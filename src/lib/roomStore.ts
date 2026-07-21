// 联机对战数据层：基于 Cloudflare Workers + KV 的 HTTP REST API
//
// 架构：
// - 前端通过 fetch 调用部署在 Cloudflare Workers 的房间 API
// - Workers 后端用 KV namespace 存储房间数据，24h TTL 自动过期
// - 客户端 1 秒轮询拉取最新数据，diff 检测对方走子/控制消息
//
// 替代方案历程：
// 原 LeanCloud SDK 方案已于 2026/01/12 官宣停服，2027/01/12 关闭所有公众服务
// 迁移到 Cloudflare Workers + KV 后：
// - 免费档 100,000 请求/天 + KV 1,000 写/天（足够 MVP）
// - 全球边缘节点，国内访问延迟尚可
// - 仍是单表 KV 模式，hook 层几乎无改动

// ====== 协议类型定义 ======

import type { RoomSummary, TimeControl } from '@/types';

export type PlayerColor = 'white' | 'black';

/** 房间状态 */
export type RoomStatus = 'waiting' | 'playing' | 'ended';

/** 对局结果 */
export type GameResult =
  | { kind: 'checkmate'; winner: PlayerColor }
  | { kind: 'resign'; winner: PlayerColor }
  | { kind: 'draw'; reason: string }
  | { kind: 'opponent_left' }
  | { kind: 'timeout'; winner: PlayerColor };

/** 聊天条目 */
export interface ChatLine {
  from: 'host' | 'guest';
  text: string;
  at: number;
}

/**
 * GameRoom 实体：对应 KV 中 `room:CODE` 的一条记录
 * 与 worker/src/index.ts 中的 GameRoomData 保持同步
 */
export interface GameRoomData {
  roomCode: string;
  hostId: string;
  hostNick: string;
  guestId: string | null;
  guestNick: string | null;
  status: RoomStatus;
  fen: string;
  moves: string[];
  turn: PlayerColor;
  lastMoveAt: number;
  lastMoveSan: string | null;
  lastMoveFrom: string | null;
  lastMoveTo: string | null;
  lastMovePromotion: string | null;
  drawOfferBy: 'host' | 'guest' | null;
  result: GameResult | null;
  chat: ChatLine[];
  updatedAt: number;
  createdAt: number;
  /** 计时规则（房主创建时设定，加入后不可更改） */
  timeControl: TimeControl;
  /** 白方剩余时间（毫秒） */
  whiteTimeMs: number;
  /** 黑方剩余时间（毫秒） */
  blackTimeMs: number;
}

// ====== 计时规则预设 ======

/** 不限时 */
export const UNLIMITED_TIME_CONTROL: TimeControl = {
  type: 'unlimited',
  initialMs: 0,
  incrementMs: 0,
};

/** 可选计时预设：标签 + 规则 */
export const TIME_CONTROL_PRESETS: { label: string; value: TimeControl }[] = [
  { label: '3 + 2', value: { type: 'increment', initialMs: 3 * 60_000, incrementMs: 2_000 } },
  { label: '5 + 0', value: { type: 'increment', initialMs: 5 * 60_000, incrementMs: 0 } },
  { label: '10 + 0', value: { type: 'increment', initialMs: 10 * 60_000, incrementMs: 0 } },
  { label: '15 + 10', value: { type: 'increment', initialMs: 15 * 60_000, incrementMs: 10_000 } },
  { label: '30 + 0', value: { type: 'increment', initialMs: 30 * 60_000, incrementMs: 0 } },
];

/** 默认计时规则（大厅默认选中） */
export const DEFAULT_TIME_CONTROL: TimeControl = TIME_CONTROL_PRESETS[1].value; // 5 + 0

