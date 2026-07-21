// 陪练对战页：AI 对弈 + 最佳走法提示 + 逐步棋理讲解 + 走法路径预览与对比
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import ChessBoard from '@/components/board/ChessBoard';
import MoveHistory from '@/components/board/MoveHistory';
import EvalBar from '@/components/board/EvalBar';
import { useAiEngine } from '@/hooks/useAiEngine';
import { useAppStore } from '@/store/useAppStore';
import { useConfirm } from '@/components/ConfirmModal';
import { evalToText, explainPosition } from '@/engine/explainer';
import { buildHintHighlights, buildHintArrows } from '@/lib/highlights';
import { play } from '@/lib/sounds';
import type { Explanation, SearchCandidate } from '@/types';
import type { Move } from 'chess.js';
import {
  Crown, Lightbulb, Undo, RotateCw, Flag, Sparkles,
  Brain, Target, TrendingUp, GitBranch, Cpu, Zap, Shield,
  ChevronRight, Eye, AlertTriangle,
} from 'lucide-react';

const LEVEL_INFO: { range: string; label: string; desc: string }[] = [
  { range: '1-2', label: '初学', desc: '高随机性 · 浅搜索' },
  { range: '3-4', label: '业余', desc: '深度 2 · α-β 剪枝' },
  { range: '5-6', label: '俱乐部', desc: '深度 3 · 适度精准' },
  { range: '7-8', label: '高级', desc: '深度 4 · 精确计算' },
  { range: '9-10', label: '大师', desc: '深度 5 · 最优解' },
];

const RISK_STYLE: Record<Explanation['riskLevel'], { color: string; label: string }> = {
  low: { color: 'text-moss', label: '低风险' },
  medium: { color: 'text-gold', label: '中等风险' },
  high: { color: 'text-wine', label: '高风险' },
};

interface GameStatus {
  state: 'playing' | 'checkmate' | 'draw' | 'resigned';
  winner?: 'w' | 'b';
  reason?: string;
}

// 根据走子特征播放对应音效（不依赖 React，避免 useCallback 依赖膨胀）
function playMoveSound(move: Move): void {
  const san = move.san;
  // 将杀：san 含 '#'
  if (san.includes('#')) {
    // 将杀音效由 checkGameEnd 处的 win/loss 接管，这里不重复播放
    return;
  }
  // 王车易位
  if (san === 'O-O' || san === 'O-O-O') {
    play('castle');
    return;
  }
  // 升变
  if (move.promotion) {
    play('promote');
    return;
  }
  // 吃子
  if (move.captured || san.includes('x')) {
    play('capture');
    return;
  }
  // 将军
  if (san.includes('+')) {
    play('check');
    return;
  }
  // 普通走子
  play('move');
}

