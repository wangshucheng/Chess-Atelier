// 联机对战核心 hook：基于 Cloudflare Workers + KV 轮询实现房间生命周期与状态同步
//
// 方案：
// 1) 创建/加入：调用 Worker REST API 写入 KV 中的房间记录
// 2) 走子同步：本地走子后立即 POST /move，对方 1 秒轮询 GET 拉取最新数据
// 3) 控制（认输/和棋/聊天）：POST 对应路由，Worker 更新 KV
// 4) 重连：重新拉取房间数据即可恢复
//
// 不负责：棋盘渲染、走子合法性校验（chess.js 在组件层完成）
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  initRoomStore,
  generateRoomCode,
  createGameRoom,
  joinGameRoom,
  fetchGameRoom,
  updateMove,
  offerDraw,
  replyDraw,
  resign,
  endGame,
  sendChatMessage,
  leaveRoom as leaveRoomRemote,
  cleanExpiredRooms,
  type GameResult,
  type GameRoomData,
  type PlayerColor,
} from '@/lib/roomStore';

// ====== 类型定义 ======

export type ConnectionState =
  | 'idle'
  | 'lobby'         // 已初始化，未进入房间
  | 'creating'
  | 'joining'
  | 'waiting'       // 房主等待对手
  | 'playing'
  | 'ended'
  | 'error';

export interface MultiplayerState {
  connection: ConnectionState;
  clientId: string;     // 本地生成的唯一 ID（房主或访客）
  role: 'host' | 'guest' | null;
  nickname: string;
  roomCode: string | null;
  myColor: PlayerColor | null;
  opponentNickname: string | null;
  errorMessage: string | null;
}

export interface MultiplayerCallbacks {
  /** 收到对方走子（基于轮询检测到 moves 变化） */
  onMove?: (san: string, from: string, to: string, promotion?: string) => void;
  /** 对方认输 */
  onResign?: () => void;
  /** 对方发起和棋请求 */
  onDrawOffer?: () => void;
  /** 对方回应和棋请求 */
  onDrawReply?: (accept: boolean) => void;
  /** 对方离开 */
  onLeave?: () => void;
  /** 收到新聊天 */
  onChat?: (text: string, fromOpponent: boolean) => void;
  /** 对局结束（将杀等） */
  onGameEnd?: (result: GameRoomData['result']) => void;
}

// ====== 常量 ======

const NICKNAME_KEY = 'chess-atelier-nickname';
const CLIENT_ID_KEY = 'chess-atelier-client-id';
const POLL_INTERVAL_MS = 1000; // 轮询间隔：1 秒

// ====== 工具函数 ======

/** 读取本地昵称，无则生成默认值 */
export function loadNickname(): string {
  try {
    const saved = localStorage.getItem(NICKNAME_KEY);
    if (saved) return saved;
  } catch { /* 隐私模式 */ }
  const fallback = `棋手${Math.floor(1000 + Math.random() * 9000)}`;
  try {
    localStorage.setItem(NICKNAME_KEY, fallback);
  } catch { /* 忽略 */ }
  return fallback;
}

/** 持久化昵称 */
export function saveNickname(name: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, name);
  } catch { /* 忽略 */ }
}

/** 读取/生成持久化的客户端 ID（同一浏览器同一用户复用） */
function loadClientId(): string {
  try {
    const saved = localStorage.getItem(CLIENT_ID_KEY);
    if (saved) return saved;
  } catch { /* 隐私模式 */ }
  const id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    localStorage.setItem(CLIENT_ID_KEY, id);
  } catch { /* 忽略 */ }
  return id;
}

// ====== Hook 实现 ======

