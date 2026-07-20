// 开局库与习题库加载器（懒加载）

import type { Opening, Puzzle } from '@/types';

let openingsCache: Opening[] | null = null;
let puzzlesCache: Puzzle[] | null = null;

// 加载开局库
export async function loadOpenings(): Promise<Opening[]> {
  if (openingsCache) return openingsCache;
  try {
    const base = import.meta.env.BASE_URL || '/';
    const res = await fetch(`${base}openings.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    openingsCache = (await res.json()) as Opening[];
    return openingsCache;
  } catch (err) {
    console.error('加载开局库失败:', err);
    return [];
  }
}

// 加载习题库
export async function loadPuzzles(): Promise<Puzzle[]> {
  if (puzzlesCache) return puzzlesCache;
  try {
    const base = import.meta.env.BASE_URL || '/';
    const res = await fetch(`${base}puzzles.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    puzzlesCache = (await res.json()) as Puzzle[];
    return puzzlesCache;
  } catch (err) {
    console.error('加载习题库失败:', err);
    return [];
  }
}

// 按难度获取习题
export async function getPuzzlesByLevel(level: 1 | 2 | 3 | 4): Promise<Puzzle[]> {
  const all = await loadPuzzles();
  return all.filter((p) => p.level === level);
}

// 随机抽取一道习题
export async function getRandomPuzzle(level: 1 | 2 | 3 | 4, excludeIds: string[] = []): Promise<Puzzle | null> {
  const pool = await getPuzzlesByLevel(level);
  const available = pool.filter((p) => !excludeIds.includes(p.id));
  if (available.length === 0) {
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}
