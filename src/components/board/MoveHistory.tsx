// 走棋历史侧栏：双列（白/黑）走子表
import { History } from 'lucide-react';

interface MoveHistoryProps {
  moves: string[]; // SAN 序列
  currentIndex?: number; // 高亮当前步
  onMoveClick?: (index: number) => void;
  className?: string;
}

export default function MoveHistory({ moves, currentIndex, onMoveClick, className = '' }: MoveHistoryProps) {
  // 配对：白黑走子
  const rows: { no: number; white?: string; black?: string; whiteIdx?: number; blackIdx?: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      no: i / 2 + 1,
      white: moves[i],
      black: moves[i + 1],
      whiteIdx: i,
      blackIdx: i + 1 < moves.length ? i + 1 : undefined,
    });
  }

  return (
    <div className={`card-gold rounded-sm ${className}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/10">
        <History size={14} className="text-gold" />
        <h3 className="text-xs uppercase tracking-[0.25em] text-gold/80">走棋记录</h3>
        <span className="ml-auto font-mono text-[10px] text-ivoryDim">{moves.length} 手</span>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-ivoryDim/60 italic">尚无走子记录</div>
        ) : (
          <table className="w-full text-sm font-mono">
            <tbody>
              {rows.map((r) => (
                <tr key={r.no} className="border-b border-gold/5 last:border-0">
                  <td className="px-3 py-1.5 text-[10px] text-ivoryDim/60 w-8 text-right">{r.no}.</td>
                  <td
                    className={`px-2 py-1.5 cursor-pointer transition-colors ${
                      currentIndex === r.whiteIdx ? 'bg-gold/20 text-ivory' : 'text-ivory/80 hover:bg-gold/10'
                    }`}
                    onClick={() => r.whiteIdx !== undefined && onMoveClick?.(r.whiteIdx)}
                  >
                    {r.white || ''}
                  </td>
                  <td
                    className={`px-2 py-1.5 cursor-pointer transition-colors ${
                      currentIndex === r.blackIdx ? 'bg-gold/20 text-ivory' : 'text-ivory/80 hover:bg-gold/10'
                    }`}
                    onClick={() => r.blackIdx !== undefined && onMoveClick?.(r.blackIdx)}
                  >
                    {r.black || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
