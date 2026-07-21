import { Link } from 'react-router-dom';
import { Swords, BookOpen, Puzzle, Reply, ArrowRight, Sparkles } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n';
import type { Path, TranslationSchema } from '@/i18n';

const MODES = [
  { key: 'play', to: '/play', icon: Swords, path: 'home.modes.play' },
  { key: 'openings', to: '/openings', icon: BookOpen, path: 'home.modes.openings' },
  { key: 'puzzles', to: '/puzzles', icon: Puzzle, path: 'home.modes.puzzles' },
  { key: 'review', to: '/review', icon: Reply, path: 'home.modes.review' },
] as const;

export default function Home() {
  const { t, format } = useI18n();
  const progress = useAppStore(
    useShallow((s) => ({
      playStats: s.progress.playStats,
      puzzleSolved: s.progress.puzzleProgress.solved.length,
      secondsToday: Math.floor(s.progress.totalTrainingMs / 1000),
      openingCount: Object.keys(s.progress.openingProgress).length,
      bestStreak: s.progress.puzzleProgress.bestStreak,
      streak: s.progress.puzzleProgress.streak,
    })),
  );

  const winRate =
    progress.playStats.totalGames > 0
      ? Math.round((progress.playStats.wins / progress.playStats.totalGames) * 100)
      : 0;

  const totalSeconds = progress.secondsToday;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const modeText = (path: string, sub: 'title' | 'en' | 'desc') =>
    t(`${path}.${sub}` as Path<TranslationSchema>);

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      {/* Hero */}
      <section className="text-center mb-24">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-gold/20 text-[11px] uppercase tracking-[0.3em] text-gold/70">
          <Sparkles size={12} /> Chess Atelier
        </div>
        <h1 className="font-display text-4xl sm:text-5xl text-ivory mb-4 leading-tight tracking-tight-display">
          {t('home.brand')}
        </h1>
        <p className="font-display text-xl text-gold/80 mb-6">{t('home.tagline')}</p>
        <p className="text-ivoryDim max-w-2xl mx-auto leading-relaxed mb-8">{t('home.intro')}</p>
        <div className="flex items-center justify-center gap-4">
          <Link
            to="/play"
            className="btn-gold px-6 py-3 rounded-sm text-xs uppercase tracking-[0.2em] inline-flex items-center gap-2"
          >
            {t('home.startTraining')} <ArrowRight size={14} />
          </Link>
          <Link
            to="/openings"
            className="btn-gold-outline px-6 py-3 rounded-sm text-xs uppercase tracking-[0.2em] inline-flex items-center gap-2"
          >
            {t('home.browseOpenings')}
          </Link>
        </div>
      </section>

      {/* Training Modes */}
      <section className="mb-24">
        <div className="text-center mb-10">
          <h2 className="font-display text-2xl text-ivory">{t('home.modesTitle')}</h2>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold/60 mt-2">{t('home.modesSubtitle')}</p>
          <p className="text-sm text-ivoryDim mt-3">{t('home.modesDesc')}</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.key}
                to={m.to}
                className="group relative p-6 border border-gold/15 bg-ink-800/40 hover:border-gold/40 transition-all duration-300 rounded-sm"
              >
                <Icon size={22} className="text-gold mb-4" />
                <h3 className="font-display text-lg text-ivory mb-1">{modeText(m.path, 'title')}</h3>
                <div className="text-[10px] uppercase tracking-widest text-gold/50 mb-3">{modeText(m.path, 'en')}</div>
                <p className="text-xs text-ivoryDim leading-relaxed">{modeText(m.path, 'desc')}</p>
                <ArrowRight
                  size={16}
                  className="absolute top-6 right-6 text-ivoryDim/30 group-hover:text-gold group-hover:translate-x-1 transition-all"
                />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Atelier / Dashboard */}
      <section>
        <div className="mb-8">
          <h2 className="font-display text-2xl text-ivory">{t('home.atelier')}</h2>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold/60 mt-2">{t('home.yourAtelier')}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {/* Win rate */}
          <div className="p-6 border border-gold/15 bg-ink-800/40 rounded-sm">
            <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-4">{t('home.winRate')}</div>
            <div className="font-mono text-4xl text-gold mb-2">{winRate}%</div>
            <div className="text-sm text-ivoryDim">
              {t('home.record', {
                wins: progress.playStats.wins,
                losses: progress.playStats.losses,
                draws: progress.playStats.draws,
              })}
            </div>
            <div className="text-xs text-ivoryDim/60 mt-1">
              {t('home.totalGames', { total: progress.playStats.totalGames })}
            </div>
          </div>

          {/* Puzzle progress */}
          <div className="p-6 border border-gold/15 bg-ink-800/40 rounded-sm">
            <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-4">{t('home.puzzleProgress')}</div>
            <div className="font-mono text-4xl text-gold mb-2">{progress.puzzleSolved}</div>
            <div className="text-sm text-ivoryDim">{t('home.puzzleCount')}</div>
            <div className="text-xs text-ivoryDim/60 mt-1">
              {t('home.streak', { best: progress.bestStreak, streak: progress.streak })}
            </div>
          </div>

          {/* Training time */}
          <div className="p-6 border border-gold/15 bg-ink-800/40 rounded-sm">
            <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-4">{t('home.trainingTime')}</div>
            <div className="font-mono text-4xl text-gold mb-2">
              {format.number(hours)}
              <span className="text-lg text-ivoryDim ml-1">{t('home.unitHour')}</span>{' '}
              {format.number(minutes)}
              <span className="text-lg text-ivoryDim ml-1">{t('home.unitMinute')}</span>
            </div>
            <div className="text-xs text-ivoryDim/60 mt-1">
              {t('home.openingsPracticed', { n: progress.openingCount })}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-24 pt-8 border-t border-gold/10 text-center text-[11px] text-ivoryDim/50 space-y-1">
        <div>{t('home.footer')}</div>
        <div>{t('home.version')}</div>
      </footer>
    </div>
  );
}
