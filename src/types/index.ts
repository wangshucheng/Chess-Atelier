// 全局类型定义

// 棋子类型（chess.js 使用小写字母）
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

// AI 搜索结果
export interface SearchCandidate {
  move: string;        // SAN 走子记谱
  from: string;
  to: string;
  promotion?: string;
  evaluation: number;  // 从白方视角的评估值
  principalVariation: string[]; // 该候选的主路径（SAN 序列）
}

export interface SearchResult {
  bestMove: string;            // SAN
  from: string;
  to: string;
  promotion?: string;
  evaluation: number;          // 白方视角
  principalVariation: string[];// SAN 序列
  candidates: SearchCandidate[]; // Top-N 候选走法
  depth: number;
  nodesSearched: number;
  timeMs: number;
}

// AI 难度配置
export interface DifficultyConfig {
  level: number;          // 1-10
  depth: number;          // 搜索深度 1-5
  useAlphaBeta: boolean;
  useMoveOrdering: boolean;
  topCandidates: number;  // 返回候选走法数量
  randomness: number;     // 0-1，引入随机性以降低难度
}

// 走子评级（复盘用）
export type MoveQuality = 'best' | 'good' | 'dubious' | 'mistake' | 'blunder';

export interface AnnotatedMove {
  san: string;
  fenBefore: string;
  fenAfter: string;
  evaluationBefore: number;
  evaluationAfter: number;
  quality: MoveQuality;
  isBest: boolean;
  bestMove?: string;
}

// 开局库
export interface Variation {
  name: string;
  moves: string[];
  note: string;
}

export interface Opening {
  eco: string;
  name: string;
  nameZh: string;
  category: 'open' | 'semi-open' | 'closed';
  mainLine: string[];
  variations: Variation[];
  description: string;
}

// 习题难度等级
export type PuzzleLevel = 1 | 2 | 3 | 4;

// 习题
export interface Puzzle {
  id: string;
  level: PuzzleLevel;
  fen: string;
  solution: string[];
  theme: string[];
  rating: number;
}

// 用户进度
export interface UserProgress {
  playStats: { wins: number; losses: number; draws: number; totalGames: number };
  openingProgress: Record<string, { practices: number; accuracy: number }>;
  puzzleProgress: {
    solved: string[];
    streak: number;
    bestStreak: number;
    byLevel: Record<PuzzleLevel, { total: number; solved: number }>;
  };
  reviewHistory: { id: string; pgn: string; reviewedAt: number }[];
  totalTrainingMs: number;
}

// 棋理讲解
export interface Explanation {
  themes: string[];      // 战术主题
  summary: string;       // 一句话总结
  details: string[];     // 详细解说段落
  riskLevel: 'low' | 'medium' | 'high';
}
