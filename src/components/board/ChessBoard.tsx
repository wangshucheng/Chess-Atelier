// 棋盘组件：封装 react-chessboard，统一主题与交互
import { useCallback, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import { Chessboard } from 'react-chessboard';
// 库主入口未导出 Square/Arrow 类型，从子路径导入
import type { Arrow, Square } from 'react-chessboard/dist/chessboard/types';

interface ChessBoardProps {
  fen: string;
  onDrop?: (sourceSquare: string, targetSquare: string, promotion?: string) => boolean;
  orientation?: 'white' | 'black';
  highlightedSquares?: { square: string; color: string }[];
  arrowHints?: { from: string; to: string; color?: string }[];
  arePiecesDraggable?: boolean;
  boardWidth?: number;
}

// 模块级常量：避免每次渲染创建新对象触发 react-chessboard 内部 memo 失效
// react-chessboard 的样式 props 类型为 Record<string, string | number> 或 Record<string, string>
const DEFAULT_ARROW_COLOR = 'rgba(212,165,116,0.7)';
const BOARD_STYLE: Record<string, string | number> = {
  borderRadius: '2px',
  boxShadow: '0 20px 60px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(212,165,116,0.3)',
};
const DARK_SQUARE_STYLE: Record<string, string> = { backgroundColor: '#7D5A3C' };
const LIGHT_SQUARE_STYLE: Record<string, string> = { backgroundColor: '#E8D5B0' };
const NOTATION_STYLE: Record<string, string | number> = {
  color: '#D4A574',
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: '10px',
};
const HIGHLIGHT_BORDER = 'rgba(212,165,116,0.6)';

function ChessBoard({
  fen,
  onDrop,
  orientation = 'white',
  highlightedSquares = [],
  arrowHints = [],
  arePiecesDraggable = true,
  boardWidth,
}: ChessBoardProps) {
  // react-chessboard 在 boardWidth 缺省时依赖内部的 ResizeObserver 测量容器宽度，
  // 该测量在某些时序下会在 null 引用上调用 getBoundingClientRect 而报错。
  // 这里改为自行测量父容器宽度并显式传入（带兜底值），彻底规避库内置测量路径。
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setContainerWidth(w);
    };
    measure();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
    };
  }, []);

  const resolvedWidth = boardWidth ?? (containerWidth > 0 ? containerWidth : 480);

  // 高亮方格样式
  const customSquareStyles = useMemo<Record<string, Record<string, string>>>(() => {
    const styles: Record<string, Record<string, string>> = {};
    for (const h of highlightedSquares) {
      styles[h.square] = {
        background: h.color,
        boxShadow: `inset 0 0 0 3px ${HIGHLIGHT_BORDER}`,
      };
    }
    return styles;
  }, [highlightedSquares]);

  // 自定义箭头：react-chessboard 要求 Arrow = [Square, Square, string?]
  const customArrows = useMemo<Arrow[]>(() => {
    return arrowHints.map((a) => [
      a.from as Square,
      a.to as Square,
      a.color || DEFAULT_ARROW_COLOR,
    ]);
  }, [arrowHints]);

  // 稳定引用：避免每次渲染都生成新函数破坏 react-chessboard 内部 memo
  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string): boolean => {
      if (!onDrop) return false;
      // 检测是否需要升变（兵到对方底线）
      // chess.js piece 标识格式：'wP'/'bP'
      const isPawn = piece.length >= 2 && piece[1] === 'P';
      const targetRank = parseInt(targetSquare[1], 10);
      const needsPromotion = isPawn && (targetRank === 1 || targetRank === 8);
      // 默认升变为后
      return onDrop(sourceSquare, targetSquare, needsPromotion ? 'q' : undefined);
    },
    [onDrop],
  );

  return (
    <div className="relative w-full flex justify-center" ref={wrapperRef}>
      <div className="absolute -inset-2 border border-gold/20 rounded-sm pointer-events-none" />
      <Chessboard
        position={fen}
        onPieceDrop={handlePieceDrop}
        boardOrientation={orientation}
        arePiecesDraggable={arePiecesDraggable}
        boardWidth={resolvedWidth}
        customBoardStyle={BOARD_STYLE}
        customDarkSquareStyle={DARK_SQUARE_STYLE}
        customLightSquareStyle={LIGHT_SQUARE_STYLE}
        customSquareStyles={customSquareStyles}
        customArrows={customArrows}
        customNotationStyle={NOTATION_STYLE}
      />
    </div>
  );
}

export default memo(ChessBoard);
