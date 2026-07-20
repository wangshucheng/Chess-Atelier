// 首页：Hero 引导 + 训练模式卡片 + 数据看板
import { Link } from 'react-router-dom';
import { Swords, BookOpen, Puzzle, Reply, ArrowRight, Sparkles, Crown } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

// 仅订阅 progress 字段，避免其他状态变更（如侧栏折叠）触发重渲染
const useProgress = () => useAppStore((s) => s.progress);

const modes = [
  {
    to: '/play',
    title: '陪练对战',
    en: 'Practice Match',
    desc: '与 Minimax + Alpha-Beta AI 对弈，支持难度调节、走法提示与棋理讲解。',
    icon: Swords,
    accent: '陪练 · AI',
  },
  {
    to: '/openings',
    title: '开局训练',
    en: 'Opening Drills',
    desc: '内置十大热门开局库，逐步演练主线与变体，建立开局直觉。',
    icon: BookOpen,
    accent: '理论 · 演练',
  },
  {
    to: '/puzzles',
    title: '习题库',
    en: 'Tactical Puzzles',
    desc: '一步杀至多步杀习题分级训练，强化战术嗅觉与计算深度。',
    icon: Puzzle,
    accent: '战术 · 计算',
  },
  {
    to: '/review',
    title: '棋局复盘',
    en: 'Game Review',
    desc: '解析 PGN/FEN 棋谱，逐步回放并绘制评估曲线，定位失误。',
    icon: Reply,
    accent: '分析 · 复盘',
  },
];

