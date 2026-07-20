// 习题答题页：加载某难度习题 · 玩家走子校验 · 自动应招 · 提示与解答
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import ChessBoard from '@/components/board/ChessBoard';
import { getPuzzlesByLevel } from '@/data';
import { useAppStore } from '@/store/useAppStore';
import { moveToSan } from '@/lib/chess';
import type { Puzzle } from '@/types';
import {
  Puzzle as PuzzleIcon, ArrowLeft, ArrowRight, Lightbulb, Eye, RotateCcw,
  Check, X, Target, Flame, Trophy, Crown, ChevronRight, Sparkles,
} from 'lucide-react';

const LEVEL_META: Record<number, { title: string; en: string; icon: typeof Target; accent: string }> = {
  1: { title: '一步杀', en: 'Mate in 1', icon: Target, accent: 'text-moss' },
  2: { title: '两步杀', en: 'Mate in 2', icon: Flame, accent: 'text-gold' },
  3: { title: '三步杀', en: 'Mate in 3', icon: Trophy, accent: 'text-gold' },
  4: { title: '多步杀', en: 'Mate in N', icon: Crown, accent: 'text-wine' },
};

type Status = 'solving' | 'wrong' | 'solved';

export default function PuzzleDetail() {
  const { level: levelStr } = useParams<{ level: string }>();
  const level = Math.max(1, Math.min(4, Number(levelStr) || 1)) as 1 | 2 | 3 | 4;
  const navigate = useNavigate();

  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);

  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState('');
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [currentStep, setCurrentStep] = useState(0); // 已完成的 solution 步数
  const [status, setStatus] = useState<Status>('solving');
  const [hintMove, setHintMove] = useState<{ from: string; to: string } | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [feedback, setFeedback] = useState<string>('');

  const { recordPuzzleSolved, recordPuzzleAttempt, progress } = useAppStore();

  // 加载该难度的所有习题
  useEffect(() => {
    getPuzzlesByLevel(level).then((data) => {
      if (data.length === 0) {
        setLoading(false);
        return;
      }
      setPuzzles(data);
      loadPuzzle(data[0]);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const loadPuzzle = useCallback((p: Puzzle) => {
    const game = new Chess(p.fen);
    gameRef.current = game;
    setFen(game.fen());
    setPlayerColor(game.turn() === 'w' ? 'white' : 'black');
    setCurrentStep(0);
    setStatus('solving');
    setHintMove(null);
    setShowSolution(false);
    setFeedback('');
  }, []);

  const currentPuzzle = puzzles[currentIdx];

  // 自动应招（对手走子）
  useEffect(() => {
    if (status !== 'solving') return;
    if (!currentPuzzle) return;
    if (currentStep === 0) return; // 玩家先走
    // 当 currentStep 为奇数时（对手回合），自动走 solution[currentStep]
    if (currentStep % 2 === 1 && currentStep < currentPuzzle.solution.length) {
      const timer = setTimeout(() => {
        const game = gameRef.current;
        try {
          const m = game.move(currentPuzzle.solution[currentStep]);
          if (m) {
            setFen(game.fen());
            const nextStep = currentStep + 1;
            setCurrentStep(nextStep);
            if (nextStep >= currentPuzzle.solution.length) {
              setStatus('solved');
              recordPuzzleSolved(currentPuzzle.id, level);
              setFeedback('全部正确，习题完成！');
            }
          }
        } catch {
          // solution 中对手走子失败，跳过
        }
      }, 600);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, status, currentPuzzle]);

  // 玩家走子校验
  const handleDrop = useCallback((from: string, to: string, promotion?: string): boolean => {
    if (status !== 'solving') return false;
    if (!currentPuzzle) return false;
    // 仅在玩家回合允许走子（currentStep 为偶数）
    if (currentStep % 2 !== 0) return false;

    const game = gameRef.current;
    const san = moveToSan(game.fen(), from, to, promotion);
    if (!san) return false;

    const expected = currentPuzzle.solution[currentStep];
    if (san === expected) {
      // 正确：应用走子
      try {
        const m = game.move({ from, to, promotion });
        if (m) {
          setFen(game.fen());
          setHintMove(null);
          const nextStep = currentStep + 1;
          setCurrentStep(nextStep);
          setFeedback('正确！');
          if (nextStep >= currentPuzzle.solution.length) {
            setStatus('solved');
            recordPuzzleSolved(currentPuzzle.id, level);
            setFeedback('全部正确，习题完成！');
          }
          return true;
        }
      } catch {
        return false;
      }
    } else {
      // 错误
      setStatus('wrong');
      recordPuzzleAttempt(level);
      setFeedback(`走子 ${san} 不正确，期望 ${expected}`);
      return false;
    }
    return false;
  }, [currentPuzzle, currentStep, status, level, recordPuzzleSolved, recordPuzzleAttempt]);

  // 重试当前习题
  const handleRetry = useCallback(() => {
    if (currentPuzzle) loadPuzzle(currentPuzzle);
  }, [currentPuzzle, loadPuzzle]);

  // 下一题
  const handleNext = useCallback(() => {
    if (currentIdx < puzzles.length - 1) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      loadPuzzle(puzzles[nextIdx]);
    }
  }, [currentIdx, puzzles, loadPuzzle]);

  // 上一题
  const handlePrev = useCallback(() => {
    if (currentIdx > 0) {
      const prevIdx = currentIdx - 1;
      setCurrentIdx(prevIdx);
      loadPuzzle(puzzles[prevIdx]);
    }
  }, [currentIdx, puzzles, loadPuzzle]);

  // 提示
  const handleHint = useCallback(() => {
    if (!currentPuzzle || status !== 'solving') return;
    const expected = currentPuzzle.solution[currentStep];
    if (!expected) return;
    // 解析 SAN 起止格
    const game = new Chess(gameRef.current.fen());
    const moves = game.moves({ verbose: true });
    const target = moves.find((m) => m.san === expected);
    if (target) {
      setHintMove({ from: target.from, to: target.to });
    }
  }, [currentPuzzle, currentStep, status]);

  // 显示解答
  const handleShowSolution = useCallback(() => {
    setShowSolution(true);
    setStatus('wrong');
    if (currentPuzzle && !progress.puzzleProgress.solved.includes(currentPuzzle.id)) {
      recordPuzzleAttempt(level);
    }
  }, [currentPuzzle, level, progress.puzzleProgress.solved, recordPuzzleAttempt]);

  if (loading) {
    return (
      <div className="px-10 py-16 max-w-[1200px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center animate-pulse">
          <div className="text-sm text-ivoryDim">加载习题数据…</div>
        </div>
      </div>
    );
  }

  if (puzzles.length === 0) {
    return (
      <div className="px-10 py-16 max-w-[1200px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center">
          <PuzzleIcon size={32} className="text-gold/40 mx-auto mb-3" />
          <div className="text-sm text-ivoryDim mb-4">该难度暂无习题</div>
          <Link to="/puzzles" className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5">
            <ArrowLeft size={12} /> 返回习题库
          </Link>
        </div>
      </div>
    );
  }

  const meta = LEVEL_META[level];
  const MetaIcon = meta.icon;
  const isPlayerTurn = currentStep % 2 === 0 && status === 'solving';
  const solvedSet = new Set(progress.puzzleProgress.solved);
  const isAlreadySolved = currentPuzzle ? solvedSet.has(currentPuzzle.id) : false;

  const highlightedSquares: { square: string; color: string }[] = [];
  if (hintMove) {
    highlightedSquares.push({ square: hintMove.from, color: 'rgba(212,165,116,0.35)' });
    highlightedSquares.push({ square: hintMove.to, color: 'rgba(212,165,116,0.55)' });
  }
  const arrowHints = hintMove ? [{ from: hintMove.from, to: hintMove.to, color: 'rgba(212,165,116,0.85)' }] : [];

  return (
    <div className="px-10 py-8 max-w-[1400px] mx-auto">
      {/* 顶部 */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/puzzles')}
          className="text-xs text-ivoryDim hover:text-gold flex items-center gap-1.5 mb-4 transition-colors"
        >
          <ArrowLeft size={12} /> 返回习题库
        </button>
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MetaIcon size={14} className={meta.accent} />
              <span className="text-[10px] uppercase tracking-[0.3em] text-gold/70">Level {level} · {meta.en}</span>
              {isAlreadySolved && (
                <span className="text-[9px] uppercase tracking-widest text-moss flex items-center gap-0.5">
                  <Check size={9} /> 已解答
                </span>
              )}
            </div>
            <h1 className="font-display text-5xl text-ivory tracking-tight-display">
              {meta.title}<span className="text-gold italic"> · 训练</span>
            </h1>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl text-gold">{currentIdx + 1}<span className="text-base text-ivoryDim"> / {puzzles.length}</span></div>
            <div className="text-[10px] uppercase tracking-widest text-ivoryDim">题目进度</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 左：棋盘 + 反馈 + 控制 */}
        <div className="col-span-12 lg:col-span-7">
          <ChessBoard
            fen={fen}
            onDrop={handleDrop}
            orientation={playerColor}
            highlightedSquares={highlightedSquares}
            arrowHints={arrowHints}
            arePiecesDraggable={isPlayerTurn}
          />

          {/* 反馈条 */}
          <div className={`mt-4 card-gold rounded-sm p-4 border-l-2 ${
            status === 'solved' ? 'border-l-moss' :
            status === 'wrong' ? 'border-l-wine' : 'border-l-gold/40'
          }`}>
            <div className="flex items-center gap-3">
              {status === 'solving' && (
                <>
                  <Target size={16} className="text-gold" />
                  <div>
                    <div className="text-xs uppercase tracking-widest text-gold/70 mb-0.5">
                      {isPlayerTurn ? '轮到你走' : '对手应招中…'}
                    </div>
                    <div className="text-sm text-ivory">
                      {currentPuzzle && currentStep === 0 ? '找出制胜走法' : `已完成 ${currentStep} / ${currentPuzzle?.solution.length} 步`}
                    </div>
                  </div>
                </>
              )}
              {status === 'solved' && (
                <>
                  <Check size={16} className="text-moss" />
                  <div>
                    <div className="text-xs uppercase tracking-widest text-moss mb-0.5">习题完成</div>
                    <div className="text-sm text-ivory">{feedback}</div>
                  </div>
                  <button onClick={handleNext} disabled={currentIdx >= puzzles.length - 1} className="ml-auto btn-gold-solid px-4 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                    下一题 <ChevronRight size={12} />
                  </button>
                </>
              )}
              {status === 'wrong' && (
                <>
                  <X size={16} className="text-wine" />
                  <div>
                    <div className="text-xs uppercase tracking-widest text-wine mb-0.5">
                      {showSolution ? '已展示解答' : '走子不正确'}
                    </div>
                    <div className="text-sm text-ivory">{feedback}</div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={handleRetry} className="btn-gold-outline px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5">
                      <RotateCcw size={12} /> 重试
                    </button>
                    {!showSolution && (
                      <button onClick={handleShowSolution} className="btn-gold-solid px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5">
                        <Eye size={12} /> 看解答
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 习题导航 */}
          <div className="mt-4 flex items-center gap-2">
            <button onClick={handlePrev} disabled={currentIdx === 0} className="btn-gold-outline px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
              <ArrowLeft size={12} /> 上一题
            </button>
            <button onClick={handleNext} disabled={currentIdx >= puzzles.length - 1} className="btn-gold-outline px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
              下一题 <ArrowRight size={12} />
            </button>
            <button onClick={handleHint} disabled={!isPlayerTurn} className="ml-auto btn-gold-outline px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
              <Lightbulb size={12} /> 提示
            </button>
            <button onClick={handleRetry} className="px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 border border-gold/20 text-ivoryDim hover:text-gold hover:border-gold/40 transition-colors">
              <RotateCcw size={12} /> 重置
            </button>
          </div>
        </div>

        {/* 右：习题信息 + 解答 */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* 习题元信息 */}
          {currentPuzzle && (
            <div className="card-gold rounded-sm p-5">
              <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-3">习题信息</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-ivoryDim uppercase tracking-widest mb-1">ID</div>
                  <div className="font-mono text-sm text-ivory">{currentPuzzle.id}</div>
                </div>
                <div>
                  <div className="text-[10px] text-ivoryDim uppercase tracking-widest mb-1">难度</div>
                  <div className="font-mono text-sm text-gold">Level {currentPuzzle.level}</div>
                </div>
                <div>
                  <div className="text-[10px] text-ivoryDim uppercase tracking-widest mb-1">评分</div>
                  <div className="font-mono text-sm text-gold">{currentPuzzle.rating}</div>
                </div>
                <div>
                  <div className="text-[10px] text-ivoryDim uppercase tracking-widest mb-1">步数</div>
                  <div className="font-mono text-sm text-gold">{currentPuzzle.solution.length}</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gold/10">
                <div className="text-[10px] text-ivoryDim uppercase tracking-widest mb-2">战术主题</div>
                <div className="flex flex-wrap gap-1.5">
                  {currentPuzzle.theme.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-sm border border-gold/20 text-gold/80 bg-gold/5">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 解答展示 */}
          <div className="card-gold rounded-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/10">
              <Eye size={14} className="text-gold" />
              <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">解答序列</h3>
              <span className="ml-auto font-mono text-[10px] text-ivoryDim">
                {currentStep} / {currentPuzzle?.solution.length ?? 0}
              </span>
            </div>
            <div className="p-4">
              {!currentPuzzle ? (
                <div className="text-center text-xs text-ivoryDim/60 italic py-4">无习题数据</div>
              ) : showSolution || status === 'solved' ? (
                <div className="font-mono text-sm text-ivory leading-loose break-all">
                  {currentPuzzle.solution.map((m, i) => (
                    <span key={i}>
                      {i % 2 === 0 && <span className="text-ivoryDim/60 mr-1">{i / 2 + 1}.</span>}
                      <span className={`mr-2 ${i < currentStep ? 'text-moss' : 'text-gold'}`}>{m}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-ivoryDim/70 italic">
                    解答隐藏中。走子或点击「看解答」以显示完整路径。
                  </div>
                  <div className="font-mono text-xs text-ivoryDim/50">
                    {Array.from({ length: currentPuzzle.solution.length }).map((_, i) => (
                      <span key={i} className="mr-2">
                        {i % 2 === 0 && <span className="text-ivoryDim/40">{i / 2 + 1}.</span>}
                        <span className="mx-1">{i < currentStep ? currentPuzzle.solution[i] : '•••'}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 答题进度条 */}
          <div className="card-gold rounded-sm p-4">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-ivoryDim mb-2">
              <span>题目导航</span>
              <span className="font-mono">{currentIdx + 1} / {puzzles.length}</span>
            </div>
            <div className="grid grid-cols-10 gap-1">
              {puzzles.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => { setCurrentIdx(i); loadPuzzle(p); }}
                  className={`aspect-square rounded-sm text-[9px] font-mono transition-colors ${
                    i === currentIdx
                      ? 'bg-gold text-ink-900'
                      : solvedSet.has(p.id)
                      ? 'bg-moss/30 text-moss border border-moss/40'
                      : 'bg-ink-800 text-ivoryDim border border-gold/10 hover:border-gold/30'
                  }`}
                  title={p.id}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* 提示卡 */}
          <div className="card-gold rounded-sm p-4">
            <div className="flex items-start gap-3">
              <Sparkles size={14} className="text-gold mt-0.5 shrink-0" />
              <div className="text-xs text-ivoryDim leading-relaxed">
                <span className="text-gold">解题提示：</span>
                你执 <span className="text-ivory">{playerColor === 'white' ? '白方' : '黑方'}</span>，
                目标是找到将杀或制胜组合。每步正确走子后，对手将自动应招。
                点击「提示」可查看下一步起止格，「看解答」则展示完整路径。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
