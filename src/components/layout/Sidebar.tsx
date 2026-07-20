// 左侧栏导航
import { NavLink } from 'react-router-dom';
import { Home, Swords, BookOpen, Puzzle, Reply, RotateCcw } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import { useConfirm } from '@/components/ConfirmModal';

const navItems = [
  { to: '/', label: '首页', labelEn: 'Atelier', icon: Home },
  { to: '/play', label: '陪练对战', labelEn: 'Play', icon: Swords },
  { to: '/openings', label: '开局训练', labelEn: 'Openings', icon: BookOpen },
  { to: '/puzzles', label: '习题库', labelEn: 'Puzzles', icon: Puzzle },
  { to: '/review', label: '棋局复盘', labelEn: 'Review', icon: Reply },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps = {}) {
  // 浅比较订阅 progress + resetAllProgress，其他状态变更不会触发重渲染
  const { progress, resetAllProgress } = useAppStore(
    useShallow((s) => ({ progress: s.progress, resetAllProgress: s.resetAllProgress })),
  );
  const confirm = useConfirm();
  const winRate = progress.playStats.totalGames > 0
    ? Math.round((progress.playStats.wins / progress.playStats.totalGames) * 100)
    : 0;

  const handleReset = async () => {
    const ok = await confirm({
      title: '重置所有训练进度？',
      message: '此操作不可撤销，将清空所有对局记录、习题进度与开局练习记录。',
      confirmText: '重置',
      danger: true,
    });
    if (ok) resetAllProgress();
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
            <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60">训练 · 陪练 · 复盘</div>
          </div>
        </div>
      </div>

      {/* 导航 */}
      <nav aria-label="主导航" className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
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
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-[10px] uppercase tracking-widest text-gold/40 group-hover:text-gold/60">
                  {item.labelEn}
                </span>
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* 训练数据快览 */}
      <div className="px-4 py-4 border-t border-gold/10 space-y-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-gold/50">训练概览</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-ink-800/60 border border-gold/10 rounded-sm py-2">
            <div className="font-mono text-sm text-gold">{progress.playStats.totalGames}</div>
            <div className="text-[9px] text-ivoryDim uppercase tracking-wider">对局</div>
          </div>
          <div className="bg-ink-800/60 border border-gold/10 rounded-sm py-2">
            <div className="font-mono text-sm text-gold">{winRate}%</div>
            <div className="text-[9px] text-ivoryDim uppercase tracking-wider">胜率</div>
          </div>
          <div className="bg-ink-800/60 border border-gold/10 rounded-sm py-2">
            <div className="font-mono text-sm text-gold">{progress.puzzleProgress.solved.length}</div>
            <div className="text-[9px] text-ivoryDim uppercase tracking-wider">解题</div>
          </div>
        </div>
        <button
          onClick={handleReset}
          className="w-full mt-2 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest text-ivoryDim/60 hover:text-wine transition-colors py-1.5"
        >
          <RotateCcw size={10} />
          重置进度
        </button>
      </div>
    </aside>
  );
}
