// 开局库与习题库加载器（懒加载）
// 加载失败时抛出错误，由调用方决定如何呈现给用户

import type { Opening, Puzzle, PuzzleLevel } from '@/types';

let openingsCache: Opening[] | null = null;
let puzzlesCache: Puzzle[] | null = null;

// 规范化 base URL：确保末尾有且仅有一个 /，避免子路径部署时拼接出错
function getBase(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

// 加载开局库
export async function loadOpenings(): Promise<Opening[]> {
  if (openingsCache) return openingsCache;
  const res = await fetch(`${getBase()}openings.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  openingsCache = (await res.json()) as Opening[];
  return openingsCache;
}

// 加载习题库
export async function loadPuzzles(): Promise<Puzzle[]> {
  if (puzzlesCache) return puzzlesCache;
  const res = await fetch(`${getBase()}puzzles.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  puzzlesCache = (await res.json()) as Puzzle[];
  return puzzlesCache;
}

// 按难度获取习题
export async function getPuzzlesByLevel(level: PuzzleLevel): Promise<Puzzle[]> {
  const all = await loadPuzzles();
  return all.filter((p) => p.level === level);
}
