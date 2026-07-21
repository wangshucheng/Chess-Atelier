// 习题训练库浏览页：统计看板 + 难度等级卡片
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Puzzle as PuzzleIcon, ArrowRight, AlertTriangle, RotateCcw } from 'lucide-react';
import { loadPuzzles } from '@/data';
import type { Puzzle } from '@/types';
import { PUZZLE_LEVELS } from '@/data/puzzleLevels';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n';
import type { Path, TranslationSchema } from '@/i18n';

export default function Puzzles() {
  const { t } = useI18n();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 只订阅 puzzleProgress，避免无关字段变化触发重渲染
  const puzzleProgress = useAppStore((s) => s.progress.puzzleProgress);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadPuzzles()
      .then((data) => {
        if (cancelled) return;
        setPuzzles(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 按等级分组统计
  const puzzlesByLevel = useMemo(() => {
    const map: Record<number, Puzzle[]> = {};
    for (const p of puzzles) {
      (map[p.level] ??= []).push(p);
    }
    return map;
  }, [puzzles]);

  // 派生统计数据
  const solvedSet = puzzleProgress.solved;
  const solvedCount = solvedSet.length;
  const totalCount = puzzles.length;
  const totalAttempts = Object.values(puzzleProgress.byLevel).reduce(
    (sum, lvl) => sum + (lvl.total ?? 0),
    0,
  );
  const accuracy = totalAttempts > 0
    ? Math.round((solvedCount / totalAttempts) * 100)
    : 0;

  if (loadError) {
    return (
      <div className="px-4 md:px-10 py-16 max-w-[1400px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center">
          <AlertTriangle size={32} className="text-wine mx-auto mb-3" />
          <div className="text-sm text-ivoryDim mb-4">{t('puzzles.loadError', { err: loadError })}</div>
          <button
            onClick={() => window.location.reload()}
            className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5"
          >
            <RotateCcw size={12} /> {t('puzzles.reload')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-10 py-8 max-w-[1400px] mx-auto">
      {/* 标题 */}
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-2 animate-fade-up">
          <PuzzleIcon size={12} className="text-gold" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-gold/70">Tactical Puzzles</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-5xl text-ivory tracking-tight-display animate-fade-up">
              {t('puzzles.title')}
            </h1>
            <p className="text-sm text-ivoryDim mt-2 animate-fade-up" style={{ animationDelay: '0.15s' }}>
              {t('puzzles.subtitle')}
            </p>
          </div>
          <div className="text-right text-xs text-ivoryDim">
            <div className="font-mono text-2xl text-gold">{solvedCount}</div>
            <div className="text-[10px] uppercase tracking-widest">{t('puzzles.solvedSuffix')}</div>
          </div>
        </div>
      </header>

      {/* 统计看板 */}
      <div className="card-gold rounded-sm p-6 mb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 divide-x divide-gold/10">
          <div className="text-center">
            <div className="font-mono text-3xl text-gold mb-1">{puzzleProgress.streak}</div>
            <div className="text-[10px] uppercase tracking-widest text-ivoryDim">{t('puzzles.currentStreak')}</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-3xl text-gold mb-1">{puzzleProgress.bestStreak}</div>
            <div className="text-[10px] uppercase tracking-widest text-ivoryDim">{t('puzzles.bestStreak')}</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-3xl text-gold mb-1">{accuracy}%</div>
            <div className="text-[10px] uppercase tracking-widest text-ivoryDim">{t('puzzles.accuracy')}</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-3xl text-gold mb-1">{totalCount}</div>
            <div className="text-[10px] uppercase tracking-widest text-ivoryDim">{t('puzzles.attempts')}</div>
          </div>
        </div>
      </div>

      {/* 难度等级卡片 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card-gold rounded-sm p-6 h-64 animate-pulse">
              <div className="h-4 w-16 bg-gold/10 rounded mb-4" />
              <div className="h-8 w-3/4 bg-gold/10 rounded mb-3" />
              <div className="h-3 w-full bg-gold/5 rounded mb-2" />
              <div className="h-3 w-2/3 bg-gold/5 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {PUZZLE_LEVELS.map((lv, idx) => {
            const levelPuzzles = puzzlesByLevel[lv.level] ?? [];
            const count = levelPuzzles.length;
            const solvedInLevel = levelPuzzles.filter((p) => solvedSet.includes(p.id)).length;
            const levelKey = String(lv.level);
            const title = t(`puzzles.levels.${levelKey}.title` as Path<TranslationSchema>);
            const en = t(`puzzles.levels.${levelKey}.en` as Path<TranslationSchema>);
            const desc = t(`puzzles.levels.${levelKey}.desc` as Path<TranslationSchema>);
            const Icon = lv.icon;
            return (
              <Link
                key={lv.level}
                to={`/puzzles/${lv.level}`}
                className="card-gold rounded-sm p-6 group relative overflow-hidden flex flex-col h-full transition-transform duration-300 hover:-translate-y-1 animate-fade-up"
                style={{ animationDelay: `${idx * 0.08}s` }}
                aria-label={t('puzzles.srEnter', {
                  title,
                  total: count,
                  solved: solvedInLevel,
                  accuracy,
                })}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-gold/5 to-transparent pointer-events-none" />
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-sm border border-gold/20 flex items-center justify-center bg-ink-800 ${lv.accent}`}>
                    <Icon size={22} />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-ivoryDim/60 font-mono">
                    {t('puzzleDetail.levelLabel', { lv: lv.level })}
                  </span>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-gold/60 mb-1">{en}</div>
                <h3 className="font-display text-2xl text-ivory tracking-tight-display mb-3">{title}</h3>
                <p className="text-xs text-ivoryDim leading-relaxed flex-1">{desc}</p>

                <div className="mt-4 pt-4 border-t border-gold/10 flex items-center justify-between">
                  <div className="text-[10px] text-ivoryDim font-mono">
                    <span className="text-gold">{count}</span> {t('puzzles.solvedSuffix')}
                  </div>
                  <ArrowRight size={14} className="text-gold/50 group-hover:text-gold group-hover:translate-x-1 transition-all" />
                </div>

                {/* 进度条 */}
                {count > 0 && (
                  <div className="mt-3 h-1 bg-ink-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-gold/60 to-gold"
                      style={{ width: `${(solvedInLevel / count) * 100}%` }}
                    />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
