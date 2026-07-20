// 全局状态管理（Zustand）：训练进度、当前对局状态等
import { create } from 'zustand';
import type { UserProgress, PuzzleLevel } from '@/types';
import { loadProgress, saveProgress, resetProgress } from '@/lib/storage';

// 复盘历史保留最近 N 条
const MAX_REVIEW_HISTORY = 20;
// 单条 PGN 文本最大长度（防止 localStorage 配额超限）
const MAX_PGN_LENGTH = 50_000;

// crypto.randomUUID 在非安全上下文（HTTP 非 localhost）下不可用，加 fallback
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface AppState {
  // 训练进度
  progress: UserProgress;
  // 移动端导航抽屉开关
  mobileNavOpen: boolean;
  // 当前训练时长累计（毫秒，会话内）
  sessionStart: number;

  // Actions
  setMobileNavOpen: (open: boolean) => void;
  recordGame: (result: 'win' | 'loss' | 'draw') => void;
  recordPuzzleSolved: (puzzleId: string, level: PuzzleLevel) => void;
  recordPuzzleAttempt: (level: PuzzleLevel) => void;
  recordOpeningPractice: (eco: string, accuracy: number) => void;
  recordReview: (pgn: string) => void;
  addTrainingTime: (ms: number) => void;
  resetAllProgress: () => void;
}

// 内部 helper：统一深拷贝 + 修改 + 落盘 + set，消除 6 个 action 的样板代码
function update(set: (partial: Partial<AppState>) => void, get: () => AppState, mutator: (draft: UserProgress) => void): void {
  const next = { ...get().progress };
  mutator(next);
  saveProgress(next);
  set({ progress: next });
}

export const useAppStore = create<AppState>((set, get) => ({
  progress: loadProgress(),
  mobileNavOpen: false,
  sessionStart: Date.now(),

  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),

  recordGame: (result) => {
    update(set, get, (p) => {
      p.playStats = { ...p.playStats };
      p.playStats.totalGames++;
      if (result === 'win') p.playStats.wins++;
      else if (result === 'loss') p.playStats.losses++;
      else p.playStats.draws++;
    });
  },

  recordPuzzleSolved: (puzzleId, level) => {
    update(set, get, (p) => {
      // 去重：同一题目已解过不再重复计入 solved/streak/byLevel.solved
      if (p.puzzleProgress.solved.includes(puzzleId)) return;
      p.puzzleProgress = { ...p.puzzleProgress };
      p.puzzleProgress.solved = [...p.puzzleProgress.solved, puzzleId];
      p.puzzleProgress.streak++;
      if (p.puzzleProgress.streak > p.puzzleProgress.bestStreak) {
        p.puzzleProgress.bestStreak = p.puzzleProgress.streak;
      }
      p.puzzleProgress.byLevel = { ...p.puzzleProgress.byLevel };
      p.puzzleProgress.byLevel[level] = {
        ...p.puzzleProgress.byLevel[level],
        solved: (p.puzzleProgress.byLevel[level]?.solved ?? 0) + 1,
      };
    });
  },

  recordPuzzleAttempt: (level) => {
    update(set, get, (p) => {
      p.puzzleProgress = { ...p.puzzleProgress };
      p.puzzleProgress.streak = 0; // 失败重置连胜
      p.puzzleProgress.byLevel = { ...p.puzzleProgress.byLevel };
      p.puzzleProgress.byLevel[level] = {
        ...p.puzzleProgress.byLevel[level],
        total: (p.puzzleProgress.byLevel[level]?.total ?? 0) + 1,
      };
    });
  },

  recordOpeningPractice: (eco, accuracy) => {
    update(set, get, (p) => {
      p.openingProgress = { ...p.openingProgress };
      const prev = p.openingProgress[eco] || { practices: 0, accuracy: 0 };
      const newPractices = prev.practices + 1;
      // 滚动平均
      const newAccuracy = (prev.accuracy * prev.practices + accuracy) / newPractices;
      p.openingProgress[eco] = { practices: newPractices, accuracy: newAccuracy };
    });
  },

  recordReview: (pgn) => {
    // 长度截断：超大 PGN 会撑爆 localStorage 配额
    const safePgn = pgn.length > MAX_PGN_LENGTH ? pgn.slice(0, MAX_PGN_LENGTH) : pgn;
    update(set, get, (p) => {
      p.reviewHistory = [
        { id: genId(), pgn: safePgn, reviewedAt: Date.now() },
        ...p.reviewHistory.slice(0, MAX_REVIEW_HISTORY - 1),
      ];
    });
  },

  addTrainingTime: (ms) => {
    update(set, get, (p) => {
      p.totalTrainingMs += ms;
    });
  },

  resetAllProgress: () => {
    const fresh = resetProgress();
    set({ progress: fresh });
  },
}));
