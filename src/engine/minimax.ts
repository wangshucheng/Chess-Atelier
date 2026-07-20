// Minimax + Alpha-Beta 剪枝搜索
// 核心算法：递归搜索博弈树，α-β 剪枝去除必不选的分支

import { Chess } from 'chess.js';
import { evaluatePosition, isEndgame } from './evaluation';
import { orderMoves, OrderedMove } from './moveOrdering';
import { MATE_SCORE } from './constants';
import type { DifficultyConfig, SearchCandidate, SearchResult } from '@/types';

// 节点计数器（用于统计搜索量）
let nodesSearched = 0;

// 将杀分数编码：±(MATE_SCORE - distanceToMate)
// 距离越近分数绝对值越大，更快的将杀更优
function mateScore(distanceToMate: number, maximizing: boolean): number {
  // maximizing=true 表示当前节点是被将杀方（白方被将杀 → 负分）
  // distanceToMate = 距离将杀的步数（1 = 立即将杀）
  const sign = maximizing ? -1 : 1;
  return sign * (MATE_SCORE - distanceToMate);
}

// 主搜索函数
function minimax(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  useAlphaBeta: boolean,
  useMoveOrdering: boolean,
  pv: string[],
  endgame: boolean,
  plyFromRoot: number,
): number {
  nodesSearched++;

  if (depth === 0 || game.isGameOver()) {
    if (game.isCheckmate()) {
      // 当前轮到方被将杀：若 maximizing=true 表示白方被将杀
      // distanceToMate = plyFromRoot + 1（当前节点到将杀的距离）
      return mateScore(plyFromRoot + 1, maximizing);
    }
    if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.isInsufficientMaterial()) {
      return 0;
    }
    return evaluatePosition(game, endgame);
  }

  // 走子排序
  let moves: OrderedMove[];
  if (useMoveOrdering) {
    moves = orderMoves(game);
  } else {
    const verbose = game.moves({ verbose: true });
    moves = verbose.map((m) => ({
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion,
      score: 0,
    }));
  }

  if (maximizing) {
    let maxEval = -Infinity;
    let bestPv: string[] = [];
    for (const m of moves) {
      game.move({ from: m.from, to: m.to, promotion: m.promotion });
      const childPv: string[] = [];
      const evalScore = minimax(game, depth - 1, alpha, beta, false, useAlphaBeta, useMoveOrdering, childPv, endgame, plyFromRoot + 1);
      game.undo();

      if (evalScore > maxEval) {
        maxEval = evalScore;
        bestPv = [m.san, ...childPv];
      }

      if (useAlphaBeta) {
        alpha = Math.max(alpha, evalScore);
        if (beta <= alpha) break; // β 剪枝
      }
    }
    pv.push(...bestPv);
    return maxEval;
  } else {
    let minEval = Infinity;
    let bestPv: string[] = [];
    for (const m of moves) {
      game.move({ from: m.from, to: m.to, promotion: m.promotion });
      const childPv: string[] = [];
      const evalScore = minimax(game, depth - 1, alpha, beta, true, useAlphaBeta, useMoveOrdering, childPv, endgame, plyFromRoot + 1);
      game.undo();

      if (evalScore < minEval) {
        minEval = evalScore;
        bestPv = [m.san, ...childPv];
      }

      if (useAlphaBeta) {
        beta = Math.min(beta, evalScore);
        if (beta <= alpha) break; // α 剪枝
      }
    }
    pv.push(...bestPv);
    return minEval;
  }
}

