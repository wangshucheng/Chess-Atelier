// PGN/FEN 解析工具
import { Chess } from 'chess.js';

export interface ParsedPgn {
  headers: Record<string, string>;
  moves: string[];     // SAN 序列
  fens: string[];      // 每一步后的 FEN（含初始局面）
  result: string;      // 1-0 / 0-1 / 1/2-1/2 / *
}

// FEN 严格校验正则：6 段标准 FEN
const FEN_REGEX = /^\s*[pnbrqkPNBRQK1-8]+(?:\/[pnbrqkPNBRQK1-8]+){7}\s+[wb]\s+(?:[KQkq]+|-)\s+(?:[a-h][1-8]|-)\s+\d+\s+\d+\s*$/;

// 解析 PGN 字符串
export function parsePgn(pgn: string): ParsedPgn | null {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const history = game.history({ verbose: true });
    const moves = history.map((m) => m.san);

    // 重建每一步的 FEN
    const replay = new Chess();
    const fens: string[] = [replay.fen()];
    for (const m of moves) {
      replay.move(m);
      fens.push(replay.fen());
    }

    // 提取 headers
    const headers: Record<string, string> = {};
    Object.assign(headers, game.header());

    const result = headers.Result || '*';

    return { headers, moves, fens, result };
  } catch {
    return null;
  }
}

// 解析 FEN
export function parseFen(fen: string): { valid: boolean; fen: string | null } {
  if (!FEN_REGEX.test(fen)) return { valid: false, fen: null };
  try {
    const game = new Chess(fen);
    return { valid: true, fen: game.fen() };
  } catch {
    return { valid: false, fen: null };
  }
}

// 检测输入是 PGN 还是 FEN
export function detectInputFormat(input: string): 'pgn' | 'fen' | 'unknown' {
  const trimmed = input.trim();
  // 严格 FEN 正则优先匹配
  if (FEN_REGEX.test(trimmed)) {
    return 'fen';
  }
  if (trimmed.includes('1.') || trimmed.includes('[')) {
    return 'pgn';
  }
  return 'unknown';
}
