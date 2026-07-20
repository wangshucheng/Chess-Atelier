// 局面评估函数
// 评估值始终从白方视角：正数=白优，负数=黑优
// 范围约 ±100000，超出表示接近将杀

import { Chess, PieceSymbol } from 'chess.js';

// 子力分值（王为 0，因为不可被吃且 PST 已涵盖其位置价值）
export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

// 经典 Piece-Square Tables（白方视角，从 a8 到 h1，即 index 0 = a8）
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

// 判断是否为残局阶段（双方非王子力总和较低）
// 结果在同一搜索中可视为常量，由调用方缓存
export function isEndgame(game: Chess): boolean {
  const board = game.board();
  let nonPawnMaterial = 0;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece) continue;
      if (piece.type !== 'p' && piece.type !== 'k') {
        nonPawnMaterial += PIECE_VALUES[piece.type];
      }
    }
  }

  // 残局判定：双方非王子力较低（约等于双方各失 1 后或同等子力）
  return nonPawnMaterial < 1700;
}

// 评估当前局面（白方视角）
// 注：终局（将杀/和棋）由调用方处理，这里只做静态评估
export function evaluatePosition(game: Chess, endgame?: boolean): number {
  const board = game.board();
  const isEnd = endgame ?? isEndgame(game);

  let score = 0;
  let whiteBishopCount = 0;
  let blackBishopCount = 0;

  // 子力 + PST 评分
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece) continue;

      const idx = squareToIndex(file, rank);
      const pst = piece.type === 'k' && isEnd ? PST_KING_END : PST_MAP[piece.type];
      // 黑方使用镜像索引：垂直翻转
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

  // 机动性（双方合法走子数差异）
  // 注意：game.moves() 只返回当前轮到方的走子，需要构造对方局面计算
  // 这里采用轻量近似：仅用当前方走子数，避免双倍 chess.js 开销
  // 评分偏移：当前方为白则加分，为黑则减分，相当于"轮到走的一方有微弱主动权"
  // 评分幅度小（±2*30=60），不影响 minimax 决策稳定性
  const currentTurn = game.turn();
  const currentMoves = game.moves().length;
  if (currentTurn === 'w') {
    score += currentMoves * 2;
  } else {
    score -= currentMoves * 2;
  }

  return score;
}