export default function Home() {
  const progress = useProgress();
  const winRate = progress.playStats.totalGames > 0
    ? Math.round((progress.playStats.wins / progress.playStats.totalGames) * 100)
    : 0;
  const puzzleProgress = progress.puzzleProgress.solved.length;
  const trainingHours = Math.floor(progress.totalTrainingMs / 3600000);
  const trainingMinutes = Math.floor((progress.totalTrainingMs % 3600000) / 60000);

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative px-4 md:px-12 pt-16 md:pt-24 pb-20 md:pb-32 overflow-hidden">
        {/* 装饰：左上角棋子符号 */}
        <div className="absolute top-12 right-12 text-[200px] font-display text-gold/5 leading-none select-none pointer-events-none">
          ♛
        </div>
        <div className="absolute bottom-12 left-12 text-[120px] font-display text-gold/5 leading-none select-none pointer-events-none">
          ♞
        </div>

        <div className="max-w-5xl">
          <div className="flex items-center gap-2 mb-8 animate-fade-up">
            <Sparkles size={12} className="text-gold" />
            <span className="text-[10px] uppercase tracking-[0.4em] text-gold/70">
              Chess Atelier · 国际象棋训练陪练
            </span>
          </div>

          <h1 className="font-display text-5xl sm:text-7xl md:text-8xl text-ivory leading-[0.95] tracking-tight-display mb-8 animate-letter-tighten">
            一座<span className="text-gold italic">棋手</span>的
            <br />
            私人书房。
          </h1>

          <p className="text-lg text-ivoryDim max-w-2xl leading-relaxed mb-12 animate-fade-up" style={{ animationDelay: '0.3s' }}>
            集成极小化极大算法与 Alpha-Beta 剪枝的网页版国际象棋陪练。
            学—练—战—复盘，在浏览器内完成完整训练闭环，无需下载、无需登录、无需服务器。
          </p>

          <div className="flex flex-wrap gap-4 animate-fade-up" style={{ animationDelay: '0.5s' }}>
            <Link
              to="/play"
              className="btn-gold-solid px-7 py-3 rounded-sm text-sm uppercase tracking-widest flex items-center gap-2"
            >
              <Crown size={14} />
              开始训练
            </Link>
            <Link
              to="/openings"
              className="btn-gold-outline px-7 py-3 rounded-sm text-sm uppercase tracking-widest flex items-center gap-2"
            >
              浏览开局库
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <div className="divider-gold mx-4 md:mx-12" />

      {/* 训练模式卡片 */}
      <section className="px-4 md:px-12 py-10 md:py-16">
        <div className="flex items-baseline justify-between mb-10">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-2">Training Modes</div>
            <h2 className="font-display text-4xl text-ivory tracking-tight-display">四种训练模式</h2>
          </div>
          <div className="text-xs text-ivoryDim italic">选择适合当下的训练方式</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {modes.map((mode, idx) => {
            const Icon = mode.icon;
            return (
              <Link
                key={mode.to}
                to={mode.to}
                className="card-gold rounded-sm p-6 group relative overflow-hidden flex flex-col h-full transition-transform duration-300 hover:-translate-y-1"
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-gold/5 to-transparent pointer-events-none" />
                <div className="mb-6">
                  <div className="w-12 h-12 border border-gold/30 rounded-sm flex items-center justify-center bg-ink-800 group-hover:border-gold/60 group-hover:shadow-glow transition-all">
                    <Icon size={20} className="text-gold" />
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-2">{mode.en}</div>
                <h3 className="font-display text-2xl text-ivory mb-3 tracking-tight-display">{mode.title}</h3>
                <p className="text-sm text-ivoryDim leading-relaxed flex-1">{mode.desc}</p>
                <div className="mt-6 pt-4 border-t border-gold/10 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-gold/50">{mode.accent}</span>
                  <ArrowRight size={14} className="text-gold/50 group-hover:text-gold group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="divider-gold mx-4 md:mx-12" />

      {/* 数据看板 */}
      <section className="px-4 md:px-12 py-10 md:py-16">
        <div className="flex items-baseline justify-between mb-10">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-2">Your Atelier</div>
            <h2 className="font-display text-4xl text-ivory tracking-tight-display">训练数据看板</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="card-gold rounded-sm p-8">
            <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-3">对战胜率</div>
            <div className="font-display text-6xl text-gold leading-none mb-3 tracking-tight-display">
              {winRate}<span className="text-3xl text-gold/60">%</span>
            </div>
            <div className="text-xs text-ivoryDim font-mono">
              {progress.playStats.wins}胜 · {progress.playStats.losses}负 · {progress.playStats.draws}和 / 共 {progress.playStats.totalGames} 局
            </div>
          </div>

          <div className="card-gold rounded-sm p-8">
            <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-3">习题进度</div>
            <div className="font-display text-6xl text-gold leading-none mb-3 tracking-tight-display">
              {puzzleProgress}<span className="text-3xl text-gold/60">题</span>
            </div>
            <div className="text-xs text-ivoryDim font-mono">
              最长连胜 {progress.puzzleProgress.bestStreak} · 当前 {progress.puzzleProgress.streak}
            </div>
          </div>

          <div className="card-gold rounded-sm p-8">
            <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60 mb-3">累计训练</div>
            <div className="font-display text-6xl text-gold leading-none mb-3 tracking-tight-display">
              {trainingHours}<span className="text-3xl text-gold/60">h</span>
              <span className="text-3xl text-gold/60 ml-2">{trainingMinutes}<span className="text-xl">m</span></span>
            </div>
            <div className="text-xs text-ivoryDim font-mono">
              已练习 {Object.keys(progress.openingProgress).length} 种开局
            </div>
          </div>
        </div>
      </section>

      {/* 底部签名 */}
      <footer className="px-4 md:px-12 py-10 border-t border-gold/10">
        <div className="flex items-center justify-between text-xs text-ivoryDim/60">
          <div className="flex items-center gap-2">
            <span className="font-display text-gold">♞</span>
            <span>Chess Atelier · React + TypeScript + Vite + chess.js</span>
          </div>
          <div className="font-mono">v0.1.0 · Minimax α-β</div>
        </div>
      </footer>
    </div>
  );
}
