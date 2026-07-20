// 习题库难度分级入口页：4 个难度等级卡片 + 进度统计
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Puzzle as PuzzleIcon, ArrowRight, Trophy, Flame, Target, Crown } from 'lucide-react';
import { loadPuzzles } from '@/data';
import { useAppStore } from '@/store/useAppStore';
import type { Puzzle } from '@/types';

const LEVELS = [
  { level: 1 as const, title: '一步杀', en: 'Mate in 1', desc: '单步将杀习题，培养战术敏锐度与终点嗅觉', icon: Target, accent: 'text-moss', range: '800-1000' },
  { level: 2 as const, title: '两步杀', en: 'Mate in 2', desc: '双步将杀组合，强化计算深度与战术衔接', icon: Flame, accent: 'text-gold', range: '1100-1200' },
  { level: 3 as const, title: '三步杀', en: 'Mate in 3', desc: '多步精确计算，考验局面预判与对手应招', icon: Trophy, accent: 'text-gold', range: '1300-1350' },
  { level: 4 as const, title: '多步杀', en: 'Mate in N', desc: '复杂将杀链路，逼近实战残局推演极限', icon: Crown, accent: 'text-wine', range: '1500+' },
];

export default function Puzzles() {
  const [counts, setCounts] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const { progress } = useAppStore();

  useEffect(() => {
    loadPuzzles().then((all: Puzzle[]) => {
      const map: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const p of all) map[p.level]++;
      setCounts(map);
    });
  }, []);

  const totalSolved = progress.puzzleProgress.solved.length;
  const totalPuzzles = counts[1] + counts[2] + counts[3] + counts[4];
  const totalAttempts = Object.values(progress.puzzleProgress.byLevel).reduce((s, v) => s + (v?.total ?? 0), 0);

  return (
    <div className="px-10 py-8 max-w-[1400px] mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-2 animate-fade-up">
          <PuzzleIcon size={12} className="text-gold" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-gold/70">Tactical Puzzles</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-5xl text-ivory tracking-tight-display animate-fade-up">
              习题<span className="text-gold italic">训练</span>库
            </h1>
            <p className="text-sm text-ivoryDim mt-2 animate-fade-up" style={{ animationDelay: '0.15s' }}>
              一步杀至多步杀 · 难度分级 · 强化战术计算
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl text-gold">{totalSolved}<span className="text-base text-ivoryDim"> / {totalPuzzles}</span></div>
            <div className="text-[10px] uppercase tracking-widest text-ivoryDim">已解题数</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card-gold rounded-sm p-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-2">当前连胜</div>
          <div className="font-display text-4xl text-gold">{progress.puzzleProgress.streak}</div>
        </div>
        <div className="card-gold rounded-sm p-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-2">最长连胜</div>
          <div className="font-display text-4xl text-gold">{progress.puzzleProgress.bestStreak}</div>
        </div>
        <div className="card-gold rounded-sm p-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-2">解题率</div>
          <div className="font-display text-4xl text-gold">
            {totalSolved > 0 && totalPuzzles > 0 ? Math.round((totalSolved / totalPuzzles) * 100) : 0}<span className="text-lg text-ivoryDim">%</span>
          </div>
        </div>
        <div className="card-gold rounded-sm p-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold/60 mb-2">尝试次数</div>
          <div className="font-display text-4xl text-gold">{totalAttempts}</div>
        </div>
      </div>

      <div className="divider-gold mb-8" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {LEVELS.map((lv, idx) => {
          const Icon = lv.icon;
          const total = counts[lv.level];
          const solved = progress.puzzleProgress.byLevel[lv.level]?.solved ?? 0;
          const attempted = progress.puzzleProgress.byLevel[lv.level]?.total ?? 0;
          const accuracy = attempted > 0 ? Math.round((solved / attempted) * 100) : 0;
          return (
            <Link
              key={lv.level}
              to={`/puzzles/${lv.level}`}
              className="card-gold rounded-sm p-7 group relative overflow-hidden flex flex-col h-full transition-transform duration-300 hover:-translate-y-1 animate-fade-up"
              style={{ animationDelay: `${idx * 0.08}s` }}
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-gold/5 to-transparent pointer-events-none" />
              <div className="absolute -top-4 -right-4 text-[140px] font-display text-gold/5 leading-none select-none pointer-events-none">
                {lv.level}
              </div>

              <div className="flex items-start justify-between mb-5 relative">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-1">Level {lv.level} · {lv.en}</div>
                  <h3 className="font-display text-4xl text-ivory tracking-tight-display">{lv.title}</h3>
                  <div className="text-[10px] text-ivoryDim font-mono mt-1">Rating {lv.range}</div>
                </div>
                <div className="w-14 h-14 border border-gold/30 rounded-sm flex items-center justify-center bg-ink-800 group-hover:border-gold/60 group-hover:shadow-glow transition-all">
                  <Icon size={22} className={lv.accent} />
                </div>
              </div>

              <p className="text-sm text-ivoryDim leading-relaxed flex-1 mb-5">{lv.desc}</p>

              <div className="mb-4">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-ivoryDim mb-1.5">
                  <span>解题进度</span>
                  <span className="font-mono">{solved} / {total}</span>
                </div>
                <div className="h-1.5 bg-ink-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-gold/60 to-gold transition-all duration-500"
                    style={{ width: `${total > 0 ? (solved / total) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gold/10">
                <div className="text-[10px] uppercase tracking-widest text-ivoryDim">
                  准确率 <span className="text-gold font-mono">{accuracy}%</span>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-gold flex items-center gap-1">
                  开始训练
                  <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
