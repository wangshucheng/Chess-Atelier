// 棋盘组件：封装 react-chessboard，统一主题与交互
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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

export default function ChessBoard({
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
    <div className="relative w-full flex justify-center" ref={wrapperRef}>
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
