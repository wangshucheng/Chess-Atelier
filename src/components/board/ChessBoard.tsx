// 棋盘组件：封装 react-chessboard，统一主题与交互
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';

interface ChessBoardProps {
  fen: string;
  onDrop?: (sourceSquare: string, targetSquare: string, promotion?: string) => boolean;
  orientation?: 'white' | 'black';
  highlightedSquares?: { square: string; color: string }[];
  arrowHints?: { from: string; to: string; color?: string }[];
  arePiecesDraggable?: boolean;
  boardWidth?: number;
}

// react-chessboard 在 boardWidth 缺省时依赖内置 ResizeObserver 测量容器宽度，
// 而该测量在 React18 StrictMode 下会读取到 null/0，导致棋盘塌缩。
// 这里改为自行测量父容器宽度并显式传入，给出稳定的兜底值。
const FALLBACK_WIDTH = 480;

export default function ChessBoard({
  fen,
  onDrop,
  orientation = 'white',
  highlightedSquares = [],
  arrowHints = [],
  arePiecesDraggable = true,
  boardWidth,
}: ChessBoardProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  useEffect(() => {
    // 若调用方已显式给定宽度，则不自行测量
    if (boardWidth != null) {
      setMeasuredWidth(null);
      return;
    }
    const el = wrapperRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setMeasuredWidth(w);
    };
    update();

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(el);
    }
    return () => {
      observer?.disconnect();
    };
  }, [boardWidth]);

  // 最终宽度：显式 > 测量值 > 兜底
  const resolvedWidth =
    boardWidth ?? measuredWidth ?? (typeof window !== 'undefined' ? Math.min(FALLBACK_WIDTH, window.innerWidth - 80) : FALLBACK_WIDTH);

  // 高亮方格样式
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    for (const h of highlightedSquares) {
      styles[h.square] = {
        background: h.color,
        boxShadow: 'inset 0 0 0 3px rgba(212,165,116,0.6)',
      };
    }
    return styles;
  }, [highlightedSquares]);

  // 自定义箭头（react-chessboard 要求 Arrow = [Square, Square, string?]，其中 Square 为联合类型）
  const customArrows = useMemo(() => {
    return arrowHints.map((a) => [a.from, a.to, a.color || 'rgba(212,165,116,0.7)'] as unknown as [never, never, string]);
  }, [arrowHints]);

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="absolute -inset-2 border border-gold/20 rounded-sm pointer-events-none" />
      <Chessboard
        position={fen}
        onPieceDrop={(sourceSquare, targetSquare, piece) => {
          if (!onDrop) return false;
          // 检测是否需要升变（兵到对方底线）
          const isPawn = piece.toLowerCase().includes('p');
          const targetRank = parseInt(targetSquare[1], 10);
          const needsPromotion = isPawn && (targetRank === 8 || targetRank === 0);
          // 默认升变为后
          return onDrop(sourceSquare, targetSquare, needsPromotion ? 'q' : undefined);
        }}
        boardOrientation={orientation}
        arePiecesDraggable={arePiecesDraggable}
        boardWidth={resolvedWidth}
        customBoardStyle={{
          borderRadius: '2px',
          boxShadow: '0 20px 60px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(212,165,116,0.3)',
        }}
        customDarkSquareStyle={{ backgroundColor: '#7D5A3C' }}
        customLightSquareStyle={{ backgroundColor: '#E8D5B0' }}
        customSquareStyles={customSquareStyles}
        customArrows={customArrows}
        customNotationStyle={{
          color: '#D4A574',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '10px',
        }}
        customPieces={undefined}
      />
    </div>
  );
}
