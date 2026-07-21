// Cloudflare Workers 后端：联机对战房间 API
//
// 架构：
// - KV namespace ROOMS_KV 存储所有房间数据，key 格式：`room:CODE`
// - 房间数据 24 小时 TTL 自动过期，无需主动清理
// - 路由通过 URL pathname 分发，全部走 /api/* 前缀
// - 休闲模式不做服务端校验，前端各自跑 chess.js
//
// 免费档配额（足够 MVP）：
// - 100,000 请求/天，1,000 写入/分钟
// - KV 1,000 次/天写入（注意：免费档 KV 写入限额，需配合前端节流）
//
// 部署：
// 1. cd worker && npm install
// 2. npx wrangler login
// 3. npx wrangler kv namespace create ROOMS  →  把返回的 id 填入 wrangler.toml
// 4. npx wrangler kv namespace create ROOMS --preview  →  把返回的 id 填入 preview_id
// 5. npm run deploy
//
// 本地开发：
// npm run dev  →  默认监听 http://localhost:8787
export interface Env {
  ROOMS_KV: KVNamespace;
  CORS_ORIGIN?: string;
}

// ====== 协议类型定义（与前端 src/lib/roomStore.ts 保持同步） ======

type PlayerColor = 'white' | 'black';
type RoomStatus = 'waiting' | 'playing' | 'ended';

type TimeControlType = 'unlimited' | 'increment';

interface TimeControl {
  type: TimeControlType;
  /** 每方初始时间（毫秒） */
  initialMs: number;
  /** 每步加时 / Fischer 增量（毫秒） */
  incrementMs: number;
}

type GameResult =
  | { kind: 'checkmate'; winner: PlayerColor }
  | { kind: 'resign'; winner: PlayerColor }
  | { kind: 'draw'; reason: string }
  | { kind: 'opponent_left' }
  | { kind: 'timeout'; winner: PlayerColor };

interface ChatLine {
  from: 'host' | 'guest';
  text: string;
  at: number;
}

