// 提示走法的高亮方格与箭头构造
// 在 Play / PuzzleDetail 等页面共享，避免颜色常量与构造逻辑重复

export interface HintMove {
  from: string;
  to: string;
}

export interface HighlightSquare {
  square: string;
  color: string;
}

export interface ArrowHint {
  from: string;
  to: string;
  color?: string;
}

// 配色：金色（与棋盘主题一致）
export const HINT_COLORS = {
  fromSquare: 'rgba(212,165,116,0.35)',
  toSquare: 'rgba(212,165,116,0.55)',
  arrow: 'rgba(212,165,116,0.85)',
} as const;

/**
 * 根据提示走法构造高亮方格列表
 */
export function buildHintHighlights(hintMove: HintMove | null): HighlightSquare[] {
  if (!hintMove) return [];
  return [
    { square: hintMove.from, color: HINT_COLORS.fromSquare },
    { square: hintMove.to, color: HINT_COLORS.toSquare },
  ];
}

/**
 * 根据提示走法构造箭头列表
 */
export function buildHintArrows(hintMove: HintMove | null): ArrowHint[] {
  return hintMove ? [{ from: hintMove.from, to: hintMove.to, color: HINT_COLORS.arrow }] : [];
}
