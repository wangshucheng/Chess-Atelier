// 全局状态管理（Zustand）：训练进度、当前对局状态等
import { create } from 'zustand';
import type { UserProgress, PuzzleLevel } from '@/types';
import { loadProgress, saveProgress, resetProgress } from '@/lib/storage';
import { setSoundEnabled as syncSoundEngine } from '@/lib/sounds';

// 复盘历史保留最近 N 条
const MAX_REVIEW_HISTORY = 20;
// 单条 PGN 文本最大长度（防止 localStorage 配额超限）
const MAX_PGN_LENGTH = 50_000;
// 音效开关独立持久化 key（不混入 progress，避免重置进度时连带重置）
const SOUND_KEY = 'chess-atelier-sound-enabled';

// 合法走步预览开关独立持久化 key（与音效同级，默认开启）
const LEGAL_MOVES_KEY = 'chess-atelier-legal-moves';
function loadShowLegalMoves(): boolean {
  try {
    return localStorage.getItem(LEGAL_MOVES_KEY) !== 'false';
  } catch {
    return true;
  }
}
function saveShowLegalMoves(enabled: boolean): void {
  try {
    localStorage.setItem(LEGAL_MOVES_KEY, String(enabled));
  } catch {
    // 隐私模式 / 配额满：忽略
  }
}

// crypto.randomUUID 在非安全上下文（HTTP 非 localhost）下不可用，加 fallback
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// 读取音效开关持久化状态：默认开启，仅当显式存过 false 才关闭
function loadSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    return raw !== 'false';
  } catch {
    return true;
  }
}
function saveSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, String(enabled));
  } catch {
    // 隐私模式 / 配额满：忽略
  }
}

interface AppState {
  // 训练进度
  progress: UserProgress;
  // 移动端导航抽屉开关
  mobileNavOpen: boolean;
  // 当前训练时长累计（毫秒，会话内）
  sessionStart: number;
  // 音效开关（独立持久化，不受 resetAllProgress 影响）
  soundEnabled: boolean;
  // 合法走步预览开关（选中/拖动棋子时高亮可走目标格；全局可调）
  showLegalMoves: boolean;

  // Actions
  setMobileNavOpen: (open: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setShowLegalMoves: (enabled: boolean) => void;
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
  // 初始化时同步给音效引擎（避免首启时引擎默认 true 与持久化值不一致）
  soundEnabled: (() => {
    const enabled = loadSoundEnabled();
    syncSoundEngine(enabled);
    return enabled;
  })(),

  // 合法走步预览默认开启
  showLegalMoves: loadShowLegalMoves(),

  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),

  setSoundEnabled: (enabled) => {
    syncSoundEngine(enabled);
    saveSoundEnabled(enabled);
    set({ soundEnabled: enabled });
  },

  setShowLegalMoves: (enabled) => {
    saveShowLegalMoves(enabled);
    set({ showLegalMoves: enabled });
  },

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
