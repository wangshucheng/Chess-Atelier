// 开局训练详情页：逐步主线演练 + 变体推演 + 自由探索
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import ChessBoard from '@/components/board/ChessBoard';
import { loadOpenings } from '@/data';
import { useAppStore } from '@/store/useAppStore';
import type { Opening } from '@/types';
import {
  BookOpen, ArrowLeft, ChevronLeft, ChevronRight, RotateCcw,
  GitBranch, Check, Target, Sparkles, Award, AlertTriangle,
} from 'lucide-react';

export default function OpeningDetail() {
  const { eco } = useParams<{ eco: string }>();
  const navigate = useNavigate();
  const [opening, setOpening] = useState<Opening | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 演练状态
  const gameRef = useRef<Chess | null>(null);
  if (!gameRef.current) gameRef.current = new Chess();
  const [fen, setFen] = useState(gameRef.current.fen());
  const [moves, setMoves] = useState<string[]>([]); // 已走的 SAN
  const [activeVariationIdx, setActiveVariationIdx] = useState<number | null>(null);
  const [exploreMode, setExploreMode] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const recordOpeningPractice = useAppStore((s) => s.recordOpeningPractice);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    // 切换开局时重置演练状态，避免旧开局的"已演练"标记和变体选择残留
    setCompletedSteps(new Set());
    setActiveVariationIdx(null);
    setExploreMode(false);
    loadOpenings()
      .then((data) => {
        if (cancelled) return;
        const found = data.find((o) => o.eco === eco);
        setOpening(found ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : '开局数据加载失败');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [eco]);

  // 重置到指定步数
  const resetToStep = useCallback((step: number, includeVariation: boolean) => {
    const game = new Chess();
    const main = opening?.mainLine ?? [];
    const varMoves = includeVariation && activeVariationIdx !== null
      ? opening?.variations[activeVariationIdx]?.moves ?? []
      : [];

    const allMoves = [...main, ...varMoves];
    const target = Math.min(step, allMoves.length);
    for (let i = 0; i < target; i++) {
      try {
        game.move(allMoves[i]);
      } catch (err) {
        // 开局数据中的非法走子：记录便于排查，停止推演
        console.warn(`[OpeningDetail] 非法走子 at step ${i}:`, allMoves[i], err);
        break;
      }
    }
    gameRef.current = game;
    setFen(game.fen());
    setMoves(game.history({ verbose: true }).map((m) => m.san));
  }, [opening, activeVariationIdx]);

  // 选择变体：仅更新状态，由下面的 effect 同步局面
  const handleSelectVariation = useCallback((idx: number) => {
    setActiveVariationIdx(idx);
    setExploreMode(false);
  }, []);

  // activeVariationIdx 变化时重置局面到主线 + 变体全部走完
  useEffect(() => {
    if (!opening || activeVariationIdx === null) return;
    const variation = opening.variations[activeVariationIdx];
    if (!variation) return;
    const totalSteps = opening.mainLine.length + variation.moves.length;
    resetToStep(totalSteps, true);
  }, [activeVariationIdx, opening, resetToStep]);

  // 上一步
  const handlePrev = useCallback(() => {
    if (moves.length === 0) return;
    const game = gameRef.current;
    if (!game) return;
    game.undo();
    setFen(game.fen());
    setMoves(game.history({ verbose: true }).map((m) => m.san));
  }, [moves.length]);

  // 下一步：按主线/变体顺序自动走
  const handleNext = useCallback(() => {
    if (!opening) return;
    const main = opening.mainLine;
    const variation = activeVariationIdx !== null ? opening.variations[activeVariationIdx] : null;
    const varMoves = variation?.moves ?? [];
    const allMoves = [...main, ...varMoves];
    if (moves.length >= allMoves.length) return;
    const nextSan = allMoves[moves.length];
    const game = gameRef.current;
    if (!game) return;
    try {
      const m = game.move(nextSan);
      if (m) {
        setFen(game.fen());
        setMoves((prev) => [...prev, m.san]);
        // 标记完成
        if (moves.length + 1 === allMoves.length) {
          const varKey = activeVariationIdx !== null ? `v${activeVariationIdx}` : 'main';
          setCompletedSteps((prev) => new Set(prev).add(`${opening.eco}-${varKey}`));
          // 记录练习
          recordOpeningPractice(opening.eco, 100);
        }
      }
    } catch (err) {
      // 主线/变体走子数据异常：记录并提示，避免静默卡住
      console.warn(`[OpeningDetail] 下一步走子失败 at step ${moves.length}:`, nextSan, err);
    }
  }, [opening, activeVariationIdx, moves.length, recordOpeningPractice]);

  // 重置
  const handleReset = useCallback(() => {
    setActiveVariationIdx(null);
    setExploreMode(false);
    resetToStep(0, false);
  }, [resetToStep]);

  // 玩家自由探索：拖拽走子
  const handleDrop = useCallback((from: string, to: string, promotion?: string): boolean => {
    if (!exploreMode) return false;
    const game = gameRef.current;
    if (!game) return false;
    try {
      const m = game.move({ from, to, promotion });
      if (!m) return false;
      setFen(game.fen());
      setMoves((prev) => [...prev, m.san]);
      return true;
    } catch {
      return false;
    }
  }, [exploreMode]);

  // 进入自由探索模式（基于当前局面）
  const handleEnterExplore = useCallback(() => {
    setExploreMode(true);
    setActiveVariationIdx(null);
  }, []);

  const totalSteps = useMemo(() => {
    if (!opening) return 0;
    const variation = activeVariationIdx !== null ? opening.variations[activeVariationIdx] : null;
    const varMoves = variation?.moves.length ?? 0;
    return opening.mainLine.length + varMoves;
  }, [opening, activeVariationIdx]);

  if (loading) {
    return (
      <div className="px-4 md:px-10 py-16 max-w-[1200px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center animate-pulse">
          <div className="text-sm text-ivoryDim">加载开局数据…</div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-4 md:px-10 py-16 max-w-[1200px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center">
          <AlertTriangle size={32} className="text-wine mx-auto mb-3" />
          <div className="text-sm text-ivoryDim mb-4">开局数据加载失败：{loadError}</div>
          <Link to="/openings" className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5">
            <ArrowLeft size={12} /> 返回开局库
          </Link>
        </div>
      </div>
    );
  }

  if (!opening) {
    return (
      <div className="px-4 md:px-10 py-16 max-w-[1200px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center">
          <BookOpen size={32} className="text-gold/40 mx-auto mb-3" />
          <div className="text-sm text-ivoryDim mb-4">未找到 ECO: {eco} 的开局</div>
          <Link to="/openings" className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5">
            <ArrowLeft size={12} /> 返回开局库
          </Link>
        </div>
      </div>
    );
  }

  const currentStep = moves.length;
  const isCompleted = currentStep >= totalSteps && totalSteps > 0;
  const activeVariation = activeVariationIdx !== null ? opening.variations[activeVariationIdx] : null;

  return (
    <div className="px-4 md:px-10 py-8 max-w-[1400px] mx-auto">
      {/* 顶部：返回 + 标题 */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/openings')}
          className="text-xs text-ivoryDim hover:text-gold flex items-center gap-1.5 mb-4 transition-colors"
        >
          <ArrowLeft size={12} /> 返回开局库
        </button>
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs text-gold/70">{opening.eco}</span>
              <span className="text-gold/30">·</span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-gold/60">
                {opening.category === 'open' ? 'Open' : opening.category === 'semi-open' ? 'Semi-Open' : 'Closed'}
              </span>
            </div>
            <h1 className="font-display text-5xl text-ivory tracking-tight-display">
              {opening.nameZh}
            </h1>
            <div className="text-sm text-ivoryDim mt-1 italic">{opening.name}</div>
          </div>
          {isCompleted && (
            <div className="flex items-center gap-2 text-moss text-xs uppercase tracking-widest">
              <Award size={14} /> 演练完成
            </div>
          )}
        </div>
        <p className="text-sm text-ivoryDim leading-relaxed mt-4 max-w-3xl">{opening.description}</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 左：棋盘 + 控制 */}
        <div className="col-span-12 lg:col-span-7">
          <ChessBoard
            fen={fen}
            onDrop={handleDrop}
            arePiecesDraggable={exploreMode}
            orientation="white"
          />

          {/* 步进控制 */}
          <div className="mt-4 card-gold rounded-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] uppercase tracking-[0.25em] text-gold/70">
                {exploreMode ? '自由探索模式' : activeVariation ? `变体：${activeVariation.name}` : '主线演练'}
              </span>
              <span className="ml-auto font-mono text-xs text-ivoryDim">
                {currentStep} / {totalSteps}
              </span>
            </div>

            {/* 进度条 */}
            <div
              className="h-1 bg-ink-800 rounded-full overflow-hidden mb-4"
              role="progressbar"
              aria-label="开局演练进度"
              aria-valuemin={0}
              aria-valuemax={totalSteps}
              aria-valuenow={currentStep}
            >
              <div
                className="h-full bg-gradient-to-r from-gold/60 to-gold transition-all duration-300"
                style={{ width: `${totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0}%` }}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handlePrev}
                disabled={currentStep === 0 || exploreMode}
                className="btn-gold-outline px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={12} /> 上一步
              </button>
              <button
                onClick={handleNext}
                disabled={currentStep >= totalSteps || exploreMode}
                className="btn-gold-solid px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一步 <ChevronRight size={12} />
              </button>
              <button
                onClick={handleReset}
                className="btn-gold-outline px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5"
              >
                <RotateCcw size={12} /> 重置
              </button>
              <button
                onClick={handleEnterExplore}
                className={`ml-auto px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 transition-colors ${
                  exploreMode
                    ? 'bg-gold/15 border border-gold/50 text-gold'
                    : 'border border-gold/20 text-ivoryDim hover:text-gold hover:border-gold/40'
                }`}
              >
                <Sparkles size={12} /> {exploreMode ? '探索中' : '自由探索'}
              </button>
            </div>

            {exploreMode && (
              <div className="mt-3 pt-3 border-t border-gold/10 text-xs text-ivoryDim leading-relaxed">
                自由探索模式已开启：你可在当前局面任意拖拽走子，推演自己的变着。
                点击「重置」可返回主线演练。
              </div>
            )}
          </div>
        </div>

        {/* 右：走子记录 + 变体列表 */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* 走子记录 */}
          <div className="card-gold rounded-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/10">
              <BookOpen size={14} className="text-gold" />
              <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">走子序列</h3>
              <span className="ml-auto font-mono text-[10px] text-ivoryDim">{moves.length} 手</span>
            </div>
            <div className="p-4">
              {moves.length === 0 ? (
                <div className="text-center text-xs text-ivoryDim/60 italic py-4">尚未走子，点击「下一步」开始</div>
              ) : (
                <div className="font-mono text-sm text-ivory leading-loose break-all">
                  {moves.map((m, i) => (
                    <span key={i}>
                      {i % 2 === 0 && <span className="text-ivoryDim/60 mr-1">{i / 2 + 1}.</span>}
                      <span className={`mr-2 ${i === currentStep - 1 ? 'text-gold font-bold' : 'text-ivory'}`}>
                        {m}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 变体列表 */}
          <div className="card-gold rounded-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/10">
              <GitBranch size={14} className="text-gold" />
              <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">变体推演</h3>
              <span className="ml-auto font-mono text-[10px] text-ivoryDim">{opening.variations.length} 种</span>
            </div>
            <div className="divide-y divide-gold/5">
              <button
                onClick={() => { setActiveVariationIdx(null); resetToStep(opening.mainLine.length, false); }}
                className={`w-full px-4 py-3 text-left transition-colors ${
                  activeVariationIdx === null && !exploreMode ? 'bg-gold/10' : 'hover:bg-gold/5'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Target size={12} className="text-gold" />
                  <span className="text-sm text-ivory font-medium">主线</span>
                  {activeVariationIdx === null && !exploreMode && (
                    <Check size={12} className="ml-auto text-moss" />
                  )}
                </div>
                <div className="text-[10px] text-ivoryDim font-mono ml-5">
                  {opening.mainLine.join(' ')}
                </div>
              </button>
              {opening.variations.map((v, idx) => {
                const isFullLine = `${opening.mainLine.join(' ')} ${v.moves.join(' ')}`;
                const isActive = activeVariationIdx === idx;
                const isDone = completedSteps.has(`${opening.eco}-v${idx}`);
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectVariation(idx)}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      isActive ? 'bg-gold/10' : 'hover:bg-gold/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <GitBranch size={12} className={isActive ? 'text-gold' : 'text-gold/40'} />
                      <span className="text-sm text-ivory font-medium">{v.name}</span>
                      {isDone && <Check size={12} className="text-moss" />}
                      {isActive && <span className="ml-auto text-[9px] uppercase tracking-widest text-gold">当前</span>}
                    </div>
                    <div className="text-[10px] text-ivoryDim leading-relaxed ml-5 mb-1">{v.note}</div>
                    <div className="text-[10px] text-ivoryDim/70 font-mono ml-5 break-all">
                      + {v.moves.join(' ')}
                    </div>
                    {isActive && (
                      <div className="mt-2 pt-2 border-t border-gold/10 text-[10px] text-gold/70 font-mono ml-5 break-all">
                        完整序列：{isFullLine}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 演练提示 */}
          <div className="card-gold rounded-sm p-4">
            <div className="flex items-start gap-3">
              <Sparkles size={14} className="text-gold mt-0.5 shrink-0" />
              <div className="text-xs text-ivoryDim leading-relaxed">
                <span className="text-gold">演练提示：</span>
                点击「下一步」逐步走完主线，再选择不同变体查看推演路径。
                切换至「自由探索」可在当前局面任意试走，建立你的开局直觉。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