/** 把毫秒格式化为时钟显示文本（m:ss 或 h:mm:ss，不限时返回 '∞'） */
export function formatClock(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ====== Worker URL 配置 ======

let workerBaseUrl = '';

/**
 * 初始化 roomStore：校验 Worker URL 是否配置
 * 必须在调用任何 API 之前执行一次
 */
export function initRoomStore(): void {
  const url = import.meta.env.VITE_WORKER_URL as string | undefined;
  if (!url) {
    throw new Error(
      '[roomStore] 缺少环境变量 VITE_WORKER_URL。请复制 .env.example 为 .env.local 并填入 Cloudflare Workers 部署地址。',
    );
  }
  if (url === 'https://your-worker-url.example.com') {
    throw new Error('[roomStore] 环境变量仍为占位符，请填入真实的 Worker URL。');
  }
  // 去除末尾斜杠
  workerBaseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
}

/** 是否已初始化 */
export function isRoomStoreReady(): boolean {
  return workerBaseUrl !== '';
}

// ====== HTTP 工具 ======

interface ApiResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function apiCall<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  if (!workerBaseUrl) {
    return { ok: false, error: 'roomStore 未初始化，请先调用 initRoomStore()' };
  }
  try {
    const res = await fetch(`${workerBaseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as ApiResponse<T>;
    return json;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '网络错误',
    };
  }
}

// ====== 邀请码生成 ======

// 去除 0/O/1/I/L 后的字符集，避免肉眼混淆
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** 生成 6 位邀请码 */
export function generateRoomCode(): string {
  let code = '';
  const arr = new Uint32Array(CODE_LENGTH);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[arr[i] % CODE_CHARS.length];
    }
  } else {
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  }
  return code;
}

// ====== GameRoom 数据访问层 ======

/** 创建房间 */
export async function createGameRoom(params: {
  roomCode: string;
  hostId: string;
  hostNick: string;
  timeControl: TimeControl;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await apiCall<{ ok: boolean }>('POST', '/api/rooms', {
    roomCode: params.roomCode,
    hostId: params.hostId,
    hostNick: params.hostNick,
    timeControl: params.timeControl,
  });
  return { ok: res.ok, error: res.error };
}

/** 拉取最新房间数据 */
export async function fetchGameRoom(roomCode: string): Promise<GameRoomData | null> {
  const res = await apiCall<GameRoomData>('GET', `/api/rooms/${encodeURIComponent(roomCode)}`);
  if (!res.ok || !res.data) return null;
  const room = res.data;
  // 兼容旧房间（缺少计时字段时回退为不限时）
  if (!room.timeControl) {
    room.timeControl = UNLIMITED_TIME_CONTROL;
    room.whiteTimeMs = 0;
    room.blackTimeMs = 0;
  }
  return room;
}

/** 列出可加入的房间（等待对手中） */
export async function listRooms(): Promise<RoomSummary[]> {
  const res = await apiCall<{ rooms: RoomSummary[] }>('GET', '/api/rooms');
  if (!res.ok || !res.data) {
    throw new Error(res.error ?? '获取房间列表失败');
  }
  return res.data.rooms ?? [];
}

/** 加入房间 */
export async function joinGameRoom(params: {
  roomCode: string;
  guestId: string;
  guestNick: string;
}): Promise<{ ok: boolean; reason?: string; data?: GameRoomData }> {
  const res = await apiCall<GameRoomData>('POST', `/api/rooms/${encodeURIComponent(params.roomCode)}/join`, {
    guestId: params.guestId,
    guestNick: params.guestNick,
  });
  if (!res.ok) {
    return { ok: false, reason: res.error ?? '加入房间失败' };
  }
  return { ok: true, data: res.data };
}

/** 更新走子信息 */
export async function updateMove(params: {
  roomCode: string;
  fen: string;
  moves: string[];
  turn: PlayerColor;
  san: string;
  from: string;
  to: string;
  promotion?: string;
  by: 'host' | 'guest';
}): Promise<void> {
  const res = await apiCall('POST', `/api/rooms/${encodeURIComponent(params.roomCode)}/move`, {
    fen: params.fen,
    moves: params.moves,
    turn: params.turn,
    san: params.san,
    from: params.from,
    to: params.to,
    promotion: params.promotion,
    by: params.by,
  });
  if (!res.ok) {
    throw new Error(res.error ?? '走子同步失败');
  }
}

/** 发起和棋请求 */
export async function offerDraw(roomCode: string, by: 'host' | 'guest'): Promise<void> {
  const res = await apiCall('POST', `/api/rooms/${encodeURIComponent(roomCode)}/draw/offer`, { by });
  if (!res.ok) {
    throw new Error(res.error ?? '发起和棋失败');
  }
}

/** 回应和棋请求 */
export async function replyDraw(roomCode: string, accept: boolean): Promise<void> {
  const res = await apiCall('POST', `/api/rooms/${encodeURIComponent(roomCode)}/draw/reply`, { accept });
  if (!res.ok) {
    throw new Error(res.error ?? '回应和棋失败');
  }
}

/** 认输 */
export async function resign(roomCode: string, by: 'host' | 'guest'): Promise<void> {
  const res = await apiCall('POST', `/api/rooms/${encodeURIComponent(roomCode)}/resign`, { by });
  if (!res.ok) {
    throw new Error(res.error ?? '认输失败');
  }
}

/** 通用对局结束 */
export async function endGame(roomCode: string, result: GameResult): Promise<void> {
  const res = await apiCall('POST', `/api/rooms/${encodeURIComponent(roomCode)}/end`, { result });
  if (!res.ok) {
    throw new Error(res.error ?? '标记对局结束失败');
  }
}

/** 发送聊天消息 */
export async function sendChatMessage(roomCode: string, from: 'host' | 'guest', text: string): Promise<void> {
  const res = await apiCall('POST', `/api/rooms/${encodeURIComponent(roomCode)}/chat`, { from, text });
  if (!res.ok) {
    throw new Error(res.error ?? '发送聊天失败');
  }
}

/** 离开房间 */
export async function leaveRoom(roomCode: string, leaver: 'host' | 'guest'): Promise<void> {
  const res = await apiCall('POST', `/api/rooms/${encodeURIComponent(roomCode)}/leave`, { by: leaver });
  if (!res.ok) {
    // 离开失败不抛错，避免阻塞前端状态重置
    console.warn('[roomStore] 离开房间失败:', res.error);
  }
}

/**
 * 清理过期房间（Cloudflare Workers 免费档不提供 KV 列表接口的便捷清理）
 * 实际依赖 KV 24h TTL 自动过期，本函数为兼容旧 hook 接口的空实现
 */
export async function cleanExpiredRooms(): Promise<void> {
  // no-op：依赖 KV TTL 自动过期
}

// 兼容性导出：保留旧 API 名，方便平滑迁移
export const initLeanCloud = initRoomStore;
export const isLeanCloudReady = isRoomStoreReady;
