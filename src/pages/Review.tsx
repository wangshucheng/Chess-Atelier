// 棋局复盘页：PGN/FEN 导入 + 逐步回放 + 评估曲线 + 走法分析
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Chess } from 'chess.js';
import ChessBoard from '@/components/board/ChessBoard';
import EvalCurve from '@/components/board/EvalCurve';
import { parsePgn, parseFen, detectInputFormat, type ParsedPgn } from '@/lib/pgnParser';
import { evaluatePosition } from '@/engine/evaluation';
import { evalToText, classifyMoveQuality } from '@/engine/explainer';
import { useAppStore } from '@/store/useAppStore';
import type { EvalCurvePoint } from '@/components/board/EvalCurve';
import type { MoveQuality } from '@/types';
import { useI18n } from '@/i18n';
import type { Path, TranslationSchema } from '@/i18n';
import {
  Reply, Upload, Play, Pause, ChevronLeft, ChevronRight,
  SkipBack, SkipForward, Trash2, FileText, TrendingUp, AlertTriangle,
  Sparkles, Clock,
} from 'lucide-react';

// PGN 输入长度上限：防止过大输入撑爆 localStorage 配额
const MAX_PGN_LENGTH = 100_000;

const SAMPLE_PGN = `[Event "Immortal Game"]
[Site "London"]
[Date "1851.??.??"]
[White "Anderssen, Adolf"]
[Black "Kieseritzky, Lionel"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6
7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6
13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2
18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6
23. Be7# 1-0`;

interface MoveAnalysis {
  san: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: number;
  evalAfter: number;
  delta: number;       // 从走子方视角的 delta（正=好）
  quality: MoveQuality;
  mover: 'w' | 'b';
  moveNo: number;
}

// 走法质量样式：仅保留与语言无关的 symbol / color / bg；label 经 t 生成
const QUALITY_STYLE: Record<MoveQuality, { symbol: string; color: string; bg: string }> = {
  best: { symbol: '!!', color: 'text-moss', bg: 'bg-moss/15 border-moss/40' },
  good: { symbol: '!', color: 'text-gold', bg: 'bg-gold/10 border-gold/30' },
  dubious: { symbol: '?!', color: 'text-gold/70', bg: 'bg-gold/5 border-gold/20' },
  mistake: { symbol: '?', color: 'text-wine', bg: 'bg-wine/10 border-wine/30' },
  blunder: { symbol: '??', color: 'text-wine', bg: 'bg-wine/20 border-wine/50' },
};

// 走法单元格键盘激活（Enter / Space）
function handleMoveCellKey(
  e: KeyboardEvent<HTMLTableCellElement>,
  activate: () => void,
) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    activate();
  }
}

