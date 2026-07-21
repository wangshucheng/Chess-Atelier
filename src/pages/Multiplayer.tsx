// 联机对战页：邀请码房间 + 走子同步 + 认输/和棋
// MVP 范围：
// - 创建房间（生成邀请码，房主执白）或加入房间（输入邀请码，加入者执黑）
// - 走子双向同步、认输、和棋请求/应答、对方离开检测
// - 客户端各自跑 chess.js 校验（休闲模式）
// - 断线重连：自动请求对方同步局面
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import ChessBoard from '@/components/board/ChessBoard';
import MoveHistory from '@/components/board/MoveHistory';
import { useMultiplayer } from '@/hooks/useMultiplayer';
import { useConfirm } from '@/components/ConfirmModal';
import { play } from '@/lib/sounds';
import {
  TIME_CONTROL_PRESETS,
  DEFAULT_TIME_CONTROL,
  UNLIMITED_TIME_CONTROL,
  formatClock,
  type PlayerColor,
} from '@/lib/roomStore';
import type { TimeControl } from '@/types';
import { useI18n } from '@/i18n';
import type { Path, TranslationSchema, Translate } from '@/i18n';
import {
  Swords, Users, LogIn, LogOut, Copy, Check, Flag, Handshake,
  RefreshCw, AlertTriangle, Loader2, Send, ArrowLeft, Clock,
} from 'lucide-react';

type GameStatus =
  | { state: 'playing' }
  | { state: 'checkmate'; winner: PlayerColor }
  | { state: 'resigned'; winner: PlayerColor }
  | { state: 'draw'; reason: string }
  | { state: 'opponent_left' }
  | { state: 'timeout'; winner: PlayerColor };

/** 把计时规则格式化为可读标签（不限时返回 i18n 文本） */
function timeControlLabel(tc: TimeControl, t: Translate): string {
  if (tc.type === 'unlimited') return t('multiplayer.unlimited');
  const min = Math.round(tc.initialMs / 60000);
  const inc = Math.round(tc.incrementMs / 1000);
  return `${min} + ${inc}`;
}

interface ChatLine {
  from: 'me' | 'opponent' | 'system';
  text: string;
  at: number;
}

