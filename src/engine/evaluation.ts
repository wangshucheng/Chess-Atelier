// 局面评估函数
// 评估值始终从白方视角：正数=白优，负数=黑优
// 范围约 ±10000，超出表示接近将杀

import { Chess, PieceSymbol, Color } from 'chess.js';

// 子力分值
export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// 经典 Piece-Square Tables（白方视角，从 a8 到 h1，即 index 0 = a8）
// 数值越大表示该位置对该棋子越有利
// 来源：chessprogramming Wiki 经典 PST

// 兵
const PST_PAWN = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0,
];

// 马
const PST_KNIGHT = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

// 象
const PST_BISHOP = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];

// 车
const PST_ROOK = [
  0,  0,  0,  0,  0,  0,  0,  0,
  5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  0,  0,  0,  5,  5,  0,  0,  0,
];

// 后
const PST_QUEEN = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
  0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];

// 王（中局）
const PST_KING_MID = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20,
];

// 王（残局）
const PST_KING_END = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
];

const PST_MAP: Record<PieceSymbol, number[]> = {
  p: PST_PAWN,
  n: PST_KNIGHT,
  b: PST_BISHOP,
  r: PST_ROOK,
  q: PST_QUEEN,
  k: PST_KING_MID,
};

// 将棋盘坐标 (file, rank) 转为 PST 索引
// chess.js board() 返回 board[rank][file]，rank=0 是第 8 行（黑方底线）
function squareToIndex(file: number, rank: number): number {
  return rank * 8 + file;
}

// 判断是否为残局阶段（双方均无后，或后侧仅剩少量子力）
function isEndgame(game: Chess): boolean {
  const board = game.board();
  let whiteQueenCount = 0;
  let blackQueenCount = 0;
  let nonPawnMaterial = 0;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece) continue;
      if (piece.type === 'q') {
        if (piece.color === 'w') whiteQueenCount++;
        else blackQueenCount++;
      }
      if (piece.type !== 'p' && piece.type !== 'k') {
        nonPawnMaterial += PIECE_VALUES[piece.type];
      }
    }
  }

  // 残局判定：每方无后，或仅有一后且其他子力较少
  const queensMinor = (whiteQueenCount <= 1 && blackQueenCount <= 1);
  return queensMinor && nonPawnMaterial < 1700;
}

// 评估当前局面（白方视角）
export function evaluatePosition(game: Chess): number {
  // 终局判定
  if (game.isCheckmate()) {
    // 被将杀方为当前轮到的方
    return game.turn() === 'w' ? -100000 : 100000;
  }
  if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.isInsufficientMaterial()) {
    return 0;
  }

  const board = game.board();
  const endgame = isEndgame(game);

  let score = 0;
  let whiteBishopCount = 0;
  let blackBishopCount = 0;
  let whiteMobility = 0;
  let blackMobility = 0;

  // 子力 + PST 评分
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece) continue;

      const idx = squareToIndex(file, rank);
      const pst = piece.type === 'k' && endgame ? PST_KING_END : PST_MAP[piece.type];
      // 黑方视角：PST 水平+垂直翻转（即 index 56 - idx + 调整）
      // 简化处理：黑方使用镜像索引 (63 - idx 大致可用，但 PST 表设计上需垂直翻转)
      // 标准做法：黑方 idx = (7 - rank) * 8 + file
      const pstIdx = piece.color === 'w' ? idx : (7 - rank) * 8 + file;
      const pstValue = pst[pstIdx];

      const materialValue = PIECE_VALUES[piece.type];

      if (piece.color === 'w') {
        score += materialValue + pstValue;
        if (piece.type === 'b') whiteBishopCount++;
      } else {
        score -= materialValue + pstValue;
        if (piece.type === 'b') blackBishopCount++;
      }
    }
  }

  // 双象奖励
  if (whiteBishopCount >= 2) score += 30;
  if (blackBishopCount >= 2) score -= 30;

  // 机动性（合法走子数）
  // 为避免修改原局面，使用 turn 已是当前轮到方，可用 game.moves() 数量作为机动性
  // 但需要在双方视角都计算，这里简化：仅用当前 turn 的走子数
  const currentTurn = game.turn();
  const currentMoves = game.moves().length;
  if (currentTurn === 'w') {
    whiteMobility = currentMoves;
  } else {
    blackMobility = currentMoves;
  }
  // 机动性差异（轻微加权，避免与子力重复影响）
  score += (whiteMobility - blackMobility) * 2;

  return score;
}

// 获取 PST 值（用于讲解器或调试）
export function getPstValue(piece: PieceSymbol, color: Color, square: string, endgame: boolean): number {
  const files = 'abcdefgh';
  const file = files.indexOf(square[0]);
  const rank = 8 - parseInt(square[1], 10);
  const idx = squareToIndex(file, rank);
  const pst = piece === 'k' && endgame ? PST_KING_END : PST_MAP[piece];
  const pstIdx = color === 'w' ? idx : (7 - rank) * 8 + file;
  return pst[pstIdx];
}
