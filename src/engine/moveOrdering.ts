// 走子排序：提升 Alpha-Beta 剪枝效率
// 核心思路：先搜索看似更好的走子，能更早触发剪枝

import { Chess } from 'chess.js';
import { PIECE_VALUES } from './evaluation';

export interface OrderedMove {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  score: number; // 启发式得分，越高越优先
}

// MVV-LVA（受害者价值-攻击者价值）：吃子走法排序
function mvvLvaScore(game: Chess, move: { from: string; to: string; promotion?: string }): number {
  const board = game.board();
  const files = 'abcdefgh';

  const fromFile = files.indexOf(move.from[0]);
  const fromRank = 8 - parseInt(move.from[1], 10);
  const toFile = files.indexOf(move.to[0]);
  const toRank = 8 - parseInt(move.to[1], 10);

  const attacker = board[fromRank][fromFile];
  const victim = board[toRank][toFile];

  let score = 0;
  if (victim) {
    // 吃子：victim 价值 - attacker 价值（吃大子用小子优先）
    score += PIECE_VALUES[victim.type] * 10 - PIECE_VALUES[attacker?.type || 'p'];
  }
  // 升变奖励
  if (move.promotion) {
    score += PIECE_VALUES[move.promotion as keyof typeof PIECE_VALUES] || 0;
  }
  return score;
}

// 将军奖励
function checkBonus(game: Chess, san: string): number {
  if (san.includes('+')) return 50;
  if (san.includes('#')) return 10000;
  return 0;
}

// 对所有合法走子进行排序
export function orderMoves(game: Chess): OrderedMove[] {
  const verboseMoves = game.moves({ verbose: true });
  const ordered = verboseMoves.map((m) => {
    const score = mvvLvaScore(game, m) + checkBonus(game, m.san);
    return {
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion,
      score,
    };
  });
  // 降序：得分高的优先
  ordered.sort((a, b) => b.score - a.score);
  return ordered;
}
