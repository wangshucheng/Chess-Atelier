// 棋局复盘页：PGN/FEN 导入 + 逐步回放 + 评估曲线 + 走法分析
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import ChessBoard from '@/components/board/ChessBoard';
import { parsePgn, parseFen, detectInputFormat, type ParsedPgn } from '@/lib/pgnParser';
import { evaluatePosition } from '@/engine/evaluation';
import { evalToText } from '@/engine/explainer';
import { useAppStore } from '@/store/useAppStore';
import type { MoveQuality } from '@/types';
import {
  Reply, Upload, Play, Pause, ChevronLeft, ChevronRight,
  SkipBack, SkipForward, Trash2, FileText, TrendingUp, AlertTriangle,
  Sparkles, Clock,
} from 'lucide-react';

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

function classifyByDelta(delta: number): MoveQuality {
  if (delta < -300) return 'blunder';
  if (delta < -100) return 'mistake';
  if (delta < -50) return 'dubious';
  if (delta < 50) return 'good';
  return 'best';
}

const QUALITY_STYLE: Record<MoveQuality, { label: string; symbol: string; color: string; bg: string }> = {
  best: { label: '最佳', symbol: '!!', color: 'text-moss', bg: 'bg-moss/15 border-moss/40' },
  good: { label: '良好', symbol: '!', color: 'text-gold', bg: 'bg-gold/10 border-gold/30' },
  dubious: { label: '可疑', symbol: '?!', color: 'text-gold/70', bg: 'bg-gold/5 border-gold/20' },
  mistake: { label: '失误', symbol: '?', color: 'text-wine', bg: 'bg-wine/10 border-wine/30' },
  blunder: { label: '败着', symbol: '??', color: 'text-wine', bg: 'bg-wine/20 border-wine/50' },
};

