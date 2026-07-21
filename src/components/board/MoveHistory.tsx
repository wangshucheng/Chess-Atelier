// 走棋历史侧栏：双列（白/黑）走子表
import { useMemo, memo, type KeyboardEvent } from 'react';
import { History } from 'lucide-react';
import { useI18n } from '@/i18n';

interface MoveHistoryProps {
  moves: string[]; // SAN 序列
  currentIndex?: number; // 高亮当前步
  onMoveClick?: (index: number) => void;
  className?: string;
}

interface Row {
  no: number;
  white?: string;
  black?: string;
  whiteIdx?: number;
  blackIdx?: number;
}

// 键盘激活走子（Enter / Space）
function handleCellKey(
  e: KeyboardEvent<HTMLTableCellElement>,
  idx: number | undefined,
  onMoveClick?: (i: number) => void,
) {
  if (!onMoveClick || idx === undefined) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onMoveClick(idx);
  }
}

function MoveHistory({ moves, currentIndex, onMoveClick, className = '' }: MoveHistoryProps) {
  const { t } = useI18n();
  // 配对：白黑走子，仅依赖 moves 重新计算
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      list.push({
        no: i / 2 + 1,
        white: moves[i],
        black: moves[i + 1],
        whiteIdx: i,
        blackIdx: i + 1 < moves.length ? i + 1 : undefined,
      });
    }
    return list;
  }, [moves]);

  return (
    <div className={`card-gold rounded-sm ${className}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/10">
        <History size={14} className="text-gold" />
        <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">{t('review.moveList')}</h3>
        <span className="ml-auto font-mono text-[10px] text-ivoryDim">{t('review.moveCount', { n: moves.length })}</span>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-ivoryDim/60 italic">{t('moveHistory.empty')}</div>
        ) : (
          <table className="w-full text-sm font-mono">
            <tbody>
              {rows.map((r) => {
                const wClickable = onMoveClick && r.whiteIdx !== undefined;
                const bClickable = onMoveClick && r.blackIdx !== undefined;
                return (
                  <tr key={r.no} className="border-b border-gold/5 last:border-0">
                    <td className="px-3 py-1.5 text-[10px] text-ivoryDim/60 w-8 text-right">{r.no}.</td>
                    <td
                      className={`px-2 py-1.5 transition-colors ${wClickable ? 'cursor-pointer' : ''} ${
                        currentIndex === r.whiteIdx ? 'bg-gold/20 text-ivory' : 'text-ivory/80 hover:bg-gold/10'
                      }`}
                      onClick={() => r.whiteIdx !== undefined && onMoveClick?.(r.whiteIdx)}
                      onKeyDown={(e) => handleCellKey(e, r.whiteIdx, onMoveClick)}
                      role={wClickable ? 'button' : undefined}
                      tabIndex={wClickable ? 0 : undefined}
                      aria-label={r.white ? t('review.ariaMoveWhite', { n: r.no, move: r.white }) : undefined}
                      aria-current={currentIndex === r.whiteIdx ? 'true' : undefined}
                    >
                      {r.white || ''}
                    </td>
                    <td
                      className={`px-2 py-1.5 transition-colors ${bClickable ? 'cursor-pointer' : ''} ${
                        currentIndex === r.blackIdx ? 'bg-gold/20 text-ivory' : 'text-ivory/80 hover:bg-gold/10'
                      }`}
                      onClick={() => r.blackIdx !== undefined && onMoveClick?.(r.blackIdx)}
                      onKeyDown={(e) => handleCellKey(e, r.blackIdx, onMoveClick)}
                      role={bClickable ? 'button' : undefined}
                      tabIndex={bClickable ? 0 : undefined}
                      aria-label={r.black ? t('review.ariaMoveBlack', { n: r.no, move: r.black }) : undefined}
                      aria-current={currentIndex === r.blackIdx ? 'true' : undefined}
                    >
                      {r.black || ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default memo(MoveHistory);
