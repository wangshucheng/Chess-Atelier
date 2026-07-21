// 习题难度等级元数据：Puzzles / PuzzleDetail 共享
// 文本（title/en/desc）已迁移至 i18n（见 src/i18n/locales），此文件仅保留与语言无关的结构信息。
import { Target, Flame, Trophy, Crown, type LucideIcon } from 'lucide-react';
import type { PuzzleLevel } from '@/types';

export interface PuzzleLevelMeta {
  level: PuzzleLevel;
  icon: LucideIcon;
  accent: string;
  range: string;
}

export const PUZZLE_LEVELS: PuzzleLevelMeta[] = [
  { level: 1, icon: Target, accent: 'text-moss', range: '800-1000' },
  { level: 2, icon: Flame, accent: 'text-gold', range: '1100-1200' },
  { level: 3, icon: Trophy, accent: 'text-gold', range: '1300-1350' },
  { level: 4, icon: Crown, accent: 'text-wine', range: '1500+' },
];

// 按等级快速查找
export const PUZZLE_LEVEL_MAP: Record<PuzzleLevel, PuzzleLevelMeta> = PUZZLE_LEVELS.reduce(
  (acc, meta) => {
    acc[meta.level] = meta;
    return acc;
  },
  {} as Record<PuzzleLevel, PuzzleLevelMeta>,
);