export default function Review() {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedPgn | null>(null);
  const [singleFen, setSingleFen] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string>('');
  const [currentIdx, setCurrentIdx] = useState(0); // 当前显示的 FEN 索引（0 = 初始）
  const [isPlaying, setIsPlaying] = useState(false);
  const [analyses, setAnalyses] = useState<MoveAnalysis[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);

  const recordReview = useAppStore((s) => s.recordReview);
  const playTimerRef = useRef<number | null>(null);

  // 解析输入
  const handleParse = useCallback(() => {
    setParseError('');
    setParsed(null);
    setSingleFen(null);
    setAnalyses([]);
    setCurrentIdx(0);
    setIsPlaying(false);

    if (!input.trim()) {
      setParseError(t('review.errors.empty'));
      return;
    }

    if (input.length > MAX_PGN_LENGTH) {
      setParseError(t('review.errors.tooLong', { len: input.length, max: MAX_PGN_LENGTH }));
      return;
    }

    const formatKind = detectInputFormat(input);
    if (formatKind === 'fen') {
      const result = parseFen(input.trim());
      if (result.valid && result.fen) {
        setSingleFen(result.fen);
        setCurrentIdx(0);
      } else {
        setParseError(t('review.errors.invalidFen'));
      }
      return;
    }

    if (formatKind === 'pgn' || formatKind === 'unknown') {
      const result = parsePgn(input);
      if (result && result.moves.length > 0) {
        setParsed(result);
        setCurrentIdx(0);
        recordReview(input);
      } else {
        setParseError(t('review.errors.pgnFailed'));
      }
    }
  }, [input, recordReview, t]);

  // 分析所有走法（计算每个 FEN 的静态评估）
  useEffect(() => {
    if (!parsed || parsed.fens.length < 2) {
      setAnalyses([]);
      return;
    }
    setAnalyzing(true);
    setAnalyzeProgress(0);

    // 异步分批计算，避免阻塞 UI
    const fens = parsed.fens;
    const moves = parsed.moves;
    const results: MoveAnalysis[] = [];
    let i = 0;
    let cancelled = false;
    let timer: number | null = null;

    const step = () => {
      if (cancelled) return;
      const batchSize = 4;
      const end = Math.min(i + batchSize, moves.length);
      try {
        for (; i < end; i++) {
          const fenBefore = fens[i];
          const fenAfter = fens[i + 1];
          const gameBefore = new Chess(fenBefore);
          const gameAfter = new Chess(fenAfter);
          const evalBefore = evaluatePosition(gameBefore);
          const evalAfter = evaluatePosition(gameAfter);
          const mover = gameBefore.turn(); // 谁走的这步
          // delta 从走子方视角：白方走子，正 delta = eval 升高 = 好
          const delta = mover === 'w' ? evalAfter - evalBefore : evalBefore - evalAfter;
          results.push({
            san: moves[i],
            fenBefore,
            fenAfter,
            evalBefore,
            evalAfter,
            delta,
            quality: classifyMoveQuality(delta),
            mover,
            moveNo: Math.floor(i / 2) + 1,
          });
        }
      } catch (err) {
        // 非法 FEN 或评估异常：终止分析并提示用户
        if (!cancelled) {
          setAnalyzing(false);
          setParseError(t('review.errors.analyzeFailed', {
            err: err instanceof Error ? err.message : String(err),
            n: i + 1,
          }));
        }
        return;
      }
      if (cancelled) return;
      setAnalyzeProgress(Math.round((i / moves.length) * 100));
      if (i < moves.length) {
        timer = window.setTimeout(step, 0);
      } else {
        setAnalyses(results);
        setAnalyzing(false);
      }
    };
    timer = window.setTimeout(step, 50);

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [parsed, t]);

  // 自动回放
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) {
        clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
      }
      return;
    }
    const total = parsed ? parsed.fens.length : 1;
    if (currentIdx >= total - 1) {
      setIsPlaying(false);
      return;
    }
    playTimerRef.current = window.setTimeout(() => {
      setCurrentIdx((idx) => Math.min(idx + 1, total - 1));
    }, 900);
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [isPlaying, currentIdx, parsed]);

  const totalSteps = parsed ? Math.max(parsed.fens.length, 1) : 1;
  const currentFen = parsed && parsed.fens.length > 0
    ? parsed.fens[Math.min(currentIdx, parsed.fens.length - 1)]
    : singleFen || new Chess().fen();

  const handleStepPrev = useCallback(() => {
    setIsPlaying(false);
    setCurrentIdx((idx) => Math.max(0, idx - 1));
  }, []);
  const handleStepNext = useCallback(() => {
    setIsPlaying(false);
    setCurrentIdx((idx) => Math.min(totalSteps - 1, idx + 1));
  }, [totalSteps]);
  const handleStart = useCallback(() => {
    setIsPlaying(false);
    setCurrentIdx(0);
  }, []);
  const handleEnd = useCallback(() => {
    setIsPlaying(false);
    setCurrentIdx(totalSteps - 1);
  }, [totalSteps]);
  const handleTogglePlay = useCallback(() => {
    if (currentIdx >= totalSteps - 1) setCurrentIdx(0);
    setIsPlaying((p) => !p);
  }, [currentIdx, totalSteps]);

  const handleClear = useCallback(() => {
    setInput('');
    setParsed(null);
    setSingleFen(null);
    setParseError('');
    setAnalyses([]);
    setCurrentIdx(0);
    setIsPlaying(false);
  }, []);

  const handleLoadSample = useCallback(() => {
    setInput(SAMPLE_PGN);
  }, []);

  // 评估曲线数据
  const evalCurveData = useMemo<EvalCurvePoint[] | null>(() => {
    if (analyses.length === 0) return null;
    const points: EvalCurvePoint[] = [];
    // 起点
    points.push({ x: 0, y: 0, eval: analyses[0]?.evalBefore ?? 0 });
    analyses.forEach((a, i) => {
      points.push({ x: i + 1, y: 0, eval: a.evalAfter });
    });
    return points;
  }, [analyses]);

  // 当前走法分析
  const currentAnalysis = currentIdx > 0 ? analyses[currentIdx - 1] : null;

  // 走法质量统计
  const qualityStats = useMemo(() => {
    const stats: Record<MoveQuality, number> = { best: 0, good: 0, dubious: 0, mistake: 0, blunder: 0 };
    for (const a of analyses) stats[a.quality]++;
    return stats;
  }, [analyses]);

  const qualityLabel = (q: MoveQuality) => t(`review.quality.${q}` as Path<TranslationSchema>);

  return (
    <div className="px-4 md:px-10 py-8 max-w-[1500px] mx-auto">
      {/* 标题 */}
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-2 animate-fade-up">
          <Reply size={12} className="text-gold" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-gold/70">Game Review</span>
        </div>
        <h1 className="font-display text-5xl text-ivory tracking-tight-display animate-fade-up">
          {t('review.title')}
        </h1>
        <p className="text-sm text-ivoryDim mt-2 animate-fade-up" style={{ animationDelay: '0.15s' }}>
          {t('review.subtitle')}
        </p>
      </header>

      {/* 输入区 */}
      <div className="card-gold rounded-sm p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={14} className="text-gold" />
          <span className="text-xs uppercase tracking-[0.25em] text-gold/80">{t('review.inputTitle')}</span>
          <span className="text-[10px] text-ivoryDim ml-2">
            {t('review.inputHint')}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={handleLoadSample} className="text-[10px] uppercase tracking-widest text-ivoryDim hover:text-gold flex items-center gap-1 transition-colors">
              <Sparkles size={10} /> {t('review.loadSample')}
            </button>
            <button onClick={handleClear} className="text-[10px] uppercase tracking-widest text-ivoryDim hover:text-wine flex items-center gap-1 transition-colors">
              <Trash2 size={10} /> {t('review.clear')}
            </button>
          </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('review.placeholder')}
          rows={5}
          aria-label={t('review.inputTitle')}
          className="w-full px-3 py-2 bg-ink-800/60 border border-gold/15 rounded-sm text-sm text-ivory placeholder:text-ivoryDim/40 font-mono focus:outline-none focus:border-gold/50 transition-colors resize-y"
        />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={handleParse} className="btn-gold-solid px-5 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5">
            <Upload size={12} /> {t('review.parse')}
          </button>
          {parseError && (
            <span className="text-xs text-wine flex items-center gap-1">
              <AlertTriangle size={11} /> {parseError}
            </span>
          )}
          {parsed && (
            <span className="text-xs text-moss flex items-center gap-1">
              {t('review.parsedCount', { n: parsed.moves.length })}
              {parsed.headers?.White && ` · ${parsed.headers.White} vs ${parsed.headers.Black || '?'}`}
            </span>
          )}
          {singleFen && (
            <span className="text-xs text-moss flex items-center gap-1">{t('review.fenLoaded')}</span>
          )}
        </div>
      </div>

      {/* 复盘主区 */}
      {(parsed || singleFen) && (
        <div className="grid grid-cols-12 gap-6">
          {/* 左：棋盘 + 回放控制 + 评估曲线 */}
          <div className="col-span-12 lg:col-span-7 space-y-4">
            <ChessBoard fen={currentFen} arePiecesDraggable={false} orientation="white" />

            {/* 回放控制 */}
            <div className="card-gold rounded-sm p-4">
              <div className="flex items-center gap-2">
                <button onClick={handleStart} disabled={currentIdx === 0} className="btn-gold-outline px-3 py-2 rounded-sm text-xs flex items-center disabled:opacity-40 disabled:cursor-not-allowed" title={t('review.controls.start')} aria-label={t('review.controls.start')}>
                  <SkipBack size={12} />
                </button>
                <button onClick={handleStepPrev} disabled={currentIdx === 0} className="btn-gold-outline px-3 py-2 rounded-sm text-xs flex items-center disabled:opacity-40 disabled:cursor-not-allowed" title={t('review.controls.prev')} aria-label={t('review.controls.prev')}>
                  <ChevronLeft size={12} />
                </button>
                <button
                  onClick={handleTogglePlay}
                  disabled={!parsed}
                  className="btn-gold-solid px-4 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={isPlaying ? t('review.controls.pause') : t('review.controls.play')}
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                  {isPlaying ? t('review.controls.pause') : t('review.controls.play')}
                </button>
                <button onClick={handleStepNext} disabled={currentIdx >= totalSteps - 1} className="btn-gold-outline px-3 py-2 rounded-sm text-xs flex items-center disabled:opacity-40 disabled:cursor-not-allowed" title={t('review.controls.next')} aria-label={t('review.controls.next')}>
                  <ChevronRight size={12} />
                </button>
                <button onClick={handleEnd} disabled={currentIdx >= totalSteps - 1} className="btn-gold-outline px-3 py-2 rounded-sm text-xs flex items-center disabled:opacity-40 disabled:cursor-not-allowed" title={t('review.controls.end')} aria-label={t('review.controls.end')}>
                  <SkipForward size={12} />
                </button>
                <div className="ml-auto flex items-center gap-3 text-xs text-ivoryDim">
                  <Clock size={11} className="text-gold" />
                  <span className="font-mono">
                    {currentIdx} / {totalSteps - 1}
                  </span>
                  <div
                    className="w-32 h-1 bg-ink-800 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-label={t('review.controls.progress')}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(totalSteps - 1, 0)}
                    aria-valuenow={currentIdx}
                  >
                    <div
                      className="h-full bg-gold transition-all duration-300"
                      style={{ width: `${totalSteps > 1 ? (currentIdx / (totalSteps - 1)) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 评估曲线 */}
            <div className="card-gold rounded-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-gold" />
                <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">{t('review.evalCurve')}</h3>
                {analyzing && (
                  <span className="ml-auto text-[10px] text-ivoryDim font-mono">
                    {t('review.analyzing', { n: analyzeProgress })}
                  </span>
                )}
                {!analyzing && analyses.length > 0 && (
                  <span className="ml-auto text-[10px] text-ivoryDim font-mono">
                    {t('review.currentEval', { eval: evalToText(currentAnalysis?.evalAfter ?? analyses[0]?.evalBefore ?? 0) })}
                  </span>
                )}
              </div>
              <EvalCurve
                data={evalCurveData}
                currentIdx={currentIdx}
                height={140}
              />
              <div className="flex items-center justify-between mt-2 text-[9px] uppercase tracking-widest text-ivoryDim/60">
                <span>{t('review.blackAdv')}</span>
                <span>{t('review.whiteAdv')}</span>
              </div>
            </div>

            {/* 当前走法分析 */}
            {currentAnalysis && (
              <div className={`card-gold rounded-sm p-4 border-l-2 ${
                currentAnalysis.quality === 'best' || currentAnalysis.quality === 'good' ? 'border-l-moss' :
                currentAnalysis.quality === 'dubious' ? 'border-l-gold' : 'border-l-wine'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`px-2 py-1 rounded-sm border text-xs font-mono ${QUALITY_STYLE[currentAnalysis.quality].bg} ${QUALITY_STYLE[currentAnalysis.quality].color}`}>
                    {QUALITY_STYLE[currentAnalysis.quality].symbol} {qualityLabel(currentAnalysis.quality)}
                  </div>
                  <div>
                    <div className="text-sm text-ivory">
                      {t('review.moveNo', {
                        n: currentAnalysis.moveNo,
                        side: t(currentAnalysis.mover === 'w' ? 'review.white' : 'review.black'),
                        san: currentAnalysis.san,
                      })}
                    </div>
                    <div className="text-[10px] text-ivoryDim font-mono mt-0.5">
                      {t('review.evalLabel')} {evalToText(currentAnalysis.evalBefore)} → {evalToText(currentAnalysis.evalAfter)}
                      {' '}{t('review.evalChange', { delta: currentAnalysis.delta >= 0 ? '+' + (currentAnalysis.delta / 100).toFixed(2) : (currentAnalysis.delta / 100).toFixed(2) })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 右：走法列表 + 头信息 + 质量统计 */}
          <div className="col-span-12 lg:col-span-5 space-y-4">
            {/* 对局头信息 */}
            {parsed?.headers && Object.keys(parsed.headers).length > 0 && (
              <div className="card-gold rounded-sm p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-3">{t('review.gameInfo')}</div>
                <div className="space-y-2">
                  {parsed.headers.White && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ivoryDim uppercase tracking-widest text-[10px]">{t('review.white')}</span>
                      <span className="text-ivory font-medium">{parsed.headers.White}</span>
                    </div>
                  )}
                  {parsed.headers.Black && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ivoryDim uppercase tracking-widest text-[10px]">{t('review.black')}</span>
                      <span className="text-ivory font-medium">{parsed.headers.Black}</span>
                    </div>
                  )}
                  {parsed.headers.Event && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ivoryDim uppercase tracking-widest text-[10px]">{t('review.event')}</span>
                      <span className="text-ivory">{parsed.headers.Event}</span>
                    </div>
                  )}
                  {parsed.headers.Date && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ivoryDim uppercase tracking-widest text-[10px]">{t('review.date')}</span>
                      <span className="text-ivory font-mono">{parsed.headers.Date}</span>
                    </div>
                  )}
                  {parsed.headers.Result && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ivoryDim uppercase tracking-widest text-[10px]">{t('review.result')}</span>
                      <span className="text-gold font-mono">{parsed.headers.Result}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 质量统计 */}
            {analyses.length > 0 && (
              <div className="card-gold rounded-sm p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-3">{t('review.qualityTitle')}</div>
                <div className="grid grid-cols-5 gap-2">
                  {(Object.keys(QUALITY_STYLE) as MoveQuality[]).map((q) => (
                    <div key={q} className={`text-center rounded-sm border py-2 ${QUALITY_STYLE[q].bg}`}>
                      <div className={`font-mono text-sm ${QUALITY_STYLE[q].color}`}>{QUALITY_STYLE[q].symbol}</div>
                      <div className={`text-[9px] uppercase tracking-wider ${QUALITY_STYLE[q].color}`}>{qualityLabel(q)}</div>
                      <div className="font-mono text-xs text-ivory mt-0.5">{qualityStats[q]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 走法列表 */}
            {parsed && (
              <div className="card-gold rounded-sm">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/10">
                  <Reply size={14} className="text-gold" />
                  <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">{t('review.moveList')}</h3>
                  <span className="ml-auto font-mono text-[10px] text-ivoryDim">{t('review.moveCount', { n: parsed.moves.length })}</span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm font-mono">
                    <tbody>
                      {Array.from({ length: Math.ceil(parsed.moves.length / 2) }).map((_, rowIdx) => {
                        const wIdx = rowIdx * 2;
                        const bIdx = rowIdx * 2 + 1;
                        const wMove = parsed.moves[wIdx];
                        const bMove = parsed.moves[bIdx];
                        const wAna = analyses[wIdx];
                        const bAna = analyses[bIdx];
                        return (
                          <tr key={rowIdx} className="border-b border-gold/5 last:border-0">
                            <td className="px-3 py-1.5 text-[10px] text-ivoryDim/60 w-10 text-right">{rowIdx + 1}.</td>
                            <td
                              className={`px-2 py-1.5 cursor-pointer transition-colors ${
                                currentIdx - 1 === wIdx ? 'bg-gold/20 text-ivory' : 'text-ivory/80 hover:bg-gold/10'
                              }`}
                              onClick={() => { setIsPlaying(false); setCurrentIdx(wIdx + 1); }}
                              onKeyDown={(e) => handleMoveCellKey(e, () => { setIsPlaying(false); setCurrentIdx(wIdx + 1); })}
                              role="button"
                              tabIndex={0}
                              aria-label={t('review.ariaMoveWhite', { n: rowIdx + 1, move: wMove })}
                              aria-current={currentIdx - 1 === wIdx ? 'true' : undefined}
                            >
                              <span className="flex items-center gap-1.5">
                                {wMove}
                                {wAna && (
                                  <span className={`text-[9px] ${QUALITY_STYLE[wAna.quality].color}`}>
                                    {QUALITY_STYLE[wAna.quality].symbol}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td
                              className={`px-2 py-1.5 cursor-pointer transition-colors ${
                                currentIdx - 1 === bIdx ? 'bg-gold/20 text-ivory' : bMove ? 'text-ivory/80 hover:bg-gold/10' : ''
                              }`}
                              onClick={() => { if (bMove) { setIsPlaying(false); setCurrentIdx(bIdx + 1); } }}
                              onKeyDown={(e) => { if (bMove) handleMoveCellKey(e, () => { setIsPlaying(false); setCurrentIdx(bIdx + 1); }); }}
                              role={bMove ? 'button' : undefined}
                              tabIndex={bMove ? 0 : undefined}
                              aria-label={bMove ? t('review.ariaMoveBlack', { n: rowIdx + 1, move: bMove }) : undefined}
                              aria-current={currentIdx - 1 === bIdx ? 'true' : undefined}
                            >
                              {bMove && (
                                <span className="flex items-center gap-1.5">
                                  {bMove}
                                  {bAna && (
                                    <span className={`text-[9px] ${QUALITY_STYLE[bAna.quality].color}`}>
                                      {QUALITY_STYLE[bAna.quality].symbol}
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 空状态提示 */}
      {!parsed && !singleFen && !parseError && (
        <div className="card-gold rounded-sm p-12 text-center">
          <Reply size={32} className="text-gold/30 mx-auto mb-3" />
          <div className="text-sm text-ivoryDim mb-2">{t('review.emptyState')}</div>
          <div className="text-xs text-ivoryDim/60">
            {t('review.emptyHint')}
          </div>
        </div>
      )}
    </div>
  );
}
