// chess.js 封装：提供常用操作的便捷方法
import { Chess } from 'chess.js';

export class ChessGame {
  private game: Chess;

  constructor(fen?: string) {
    this.game = fen ? new Chess(fen) : new Chess();
  }

  // 走子（SAN 或 {from, to, promotion}）
  move(move: string | { from: string; to: string; promotion?: string }): boolean {
    try {
      this.game.move(move);
      return true;
    } catch {
      return false;
    }
  }

  undo() {
    return this.game.undo();
  }

  fen(): string {
    return this.game.fen();
  }

  turn(): 'w' | 'b' {
    return this.game.turn();
  }

  isGameOver(): boolean {
    return this.game.isGameOver();
  }

  isCheckmate(): boolean {
    return this.game.isCheckmate();
  }

  isDraw(): boolean {
    return this.game.isDraw();
  }

  isStalemate(): boolean {
    return this.game.isStalemate();
  }

  inCheck(): boolean {
    return this.game.inCheck();
  }

  // 合法走子（verbose 含 from/to/promotion）
  moves(verbose = false) {
    return this.game.moves({ verbose });
  }

  history(verbose = false) {
    return this.game.history({ verbose });
  }

  board() {
    return this.game.board();
  }

  // 加载 PGN
  loadPgn(pgn: string): boolean {
    try {
      this.game.loadPgn(pgn);
      return true;
    } catch {
      return false;
    }
  }

  pgn(): string {
    return this.game.pgn();
  }

  // 克隆
  clone(): ChessGame {
    return new ChessGame(this.fen());
  }

  // 获取原始 chess.js 实例（用于高级操作）
  raw(): Chess {
    return this.game;
  }
}

// 棋盘位置转代数记谱（如 {from:'e2', to:'e4'}）
export function moveToSan(fen: string, from: string, to: string, promotion?: string): string | null {
  const game = new Chess(fen);
  try {
    const result = game.move({ from, to, promotion });
    return result?.san ?? null;
  } catch {
    return null;
  }
}

// 检查走子是否合法
export function isLegalMove(fen: string, from: string, to: string, promotion?: string): boolean {
  const game = new Chess(fen);
  try {
    game.move({ from, to, promotion });
    return true;
  } catch {
    return false;
  }
}

// 获取某格的所有合法走子目标
export function getLegalTargets(fen: string, from: string): string[] {
  const game = new Chess(fen);
  const moves = game.moves({ verbose: true });
  return moves.filter((m) => m.from === from).map((m) => m.to);
}
