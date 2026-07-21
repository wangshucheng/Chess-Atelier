// 棋盘组件：封装 react-chessboard，统一主题与交互
// 支持双模式走棋：① 拖动棋子 ② 点击选中再点击目标格
// 选中/拖动时实时高亮合法走步目标；取消/松开/完成走步自动清除高亮
// 全局开关 showLegalMoves 控制是否显示合法步预览
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Arrow, Square } from 'react-chessboard/dist/chessboard/types';
import { useAppStore } from '@/store/useAppStore';

interface ChessBoardProps {
  fen: string;
  onDrop?: (sourceSquare: string, targetSquare: string, promotion?: string) => boolean;
  orientation?: 'white' | 'black';
  highlightedSquares?: { square: string; color: string }[];
  arrowHints?: { from: string; to: string; color?: string }[];
  arePiecesDraggable?: boolean;
  boardWidth?: number;
}

// 选中源描边（金色环）
const SELECTED_RING = 'inset 0 0 0 4px rgba(212,175,55,0.95)';
// 合法目标圆点颜色
const LEGAL_DOT = 'rgba(212,175,55,0.30)';
// 父级提示高亮边框
const HIGHLIGHT_BORDER = 'rgba(212,175,55,0.6)';

function ChessBoard({
  fen,
  onDrop,
  orientation = 'white',
  highlightedSquares = [],
  arrowHints = [],
  arePiecesDraggable = true,
  boardWidth,
}: ChessBoardProps) {
  // 全局开关：是否显示合法走步预览
  const showLegalMoves = useAppStore((s) => s.showLegalMoves);

  // —— 两种交互模式的状态（相互隔离）——
  // 点击选中源格
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  // 拖动中的源格
  const [draggingSquare, setDraggingSquare] = useState<Square | null>(null);
  // 拖动结束后对“误触 click”的防护标记
  const justDraggedRef = useRef(false);

  // 局面变化或失去交互权限时，清除选中/拖动状态，避免残留高亮
  useEffect(() => {
    if (!arePiecesDraggable) {
      setSelectedSquare(null);
      setDraggingSquare(null);
    }
  }, [fen, arePiecesDraggable]);

  // 测量父容器宽度（绕开库内部易错的 ResizeObserver 测量，消除 getBoundingClientRect 报错）
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const resolvedWidth = boardWidth ?? (containerWidth > 0 ? containerWidth : 480);

  // 当前高亮源：点击选中 或 拖动中（二者互斥时取其一）
  const activeSource: Square | null = selectedSquare ?? draggingSquare;

  // 合法走步目标：选中/拖动源子的所有可走目标格
  const legalTargets = useMemo<Square[]>(() => {
    if (!activeSource || !showLegalMoves) return [];
    try {
      const g = new Chess(fen);
      return g.moves({ square: activeSource, verbose: true }).map((m) => m.to as Square);
    } catch {
      return [];
    }
  }, [fen, activeSource, showLegalMoves]);

  // 当前轮到方（w/b）
  const turnOf = useCallback((): 'w' | 'b' => {
    return fen.split(' ')[1] === 'b' ? 'b' : 'w';
  }, [fen]);

  // 是否为“当前轮到方”的棋子（点击选中只选己方子）
  const isTurnPieceAt = useCallback(
    (piece: string | undefined): boolean => {
      if (!piece) return false;
      return piece.charAt(0) === turnOf();
    },
    [turnOf],
  );

  // 是否需升变（兵走到最后一行），默认升变为后
  const getPromotion = useCallback(
    (from: Square, to: Square): string | undefined => {
      try {
        const p = new Chess(fen).get(from);
        if (!p || p.type !== 'p') return undefined;
        if (p.color === 'w' && from[1] === '7' && to[1] === '8') return 'q';
        if (p.color === 'b' && from[1] === '2' && to[1] === '1') return 'q';
      } catch {
        return undefined;
      }
      return undefined;
    },
    [fen],
  );

  // —— 模式一：点击选中 + 点击目标 ——
  const handleSquareClick = useCallback(
    (square: Square, piece?: string) => {
      if (!arePiecesDraggable) return;
      // 拖动结束后的误触防护：吞掉紧随其后的 click
      if (justDraggedRef.current) {
        justDraggedRef.current = false;
        return;
      }
      // 未选中：尝试选中己方棋子
      if (!selectedSquare) {
        if (isTurnPieceAt(piece)) setSelectedSquare(square);
        return;
      }
      // 已选中同一格：取消
      if (square === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
      // 点到合法目标：走子并清除选中
      if (legalTargets.includes(square)) {
        const promo = getPromotion(selectedSquare, square);
        onDrop?.(selectedSquare, square, promo);
        setSelectedSquare(null);
        return;
      }
      // 非合法目标：点到己方另一子则改选，否则取消
      if (isTurnPieceAt(piece)) setSelectedSquare(square);
      else setSelectedSquare(null);
    },
    [arePiecesDraggable, selectedSquare, legalTargets, isTurnPieceAt, getPromotion, onDrop],
  );

  // —— 模式二：拖动棋子 ——
  const handlePieceDragBegin = useCallback((_piece: string, sourceSquare: Square) => {
    setSelectedSquare(null); // 拖动与点击隔离：开始拖动即清除点击选中
    setDraggingSquare(sourceSquare);
  }, []);

  const handlePieceDragEnd = useCallback((_piece: string, _sourceSquare: Square) => {
    setDraggingSquare(null);
    justDraggedRef.current = true;
    // 兜底：若本次拖动未触发 click（如拖到盘外回弹），下一 tick 复位，避免吞掉后续真实点击
    setTimeout(() => {
      justDraggedRef.current = false;
    }, 0);
  }, []);

  const handlePieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square, piece: string): boolean => {
      const isPawn = piece.length >= 2 && piece[1] === 'P';
      const targetRank = parseInt(targetSquare[1], 10);
      const needsPromotion = isPawn && (targetRank === 1 || targetRank === 8);
      const ok = onDrop ? onDrop(sourceSquare, targetSquare, needsPromotion ? 'q' : undefined) : false;
      // 完成走步：清除所有交互高亮
      setSelectedSquare(null);
      setDraggingSquare(null);
      return ok;
    },
    [onDrop],
  );

  // 合并高亮：父级提示 > 选中源描边 > 合法目标圆点预览
  const customSquareStyles = useMemo<Record<string, Record<string, string>>>(() => {
    const styles: Record<string, Record<string, string>> = {};
    // 父级提示高亮（如习题提示、最近走子）
    for (const h of highlightedSquares) {
      styles[h.square] = {
        background: h.color,
        boxShadow: `inset 0 0 0 3px ${HIGHLIGHT_BORDER}`,
      };
    }
    // 选中/拖动源：金色环描边
    if (activeSource) {
      const s = styles[activeSource] ?? {};
      s.boxShadow = SELECTED_RING;
      styles[activeSource] = s;
    }
    // 合法走步目标：圆点预览（吃子格用环形，空格用实心圆点）
    if (showLegalMoves && legalTargets.length) {
      let game: Chess | null = null;
      try {
        game = new Chess(fen);
      } catch {
        game = null;
      }
      for (const sq of legalTargets) {
        const s = styles[sq] ?? {};
        const isCapture = game ? !!game.get(sq) : false;
        s.background = isCapture
          ? `radial-gradient(circle, ${LEGAL_DOT} 58%, transparent 62%)`
          : `radial-gradient(circle, ${LEGAL_DOT} 22%, transparent 26%)`;
        styles[sq] = s;
      }
    }
    return styles;
  }, [highlightedSquares, activeSource, legalTargets, showLegalMoves, fen]);

  const customArrows: Arrow[] = useMemo(
    () => arrowHints.map((a) => [a.from, a.to, a.color ?? '#D4AF37'] as Arrow),
    [arrowHints],
  );

  return (
    <div className="relative w-full flex justify-center" ref={wrapperRef}>
      {/* 装饰边框 */}
      <div className="absolute -inset-2 border border-gold/20 rounded-sm pointer-events-none" />
      <Chessboard
        position={fen}
        onPieceDrop={handlePieceDrop}
        onPieceDragBegin={handlePieceDragBegin}
        onPieceDragEnd={handlePieceDragEnd}
        onSquareClick={handleSquareClick}
        boardOrientation={orientation}
        arePiecesDraggable={arePiecesDraggable}
        customSquareStyles={customSquareStyles}
        customArrows={customArrows}
        boardWidth={resolvedWidth}
        animationDuration={200}
        customBoardStyle={{
          borderRadius: '2px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
        }}
      />
    </div>
  );
}

export default memo(ChessBoard);
