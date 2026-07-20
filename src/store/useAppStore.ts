// 全局状态管理（Zustand）：训练进度、当前对局状态等
import { create } from 'zustand';
import type { UserProgress } from '@/types';
import { loadProgress, saveProgress, resetProgress } from '@/lib/storage';

interface AppState {
  // 训练进度
  progress: UserProgress;
  // 侧栏折叠状态
  sidebarCollapsed: boolean;
  // 当前训练时长累计（毫秒，会话内）
  sessionStart: number;

  // Actions
  toggleSidebar: () => void;
  recordGame: (result: 'win' | 'loss' | 'draw') => void;
  recordPuzzleSolved: (puzzleId: string, level: number) => void;
  recordPuzzleAttempt: (level: number) => void;
  recordOpeningPractice: (eco: string, accuracy: number) => void;
  recordReview: (pgn: string) => void;
  addTrainingTime: (ms: number) => void;
  resetAllProgress: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  progress: loadProgress(),
  sidebarCollapsed: false,
  sessionStart: Date.now(),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  recordGame: (result) => {
    const next = { ...get().progress };
    next.playStats = { ...next.playStats };
    next.playStats.totalGames++;
    if (result === 'win') next.playStats.wins++;
    else if (result === 'loss') next.playStats.losses++;
    else next.playStats.draws++;
    saveProgress(next);
    set({ progress: next });
  },

  recordPuzzleSolved: (puzzleId, level) => {
    const next = { ...get().progress };
    next.puzzleProgress = { ...next.puzzleProgress };
    next.puzzleProgress.solved = [...next.puzzleProgress.solved, puzzleId];
    next.puzzleProgress.streak++;
    if (next.puzzleProgress.streak > next.puzzleProgress.bestStreak) {
      next.puzzleProgress.bestStreak = next.puzzleProgress.streak;
    }
    next.puzzleProgress.byLevel = { ...next.puzzleProgress.byLevel };
    next.puzzleProgress.byLevel[level] = {
      ...next.puzzleProgress.byLevel[level],
      solved: (next.puzzleProgress.byLevel[level]?.solved ?? 0) + 1,
    };
    saveProgress(next);
    set({ progress: next });
  },

  recordPuzzleAttempt: (level) => {
    const next = { ...get().progress };
    next.puzzleProgress = { ...next.puzzleProgress };
    next.puzzleProgress.streak = 0; // 失败重置连胜
    next.puzzleProgress.byLevel = { ...next.puzzleProgress.byLevel };
    next.puzzleProgress.byLevel[level] = {
      ...next.puzzleProgress.byLevel[level],
      total: (next.puzzleProgress.byLevel[level]?.total ?? 0) + 1,
    };
    saveProgress(next);
    set({ progress: next });
  },

  recordOpeningPractice: (eco, accuracy) => {
    const next = { ...get().progress };
    next.openingProgress = { ...next.openingProgress };
    const prev = next.openingProgress[eco] || { practices: 0, accuracy: 0 };
    const newPractices = prev.practices + 1;
    // 滚动平均
    const newAccuracy = (prev.accuracy * prev.practices + accuracy) / newPractices;
    next.openingProgress[eco] = { practices: newPractices, accuracy: newAccuracy };
    saveProgress(next);
    set({ progress: next });
  },

  recordReview: (pgn) => {
    const next = { ...get().progress };
    next.reviewHistory = [
      { id: `rev-${Date.now()}`, pgn, reviewedAt: Date.now() },
      ...next.reviewHistory.slice(0, 19), // 保留最近 20 条
    ];
    saveProgress(next);
    set({ progress: next });
  },

  addTrainingTime: (ms) => {
    const next = { ...get().progress };
    next.totalTrainingMs += ms;
    saveProgress(next);
    set({ progress: next });
  },

  resetAllProgress: () => {
    const fresh = resetProgress();
    set({ progress: fresh });
  },
}));
