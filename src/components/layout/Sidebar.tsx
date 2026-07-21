// 左侧栏导航
import { NavLink } from 'react-router-dom';
import { Home, Swords, BookOpen, Puzzle, Reply, Users, Target, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import { useConfirm } from '@/components/ConfirmModal';
import { useI18n } from '@/i18n';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { play } from '@/lib/sounds';

const navItems = [
  { to: '/', key: 'nav.home' as const, en: 'Atelier', icon: Home },
  { to: '/play', key: 'nav.play' as const, en: 'Play', icon: Swords },
  { to: '/openings', key: 'nav.openings' as const, en: 'Openings', icon: BookOpen },
  { to: '/puzzles', key: 'nav.puzzles' as const, en: 'Puzzles', icon: Puzzle },
  { to: '/multiplayer', key: 'nav.multiplayer' as const, en: 'Multiplayer', icon: Users },
  { to: '/review', key: 'nav.review' as const, en: 'Review', icon: Reply },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps = {}) {
  // 浅比较订阅 progress + resetAllProgress + soundEnabled + showLegalMoves
  const { progress, resetAllProgress, soundEnabled, setSoundEnabled, showLegalMoves, setShowLegalMoves } = useAppStore(
    useShallow((s) => ({
      progress: s.progress,
      resetAllProgress: s.resetAllProgress,
      soundEnabled: s.soundEnabled,
      setSoundEnabled: s.setSoundEnabled,
      showLegalMoves: s.showLegalMoves,
      setShowLegalMoves: s.setShowLegalMoves,
    })),
  );
  const confirm = useConfirm();
  const { t, locale } = useI18n();
  const winRate = progress.playStats.totalGames > 0
    ? Math.round((progress.playStats.wins / progress.playStats.totalGames) * 100)
    : 0;

  const handleReset = async () => {
    const ok = await confirm({
      title: t('sidebar.resetConfirm.title'),
      message: t('sidebar.resetConfirm.message'),
      confirmText: t('sidebar.resetConfirm.confirm'),
      danger: true,
    });
    if (ok) resetAllProgress();
  };

  // 切换音效：开启时立刻播放一次点击作为反馈
  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) play('click');
  };

  // 切换合法走步预览：开启时播放一次点击反馈
  const handleToggleLegalMoves = () => {
    const next = !showLegalMoves;
    setShowLegalMoves(next);
    if (next) play('click');
  };

  return (
    <aside className="w-64 shrink-0 border-r border-gold/15 bg-ink-900/95 backdrop-blur-md flex flex-col h-screen">
      {/* 品牌 */}
      <div className="px-6 py-8 border-b border-gold/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm border border-gold/40 flex items-center justify-center bg-ink-800">
            <span className="font-display text-2xl text-gold leading-none">♞</span>
          </div>
          <div>
            <div className="font-display text-xl text-ivory leading-tight tracking-tight-display">Chess Atelier</div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60">{t('sidebar.brandSubtitle')}</div>
          </div>
        </div>
      </div>

      {/* 导航 */}
      <nav aria-label={t('nav.primaryNav')} className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-gold/10 border-l-2 border-gold text-ivory'
                    : 'border-l-2 border-transparent text-ivoryDim hover:text-ivory hover:bg-gold/5'
                }`
              }
            >
              <Icon size={16} className="shrink-0" />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium">{t(item.key)}</span>
                {locale === 'zh-CN' && (
                  <span className="text-[10px] uppercase tracking-widest text-gold/40 group-hover:text-gold/60">
                    {item.en}
                  </span>
                )}
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* 训练数据快览 */}
      <div className="px-4 py-4 border-t border-gold/10 space-y-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-gold/50">{t('nav.overview')}</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-ink-800/60 border border-gold/10 rounded-sm py-2">
            <div className="font-mono text-sm text-gold">{progress.playStats.totalGames}</div>
            <div className="text-[9px] text-ivoryDim uppercase tracking-wider">{t('nav.stats.games')}</div>
          </div>
          <div className="bg-ink-800/60 border border-gold/10 rounded-sm py-2">
            <div className="font-mono text-sm text-gold">{winRate}%</div>
            <div className="text-[9px] text-ivoryDim uppercase tracking-wider">{t('nav.stats.winRate')}</div>
          </div>
          <div className="bg-ink-800/60 border border-gold/10 rounded-sm py-2">
            <div className="font-mono text-sm text-gold">{progress.puzzleProgress.solved.length}</div>
            <div className="text-[9px] text-ivoryDim uppercase tracking-wider">{t('nav.stats.puzzles')}</div>
          </div>
        </div>
        <button
          onClick={handleToggleLegalMoves}
          aria-pressed={showLegalMoves}
          aria-label={showLegalMoves ? t('sidebar.legalOnAria') : t('sidebar.legalOffAria')}
          className={`flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest py-1.5 mb-2 transition-colors border rounded-sm ${
            showLegalMoves
              ? 'border-gold/30 text-gold/80 hover:text-gold hover:border-gold/50'
              : 'border-gold/10 text-ivoryDim/50 hover:text-ivoryDim hover:border-gold/20'
          }`}
        >
          <Target size={10} />
          {showLegalMoves ? t('sidebar.toggleLegalOn') : t('sidebar.toggleLegalOff')}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleToggleSound}
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? t('sidebar.soundOnAria') : t('sidebar.soundOffAria')}
            className={`flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest py-1.5 transition-colors border rounded-sm ${
              soundEnabled
                ? 'border-gold/30 text-gold/80 hover:text-gold hover:border-gold/50'
                : 'border-gold/10 text-ivoryDim/50 hover:text-ivoryDim hover:border-gold/20'
            }`}
          >
            {soundEnabled ? <Volume2 size={10} /> : <VolumeX size={10} />}
            {soundEnabled ? t('sidebar.soundOn') : t('sidebar.soundOff')}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest text-ivoryDim/60 hover:text-wine transition-colors py-1.5 border border-transparent hover:border-wine/20 rounded-sm"
          >
            <RotateCcw size={10} />
            {t('sidebar.reset')}
          </button>
        </div>
        <LanguageSwitcher />
      </div>
    </aside>
  );
}
