// localStorage 持久化封装
// 包含：版本号、深合并、类型校验、配额异常处理
import type { UserProgress } from '@/types';

const STORAGE_KEY = 'chess-atelier-progress-v1';

function defaultByLevel() {
  return {
    1: { total: 0, solved: 0 },
    2: { total: 0, solved: 0 },
    3: { total: 0, solved: 0 },
    4: { total: 0, solved: 0 },
  };
}

function defaultProgress(): UserProgress {
  return {
    playStats: { wins: 0, losses: 0, draws: 0, totalGames: 0 },
    openingProgress: {},
    puzzleProgress: {
      solved: [],
      streak: 0,
      bestStreak: 0,
      byLevel: defaultByLevel(),
    },
    reviewHistory: [],
    totalTrainingMs: 0,
  };
}

let memoryCache: UserProgress | null = null;
// 保存失败标志：暴露给 UI 层提示用户
let persistFailed = false;

export function isPersistFailed(): boolean {
  return persistFailed;
}

// 校验 + 合并 parsed 到默认结构，确保嵌套字段类型完整
function sanitizeProgress(parsed: unknown): UserProgress {
  const base = defaultProgress();
  if (!parsed || typeof parsed !== 'object') return base;
  const p = parsed as Record<string, unknown>;

  // playStats
  if (p.playStats && typeof p.playStats === 'object') {
    const ps = p.playStats as Record<string, unknown>;
    base.playStats = {
      wins: typeof ps.wins === 'number' ? ps.wins : 0,
      losses: typeof ps.losses === 'number' ? ps.losses : 0,
      draws: typeof ps.draws === 'number' ? ps.draws : 0,
      totalGames: typeof ps.totalGames === 'number' ? ps.totalGames : 0,
    };
  }

  // openingProgress：保留结构但跳过非法值
  if (p.openingProgress && typeof p.openingProgress === 'object') {
    const op = p.openingProgress as Record<string, unknown>;
    for (const [k, v] of Object.entries(op)) {
      if (v && typeof v === 'object') {
        const entry = v as Record<string, unknown>;
        base.openingProgress[k] = {
          practices: typeof entry.practices === 'number' ? entry.practices : 0,
          accuracy: typeof entry.accuracy === 'number' ? entry.accuracy : 0,
        };
      }
    }
  }

  // puzzleProgress
  if (p.puzzleProgress && typeof p.puzzleProgress === 'object') {
    const pp = p.puzzleProgress as Record<string, unknown>;
    base.puzzleProgress = {
      solved: Array.isArray(pp.solved) ? pp.solved.filter((x): x is string => typeof x === 'string') : [],
      streak: typeof pp.streak === 'number' ? pp.streak : 0,
      bestStreak: typeof pp.bestStreak === 'number' ? pp.bestStreak : 0,
      byLevel: defaultByLevel(),
    };
    if (pp.byLevel && typeof pp.byLevel === 'object') {
      const bl = pp.byLevel as Record<string, unknown>;
      for (const lvl of [1, 2, 3, 4] as const) {
        const e = bl[String(lvl)];
        if (e && typeof e === 'object') {
          const entry = e as Record<string, unknown>;
          base.puzzleProgress.byLevel[lvl] = {
            total: typeof entry.total === 'number' ? entry.total : 0,
            solved: typeof entry.solved === 'number' ? entry.solved : 0,
          };
        }
      }
    }
  }

  // reviewHistory
  if (Array.isArray(p.reviewHistory)) {
    base.reviewHistory = p.reviewHistory.filter(
      (x): x is { id: string; pgn: string; reviewedAt: number } =>
        !!x && typeof x === 'object' &&
        typeof (x as Record<string, unknown>).pgn === 'string' &&
        typeof (x as Record<string, unknown>).reviewedAt === 'number',
    );
  }

  if (typeof p.totalTrainingMs === 'number') {
    base.totalTrainingMs = p.totalTrainingMs;
  }

  return base;
}

export function loadProgress(): UserProgress {
  if (memoryCache) return memoryCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      memoryCache = sanitizeProgress(parsed);
      return memoryCache;
    }
  } catch (err) {
    // 损坏的 localStorage 数据，回退到默认值并记录
    console.warn('[storage] 读取进度失败，使用默认值:', err);
  }
  memoryCache = defaultProgress();
  return memoryCache;
}

export function saveProgress(progress: UserProgress): void {
  memoryCache = progress;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    persistFailed = false;
  } catch (err) {
    // 配额超限或隐私模式：保留内存缓存但标记失败
    persistFailed = true;
    console.warn('[storage] 保存进度失败，可能 localStorage 配额已满:', err);
  }
}

export function resetProgress(): UserProgress {
  // 直接复用 defaultProgress()，避免两处构造逻辑漂移
  memoryCache = defaultProgress();
  saveProgress(memoryCache);
  return memoryCache;
}
