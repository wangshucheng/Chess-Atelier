// localStorage 持久化封装
import type { UserProgress } from '@/types';

const STORAGE_KEY = 'chess-atelier-progress-v1';

const DEFAULT_PROGRESS: UserProgress = {
  playStats: { wins: 0, losses: 0, draws: 0, totalGames: 0 },
  openingProgress: {},
  puzzleProgress: {
    solved: [],
    streak: 0,
    bestStreak: 0,
    byLevel: { 1: { total: 0, solved: 0 }, 2: { total: 0, solved: 0 }, 3: { total: 0, solved: 0 }, 4: { total: 0, solved: 0 } },
  },
  reviewHistory: [],
  totalTrainingMs: 0,
};

let memoryCache: UserProgress | null = null;

export function loadProgress(): UserProgress {
  if (memoryCache) return memoryCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      memoryCache = { ...DEFAULT_PROGRESS, ...parsed };
      return memoryCache;
    }
  } catch {
    // ignore
  }
  memoryCache = { ...DEFAULT_PROGRESS };
  return memoryCache;
}

export function saveProgress(progress: UserProgress): void {
  memoryCache = progress;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

export function updateProgress(updater: (prev: UserProgress) => UserProgress): UserProgress {
  const current = loadProgress();
  const next = updater(current);
  saveProgress(next);
  return next;
}

export function resetProgress(): UserProgress {
  memoryCache = { ...DEFAULT_PROGRESS, puzzleProgress: { ...DEFAULT_PROGRESS.puzzleProgress, byLevel: { ...DEFAULT_PROGRESS.puzzleProgress.byLevel } } };
  saveProgress(memoryCache);
  return memoryCache;
}
