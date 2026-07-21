// 习题训练详情页：出题为玩家，AI 自动应招，逐步验证制胜走法
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import ChessBoard from '@/components/board/ChessBoard';
import { getPuzzlesByLevel } from '@/data';
import { useAppStore } from '@/store/useAppStore';
import { play } from '@/lib/sounds';
import type { Puzzle, PuzzleLevel } from '@/types';
import { useI18n } from '@/i18n';
import type { Path, TranslationSchema } from '@/i18n';
import {
  Puzzle as PuzzleIcon, ArrowLeft, Lightbulb, Target, Eye, RotateCcw,
  CheckCircle2, XCircle, ChevronLeft, ChevronRight, Trophy, Info, BookOpen,
} from 'lucide-react';

export default function PuzzleDetail() {
  const { t } = useI18n();
  const { level: levelParam } = useParams<{ level: string }>();
  const level = Number(levelParam) as PuzzleLevel;
  const navigate = useNavigate();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // 棋局状态
  const gameRef = useRef<Chess | null>(null);
  if (!gameRef.current) gameRef.current = new Chess();
  const [fen, setFen] = useState(gameRef.current.fen());
  const [feedback, setFeedback] = useState<{ type: 'none' | 'correct' | 'wrong'; message: string }>({ type: 'none', message: '' });
  const [currentStep, setCurrentStep] = useState(0); // 已走步数（含玩家与AI）
  const [showSolution, setShowSolution] = useState(false);
  const [solved, setSolved] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const recordPuzzleSolved = useAppStore((s) => s.recordPuzzleSolved);
  const solvedSet = useAppStore((s) => s.progress.puzzleProgress.solved);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPuzzlesByLevel(level)
      .then((data) => {
        if (cancelled) return;
        setPuzzles(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [level]);

  const currentPuzzle = puzzles[currentIndex];
  const playerColor = useMemo<'white' | 'black'>(() => {
    if (!currentPuzzle) return 'white';
    return (currentPuzzle.fen.split(' ')[1] === 'b' ? 'b' : 'w') === 'w' ? 'white' : 'black';
  }, [currentPuzzle]);
  const levelEn = t(`puzzles.levels.${level}.en` as Path<TranslationSchema>);
  const levelTitle = t(`puzzles.levels.${level}.title` as Path<TranslationSchema>);

  // 跳到指定题目的初始局面
  const loadPuzzlePosition = useCallback((idx: number) => {
    const p = puzzles[idx];
    if (!p) return;
    const g = new Chess(p.fen);
    gameRef.current = g;
    setFen(g.fen());
    setCurrentStep(0);
    setShowSolution(false);
    setSolved(false);
    setFeedback({ type: 'none', message: '' });
  }, [puzzles]);

  // 切换题目后重置局面
  useEffect(() => {
    if (puzzles.length > 0) {
      setCurrentIndex(0);
    }
  }, [puzzles]);

  useEffect(() => {
    if (currentPuzzle) loadPuzzlePosition(currentIndex);
  }, [currentPuzzle, currentIndex, loadPuzzlePosition]);

  // 玩家走子
  const handleDrop = useCallback((from: string, to: string, promotion?: string): boolean => {
    if (!currentPuzzle || solved || showSolution) return false;
    if (currentStep % 2 !== 0) return false; // 仅玩家回合
    const expected = currentPuzzle.solution[currentStep];
    const g = gameRef.current;
    if (!g) return false;
    try {
      const move = g.move({ from, to, promotion });
      if (!move) return false;
      if (move.san !== expected) {
        // 走子错误：回退并提示
        g.undo();
        setFeedback({
          type: 'wrong',
          message: t('puzzleDetail.wrongDetail', { san: move.san, expected }),
        });
        play('wrong');
        return false;
      }
      // 正确
      setFen(g.fen());
      setCurrentStep((s) => s + 1);
      setFeedback({ type: 'correct', message: t('puzzleDetail.correct') });
      play('move');
      // 是否完成玩家全部步数
      if (currentStep + 1 >= currentPuzzle.solution.length) {
        setSolved(true);
        recordPuzzleSolved(currentPuzzle.id, currentPuzzle.level);
        play('complete');
      }
      return true;
    } catch {
      return false;
    }
  }, [currentPuzzle, currentStep, showSolution, solved, recordPuzzleSolved, t]);

  // AI 自动应招（偶数索引为玩家，奇数索引为AI）
  useEffect(() => {
    if (!currentPuzzle) return;
    if (currentStep % 2 !== 1) return; // 仅AI回合
    if (solved) return;
    const aiMoveSan = currentPuzzle.solution[currentStep];
    setIsThinking(true);
    const timer = setTimeout(() => {
      const g = gameRef.current;
      if (!g) return;
      try {
        g.move(aiMoveSan);
        setFen(g.fen());
        setCurrentStep((s) => s + 1);
        play('capture');
      } catch (err) {
        // 习题数据中的 AI 应招非法：记录并提示跳过
        console.warn(`[PuzzleDetail] AI 应招非法 at step ${currentStep}:`, aiMoveSan, err);
        setFeedback({
          type: 'wrong',
          message: t('puzzleDetail.dataError', { i: currentStep, san: aiMoveSan }),
        });
      } finally {
        setIsThinking(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [currentStep, currentPuzzle, solved, t]);

  // 导航
  const goNext = () => { if (currentIndex < puzzles.length - 1) setCurrentIndex((i) => i + 1); };
  const goPrev = () => { if (currentIndex > 0) setCurrentIndex((i) => i - 1); };

  if (loading) {
    return (
      <div className="px-4 md:px-10 py-16 max-w-[1200px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center animate-pulse">
          <div className="text-sm text-ivoryDim">{t('puzzleDetail.loading')}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 md:px-10 py-16 max-w-[1200px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center">
          <XCircle size={32} className="text-wine mx-auto mb-3" />
          <div className="text-sm text-ivoryDim mb-4">{t('puzzleDetail.loadError', { err: error })}</div>
          <Link to="/puzzles" className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5">
            <ArrowLeft size={12} /> {t('puzzleDetail.backToLibrary')}
          </Link>
        </div>
      </div>
    );
  }

  if (!currentPuzzle) {
    return (
      <div className="px-4 md:px-10 py-16 max-w-[1200px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center">
          <PuzzleIcon size={32} className="text-gold/40 mx-auto mb-3" />
          <div className="text-sm text-ivoryDim mb-4">{t('puzzleDetail.noPuzzles')}</div>
          <Link to="/puzzles" className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5">
            <ArrowLeft size={12} /> {t('puzzleDetail.backToLibrary')}
          </Link>
        </div>
      </div>
    );
  }

  const colorText = playerColor === 'white' ? t('puzzleDetail.white') : t('puzzleDetail.black');

  return (
    <div className="px-4 md:px-10 py-8 max-w-[1200px] mx-auto">
      {/* 顶部：返回 + 标题 */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/puzzles')}
          className="text-xs text-ivoryDim hover:text-gold flex items-center gap-1.5 mb-4 transition-colors"
        >
          <ArrowLeft size={12} /> {t('puzzleDetail.back')}
        </button>
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <PuzzleIcon size={12} className="text-gold" />
              <span className="text-[10px] uppercase tracking-[0.4em] text-gold/70">Tactical Puzzles</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-gold/70">{t('puzzleDetail.levelTag', { lv: level, en: levelEn })}</span>
              {solvedSet.includes(currentPuzzle.id) && (
                <span className="text-[9px] uppercase tracking-widest text-moss flex items-center gap-1">
                  <CheckCircle2 size={11} /> {t('puzzleDetail.solvedTag')}
                </span>
              )}
            </div>
            <h1 className="font-display text-5xl text-ivory tracking-tight-display mt-1">
              {levelTitle}
              <span className="text-gold italic"> {t('puzzleDetail.trainingSuffix')}</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="btn-gold-outline px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={12} /> {t('puzzleDetail.prev')}
            </button>
            <button
              onClick={goNext}
              disabled={currentIndex === puzzles.length - 1}
              className="btn-gold-outline px-3 py-2 rounded-sm text-xs uppercase tracking-widest flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('puzzleDetail.next')} <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 左：棋盘 + 控制 */}
        <div className="col-span-12 lg:col-span-7">
          <ChessBoard
            fen={fen}
            onDrop={handleDrop}
            orientation={playerColor}
            arePiecesDraggable={!solved && !showSolution && currentStep % 2 === 0}
          />

          {/* 进度 + 反馈 */}
          <div className="mt-4 card-gold rounded-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-[0.25em] text-gold/70">{t('puzzleDetail.progress')}</span>
              <span className="font-mono text-xs text-ivoryDim">
                {t('puzzleDetail.completed', { n: currentStep, m: currentPuzzle.solution.length })}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {!solved ? (
                <div className={`flex items-center gap-2 text-xs ${isThinking ? 'text-gold' : 'text-ivoryDim'}`}>
                  {isThinking ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                      {t('puzzleDetail.opponentThinking')}
                    </>
                  ) : (
                    <>
                      <Target size={12} />
                      {t('puzzleDetail.findMove')}
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-moss text-xs">
                  <Trophy size={14} />
                  {t('puzzleDetail.solved')}
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setShowSolution((v) => !v)}
                  className="btn-gold-outline px-3 py-1.5 rounded-sm text-[10px] uppercase tracking-widest flex items-center gap-1"
                >
                  <Eye size={10} /> {t('puzzleDetail.showSolution')}
                </button>
                <button
                  onClick={() => loadPuzzlePosition(currentIndex)}
                  className="btn-gold-outline px-3 py-1.5 rounded-sm text-[10px] uppercase tracking-widest flex items-center gap-1"
                >
                  <RotateCcw size={10} /> {t('puzzleDetail.retry')}
                </button>
              </div>
            </div>

            {/* 反馈条 */}
            {feedback.type !== 'none' && (
              <div className={`mt-3 px-3 py-2 rounded-sm text-xs flex items-center gap-2 ${
                feedback.type === 'correct'
                  ? 'bg-moss/10 border border-moss/30 text-moss'
                  : 'bg-wine/10 border border-wine/30 text-wine'
              }`}>
                {feedback.type === 'correct' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                <span>{feedback.type === 'correct' ? t('puzzleDetail.allCorrect') : feedback.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* 右：提示 + 习题信息 + 解答 */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* 解题提示 */}
          <div className="card-gold rounded-sm p-4">
            <div className="flex items-start gap-3">
              <Lightbulb size={14} className="text-gold mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1 flex items-center gap-1.5">
                  <Target size={11} /> {t('puzzleDetail.hint')}
                </div>
                <div className="text-xs text-ivoryDim leading-relaxed">
                  {t('puzzleDetail.hintText', { color: colorText })}
                </div>
              </div>
            </div>
          </div>

          {/* 习题信息 */}
          <div className="card-gold rounded-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/10">
              <Info size={14} className="text-gold" />
              <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">{t('puzzleDetail.info')}</h3>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ivoryDim mb-1">{t('puzzleDetail.id')}</div>
                <div className="font-mono text-ivory">{currentPuzzle.id}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ivoryDim mb-1">{t('puzzleDetail.difficulty')}</div>
                <div className="font-mono text-ivory">{t('puzzleDetail.levelLabel', { lv: currentPuzzle.level })}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ivoryDim mb-1">{t('puzzleDetail.rating')}</div>
                <div className="font-mono text-ivory">{currentPuzzle.rating}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ivoryDim mb-1">{t('puzzleDetail.moves')}</div>
                <div className="font-mono text-ivory">{currentPuzzle.solution.length}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-widest text-ivoryDim mb-1">{t('puzzleDetail.themes')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {currentPuzzle.theme.map((theme) => (
                    <span key={theme} className="text-[10px] px-2 py-0.5 rounded-sm border border-gold/20 text-gold/80 bg-gold/5">
                      {theme}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 解答序列 */}
          <div className="card-gold rounded-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/10">
              <BookOpen size={14} className="text-gold" />
              <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">{t('puzzleDetail.solutionTitle')}</h3>
            </div>
            <div className="p-4">
              {!showSolution ? (
                <div className="text-xs text-ivoryDim/60 italic">{t('puzzleDetail.solutionHidden')}</div>
              ) : currentPuzzle.solution.length === 0 ? (
                <div className="text-xs text-ivoryDim/60 italic">{t('puzzleDetail.noData')}</div>
              ) : (
                <div className="font-mono text-sm text-ivory leading-loose break-all">
                  {currentPuzzle.solution.map((san, i) => (
                    <span key={i}>
                      {i % 2 === 0 && <span className="text-ivoryDim/60 mr-1">{i / 2 + 1}.</span>}
                      <span className={`mr-2 ${i < currentStep ? 'text-moss' : i === currentStep ? 'text-gold' : 'text-ivory'}`}>
                        {san}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 题目导航 */}
          <div className="flex items-center justify-between card-gold rounded-sm px-4 py-3" role="group" aria-label={t('puzzleDetail.navigation')}>
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="text-xs uppercase tracking-widest text-ivoryDim hover:text-gold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft size={12} /> {t('puzzleDetail.prev')}
            </button>
            <span className="font-mono text-xs text-gold">
              {currentIndex + 1} / {puzzles.length}
            </span>
            <button
              onClick={goNext}
              disabled={currentIndex === puzzles.length - 1}
              className="text-xs uppercase tracking-widest text-ivoryDim hover:text-gold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {t('puzzleDetail.next')} <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
