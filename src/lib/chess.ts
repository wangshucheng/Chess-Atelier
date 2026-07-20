// chess.js 封装：仅保留实际被使用的工具方法
import { Chess } from 'chess.js';

// 在给定 FEN 下尝试走子，返回 SAN 或 null（非法）
export function moveToSan(fen: string, from: string, to: string, promotion?: string): string | null {
  const game = new Chess(fen);
  try {
    const result = game.move({ from, to, promotion });
    return result?.san ?? null;
  } catch {
    return null;
  }
}