// 顶层搜索：返回完整结果（含候选走法与各自 PV）
export function searchBestMove(fen: string, config: DifficultyConfig): SearchResult {
  const startTime = Date.now();
  nodesSearched = 0;

  const game = new Chess(fen);
  const isWhiteTurn = game.turn() === 'w';
  const maximizing = isWhiteTurn; // 白方最大化，黑方最小化
  const endgame = isEndgame(game); // 顶层计算一次，递归内复用

  // 走子排序
  let moves: OrderedMove[];
  if (config.useMoveOrdering) {
    moves = orderMoves(game);
  } else {
    const verbose = game.moves({ verbose: true });
    moves = verbose.map((m) => ({
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion,
      score: 0,
    }));
  }

  // 对所有顶层走子逐一评估，收集候选（含 PV）
  // 顶层不剪枝（保留所有候选供 UI 对比），但子树内部正常 α-β 剪枝
  const candidates: SearchCandidate[] = [];
  let alpha = -Infinity;
  let beta = Infinity;

  for (const m of moves) {
    game.move({ from: m.from, to: m.to, promotion: m.promotion });
    const childPv: string[] = [];
    const evalScore = minimax(
      game,
      config.depth - 1,
      alpha,
      beta,
      !maximizing,
      config.useAlphaBeta,
      config.useMoveOrdering,
      childPv,
      endgame,
      1,
    );
    game.undo();

    const candidate: SearchCandidate = {
      move: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion,
      evaluation: evalScore,
      principalVariation: [m.san, ...childPv],
    };
    candidates.push(candidate);

    // 顶层也更新 alpha/beta 边界（不剪枝顶层，但收紧子树搜索窗口）
    if (config.useAlphaBeta) {
      if (maximizing) {
        alpha = Math.max(alpha, evalScore);
      } else {
        beta = Math.min(beta, evalScore);
      }
    }
  }

  // 排序候选：白方选最大，黑方选最小
  candidates.sort((a, b) => (maximizing ? b.evaluation - a.evaluation : a.evaluation - b.evaluation));

  // 根据难度引入随机性：低难度时从 Top-N 中随机选择
  const topN = Math.max(1, Math.min(candidates.length, config.topCandidates));
  const pool = candidates.slice(0, topN);
  let chosen = pool[0];
  if (config.randomness > 0 && pool.length > 1) {
    if (Math.random() < config.randomness) {
      chosen = pool[Math.floor(Math.random() * pool.length)];
    }
  }

  // 直接复用 chosen 的 PV（无需重复搜索）
  const pv = chosen.principalVariation.slice(0, 6);
  const timeMs = Date.now() - startTime;

  return {
    bestMove: chosen.move,
    from: chosen.from,
    to: chosen.to,
    promotion: chosen.promotion,
    evaluation: chosen.evaluation,
    principalVariation: pv,
    candidates: pool,
    depth: config.depth,
    nodesSearched,
    timeMs,
  };
}

// 难度映射
export function getDifficultyConfig(level: number): DifficultyConfig {
  const clamped = Math.max(1, Math.min(10, level));
  const config: DifficultyConfig = {
    level: clamped,
    depth: 1,
    useAlphaBeta: false,
    useMoveOrdering: false,
    topCandidates: 1,
    randomness: 0,
  };

  if (clamped <= 2) {
    config.depth = 1;
    config.useAlphaBeta = false;
    config.useMoveOrdering = false;
    config.topCandidates = 5;
    config.randomness = 0.7; // 高随机性模拟初学
  } else if (clamped <= 4) {
    config.depth = 2;
    config.useAlphaBeta = true;
    config.useMoveOrdering = true;
    config.topCandidates = 3;
    config.randomness = 0.35;
  } else if (clamped <= 6) {
    config.depth = 3;
    config.useAlphaBeta = true;
    config.useMoveOrdering = true;
    config.topCandidates = 3;
    config.randomness = 0.12;
  } else if (clamped <= 8) {
    config.depth = 4;
    config.useAlphaBeta = true;
    config.useMoveOrdering = true;
    config.topCandidates = 3;
    config.randomness = 0;
  } else {
    config.depth = 5;
    config.useAlphaBeta = true;
    config.useMoveOrdering = true;
    config.topCandidates = 3;
    config.randomness = 0;
  }

  return config;
}
