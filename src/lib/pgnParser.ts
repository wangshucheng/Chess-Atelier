// PGN/FEN 解析与导出工具
import { Chess } from 'chess.js';

export interface ParsedPgn {
  headers: Record<string, string>;
  moves: string[];     // SAN 序列
  fens: string[];      // 每一步后的 FEN（含初始局面）
  result: string;      // 1-0 / 0-1 / 1/2-1/2 / *
}

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
    const rawHeaders = game.header ? game.header() : {};
    Object.assign(headers, rawHeaders);

    const result = headers.Result || '*';

    return { headers, moves, fens, result };
  } catch (err) {
    return null;
  }
}

// 解析 FEN
export function parseFen(fen: string): { valid: boolean; fen: string | null } {
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
  if (trimmed.split('\n').length === 1 && trimmed.split(' ').length === 6) {
    // 6 段以空格分隔 → FEN
    return 'fen';
  }
  if (trimmed.includes('1.') || trimmed.includes('[')) {
    return 'pgn';
  }
  return 'unknown';
}

// 导出 PGN（含可选 headers）
export function exportPgn(moves: string[], headers?: Record<string, string>): string {
  const game = new Chess();
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      game.header(k, v);
    }
  }
  for (const m of moves) {
    try {
      game.move(m);
    } catch {
      break;
    }
  }
  return game.pgn();
}

// 导出当前局面 FEN
export function exportFen(moves: string[], startingFen?: string): string {
  const game = startingFen ? new Chess(startingFen) : new Chess();
  for (const m of moves) {
    try {
      game.move(m);
    } catch {
      break;
    }
  }
  return game.fen();
}
