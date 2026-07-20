// 习题难度等级元数据：Puzzles / PuzzleDetail 共享
// 避免两处独立维护导致漂移
import { Target, Flame, Trophy, Crown, type LucideIcon } from 'lucide-react';
import type { PuzzleLevel } from '@/types';

export interface PuzzleLevelMeta {
  level: PuzzleLevel;
  title: string;
  en: string;
  desc: string;
  icon: LucideIcon;
  accent: string;
  range: string;
}

export const PUZZLE_LEVELS: PuzzleLevelMeta[] = [
  { level: 1, title: '一步杀', en: 'Mate in 1', desc: '单步将杀习题，培养战术敏锐度与终点嗅觉', icon: Target, accent: 'text-moss', range: '800-1000' },
  { level: 2, title: '两步杀', en: 'Mate in 2', desc: '双步将杀组合，强化计算深度与战术衔接', icon: Flame, accent: 'text-gold', range: '1100-1200' },
  { level: 3, title: '三步杀', en: 'Mate in 3', desc: '多步精确计算，考验局面预判与对手应招', icon: Trophy, accent: 'text-gold', range: '1300-1350' },
  { level: 4, title: '多步杀', en: 'Mate in N', desc: '复杂将杀链路，逼近实战残局推演极限', icon: Crown, accent: 'text-wine', range: '1500+' },
];

// 按等级快速查找
export const PUZZLE_LEVEL_MAP: Record<PuzzleLevel, PuzzleLevelMeta> = PUZZLE_LEVELS.reduce(
  (acc, meta) => {
    acc[meta.level] = meta;
    return acc;
  },
  {} as Record<PuzzleLevel, PuzzleLevelMeta>,
);