export default function Play() {
  // 懒初始化：避免每次渲染都执行 new Chess()
  const gameRef = useRef<Chess | null>(null);
  if (!gameRef.current) gameRef.current = new Chess();
  const [fen, setFen] = useState(gameRef.current.fen());
  const [moves, setMoves] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [aiLevel, setAiLevel] = useState(3);
  const [evaluation, setEvaluation] = useState(0);
  const [hintMove, setHintMove] = useState<{ from: string; to: string } | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number | null>(null);
  const [pvPreview, setPvPreview] = useState<string[]>([]);
  const [pvPreviewFen, setPvPreviewFen] = useState<string | null>(null);
  const [status, setStatus] = useState<GameStatus>({ state: 'playing' });
  const [lastSearchMeta, setLastSearchMeta] = useState<{ depth: number; nodes: number; timeMs: number } | null>(null);

  const recordGame = useAppStore((s) => s.recordGame);
  const addTrainingTime = useAppStore((s) => s.addTrainingTime);
  const confirm = useConfirm();
  const sessionStartRef = useRef(Date.now());

  const { isThinking, error: aiError, search } = useAiEngine({
    onResult: (result) => {
      setEvaluation(result.evaluation);
      setCandidates(result.candidates);
      setLastSearchMeta({ depth: result.depth, nodes: result.nodesSearched, timeMs: result.timeMs });

      // 生成棋理讲解（lazy ref 已确保非空）
      const game = gameRef.current;
      if (!game) return;
      const expl = explainPosition(game, result.candidates[0]);
      setExplanation(expl);
    },
  });

  // 应用走子
  const applyMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    const game = gameRef.current;
    if (!game) return false;
    try {
      const move = game.move({ from, to, promotion });
      if (!move) return false;
      setFen(game.fen());
      setMoves((prev) => [...prev, move.san]);
      setHintMove(null);
      setSelectedCandidateIdx(null);
      setPvPreview([]);
      setPvPreviewFen(null);
      // 走子音效：根据走子特征选择
      // 优先级：将杀 > 将军 > 王车易位 > 升变 > 吃子 > 普通走子
      playMoveSound(move);
      return true;
    } catch (err) {
      // chess.js 对非法走子抛 Error，记录便于调试但不打扰用户
      console.warn('[Play] applyMove 失败:', { from, to, promotion }, err);
      return false;
    }
  }, []);

  // 检查游戏结束
  const checkGameEnd = useCallback((): boolean => {
    const game = gameRef.current;
    if (!game) return false;
    if (game.isCheckmate()) {
      const turn = game.turn();
      // 被将杀的一方是 turn，对方获胜
      const winner = turn === 'w' ? 'b' : 'w';
      setStatus({ state: 'checkmate', winner, reason: '将杀' });
      recordGame(winner === 'w' ? 'win' : 'loss');
      // 玩家白方，winner==='w' 表示玩家胜
      play(winner === 'w' ? 'win' : 'loss');
      return true;
    }
    if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.isInsufficientMaterial()) {
      let reason = '和棋';
      if (game.isStalemate()) reason = '逼和';
      else if (game.isThreefoldRepetition()) reason = '三次重复';
      else if (game.isInsufficientMaterial()) reason = '子力不足';
      setStatus({ state: 'draw', reason });
      recordGame('draw');
      play('draw');
      return true;
    }
    return false;
  }, [recordGame]);

  // 玩家走子
  const handleDrop = useCallback((sourceSquare: string, targetSquare: string, promotion?: string): boolean => {
    if (status.state !== 'playing') return false;
    const game = gameRef.current;
    if (!game || game.turn() !== 'w') return false; // 仅白方（玩家）走子
    const ok = applyMove(sourceSquare, targetSquare, promotion);
    if (!ok) return false;
    checkGameEnd();
    return true;
  }, [applyMove, checkGameEnd, status.state]);

  // AI 自动应招
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    if (status.state !== 'playing') return;
    if (game.turn() !== 'b') return;
    if (game.isGameOver()) return;

    let cancelled = false;
    const fenNow = game.fen();
    search(fenNow, aiLevel)
      .then((result) => {
        if (cancelled) return;
        applyMove(result.from, result.to, result.promotion);
        checkGameEnd();
      })
      .catch((err) => {
        // 仅记录日志，错误状态由 useAiError 暴露给 UI
        if (!cancelled) console.warn('[Play] AI 应招失败:', err);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, status.state, aiLevel]);

  // 提示
  const handleHint = useCallback(() => {
    if (status.state !== 'playing') return;
    const game = gameRef.current;
    if (!game) return;
    const fenNow = game.fen();
    search(fenNow, Math.max(aiLevel, 5))
      .then((result) => {
        setHintMove({ from: result.from, to: result.to });
        setEvaluation(result.evaluation);
        setCandidates(result.candidates);
        setLastSearchMeta({ depth: result.depth, nodes: result.nodesSearched, timeMs: result.timeMs });
        const g = gameRef.current;
        if (!g) return;
        const expl = explainPosition(g, result.candidates[0]);
        setExplanation(expl);
      })
      .catch((err) => {
        console.warn('[Play] 求提示失败:', err);
      });
  }, [aiLevel, search, status.state]);

  // 撤销（撤回玩家与AI各一步）
  // 仅在游戏进行中允许，避免终局悔棋导致胜负记录失真
  const handleUndo = useCallback(() => {
    if (status.state !== 'playing') return;
    const game = gameRef.current;
    if (!game) return;
    // 撤回两步（玩家+AI），不足两步则不操作
    if (game.history().length < 2) return;
    game.undo();
    game.undo();
    setFen(game.fen());
    setMoves(game.history({ verbose: true }).map((m) => m.san));
    setHintMove(null);
    setCandidates([]);
    setExplanation(null);
    setPvPreview([]);
    setPvPreviewFen(null);
    setSelectedCandidateIdx(null);
  }, [status.state]);

  // 新局
  const handleNewGame = useCallback(() => {
    gameRef.current = new Chess();
    setFen(gameRef.current.fen());
    setMoves([]);
    setStatus({ state: 'playing' });
    setHintMove(null);
    setCandidates([]);
    setExplanation(null);
    setEvaluation(0);
    setPvPreview([]);
    setPvPreviewFen(null);
    setSelectedCandidateIdx(null);
  }, []);

  // 认输
  const handleResign = useCallback(async () => {
    if (status.state !== 'playing') return;
    const ok = await confirm({
      title: '确认认输？',
      message: '本局将记为负，对局结束。',
      confirmText: '认输',
      danger: true,
    });
    if (!ok) return;
    setStatus({ state: 'resigned', winner: 'b', reason: '玩家认输' });
    recordGame('loss');
    play('loss');
  }, [recordGame, status.state, confirm]);

  // 翻转棋盘
  const handleFlip = useCallback(() => {
    setOrientation((o) => (o === 'white' ? 'black' : 'white'));
  }, []);

  // 选中候选走法 → 预览主路径（PV）
  // 使用 SearchCandidate.principalVariation 真实推演多步
  const handleSelectCandidate = useCallback((idx: number) => {
    setSelectedCandidateIdx(idx);
    const c = candidates[idx];
    if (!c) return;
    const current = gameRef.current;
    if (!current) return;
    // 在副本上推演完整 PV，最终停在 PV 末端的局面
    const previewGame = new Chess(current.fen());
    // 取 PV 前 6 步用于预览（避免过长）
    const pvSteps = c.principalVariation.slice(0, 6);
    // 尝试逐步应用 SAN，遇到非法则停在当前
    for (const san of pvSteps) {
      try {
        previewGame.move(san);
      } catch {
        break;
      }
    }
    setPvPreviewFen(previewGame.fen());
    setPvPreview(pvSteps);
  }, [candidates]);

  // 离开页面时累计训练时长
  useEffect(() => {
    const start = sessionStartRef.current;
    return () => {
      addTrainingTime(Date.now() - start);
    };
  }, [addTrainingTime]);

  // 从 fen 推导当前轮次（避免渲染期读 ref 导致与状态不同步）
  // FEN 第 2 字段为 'w' 或 'b'
  const turn: 'w' | 'b' = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const isPlayerTurn = turn === 'w' && status.state === 'playing';
  const levelInfo = LEVEL_INFO.find((l) => {
    const [lo, hi] = l.range.split('-').map(Number);
    return aiLevel >= lo && aiLevel <= hi;
  }) ?? LEVEL_INFO[0];

  const highlightedSquares = useMemo(() => buildHintHighlights(hintMove), [hintMove]);
  const arrowHints = useMemo(() => buildHintArrows(hintMove), [hintMove]);

  return (
    <div className="px-4 md:px-10 py-8 max-w-[1600px] mx-auto">
      {/* 顶部标题栏 */}
      <header className="mb-8 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2 animate-fade-up">
            <Crown size={12} className="text-gold" />
            <span className="text-[10px] uppercase tracking-[0.4em] text-gold/70">Practice Match</span>
          </div>
          <h1 className="font-display text-5xl text-ivory tracking-tight-display animate-fade-up">
            陪练<span className="text-gold italic">对战</span>
          </h1>
          <p className="text-sm text-ivoryDim mt-2 animate-fade-up" style={{ animationDelay: '0.15s' }}>
            Minimax + Alpha-Beta 剪枝 · 你执白方，AI 执黑方
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-1">回合</div>
          <div className="font-display text-2xl text-ivory">
            {Math.floor(moves.length / 2) + 1}
            <span className="text-sm text-ivoryDim ml-1">{turn === 'w' ? '白方' : '黑方'}</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* 左列：评估条 + 棋盘 + 控制 */}
        <div className="col-span-12 lg:col-span-7">
          <div className="flex gap-3 items-start">
            <EvalBar evaluation={evaluation} height={420} />
            <div className="flex-1">
              <ChessBoard
                fen={pvPreviewFen || fen}
                onDrop={handleDrop}
                orientation={orientation}
                highlightedSquares={highlightedSquares}
                arrowHints={arrowHints}
                arePiecesDraggable={isPlayerTurn && !isThinking && !pvPreviewFen}
              />
              {pvPreviewFen && (
                <div className="mt-2 flex items-center justify-between text-xs px-2">
                  <span className="text-gold flex items-center gap-1.5">
                    <Eye size={11} /> 路径预览模式
                  </span>
                  <button
                    onClick={() => { setPvPreviewFen(null); setPvPreview([]); setSelectedCandidateIdx(null); }}
                    className="text-ivoryDim hover:text-ivory underline underline-offset-2"
                  >
                    返回当前局面
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 棋盘下方：游戏控制 */}
          <div className="mt-4 card-gold rounded-sm p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={handleNewGame} className="btn-gold-solid px-4 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5">
                <Crown size={12} /> 新局
              </button>
              <button onClick={handleUndo} disabled={moves.length < 2 || isThinking || status.state !== 'playing'} className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                <Undo size={12} /> 悔棋
              </button>
              <button onClick={handleFlip} className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5">
                <RotateCw size={12} /> 翻转
              </button>
              <button onClick={handleResign} disabled={status.state !== 'playing'} className="px-4 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 border border-wine/40 text-wine hover:bg-wine/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Flag size={12} /> 认输
              </button>
              <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-widest text-ivoryDim">
                <Cpu size={11} className={isThinking ? 'text-gold animate-breathe' : 'text-gold/40'} />
                <span>{isThinking ? 'AI 计算中…' : 'AI 待命'}</span>
              </div>
            </div>

            {/* AI 错误提示 */}
            {aiError && (
              <div
                className="mt-3 px-3 py-2 rounded-sm border border-wine/40 bg-wine/10 text-xs text-wine flex items-center gap-2"
                role="alert"
              >
                <AlertTriangle size={12} className="shrink-0" />
                <span>AI 计算失败：{aiError}</span>
              </div>
            )}

            {/* 难度滑块 */}
            <div className="mt-4 pt-4 border-t border-gold/10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Brain size={12} className="text-gold" />
                  <span className="text-[10px] uppercase tracking-[0.25em] text-gold/70">AI 难度</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-2xl text-gold">{aiLevel}</span>
                  <span className="text-xs text-ivoryDim">/ 10</span>
                  <span className="ml-2 text-xs text-ivoryDim">· {levelInfo.label}</span>
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={aiLevel}
                onChange={(e) => setAiLevel(Number(e.target.value))}
                aria-label="AI 难度"
                aria-valuetext={`${aiLevel} - ${levelInfo.label}`}
                className="w-full accent-[#D4A574]"
              />
              <div className="flex justify-between mt-1 text-[9px] uppercase tracking-widest text-ivoryDim/60">
                {LEVEL_INFO.map((l) => (
                  <span key={l.range} className={levelInfo.range === l.range ? 'text-gold' : ''}>{l.label}</span>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-ivoryDim font-mono">{levelInfo.desc}</div>
            </div>

            {/* 搜索元信息 */}
            {lastSearchMeta && (
              <div className="mt-3 pt-3 border-t border-gold/10 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="font-mono text-sm text-gold">{lastSearchMeta.depth}</div>
                  <div className="text-[9px] uppercase tracking-widest text-ivoryDim">搜索深度</div>
                </div>
                <div>
                  <div className="font-mono text-sm text-gold">{lastSearchMeta.nodes.toLocaleString('en-US')}</div>
                  <div className="text-[9px] uppercase tracking-widest text-ivoryDim">节点数</div>
                </div>
                <div>
                  <div className="font-mono text-sm text-gold">{lastSearchMeta.timeMs}ms</div>
                  <div className="text-[9px] uppercase tracking-widest text-ivoryDim">耗时</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右列：走棋记录 + 提示 + 讲解 + 候选 */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* 状态横幅 */}
          {status.state !== 'playing' && (
            <div className={`card-gold rounded-sm p-5 border-l-2 ${status.winner === 'w' ? 'border-l-moss' : status.winner === 'b' ? 'border-l-wine' : 'border-l-gold'}`}>
              <div className="flex items-center gap-3">
                {status.winner === 'w' ? <Crown className="text-moss" /> : status.winner === 'b' ? <Flag className="text-wine" /> : <Sparkles className="text-gold" />}
                <div>
                  <div className="text-xs uppercase tracking-widest text-ivoryDim mb-1">对局结束</div>
                  <div className="font-display text-2xl text-ivory">
                    {status.state === 'checkmate' && (status.winner === 'w' ? '你赢了' : 'AI 获胜')}
                    {status.state === 'draw' && '和棋'}
                    {status.state === 'resigned' && '你已认输'}
                  </div>
                  <div className="text-xs text-ivoryDim mt-1">{status.reason}</div>
                </div>
              </div>
            </div>
          )}

          {/* 走棋记录 */}
          <MoveHistory
            moves={moves}
            currentIndex={moves.length - 1}
          />

          {/* 提示与讲解 */}
          <div className="card-gold rounded-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/10">
              <Lightbulb size={14} className="text-gold" />
              <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">提示与讲解</h3>
              <button
                onClick={handleHint}
                disabled={!isPlayerTurn || isThinking}
                className="ml-auto btn-gold-outline px-3 py-1 rounded-sm text-[10px] uppercase tracking-widest flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Zap size={10} /> {hintMove ? '已显示' : '求提示'}
              </button>
            </div>
            <div className="p-4">
              {!explanation ? (
                <div className="text-center text-xs text-ivoryDim/60 italic py-6">
                  走出第一步或点击「求提示」以获取棋理讲解
                </div>
              ) : (
                <div className="space-y-3">
                  {/* 评估与风险 */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp size={11} className="text-gold" />
                      <span className="text-[10px] uppercase tracking-widest text-ivoryDim">评估</span>
                      <span className="font-mono text-sm text-gold">{evalToText(evaluation)}</span>
                    </div>
                    <div className="w-px h-3 bg-gold/20" />
                    <div className="flex items-center gap-1.5">
                      <Shield size={11} className="text-gold" />
                      <span className="text-[10px] uppercase tracking-widest text-ivoryDim">风险</span>
                      <span className={`text-xs ${RISK_STYLE[explanation.riskLevel].color}`}>
                        {RISK_STYLE[explanation.riskLevel].label}
                      </span>
                    </div>
                  </div>

                  {/* 主题标签 */}
                  <div className="flex flex-wrap gap-1.5">
                    {explanation.themes.map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-sm border border-gold/20 text-gold/80 bg-gold/5">
                        {t}
                      </span>
                    ))}
                  </div>

                  {/* 一句话总结 */}
                  <p className="text-sm text-ivory leading-relaxed border-l-2 border-gold/40 pl-3 italic">
                    {explanation.summary}
                  </p>

                  {/* 详细解说 */}
                  <ul className="space-y-1.5">
                    {explanation.details.map((d, i) => (
                      <li key={i} className="text-xs text-ivoryDim leading-relaxed flex gap-2">
                        <span className="text-gold/60 mt-0.5">·</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* 候选走法对比 */}
          {candidates.length > 0 && (
            <div className="card-gold rounded-sm">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/10">
                <GitBranch size={14} className="text-gold" />
                <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">候选走法对比</h3>
                <span className="ml-auto font-mono text-[10px] text-ivoryDim">Top {candidates.length}</span>
              </div>
              <div className="divide-y divide-gold/5">
                {candidates.map((c, idx) => {
                  const isSelected = selectedCandidateIdx === idx;
                  const isBest = idx === 0;
                  return (
                    <button
                      key={`${c.move}-${idx}`}
                      onClick={() => handleSelectCandidate(idx)}
                      className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                        isSelected ? 'bg-gold/10' : 'hover:bg-gold/5'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-sm flex items-center justify-center font-mono text-xs ${
                        isBest ? 'bg-gold/20 text-gold border border-gold/40' : 'bg-ink-800 text-ivoryDim border border-gold/10'
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-ivory">{c.move}</span>
                          {isBest && (
                            <span className="text-[9px] uppercase tracking-widest text-gold flex items-center gap-0.5">
                              <Target size={9} /> 最优
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-ivoryDim font-mono">
                          {c.from} → {c.to}{c.promotion ? ` (= ${c.promotion})` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-mono text-sm ${isBest ? 'text-gold' : 'text-ivoryDim'}`}>
                          {evalToText(c.evaluation)}
                        </div>
                      </div>
                      <ChevronRight size={12} className={`text-gold/40 transition-transform ${isSelected ? 'translate-x-0' : '-translate-x-1'}`} />
                    </button>
                  );
                })}
              </div>
              {pvPreview.length > 0 && (
                <div className="px-4 py-3 border-t border-gold/10 bg-ink-800/40">
                  <div className="text-[10px] uppercase tracking-widest text-gold/60 mb-2 flex items-center gap-1.5">
                    <Eye size={10} /> 主路径预览（PV）
                  </div>
                  <div className="font-mono text-xs text-ivory leading-relaxed break-all">
                    {pvPreview.map((m, i) => (
                      <span key={i}>
                        {i % 2 === 0 && <span className="text-ivoryDim/60 mr-1">{Math.floor(i / 2) + 1}.</span>}
                        <span className="text-gold mr-1.5">{m}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