export default function Multiplayer() {
  const confirm = useConfirm();
  const { t } = useI18n();
  const [nicknameInput, setNicknameInput] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chat, setChat] = useState<ChatLine[]>([]);
  // 房主创建房间时选定的计时规则（加入者通过房间数据自动获得）
  const [timeControl, setTimeControl] = useState<TimeControl>(DEFAULT_TIME_CONTROL);

  // 棋局状态
  const gameRef = useRef<Chess | null>(null);
  if (!gameRef.current) gameRef.current = new Chess();
  const [fen, setFen] = useState(gameRef.current.fen());
  const [moves, setMoves] = useState<string[]>([]);
  const [gameStatus, setGameStatus] = useState<GameStatus>({ state: 'playing' });
  const [drawOfferedBy, setDrawOfferedBy] = useState<'me' | 'opponent' | null>(null);

  // ====== 联机 hook：注册回调 ======
  const mp = useMultiplayer({
    onMove: (san, from, to, promotion) => {
      const game = gameRef.current;
      if (!game) return;
      try {
        const m = game.move({ from, to, promotion });
        if (!m) {
          // 对方走子非法（数据异常或不同步），记录但不阻塞
          console.warn('[Multiplayer] 对方走子非法:', san);
          return;
        }
        setFen(game.fen());
        setMoves((prev) => [...prev, m.san]);
        // 走子音效
        if (m.san === 'O-O' || m.san === 'O-O-O') play('castle');
        else if (m.promotion) play('promote');
        else if (m.captured || m.san.includes('x')) play('capture');
        else if (m.san.includes('+')) play('check');
        else play('move');
        // 检测终局
        if (game.isCheckmate()) {
          // 对方将杀了我
          const winner: PlayerColor = game.turn() === 'w' ? 'black' : 'white';
          setGameStatus({ state: 'checkmate', winner });
          play('loss');
        } else if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.isInsufficientMaterial()) {
          setGameStatus({ state: 'draw', reason: 'draw' });
          play('draw');
        }
      } catch (err) {
        console.warn('[Multiplayer] 应用对方走子失败:', err);
      }
    },
    onGameEnd: (result) => {
      // 对方标记对局结束（将杀/认输/和棋）
      if (!result) return;
      if (result.kind === 'checkmate') {
        setGameStatus({ state: 'checkmate', winner: result.winner });
        play(result.winner === mp.state.myColor ? 'win' : 'loss');
      } else if (result.kind === 'resign') {
        setGameStatus({ state: 'resigned', winner: result.winner });
        play(result.winner === mp.state.myColor ? 'win' : 'loss');
      } else if (result.kind === 'draw') {
        setGameStatus({ state: 'draw', reason: result.reason });
        play('draw');
      } else if (result.kind === 'timeout') {
        setGameStatus({ state: 'timeout', winner: result.winner });
        play(result.winner === mp.state.myColor ? 'win' : 'loss');
      }
    },
    onResign: () => {
      // 对方认输，我方胜（onGameEnd 也会触发，此处仅补聊天提示）
        setChat((prev) => [...prev, { from: 'system', text: t('multiplayer.system.opponentResigned'), at: Date.now() }]);
    },
    onDrawOffer: () => {
      setDrawOfferedBy('opponent');
      setChat((prev) => [...prev, { from: 'system', text: t('multiplayer.system.opponentDrawOffer'), at: Date.now() }]);
    },
    onDrawReply: (accept) => {
      if (accept) {
        setChat((prev) => [...prev, { from: 'system', text: t('multiplayer.system.opponentAcceptedDraw'), at: Date.now() }]);
      } else {
        setChat((prev) => [...prev, { from: 'system', text: t('multiplayer.system.opponentDeclinedDraw'), at: Date.now() }]);
      }
      setDrawOfferedBy(null);
    },
    onLeave: () => {
      setGameStatus({ state: 'opponent_left' });
      setChat((prev) => [...prev, { from: 'system', text: t('multiplayer.system.opponentLeft'), at: Date.now() }]);
    },
    onChat: (text, fromOpponent) => {
      if (fromOpponent) {
        setChat((prev) => [...prev, { from: 'opponent', text, at: Date.now() }]);
      }
    },
  });

  // ====== 初始化触发 ======
  useEffect(() => {
    if (mp.state.connection === 'idle') {
      mp.init();
    }
  }, [mp.state.connection, mp]);

  // ====== 玩家走子 ======
  const handleDrop = useCallback((sourceSquare: string, targetSquare: string, promotion?: string): boolean => {
    if (gameStatus.state !== 'playing') return false;
    const game = gameRef.current;
    if (!game) return false;
    // 仅允许轮到自己时走子
    const myTurn: PlayerColor = game.turn() === 'w' ? 'white' : 'black';
    if (myTurn !== mp.state.myColor) return false;

    try {
      const move = game.move({ from: sourceSquare, to: targetSquare, promotion });
      if (!move) return false;
      const newFen = game.fen();
      const newMoves = [...moves, move.san];
      const nextTurn: PlayerColor = game.turn() === 'w' ? 'white' : 'black';
      setFen(newFen);
      setMoves(newMoves);
      // 走子音效（己方走子也播放，反馈感更强）
      playMoveSound(move);
      // 发送给对方（写入服务端，对方轮询拉取）
      void mp.sendMove(move.san, sourceSquare, targetSquare, promotion, newMoves.length, newFen, newMoves, nextTurn);
      // 检测终局：将杀 / 和棋
      if (game.isCheckmate()) {
        const winner: PlayerColor = mp.state.myColor ?? 'white';
        setGameStatus({ state: 'checkmate', winner });
        void mp.sendGameEnd({ kind: 'checkmate', winner });
        play('win');
      } else if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.isInsufficientMaterial()) {
        const reason = game.isStalemate() ? 'stalemate' :
          game.isThreefoldRepetition() ? 'repetition' :
          game.isInsufficientMaterial() ? 'insufficient' : 'draw';
        setGameStatus({ state: 'draw', reason });
        void mp.sendGameEnd({ kind: 'draw', reason });
        play('draw');
      }
      return true;
    } catch {
      return false;
    }
  }, [gameStatus.state, mp.state.myColor, mp, moves]);

  // ====== 控制：认输 / 和棋 / 离开 ======
  const handleResign = useCallback(async () => {
    const ok = await confirm({
      title: t('multiplayer.resignConfirm.title'),
      message: t('multiplayer.resignConfirm.message'),
      confirmText: t('multiplayer.resignConfirm.confirm'),
      danger: true,
    });
    if (!ok) return;
    mp.sendResign();
    const winner: PlayerColor = mp.state.myColor === 'white' ? 'black' : 'white';
    setGameStatus({ state: 'resigned', winner });
    play('loss');
  }, [confirm, mp]);

  const handleDrawOffer = useCallback(() => {
    if (drawOfferedBy === 'me') return;
    mp.sendDrawOffer();
    setDrawOfferedBy('me');
    setChat((prev) => [...prev, { from: 'system', text: t('multiplayer.system.youOfferedDraw'), at: Date.now() }]);
  }, [drawOfferedBy, mp, t]);

  const handleDrawReply = useCallback((accept: boolean) => {
    mp.sendDrawReply(accept);
    if (accept) {
      setGameStatus({ state: 'draw', reason: 'agreed' });
      play('draw');
    }
    setDrawOfferedBy(null);
  }, [mp]);

  const handleLeave = useCallback(async () => {
    const ok = await confirm({
      title: t('multiplayer.leaveConfirm.title'),
      message: t('multiplayer.leaveConfirm.message'),
      confirmText: t('multiplayer.leaveConfirm.confirm'),
      danger: true,
    });
    if (!ok) return;
    await mp.leaveRoom(true);
    // 重置棋局
    gameRef.current = new Chess();
    setFen(gameRef.current.fen());
    setMoves([]);
    setGameStatus({ state: 'playing' });
    setDrawOfferedBy(null);
    setChat([]);
  }, [confirm, mp]);

  // ====== 超时判负（本地时钟耗尽时由 GameView 触发） ======
  const handleTimeout = useCallback((winner: PlayerColor) => {
    mp.sendGameEnd({ kind: 'timeout', winner });
    setGameStatus({ state: 'timeout', winner });
    play(winner === mp.state.myColor ? 'win' : 'loss');
  }, [mp]);

  // ====== 复制邀请码 ======
  const handleCopyCode = useCallback(() => {
    if (!mp.state.roomCode) return;
    navigator.clipboard?.writeText(mp.state.roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* 忽略 */ });
  }, [mp.state.roomCode]);

  // ====== 聊天发送 ======
  const handleSendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    mp.sendChat(text.slice(0, 200));
    setChat((prev) => [...prev, { from: 'me', text: text.slice(0, 200), at: Date.now() }]);
    setChatInput('');
  }, [chatInput, mp]);

  // ====== 渲染分支 ======
  const { connection, errorMessage } = mp.state;

  // 错误状态
  if (connection === 'error') {
    return (
      <div className="px-4 md:px-10 py-16 max-w-[800px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center">
          <AlertTriangle size={32} className="text-wine mx-auto mb-3" />
          <div className="text-sm text-ivoryDim mb-2">{t('multiplayer.initError')}</div>
          <div className="text-xs text-wine/80 mb-6 font-mono">{errorMessage}</div>
          <button
            onClick={mp.resetError}
            className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5"
          >
            <RefreshCw size={12} /> {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  // 初始化中
  if (connection === 'idle') {
    return (
      <div className="px-4 md:px-10 py-16 max-w-[800px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center">
          <Loader2 size={32} className="text-gold mx-auto mb-3 animate-spin" />
          <div className="text-sm text-ivoryDim">{t('multiplayer.connecting')}</div>
        </div>
      </div>
    );
  }

  // 大厅：未进入房间
  if (connection === 'lobby') {
    return (
      <Lobby
        nickname={mp.state.nickname}
        nicknameInput={nicknameInput}
        setNicknameInput={setNicknameInput}
        onSaveNickname={mp.setNickname}
        joinCode={joinCode}
        setJoinCode={setJoinCode}
        onCreate={mp.createRoom}
        onJoin={mp.joinRoom}
        timeControl={timeControl}
        onTimeControlChange={setTimeControl}
      />
    );
  }

  // 创建中 / 加入中
  if (connection === 'creating' || connection === 'joining') {
    return (
      <div className="px-4 md:px-10 py-16 max-w-[800px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center">
          <Loader2 size={32} className="text-gold mx-auto mb-3 animate-spin" />
          <div className="text-sm text-ivoryDim">
            {connection === 'creating' ? t('multiplayer.creating') : t('multiplayer.joining')}
          </div>
        </div>
      </div>
    );
  }

  // 等待对手加入
  if (connection === 'waiting') {
    return (
      <WaitingRoom
        roomCode={mp.state.roomCode ?? ''}
        nickname={mp.state.nickname}
        timeControl={timeControl}
        copied={copied}
        onCopy={handleCopyCode}
        onCancel={() => mp.leaveRoom(false)}
      />
    );
  }

  // 对局中或已结束
  return (
    <GameView
      mp={mp}
      fen={fen}
      moves={moves}
      gameStatus={gameStatus}
      drawOfferedBy={drawOfferedBy}
      chat={chat}
      chatInput={chatInput}
      setChatInput={setChatInput}
      onSendChat={handleSendChat}
      onDrop={handleDrop}
      onResign={handleResign}
      onDrawOffer={handleDrawOffer}
      onDrawReply={handleDrawReply}
      onLeave={handleLeave}
      onCopyCode={handleCopyCode}
      onTimeout={handleTimeout}
      copied={copied}
    />
  );
}

// ====== 走子音效工具函数 ======
function playMoveSound(move: Move): void {
  const san = move.san;
  if (san.includes('#')) return; // 将杀由终局音效接管
  if (san === 'O-O' || san === 'O-O-O') { play('castle'); return; }
  if (move.promotion) { play('promote'); return; }
  if (move.captured || san.includes('x')) { play('capture'); return; }
  if (san.includes('+')) { play('check'); return; }
  play('move');
}

// ====== 大厅子组件 ======

interface LobbyProps {
  nickname: string;
  nicknameInput: string;
  setNicknameInput: (v: string) => void;
  onSaveNickname: (v: string) => void;
  joinCode: string;
  setJoinCode: (v: string) => void;
  onCreate: (tc: TimeControl) => Promise<string | null>;
  onJoin: (code: string) => Promise<boolean>;
  timeControl: TimeControl;
  onTimeControlChange: (tc: TimeControl) => void;
}

function Lobby({
  nickname, nicknameInput, setNicknameInput, onSaveNickname,
  joinCode, setJoinCode, onCreate, onJoin,
  timeControl, onTimeControlChange,
}: LobbyProps) {
  const [editingNick, setEditingNick] = useState(false);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const handleSaveNick = () => {
    onSaveNickname(nicknameInput);
    setEditingNick(false);
  };

  const { t } = useI18n();

  const handleCreate = async () => {
    setBusy('create');
    await onCreate(timeControl);
    setBusy(null);
  };

  const handleJoin = async () => {
    if (joinCode.trim().length !== 6) return;
    setBusy('join');
    await onJoin(joinCode.trim().toUpperCase());
    setBusy(null);
  };

  return (
    <div className="px-4 md:px-10 py-8 max-w-[1000px] mx-auto">
      <header className="mb-8 animate-fade-up">
        <div className="flex items-center gap-2 mb-2">
          <Users size={12} className="text-gold" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-gold/70">{t('multiplayer.badge')}</span>
        </div>
        <h1 className="font-display text-5xl text-ivory tracking-tight-display">
          {t('multiplayer.title')}
        </h1>
        <p className="text-sm text-ivoryDim mt-2">{t('multiplayer.subtitle')}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 当前昵称 */}
        <div className="card-gold rounded-sm p-6 md:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-3">{t('multiplayer.nickname')}</div>
          {editingNick ? (
            <div className="flex items-center gap-2">
              <input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder={t('multiplayer.nicknamePlaceholder')}
                maxLength={20}
                autoFocus
                aria-label={t('multiplayer.nickname')}
                className="flex-1 px-3 py-2 bg-ink-800/60 border border-gold/15 rounded-sm text-sm text-ivory placeholder:text-ivoryDim/50 focus:outline-none focus:border-gold/50 transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveNick()}
              />
              <button
                onClick={handleSaveNick}
                className="btn-gold-solid px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5"
              >
                <Check size={12} /> {t('common.save')}
              </button>
              <button
                onClick={() => setEditingNick(false)}
                className="btn-gold-outline px-3 py-2 rounded-sm text-xs uppercase tracking-widest"
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="font-display text-2xl text-ivory">{nickname}</div>
              <button
                onClick={() => { setNicknameInput(nickname); setEditingNick(true); }}
                className="text-xs text-gold/70 hover:text-gold transition-colors"
              >
                {t('multiplayer.edit')}
              </button>
            </div>
          )}
        </div>

        {/* 创建房间 */}
        <div className="card-gold rounded-sm p-6 flex flex-col">
          <div className="mb-6">
            <div className="w-12 h-12 border border-gold/30 rounded-sm flex items-center justify-center bg-ink-800 mb-4">
              <Swords size={20} className="text-gold" />
            </div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-2">{t('multiplayer.createRoomBadge')}</div>
            <h3 className="font-display text-2xl text-ivory mb-2 tracking-tight-display">{t('multiplayer.createRoomTitle')}</h3>
            <p className="text-xs text-ivoryDim leading-relaxed">
              {t('multiplayer.createRoomDesc')}
            </p>
          </div>
          {/* 计时规则配置 */}
          <div className="mb-6">
            <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-[0.3em] text-gold/60">
              <Clock size={12} /> {t('multiplayer.timeControl')}
            </div>
            <div className="flex flex-wrap gap-2">
              {TIME_CONTROL_PRESETS.map((preset) => {
                const active =
                  timeControl.type === preset.value.type &&
                  timeControl.initialMs === preset.value.initialMs &&
                  timeControl.incrementMs === preset.value.incrementMs;
                return (
                  <button
                    key={preset.label}
                    onClick={() => onTimeControlChange(preset.value)}
                    className={`px-3 py-1.5 rounded-sm text-xs tracking-wide border transition-colors ${
                      active ? 'border-gold bg-gold/15 text-gold' : 'border-gold/15 text-ivoryDim hover:border-gold/40'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                onClick={() => onTimeControlChange(UNLIMITED_TIME_CONTROL)}
                className={`px-3 py-1.5 rounded-sm text-xs tracking-wide border transition-colors ${
                  timeControl.type === 'unlimited'
                    ? 'border-gold bg-gold/15 text-gold'
                    : 'border-gold/15 text-ivoryDim hover:border-gold/40'
                }`}
              >
                {t('multiplayer.unlimited')}
              </button>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={busy !== null}
            className="btn-gold-solid px-4 py-3 rounded-sm text-xs uppercase tracking-widest flex items-center justify-center gap-2 mt-auto disabled:opacity-50"
          >
            {busy === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Swords size={14} />}
            {t('multiplayer.create')}
          </button>
        </div>

        {/* 加入房间 */}
        <div className="card-gold rounded-sm p-6 flex flex-col">
          <div className="mb-6">
            <div className="w-12 h-12 border border-gold/30 rounded-sm flex items-center justify-center bg-ink-800 mb-4">
              <LogIn size={20} className="text-gold" />
            </div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-2">{t('multiplayer.joinRoomBadge')}</div>
            <h3 className="font-display text-2xl text-ivory mb-2 tracking-tight-display">{t('multiplayer.joinRoomTitle')}</h3>
            <p className="text-xs text-ivoryDim leading-relaxed">
              {t('multiplayer.joinRoomDesc')}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-auto">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))}
              placeholder={t('multiplayer.joinPlaceholder')}
              maxLength={6}
              aria-label={t('multiplayer.code')}
              className="flex-1 px-3 py-3 bg-ink-800/60 border border-gold/15 rounded-sm text-center text-lg font-mono text-ivory tracking-[0.3em] placeholder:text-ivoryDim/30 placeholder:tracking-widest focus:outline-none focus:border-gold/50 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              onClick={handleJoin}
              disabled={joinCode.length !== 6 || busy !== null}
              className="btn-gold-solid px-4 py-3 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40"
            >
              {busy === 'join' ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
            {t('multiplayer.join')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== 等待对手子组件 ======

interface WaitingRoomProps {
  roomCode: string;
  nickname: string;
  timeControl: TimeControl;
  copied: boolean;
  onCopy: () => void;
  onCancel: () => void;
}

function WaitingRoom({ roomCode, nickname, timeControl, copied, onCopy, onCancel }: WaitingRoomProps) {
  const { t } = useI18n();
  return (
    <div className="px-4 md:px-10 py-16 max-w-[800px] mx-auto">
      <div className="card-gold rounded-sm p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-6 border border-gold/30 rounded-sm flex items-center justify-center bg-ink-800 relative">
          <Users size={28} className="text-gold" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-gold rounded-full animate-ping" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-2">{t('multiplayer.waitingBadge')}</div>
        <h2 className="font-display text-4xl text-ivory mb-3 tracking-tight-display">{t('multiplayer.waiting')}</h2>
        <p className="text-sm text-ivoryDim mb-8">
          {t('multiplayer.waitingHint', { nickname })}
        </p>

        <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-sm bg-ink-800/60 border border-gold/15 text-sm text-ivoryDim">
          <Clock size={14} className="text-gold/70" />
          <span>{t('multiplayer.timeControl')}:</span>
          <span className="text-gold font-medium">{timeControlLabel(timeControl, t)}</span>
        </div>

        <div className="inline-block bg-ink-800/80 border border-gold/20 rounded-sm p-6 mb-6">
          <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-2">{t('multiplayer.code')}</div>
          <div className="font-mono text-4xl text-gold tracking-[0.3em] mb-3">{roomCode}</div>
          <button
            onClick={onCopy}
            className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? t('common.copied') : t('multiplayer.copyCode')}
          </button>
        </div>

        <div>
          <button
            onClick={onCancel}
            className="text-xs text-ivoryDim/70 hover:text-wine transition-colors inline-flex items-center gap-1.5"
          >
            <ArrowLeft size={12} /> {t('multiplayer.cancelLobby')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ====== 对局视图子组件 ======

interface GameViewProps {
  mp: ReturnType<typeof useMultiplayer>;
  fen: string;
  moves: string[];
  gameStatus: GameStatus;
  drawOfferedBy: 'me' | 'opponent' | null;
  chat: ChatLine[];
  chatInput: string;
  setChatInput: (v: string) => void;
  onSendChat: () => void;
  onDrop: (from: string, to: string, promotion?: string) => boolean;
  onResign: () => void;
  onDrawOffer: () => void;
  onDrawReply: (accept: boolean) => void;
  onLeave: () => void;
  onCopyCode: () => void;
  onTimeout: (winner: PlayerColor) => void;
  copied: boolean;
}

function GameView({
  mp, fen, moves, gameStatus, drawOfferedBy,
  chat, chatInput, setChatInput, onSendChat,
  onDrop, onResign, onDrawOffer, onDrawReply, onLeave, onCopyCode, onTimeout, copied,
}: GameViewProps) {
  const { t } = useI18n();
  const myColor = mp.state.myColor;
  const opponentNick = mp.state.opponentNickname ?? t('multiplayer.defaultOpponent');
  const myNick = mp.state.nickname;
  const roomCode = mp.state.roomCode ?? '';

  // 当前轮到谁（基于 FEN）
  const turn: PlayerColor = useMemo(() => {
    const parts = fen.split(' ');
    return parts[1] === 'w' ? 'white' : 'black';
  }, [fen]);

  const isMyTurn = turn === myColor && gameStatus.state === 'playing';
  const gameEnded = gameStatus.state !== 'playing';

  // ====== 计时时钟：本地推算当前剩余时间 + 超时判负 ======
  const timeControl = mp.state.timeControl;
  const clock = mp.state.clock;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  // 返回某方当前应显示的剩余毫秒（不限时返回 null）
  const clockMsFor = (color: PlayerColor): number | null => {
    if (!clock || !timeControl || timeControl.type === 'unlimited') return null;
    const base = color === 'white' ? clock.whiteTimeMs : clock.blackTimeMs;
    if (turn !== color || gameStatus.state !== 'playing') return base;
    return Math.max(0, base - (now - clock.lastMoveAt));
  };

  // 当前走子方时钟耗尽 → 对手超时获胜
  const timeoutFiredRef = useRef(false);
  useEffect(() => {
    if (!clock || !timeControl || timeControl.type === 'unlimited') return;
    if (gameStatus.state !== 'playing') return;
    const base = turn === 'white' ? clock.whiteTimeMs : clock.blackTimeMs;
    const remaining = Math.max(0, base - (now - clock.lastMoveAt));
    if (remaining <= 0 && !timeoutFiredRef.current) {
      timeoutFiredRef.current = true;
      const winner: PlayerColor = turn === 'white' ? 'black' : 'white';
      onTimeout(winner);
    }
  }, [now, clock, timeControl, turn, gameStatus.state]);

  // 终局状态文本
  const endText = useMemo(() => {
    switch (gameStatus.state) {
      case 'checkmate':
        return gameStatus.winner === myColor ? t('multiplayer.youWinCheckmate') : t('multiplayer.youLoseCheckmate');
      case 'resigned':
        return gameStatus.winner === myColor ? t('multiplayer.youWinResign') : t('multiplayer.youResigned');
      case 'draw':
        return t('multiplayer.draw', {
          reason: t(`multiplayer.drawReason.${gameStatus.reason}` as Path<TranslationSchema>),
        });
      case 'opponent_left':
        return t('multiplayer.opponentLeft');
      case 'timeout':
        return gameStatus.winner === myColor ? t('multiplayer.youWinTimeout') : t('multiplayer.youLoseTimeout');
      default:
        return '';
    }
  }, [gameStatus, myColor]);

  return (
    <div className="px-4 md:px-10 py-6 max-w-[1400px] mx-auto">
      {/* 顶部：房间信息 */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={onLeave}
            className="text-xs text-ivoryDim hover:text-wine flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft size={12} /> {t('multiplayer.leaveRoom')}
          </button>
          <div className="text-xs text-ivoryDim/60 font-mono">#{roomCode}</div>
          <button
            onClick={onCopyCode}
            className="text-xs text-gold/60 hover:text-gold transition-colors flex items-center gap-1"
            aria-label={t('multiplayer.copyCode')}
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? t('common.copied') : t('multiplayer.copyCode')}
          </button>
        </div>
        <div className="text-xs text-ivoryDim">
          {gameEnded ? (
            <span className="text-gold">{endText}</span>
          ) : isMyTurn ? (
            <span className="text-moss">{t('multiplayer.yourTurn')}</span>
          ) : (
            <span className="text-ivoryDim/70">{t('multiplayer.opponentThinking')}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 左：棋盘 */}
        <div className="col-span-12 lg:col-span-8">
          <ChessBoard
            fen={fen}
            onDrop={onDrop}
            arePiecesDraggable={isMyTurn}
            orientation={myColor ?? 'white'}
          />

          {/* 终局状态横幅 */}
          {gameEnded && (
            <div className="mt-4 card-gold rounded-sm p-6 text-center">
              <div className="font-display text-3xl text-ivory mb-2 tracking-tight-display">
                {endText}
              </div>
              <button
                onClick={onLeave}
                className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5 mt-3"
              >
                <LogOut size={12} /> {t('multiplayer.backToLobby')}
              </button>
            </div>
          )}

          {/* 和棋请求弹窗（对手发起） */}
          {drawOfferedBy === 'opponent' && !gameEnded && (
            <div className="mt-4 card-gold rounded-sm p-4 border-gold/40 flex items-center justify-between gap-3" role="alert">
              <div className="text-sm text-ivory">{t('multiplayer.drawOfferReceived')}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => onDrawReply(true)}
                  className="btn-gold-solid px-3 py-1.5 rounded-sm text-xs uppercase tracking-widest"
                >
                  {t('multiplayer.accept')}
                </button>
                <button
                  onClick={() => onDrawReply(false)}
                  className="btn-gold-outline px-3 py-1.5 rounded-sm text-xs uppercase tracking-widest"
                >
                  {t('multiplayer.decline')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 右：信息栏 */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* 玩家信息 */}
          <div className="card-gold rounded-sm p-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-3">{t('multiplayer.gameInfo')}</div>
            <div className="space-y-2">
              {(['white', 'black'] as PlayerColor[]).map((color) => {
                const isActive = turn === color && gameStatus.state === 'playing';
                const name = myColor === color ? myNick : opponentNick;
                const cm = clockMsFor(color);
                return (
                  <div
                    key={color}
                    className={`flex items-center justify-between text-sm rounded-sm px-2 py-1.5 ${
                      isActive ? 'bg-gold/10' : ''
                    }`}
                  >
                    <span className="text-ivoryDim flex items-center">
                      <span
                        className={`inline-block w-3 h-3 rounded-full mr-2 align-middle ${
                          color === 'white' ? 'bg-ivory' : 'bg-ink-700 border border-gold/30'
                        }`}
                      />
                      {color === 'white' ? t('multiplayer.white') : t('multiplayer.black')}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-ivory">{name}</span>
                      <span
                        className={`font-mono text-sm tabular-nums min-w-[3.5rem] text-right ${
                          isActive ? 'text-gold' : 'text-ivoryDim'
                        }`}
                      >
                        {cm === null ? '∞' : formatClock(cm)}
                      </span>
                    </span>
                  </div>
                );
              })}
              <div className="pt-2 mt-2 border-t border-gold/10 flex items-center justify-between text-xs">
                <span className="text-ivoryDim">{t('multiplayer.turn')}</span>
                <span className={isMyTurn ? 'text-moss' : 'text-gold'}>
                  {myColor === turn ? t('multiplayer.you') : t('multiplayer.opponent')}
                </span>
              </div>
              {timeControl && timeControl.type !== 'unlimited' && (
                <div className="pt-2 mt-2 border-t border-gold/10 flex items-center justify-between text-xs text-ivoryDim/70">
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {t('multiplayer.timeControl')}
                  </span>
                  <span>{timeControlLabel(timeControl, t)}</span>
                </div>
              )}
            </div>
          </div>

          {/* 控制按钮 */}
          {!gameEnded && (
            <div className="card-gold rounded-sm p-4">
              <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-3">{t('multiplayer.controls')}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onResign}
                  className="btn-gold-outline px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 hover:border-wine/50 hover:text-wine"
                >
                  <Flag size={12} /> {t('multiplayer.resign')}
                </button>
                <button
                  onClick={onDrawOffer}
                  disabled={drawOfferedBy === 'me'}
                  className="btn-gold-outline px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Handshake size={12} />
                  {drawOfferedBy === 'me' ? t('multiplayer.drawRequested') : t('multiplayer.offerDraw')}
                </button>
              </div>
              {drawOfferedBy === 'me' && (
                <div className="text-[10px] text-ivoryDim/60 mt-2 text-center">
                  {t('multiplayer.waitingReply')}
                </div>
              )}
            </div>
          )}

          {/* 走子历史 */}
          <MoveHistory moves={moves} />

          {/* 聊天 */}
          <div className="card-gold rounded-sm p-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-3">{t('multiplayer.chat')}</div>
            <div className="h-32 overflow-y-auto space-y-1.5 mb-2 text-xs">
              {chat.length === 0 ? (
                <div className="text-ivoryDim/40 italic text-center py-4">{t('multiplayer.noMessages')}</div>
              ) : (
                chat.map((line, i) => (
                  <div
                    key={i}
                    className={`${
                      line.from === 'me' ? 'text-gold text-right' :
                      line.from === 'opponent' ? 'text-ivory' :
                      'text-ivoryDim/60 italic text-center'
                    }`}
                  >
                    {line.from === 'system' ? `— ${line.text} —` : line.text}
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={t('multiplayer.chatPlaceholder')}
                maxLength={200}
                aria-label={t('multiplayer.chat')}
                className="flex-1 px-2 py-1.5 bg-ink-800/60 border border-gold/15 rounded-sm text-xs text-ivory placeholder:text-ivoryDim/40 focus:outline-none focus:border-gold/40 transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && onSendChat()}
              />
              <button
                onClick={onSendChat}
                disabled={!chatInput.trim()}
                className="btn-gold-outline px-2 py-1.5 rounded-sm text-xs disabled:opacity-40"
                aria-label={t('multiplayer.send')}
              >
                <Send size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