export function useMultiplayer(callbacks: MultiplayerCallbacks = {}) {
  // 回调存入 ref，避免回调变化触发副作用
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const [state, setState] = useState<MultiplayerState>({
    connection: 'idle',
    clientId: '',
    role: null,
    nickname: loadNickname(),
    roomCode: null,
    myColor: null,
    opponentNickname: null,
    errorMessage: null,
  });

  // 本地缓存最新一次拉取的房间数据，用于 diff
  const lastRoomDataRef = useRef<GameRoomData | null>(null);
  // 轮询定时器
  const pollTimerRef = useRef<number | null>(null);
  // 标记是否正在写入（避免自己的 update 触发回调）
  const writingRef = useRef(false);
  // 防止并发轮询
  const pollingRef = useRef(false);

  const patch = useCallback((p: Partial<MultiplayerState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  // ====== 初始化 ======
  const init = useCallback(async () => {
    if (state.connection !== 'idle') return;
    patch({ connection: 'lobby', errorMessage: null });
    try {
      initRoomStore();
      const clientId = loadClientId();
      patch({ clientId });
      // 后台清理过期房间（不阻塞）
      cleanExpiredRooms().catch(() => { /* 忽略 */ });
    } catch (err) {
      patch({
        connection: 'error',
        errorMessage: err instanceof Error ? err.message : '初始化失败',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.connection]);

  // ====== 创建房间 ======
  const createRoom = useCallback(async () => {
    if (state.connection !== 'lobby') return null;
    patch({ connection: 'creating', errorMessage: null });
    try {
      const code = generateRoomCode();
      const result = await createGameRoom({
        roomCode: code,
        hostId: state.clientId,
        hostNick: state.nickname,
      });
      if (!result.ok) {
        patch({
          connection: 'error',
          errorMessage: result.error ?? '创建房间失败',
        });
        return null;
      }
      patch({
        connection: 'waiting',
        roomCode: code,
        role: 'host',
        myColor: 'white',
      });
      return code;
    } catch (err) {
      patch({
        connection: 'error',
        errorMessage: err instanceof Error ? err.message : '创建房间失败',
      });
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.connection, state.clientId, state.nickname]);

  // ====== 加入房间 ======
  const joinRoom = useCallback(async (code: string) => {
    if (state.connection !== 'lobby') return false;
    patch({ connection: 'joining', errorMessage: null });
    try {
      const result = await joinGameRoom({
        roomCode: code,
        guestId: state.clientId,
        guestNick: state.nickname,
      });
      if (!result.ok) {
        patch({
          connection: 'lobby',
          errorMessage: result.reason ?? '加入房间失败',
        });
        return false;
      }
      patch({
        connection: 'playing',
        roomCode: code.toUpperCase(),
        role: 'guest',
        myColor: 'black',
        opponentNickname: result.data?.hostNick ?? '房主',
      });
      return true;
    } catch (err) {
      patch({
        connection: 'error',
        errorMessage: err instanceof Error ? err.message : '加入房间失败',
      });
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.connection, state.clientId, state.nickname]);

  // ====== 轮询：拉取房间数据并 diff 触发回调 ======
  const pollRoom = useCallback(async () => {
    if (pollingRef.current) return;
    if (!state.roomCode) return;
    pollingRef.current = true;
    try {
      const data = await fetchGameRoom(state.roomCode);
      if (!data) {
        // 房间被销毁（可能是房主取消或服务端清理）
        callbacksRef.current.onLeave?.();
        return;
      }
      const prev = lastRoomDataRef.current;

      // 状态机切换：waiting → playing（房主检测到 guest 加入）
      if (state.connection === 'waiting' && data.status === 'playing') {
        patch({
          connection: 'playing',
          opponentNickname: data.guestNick ?? '对手',
        });
      }

      // 对局结束检测
      if (data.status === 'ended' && state.connection !== 'ended') {
        patch({ connection: 'ended' });
        callbacksRef.current.onGameEnd?.(data.result);
        // 若是认输结果，区分谁认输
        if (data.result?.kind === 'resign') {
          // resign by opponent → 我赢
          const resignerIsHost = data.result.winner === 'black'; // host 输 = winner 是 black
          const iAmHost = state.role === 'host';
          if ((resignerIsHost && iAmHost) || (!resignerIsHost && !iAmHost)) {
            // 我认输（理论不会走到这里，因为我认输时已直接 patch）
          } else {
            callbacksRef.current.onResign?.();
          }
        }
      }

      // 走子检测：lastMoveAt 变化且不是自己刚走
      if (
        prev &&
        data.lastMoveAt !== prev.lastMoveAt &&
        !writingRef.current &&
        data.lastMoveSan
      ) {
        callbacksRef.current.onMove?.(
          data.lastMoveSan,
          data.lastMoveFrom ?? '',
          data.lastMoveTo ?? '',
          data.lastMovePromotion ?? undefined,
        );
      }

      // 和棋请求检测
      if (prev && data.drawOfferBy !== prev.drawOfferBy) {
        if (data.drawOfferBy && data.drawOfferBy !== state.role) {
          callbacksRef.current.onDrawOffer?.();
        } else if (!data.drawOfferBy && prev.drawOfferBy && prev.drawOfferBy !== state.role) {
          // 对方回应了和棋请求
          // 若 status === 'ended' 则 accept=true，否则 accept=false
          callbacksRef.current.onDrawReply?.(data.status === 'ended');
        }
      }

      // 聊天检测：对比 chat 数组长度
      if (prev && data.chat.length > prev.chat.length) {
        const newLines = data.chat.slice(prev.chat.length);
        for (const line of newLines) {
          // from !== state.role 表示对方发来的
          callbacksRef.current.onChat?.(line.text, line.from !== state.role);
        }
      }

      lastRoomDataRef.current = data;
    } catch (err) {
      // 轮询失败静默，下次重试
      console.warn('[useMultiplayer] 轮询失败:', err);
    } finally {
      pollingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.roomCode, state.connection, state.role]);

  // 启动/停止轮询
  useEffect(() => {
    if (state.connection !== 'waiting' && state.connection !== 'playing') {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    // 立即拉一次，再定期拉
    pollRoom();
    pollTimerRef.current = window.setInterval(pollRoom, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [state.connection, pollRoom]);

  // ====== 走子 ======
  const sendMove = useCallback(async (
    san: string, from: string, to: string,
    promotion: string | undefined, _moveNo: number,
    fen: string, moves: string[], turn: PlayerColor,
  ): Promise<boolean> => {
    if (!state.roomCode || !state.role) return false;
    writingRef.current = true;
    try {
      await updateMove({
        roomCode: state.roomCode,
        fen, moves, turn,
        san, from, to, promotion,
        by: state.role,
      });
      // 同步更新本地缓存，避免下次轮询误判为对方走子
      if (lastRoomDataRef.current) {
        lastRoomDataRef.current = {
          ...lastRoomDataRef.current,
          fen, moves, turn,
          lastMoveAt: Date.now(),
          lastMoveSan: san,
          lastMoveFrom: from,
          lastMoveTo: to,
          lastMovePromotion: promotion ?? null,
          drawOfferBy: null,
        };
      }
      return true;
    } catch (err) {
      console.warn('[useMultiplayer] 发送走子失败:', err);
      return false;
    } finally {
      writingRef.current = false;
    }
  }, [state.roomCode, state.role]);

  // ====== 认输 ======
  const sendResign = useCallback(async (): Promise<boolean> => {
    if (!state.roomCode || !state.role) return false;
    try {
      await resign(state.roomCode, state.role);
      patch({ connection: 'ended' });
      return true;
    } catch (err) {
      console.warn('[useMultiplayer] 认输失败:', err);
      return false;
    }
  }, [state.roomCode, state.role, patch]);

  // ====== 通用对局结束（将杀 / 和棋等） ======
  const sendGameEnd = useCallback(async (result: GameResult): Promise<boolean> => {
    if (!state.roomCode) return false;
    try {
      await endGame(state.roomCode, result);
      patch({ connection: 'ended' });
      return true;
    } catch (err) {
      console.warn('[useMultiplayer] 标记对局结束失败:', err);
      return false;
    }
  }, [state.roomCode, patch]);

  // ====== 和棋请求 ======
  const sendDrawOffer = useCallback(async (): Promise<boolean> => {
    if (!state.roomCode || !state.role) return false;
    try {
      await offerDraw(state.roomCode, state.role);
      return true;
    } catch (err) {
      console.warn('[useMultiplayer] 发起和棋失败:', err);
      return false;
    }
  }, [state.roomCode, state.role]);

  // ====== 回应和棋 ======
  const sendDrawReply = useCallback(async (accept: boolean): Promise<boolean> => {
    if (!state.roomCode) return false;
    try {
      await replyDraw(state.roomCode, accept);
      if (accept) patch({ connection: 'ended' });
      return true;
    } catch (err) {
      console.warn('[useMultiplayer] 回应和棋失败:', err);
      return false;
    }
  }, [state.roomCode, patch]);

  // ====== 聊天 ======
  const sendChat = useCallback(async (text: string): Promise<boolean> => {
    if (!state.roomCode || !state.role) return false;
    try {
      await sendChatMessage(state.roomCode, state.role, text);
      // 本地缓存更新，避免轮询时重复触发回调
      if (lastRoomDataRef.current) {
        lastRoomDataRef.current = {
          ...lastRoomDataRef.current,
          chat: [...lastRoomDataRef.current.chat, { from: state.role, text, at: Date.now() }],
        };
      }
      return true;
    } catch (err) {
      console.warn('[useMultiplayer] 发送聊天失败:', err);
      return false;
    }
  }, [state.roomCode, state.role]);

  // ====== 离开房间 ======
  const leaveRoom = useCallback(async (_notifyOpponent = true): Promise<void> => {
    if (state.roomCode && state.role) {
      try {
        await leaveRoomRemote(state.roomCode, state.role);
      } catch (err) {
        console.warn('[useMultiplayer] 离开房间失败:', err);
      }
    }
    lastRoomDataRef.current = null;
    patch({
      connection: 'lobby',
      roomCode: null,
      role: null,
      myColor: null,
      opponentNickname: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.roomCode, state.role, patch]);

  // ====== 卸载清理 ======
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // ====== 公开 action ======
  const setNickname = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 20);
    if (trimmed) {
      saveNickname(trimmed);
      patch({ nickname: trimmed });
    }
  }, [patch]);

  const markEnded = useCallback(() => patch({ connection: 'ended' }), [patch]);
  const resetError = useCallback(() => patch({ connection: 'lobby', errorMessage: null }), [patch]);

  // 保留接口签名兼容（占位实现，不实际使用）
  const markPlaying = useCallback(() => patch({ connection: 'playing' }), [patch]);

  return {
    state,
    // 生命周期
    init,
    createRoom,
    joinRoom,
    leaveRoom,
    // 昵称
    setNickname,
    // 消息发送
    sendMove,
    sendResign,
    sendGameEnd,
    sendDrawOffer,
    sendDrawReply,
    sendChat,
    // 状态变更
    markPlaying,
    markEnded,
    resetError,
    // 工具
    isRoomExpired: (createdAt: number): boolean => Date.now() - createdAt > 5 * 60 * 1000,
  };
}