export default function Review() {
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedPgn | null>(null);
  const [singleFen, setSingleFen] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string>('');
  const [currentIdx, setCurrentIdx] = useState(0); // 当前显示的 FEN 索引（0 = 初始）
  const [isPlaying, setIsPlaying] = useState(false);
  const [analyses, setAnalyses] = useState<MoveAnalysis[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);

  const { recordReview } = useAppStore();
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
      setParseError('请输入 PGN 或 FEN 文本');
      return;
    }

    const format = detectInputFormat(input);
    if (format === 'fen') {
      const result = parseFen(input.trim());
      if (result.valid && result.fen) {
        setSingleFen(result.fen);
        setCurrentIdx(0);
      } else {
        setParseError('FEN 格式无效，请检查输入');
      }
      return;
    }

    if (format === 'pgn' || format === 'unknown') {
      const result = parsePgn(input);
      if (result && result.moves.length > 0) {
        setParsed(result);
        setCurrentIdx(0);
        recordReview(input);
      } else {
        setParseError('PGN 解析失败，请检查格式是否正确');
      }
    }
  }, [input, recordReview]);

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

    const step = () => {
      const batchSize = 4;
      const end = Math.min(i + batchSize, moves.length);
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
          quality: classifyByDelta(delta),
          mover,
          moveNo: Math.floor(i / 2) + 1,
        });
      }
      setAnalyzeProgress(Math.round((i / moves.length) * 100));
      if (i < moves.length) {
        setTimeout(step, 0);
      } else {
        setAnalyses(results);
        setAnalyzing(false);
      }
    };
    setTimeout(step, 50);
  }, [parsed]);

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

  const totalSteps = parsed ? parsed.fens.length : 1;
  const currentFen = parsed
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
  const evalCurveData = useMemo(() => {
    if (analyses.length === 0) return null;
    const points: { x: number; y: number; eval: number }[] = [];
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

  return (
    <div className="px-10 py-8 max-w-[1500px] mx-auto">
      {/* 标题 */}
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-2 animate-fade-up">
          <Reply size={12} className="text-gold" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-gold/70">Game Review</span>
        </div>
        <h1 className="font-display text-5xl text-ivory tracking-tight-display animate-fade-up">
          棋局<span className="text-gold italic">复盘</span>
        </h1>
        <p className="text-sm text-ivoryDim mt-2 animate-fade-up" style={{ animationDelay: '0.15s' }}>
          粘贴 PGN 或 FEN · 逐步回放 · 评估曲线 · 走法质量分析
        </p>
      </header>

      {/* 输入区 */}
      <div className="card-gold rounded-sm p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={14} className="text-gold" />
          <span className="text-xs uppercase tracking-[0.25em] text-gold/80">棋谱输入</span>
          <span className="text-[10px] text-ivoryDim ml-2">
            支持 PGN（含走子序列）或 FEN（单局面）
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={handleLoadSample} className="text-[10px] uppercase tracking-widest text-ivoryDim hover:text-gold flex items-center gap-1 transition-colors">
              <Sparkles size={10} /> 载入示例
            </button>
            <button onClick={handleClear} className="text-[10px] uppercase tracking-widest text-ivoryDim hover:text-wine flex items-center gap-1 transition-colors">
              <Trash2 size={10} /> 清空
            </button>
          </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`粘贴 PGN 棋谱或 FEN 字符串…\n\n示例 FEN：r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3\n示例 PGN：1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...`}
          rows={5}
          className="w-full px-3 py-2 bg-ink-800/60 border border-gold/15 rounded-sm text-sm text-ivory placeholder:text-ivoryDim/40 font-mono focus:outline-none focus:border-gold/50 transition-colors resize-y"
        />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={handleParse} className="btn-gold-solid px-5 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5">
            <Upload size={12} /> 解析并复盘
          </button>
          {parseError && (
            <span className="text-xs text-wine flex items-center gap-1">
              <AlertTriangle size={11} /> {parseError}
            </span>
          )}
          {parsed && (
            <span className="text-xs text-moss flex items-center gap-1">
              已解析 {parsed.moves.length} 手
              {parsed.headers?.White && ` · ${parsed.headers.White} vs ${parsed.headers.Black || '?'}`}
            </span>
          )}
          {singleFen && (
            <span className="text-xs text-moss flex items-center gap-1">FEN 已加载</span>
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
                <button onClick={handleStart} disabled={currentIdx === 0} className="btn-gold-outline px-3 py-2 rounded-sm text-xs flex items-center disabled:opacity-40 disabled:cursor-not-allowed" title="跳到开始">
                  <SkipBack size={12} />
                </button>
                <button onClick={handleStepPrev} disabled={currentIdx === 0} className="btn-gold-outline px-3 py-2 rounded-sm text-xs flex items-center disabled:opacity-40 disabled:cursor-not-allowed" title="上一步">
                  <ChevronLeft size={12} />
                </button>
                <button
                  onClick={handleTogglePlay}
                  disabled={!parsed}
                  className="btn-gold-solid px-4 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                  {isPlaying ? '暂停' : '播放'}
                </button>
                <button onClick={handleStepNext} disabled={currentIdx >= totalSteps - 1} className="btn-gold-outline px-3 py-2 rounded-sm text-xs flex items-center disabled:opacity-40 disabled:cursor-not-allowed" title="下一步">
                  <ChevronRight size={12} />
                </button>
                <button onClick={handleEnd} disabled={currentIdx >= totalSteps - 1} className="btn-gold-outline px-3 py-2 rounded-sm text-xs flex items-center disabled:opacity-40 disabled:cursor-not-allowed" title="跳到结尾">
                  <SkipForward size={12} />
                </button>
                <div className="ml-auto flex items-center gap-3 text-xs text-ivoryDim">
                  <Clock size={11} className="text-gold" />
                  <span className="font-mono">
                    {currentIdx} / {totalSteps - 1}
                  </span>
                  <div className="w-32 h-1 bg-ink-800 rounded-full overflow-hidden">
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
                <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">评估曲线</h3>
                {analyzing && (
                  <span className="ml-auto text-[10px] text-ivoryDim font-mono">
                    分析中… {analyzeProgress}%
                  </span>
                )}
                {!analyzing && analyses.length > 0 && (
                  <span className="ml-auto text-[10px] text-ivoryDim font-mono">
                    当前 {evalToText(currentAnalysis?.evalAfter ?? analyses[0]?.evalBefore ?? 0)}
                  </span>
                )}
              </div>
              <EvalCurve
                data={evalCurveData}
                currentIdx={currentIdx}
                height={140}
              />
              <div className="flex items-center justify-between mt-2 text-[9px] uppercase tracking-widest text-ivoryDim/60">
                <span>黑方优势</span>
                <span>白方优势</span>
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
                    {QUALITY_STYLE[currentAnalysis.quality].symbol} {QUALITY_STYLE[currentAnalysis.quality].label}
                  </div>
                  <div>
                    <div className="text-sm text-ivory">
                      第 {currentAnalysis.moveNo} 手 · {currentAnalysis.mover === 'w' ? '白' : '黑'}方走 {currentAnalysis.san}
                    </div>
                    <div className="text-[10px] text-ivoryDim font-mono mt-0.5">
                      评估 {evalToText(currentAnalysis.evalBefore)} → {evalToText(currentAnalysis.evalAfter)}
                      （{currentAnalysis.delta >= 0 ? '+' : ''}{(currentAnalysis.delta / 100).toFixed(2)}）
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
                <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-3">对局信息</div>
                <div className="space-y-2">
                  {parsed.headers.White && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ivoryDim uppercase tracking-widest text-[10px]">白方</span>
                      <span className="text-ivory font-medium">{parsed.headers.White}</span>
                    </div>
                  )}
                  {parsed.headers.Black && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ivoryDim uppercase tracking-widest text-[10px]">黑方</span>
                      <span className="text-ivory font-medium">{parsed.headers.Black}</span>
                    </div>
                  )}
                  {parsed.headers.Event && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ivoryDim uppercase tracking-widest text-[10px]">赛事</span>
                      <span className="text-ivory">{parsed.headers.Event}</span>
                    </div>
                  )}
                  {parsed.headers.Date && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ivoryDim uppercase tracking-widest text-[10px]">日期</span>
                      <span className="text-ivory font-mono">{parsed.headers.Date}</span>
                    </div>
                  )}
                  {parsed.headers.Result && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ivoryDim uppercase tracking-widest text-[10px]">结果</span>
                      <span className="text-gold font-mono">{parsed.headers.Result}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 质量统计 */}
            {analyses.length > 0 && (
              <div className="card-gold rounded-sm p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-3">走法质量分布</div>
                <div className="grid grid-cols-5 gap-2">
                  {(Object.keys(QUALITY_STYLE) as MoveQuality[]).map((q) => (
                    <div key={q} className={`text-center rounded-sm border py-2 ${QUALITY_STYLE[q].bg}`}>
                      <div className={`font-mono text-sm ${QUALITY_STYLE[q].color}`}>{QUALITY_STYLE[q].symbol}</div>
                      <div className={`text-[9px] uppercase tracking-wider ${QUALITY_STYLE[q].color}`}>{QUALITY_STYLE[q].label}</div>
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
                  <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">走法记录</h3>
                  <span className="ml-auto font-mono text-[10px] text-ivoryDim">{parsed.moves.length} 手</span>
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
          <div className="text-sm text-ivoryDim mb-2">尚无棋谱</div>
          <div className="text-xs text-ivoryDim/60">
            在上方输入框粘贴 PGN 或 FEN，点击「解析并复盘」开始
          </div>
        </div>
      )}
    </div>
  );
}

// 评估曲线组件（内联 SVG）
function EvalCurve({
  data,
  currentIdx,
  height = 140,
}: {
  data: { x: number; y: number; eval: number }[] | null;
  currentIdx: number;
  height?: number;
}) {
  const width = 600;
  const padding = { top: 8, right: 8, bottom: 8, left: 8 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (!data || data.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-ivoryDim/50 italic" style={{ height }}>
        评估数据将在解析后生成…
      </div>
    );
  }

  const maxAbs = 800; // 评估值范围 ±800
  const toY = (evalScore: number) => {
    const clamped = Math.max(-maxAbs, Math.min(maxAbs, evalScore));
    // tanh 平滑映射
    const normalized = Math.tanh(clamped / 400); // [-1, 1]
    // 白优在上方（y 小），黑优在下方（y 大）
    return padding.top + chartH / 2 - normalized * (chartH / 2 - 4);
  };
  const toX = (idx: number) => {
    return padding.left + (data.length > 1 ? (idx / (data.length - 1)) * chartW : chartW / 2);
  };

  // 构建路径
  const linePath = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.x).toFixed(1)} ${toY(p.eval).toFixed(1)}`).join(' ');
  // 填充区域路径（白方优势区域填充金色，黑方填充酒红）
  const areaPath = `${linePath} L ${toX(data[data.length - 1].x).toFixed(1)} ${padding.top + chartH / 2} L ${toX(0).toFixed(1)} ${padding.top + chartH / 2} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {/* 背景网格 */}
      <line x1={padding.left} y1={padding.top + chartH / 2} x2={width - padding.right} y2={padding.top + chartH / 2} stroke="rgba(212,165,116,0.2)" strokeWidth="1" strokeDasharray="2 4" />
      <line x1={padding.left} y1={padding.top} x2={width - padding.right} y2={padding.top} stroke="rgba(212,165,116,0.08)" strokeWidth="1" />
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="rgba(212,165,116,0.08)" strokeWidth="1" />

      {/* 填充区域 */}
      <path d={areaPath} fill="rgba(212,165,116,0.12)" />

      {/* 曲线 */}
      <path d={linePath} fill="none" stroke="#D4A574" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* 当前位置标记 */}
      {currentIdx >= 0 && currentIdx < data.length && (
        <>
          <line
            x1={toX(currentIdx)} y1={padding.top}
            x2={toX(currentIdx)} y2={height - padding.bottom}
            stroke="rgba(212,165,116,0.4)" strokeWidth="1" strokeDasharray="2 2"
          />
          <circle cx={toX(currentIdx)} cy={toY(data[currentIdx].eval)} r="4" fill="#D4A574" stroke="#0E0F13" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}