interface GameRoomData {
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

/** 房间列表摘要（供大厅展示可加入的房间） */
interface RoomSummary {
  code: string;
  host: PlayerColor;
  guest: PlayerColor | null;
  status: RoomStatus;
  timeControl: TimeControl;
  createdAt: number;
}

// ====== 常量 ======

const ROOM_TTL_SECONDS = 24 * 60 * 60; // 24 小时自动过期
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ====== 工具函数 ======

function jsonResponse(data: unknown, status = 200, corsOrigin = '*'): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function errorResponse(message: string, status = 400, corsOrigin = '*'): Response {
  return jsonResponse({ ok: false, error: message }, status, corsOrigin);
}

function roomKey(code: string): string {
  return `room:${code.toUpperCase()}`;
}

async function readRoom(kv: KVNamespace, code: string): Promise<GameRoomData | null> {
  const raw = await kv.get(roomKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GameRoomData;
  } catch {
    return null;
  }
}

async function writeRoom(kv: KVNamespace, room: GameRoomData): Promise<void> {
  await kv.put(roomKey(room.roomCode), JSON.stringify(room), {
    expirationTtl: ROOM_TTL_SECONDS,
  });
}

/** 解析请求体 JSON，失败返回 null */
async function parseBody<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** 校验并规范化客户端传来的计时规则，非法输入回退为不限时 */
function normalizeTimeControl(raw: any): TimeControl {
  if (raw && raw.type === 'increment' && typeof raw.initialMs === 'number') {
    const initialMs = Math.min(Math.max(Math.round(raw.initialMs), 0), 3 * 60 * 60 * 1000); // 上限 3 小时
    const incrementMs = Math.min(Math.max(Math.round(raw.incrementMs ?? 0), 0), 60 * 1000); // 上限 60 秒
    return { type: 'increment', initialMs, incrementMs };
  }
  return { type: 'unlimited', initialMs: 0, incrementMs: 0 };
}

/**
 * 根据计时规则更新走子后的时钟，并判定是否超时（旗帜落下）。
 * 直接修改 room 的 whiteTimeMs / blackTimeMs / lastMoveAt / status / result。
 * mover 为刚刚走子的那一方（即走子前的 room.turn）。
 */
function applyClockOnMove(room: GameRoomData, now: number): void {
  const tc = room.timeControl;
  if (!tc || tc.type === 'unlimited') return;
  const mover: PlayerColor = room.turn;
  const remainingBefore = mover === 'white' ? room.whiteTimeMs : room.blackTimeMs;
  const elapsed = now - room.lastMoveAt;
  let remaining = remainingBefore - elapsed;
  if (remaining < 0) {
    // 旗帜在走子前已落下 → 走子方判负
    remaining = 0;
    room.status = 'ended';
    room.result = { kind: 'timeout', winner: mover === 'white' ? 'black' : 'white' };
  } else {
    // Fischer 增量：走子后加上每步加时
    remaining += tc.incrementMs;
  }
  if (mover === 'white') room.whiteTimeMs = remaining;
  else room.blackTimeMs = remaining;
  room.lastMoveAt = now;
}

/** 列出可加入的房间（仅返回等待对手的房间） */
async function handleListRooms(ctx: RouteContext): Promise<Response> {
  const list = await ctx.env.ROOMS_KV.list({ prefix: 'room:' });
  const rooms: RoomSummary[] = [];
  for (const { name } of list.keys) {
    const room = await readRoom(ctx.env.ROOMS_KV, name.replace(/^room:/, ''));
    if (!room) continue;
    if (room.status !== 'waiting') continue;
    rooms.push({
      code: room.roomCode,
      host: 'white',
      guest: room.guestId ? 'black' : null,
      status: room.status,
      timeControl: normalizeTimeControl(room.timeControl),
      createdAt: room.createdAt,
    });
  }
  rooms.sort((a, b) => b.createdAt - a.createdAt);
  return jsonResponse({ ok: true, rooms }, 200, ctx.corsOrigin);
}

// ====== 路由处理 ======

interface RouteContext {
  req: Request;
  env: Env;
  corsOrigin: string;
  url: URL;
  // 路径段（已去除 /api/ 前缀）
  segments: string[];
}

type RouteHandler = (ctx: RouteContext) => Promise<Response>;

/** 健康检查 */
async function handleHealth(ctx: RouteContext): Promise<Response> {
  return jsonResponse({ ok: true, service: 'chess-multiplayer', time: Date.now() }, 200, ctx.corsOrigin);
}

/** 创建房间 */
interface CreateRoomBody {
  roomCode: string;
  hostId: string;
  hostNick: string;
  timeControl?: TimeControl;
}

async function handleCreateRoom(ctx: RouteContext): Promise<Response> {
  const body = await parseBody<CreateRoomBody>(ctx.req);
  if (!body || !body.roomCode || !body.hostId) {
    return errorResponse('参数缺失：roomCode / hostId 必填', 400, ctx.corsOrigin);
  }
  // 检查房间是否已存在（极小概率邀请码冲突）
  const existing = await readRoom(ctx.env.ROOMS_KV, body.roomCode);
  if (existing) {
    return errorResponse('房间已存在，请重新生成邀请码', 409, ctx.corsOrigin);
  }
  const now = Date.now();
  const timeControl = normalizeTimeControl(body.timeControl);
  const room: GameRoomData = {
    roomCode: body.roomCode.toUpperCase(),
    hostId: body.hostId,
    hostNick: body.hostNick?.trim()?.slice(0, 20) || '房主',
    guestId: null,
    guestNick: null,
    status: 'waiting',
    fen: INITIAL_FEN,
    moves: [],
    turn: 'white',
    lastMoveAt: 0,
    lastMoveSan: null,
    lastMoveFrom: null,
    lastMoveTo: null,
    lastMovePromotion: null,
    drawOfferBy: null,
    result: null,
    chat: [],
    updatedAt: now,
    createdAt: now,
    timeControl,
    whiteTimeMs: timeControl.initialMs,
    blackTimeMs: timeControl.initialMs,
  };
  await writeRoom(ctx.env.ROOMS_KV, room);
  return jsonResponse({ ok: true, data: room }, 201, ctx.corsOrigin);
}

/** 查询房间 */
async function handleGetRoom(ctx: RouteContext): Promise<Response> {
  const code = ctx.segments[0];
  if (!code) return errorResponse('缺少邀请码', 400, ctx.corsOrigin);
  const room = await readRoom(ctx.env.ROOMS_KV, code);
  if (!room) return errorResponse('房间不存在或已过期', 404, ctx.corsOrigin);
  return jsonResponse({ ok: true, data: room }, 200, ctx.corsOrigin);
}

/** 加入房间 */
interface JoinRoomBody {
  guestId: string;
  guestNick: string;
}

async function handleJoinRoom(ctx: RouteContext): Promise<Response> {
  const code = ctx.segments[0];
  if (!code) return errorResponse('缺少邀请码', 400, ctx.corsOrigin);
  const body = await parseBody<JoinRoomBody>(ctx.req);
  if (!body || !body.guestId) {
    return errorResponse('参数缺失：guestId 必填', 400, ctx.corsOrigin);
  }
  const room = await readRoom(ctx.env.ROOMS_KV, code);
  if (!room) return errorResponse('未找到该房间，邀请码无效或已过期', 404, ctx.corsOrigin);
  if (room.status === 'ended') return errorResponse('房间已结束', 409, ctx.corsOrigin);
  if (room.guestId && room.guestId !== body.guestId) {
    return errorResponse('房间已满', 409, ctx.corsOrigin);
  }
  room.guestId = body.guestId;
  room.guestNick = body.guestNick?.trim()?.slice(0, 20) || '访客';
  room.status = 'playing';
  room.updatedAt = Date.now();
  await writeRoom(ctx.env.ROOMS_KV, room);
  return jsonResponse({ ok: true, data: room }, 200, ctx.corsOrigin);
}

/** 走子 */
interface MoveBody {
  fen: string;
  moves: string[];
  turn: PlayerColor;
  san: string;
  from: string;
  to: string;
  promotion?: string;
  by: 'host' | 'guest';
}

async function handleMove(ctx: RouteContext): Promise<Response> {
  const code = ctx.segments[0];
  if (!code) return errorResponse('缺少邀请码', 400, ctx.corsOrigin);
  const body = await parseBody<MoveBody>(ctx.req);
  if (!body || !body.fen || !body.san || !body.from || !body.to) {
    return errorResponse('参数缺失', 400, ctx.corsOrigin);
  }
  const room = await readRoom(ctx.env.ROOMS_KV, code);
  if (!room) return errorResponse('房间不存在', 404, ctx.corsOrigin);
  const now = Date.now();
  // 休闲模式不做服务端校验，直接采用客户端状态更新时钟（含超时判定）
  applyClockOnMove(room, now);
  room.fen = body.fen;
  room.moves = body.moves;
  room.turn = body.turn;
  room.lastMoveAt = now;
  room.lastMoveSan = body.san;
  room.lastMoveFrom = body.from;
  room.lastMoveTo = body.to;
  room.lastMovePromotion = body.promotion ?? null;
  room.drawOfferBy = null; // 走子清除和棋请求
  room.updatedAt = Date.now();
  await writeRoom(ctx.env.ROOMS_KV, room);
  return jsonResponse({ ok: true, data: room }, 200, ctx.corsOrigin);
}

/** 发起和棋 */
interface DrawOfferBody {
  by: 'host' | 'guest';
}

async function handleDrawOffer(ctx: RouteContext): Promise<Response> {
  const code = ctx.segments[0];
  if (!code) return errorResponse('缺少邀请码', 400, ctx.corsOrigin);
  const body = await parseBody<DrawOfferBody>(ctx.req);
  if (!body?.by) return errorResponse('参数缺失：by', 400, ctx.corsOrigin);
  const room = await readRoom(ctx.env.ROOMS_KV, code);
  if (!room) return errorResponse('房间不存在', 404, ctx.corsOrigin);
  room.drawOfferBy = body.by;
  room.updatedAt = Date.now();
  await writeRoom(ctx.env.ROOMS_KV, room);
  return jsonResponse({ ok: true }, 200, ctx.corsOrigin);
}

/** 回应和棋 */
interface DrawReplyBody {
  accept: boolean;
}

async function handleDrawReply(ctx: RouteContext): Promise<Response> {
  const code = ctx.segments[0];
  if (!code) return errorResponse('缺少邀请码', 400, ctx.corsOrigin);
  const body = await parseBody<DrawReplyBody>(ctx.req);
  if (!body || typeof body.accept !== 'boolean') {
    return errorResponse('参数缺失：accept', 400, ctx.corsOrigin);
  }
  const room = await readRoom(ctx.env.ROOMS_KV, code);
  if (!room) return errorResponse('房间不存在', 404, ctx.corsOrigin);
  if (body.accept) {
    room.status = 'ended';
    room.result = { kind: 'draw', reason: '双方同意和棋' };
  }
  room.drawOfferBy = null;
  room.updatedAt = Date.now();
  await writeRoom(ctx.env.ROOMS_KV, room);
  return jsonResponse({ ok: true }, 200, ctx.corsOrigin);
}

/** 认输 */
interface ResignBody {
  by: 'host' | 'guest';
}

async function handleResign(ctx: RouteContext): Promise<Response> {
  const code = ctx.segments[0];
  if (!code) return errorResponse('缺少邀请码', 400, ctx.corsOrigin);
  const body = await parseBody<ResignBody>(ctx.req);
  if (!body?.by) return errorResponse('参数缺失：by', 400, ctx.corsOrigin);
  const room = await readRoom(ctx.env.ROOMS_KV, code);
  if (!room) return errorResponse('房间不存在', 404, ctx.corsOrigin);
  const winner: PlayerColor = body.by === 'host' ? 'black' : 'white';
  room.status = 'ended';
  room.result = { kind: 'resign', winner };
  room.updatedAt = Date.now();
  await writeRoom(ctx.env.ROOMS_KV, room);
  return jsonResponse({ ok: true }, 200, ctx.corsOrigin);
}

/** 通用对局结束（将杀 / 和棋 / 对方离开） */
interface EndGameBody {
  result: GameResult;
}

async function handleEndGame(ctx: RouteContext): Promise<Response> {
  const code = ctx.segments[0];
  if (!code) return errorResponse('缺少邀请码', 400, ctx.corsOrigin);
  const body = await parseBody<EndGameBody>(ctx.req);
  if (!body?.result) return errorResponse('参数缺失：result', 400, ctx.corsOrigin);
  const room = await readRoom(ctx.env.ROOMS_KV, code);
  if (!room) return errorResponse('房间不存在', 404, ctx.corsOrigin);
  room.status = 'ended';
  room.result = body.result;
  room.updatedAt = Date.now();
  await writeRoom(ctx.env.ROOMS_KV, room);
  return jsonResponse({ ok: true }, 200, ctx.corsOrigin);
}

/** 发送聊天 */
interface ChatBody {
  from: 'host' | 'guest';
  text: string;
}

async function handleChat(ctx: RouteContext): Promise<Response> {
  const code = ctx.segments[0];
  if (!code) return errorResponse('缺少邀请码', 400, ctx.corsOrigin);
  const body = await parseBody<ChatBody>(ctx.req);
  if (!body?.from || !body.text) return errorResponse('参数缺失', 400, ctx.corsOrigin);
  const room = await readRoom(ctx.env.ROOMS_KV, code);
  if (!room) return errorResponse('房间不存在', 404, ctx.corsOrigin);
  const text = body.text.slice(0, 200);
  room.chat.push({ from: body.from, text, at: Date.now() });
  // 仅保留最近 50 条
  if (room.chat.length > 50) {
    room.chat.splice(0, room.chat.length - 50);
  }
  room.updatedAt = Date.now();
  await writeRoom(ctx.env.ROOMS_KV, room);
  return jsonResponse({ ok: true }, 200, ctx.corsOrigin);
}

/** 离开房间 */
interface LeaveBody {
  by: 'host' | 'guest';
}

async function handleLeave(ctx: RouteContext): Promise<Response> {
  const code = ctx.segments[0];
  if (!code) return errorResponse('缺少邀请码', 400, ctx.corsOrigin);
  const body = await parseBody<LeaveBody>(ctx.req);
  if (!body?.by) return errorResponse('参数缺失：by', 400, ctx.corsOrigin);
  const room = await readRoom(ctx.env.ROOMS_KV, code);
  if (!room) return jsonResponse({ ok: true }, 200, ctx.corsOrigin); // 已不存在视为成功
  if (room.status === 'waiting') {
    // 等待中：直接删除房间
    await ctx.env.ROOMS_KV.delete(roomKey(code));
    return jsonResponse({ ok: true }, 200, ctx.corsOrigin);
  }
  // 对局中离开 = 弃权，对方胜
  const winner: PlayerColor = body.by === 'host' ? 'black' : 'white';
  room.status = 'ended';
  room.result = { kind: 'resign', winner };
  room.updatedAt = Date.now();
  await writeRoom(ctx.env.ROOMS_KV, room);
  return jsonResponse({ ok: true }, 200, ctx.corsOrigin);
}

/** 删除房间（管理/清理用） */
async function handleDeleteRoom(ctx: RouteContext): Promise<Response> {
  const code = ctx.segments[0];
  if (!code) return errorResponse('缺少邀请码', 400, ctx.corsOrigin);
  await ctx.env.ROOMS_KV.delete(roomKey(code));
  return jsonResponse({ ok: true }, 200, ctx.corsOrigin);
}

// ====== 路由表 ======

const routes: Record<string, RouteHandler> = {
  'GET /api/health': handleHealth,
  'GET /api/rooms': handleListRooms,
  'POST /api/rooms': handleCreateRoom,
  'GET /api/rooms/:code': handleGetRoom,
  'POST /api/rooms/:code/join': handleJoinRoom,
  'POST /api/rooms/:code/move': handleMove,
  'POST /api/rooms/:code/draw/offer': handleDrawOffer,
  'POST /api/rooms/:code/draw/reply': handleDrawReply,
  'POST /api/rooms/:code/resign': handleResign,
  'POST /api/rooms/:code/end': handleEndGame,
  'POST /api/rooms/:code/chat': handleChat,
  'POST /api/rooms/:code/leave': handleLeave,
  'DELETE /api/rooms/:code': handleDeleteRoom,
};

/** 简易路由匹配：将 URL pathname 匹配到路由表 */
function matchRoute(method: string, pathname: string): { handler: RouteHandler; pathParams: string[] } | null {
  // 去除末尾斜杠
  const cleanPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;

  // 健康检查 / 顶层路由（无路径参数）
  const directKey = `${method} ${cleanPath}`;
  if (routes[directKey]) {
    return { handler: routes[directKey], pathParams: [] };
  }

  // 带 :code 路径参数的路由
  // 形如 /api/rooms/:code/join
  const parts = cleanPath.split('/').filter(Boolean); // ['api', 'rooms', 'CODE', 'join']
  if (parts.length >= 3 && parts[0] === 'api' && parts[1] === 'rooms') {
    const code = parts[2];
    const subPath = parts.slice(3).join('/');
    const routePath = subPath ? `/api/rooms/:code/${subPath}` : '/api/rooms/:code';
    const key = `${method} ${routePath}`;
    if (routes[key]) {
      return { handler: routes[key], pathParams: [code] };
    }
  }

  return null;
}

// ====== 主入口 ======

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsOrigin = env.CORS_ORIGIN ?? '*';

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const matched = matchRoute(request.method, url.pathname);

    if (!matched) {
      return errorResponse(`无匹配路由：${request.method} ${url.pathname}`, 404, corsOrigin);
    }

    const ctx: RouteContext = {
      req: request,
      env,
      corsOrigin,
      url,
      segments: matched.pathParams,
    };

    try {
      return await matched.handler(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal Server Error';
      console.error('[worker] handler error:', err);
      return errorResponse(message, 500, corsOrigin);
    }
  },
};
