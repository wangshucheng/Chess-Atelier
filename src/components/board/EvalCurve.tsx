// 评估曲线组件：SVG 折线图，白优在上方，黑优在下方
import { memo } from 'react';

// 评估曲线归一化常量
const EVAL_CURVE_MAX_ABS = 800; // 评估值范围 ±800（超出按边界裁剪）
const EVAL_CURVE_TANH_DIVISOR = 400; // tanh 平滑因子：值越小曲线越陡

export interface EvalCurvePoint {
  x: number;
  y: number;
  eval: number;
}

interface EvalCurveProps {
  data: EvalCurvePoint[] | null;
  currentIdx: number;
  height?: number;
}

function EvalCurveImpl({ data, currentIdx, height = 140 }: EvalCurveProps) {
  const width = 600;
  const padding = { top: 8, right: 8, bottom: 8, left: 8 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (!data || data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs text-ivoryDim/50 italic"
        style={{ height }}
      >
        评估数据将在解析后生成…
      </div>
    );
  }

  const toY = (evalScore: number) => {
    const clamped = Math.max(-EVAL_CURVE_MAX_ABS, Math.min(EVAL_CURVE_MAX_ABS, evalScore));
    // tanh 平滑映射：将 [-∞, +∞] 压缩到 [-1, 1]
    const normalized = Math.tanh(clamped / EVAL_CURVE_TANH_DIVISOR);
    // 白优在上方（y 小），黑优在下方（y 大）
    return padding.top + chartH / 2 - normalized * (chartH / 2 - 4);
  };
  const toX = (idx: number) => {
    return padding.left + (data.length > 1 ? (idx / (data.length - 1)) * chartW : chartW / 2);
  };

  const linePath = data
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.x).toFixed(1)} ${toY(p.eval).toFixed(1)}`)
    .join(' ');
  // 填充区域路径：从曲线延伸到中线，形成相对中线的优势区域
  const areaPath = `${linePath} L ${toX(data[data.length - 1].x).toFixed(1)} ${padding.top + chartH / 2} L ${toX(0).toFixed(1)} ${padding.top + chartH / 2} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {/* 背景网格：中线 + 上下边界 */}
      <line
        x1={padding.left}
        y1={padding.top + chartH / 2}
        x2={width - padding.right}
        y2={padding.top + chartH / 2}
        stroke="rgba(212,165,116,0.2)"
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      <line
        x1={padding.left}
        y1={padding.top}
        x2={width - padding.right}
        y2={padding.top}
        stroke="rgba(212,165,116,0.08)"
        strokeWidth="1"
      />
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="rgba(212,165,116,0.08)"
        strokeWidth="1"
      />

      {/* 填充区域 */}
      <path d={areaPath} fill="rgba(212,165,116,0.12)" />

      {/* 曲线 */}
      <path
        d={linePath}
        fill="none"
        stroke="#D4A574"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* 当前位置标记 */}
      {currentIdx >= 0 && currentIdx < data.length && (
        <>
          <line
            x1={toX(currentIdx)}
            y1={padding.top}
            x2={toX(currentIdx)}
            y2={height - padding.bottom}
            stroke="rgba(212,165,116,0.4)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <circle
            cx={toX(currentIdx)}
            cy={toY(data[currentIdx].eval)}
            r="4"
            fill="#D4A574"
            stroke="#0E0F13"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}

const EvalCurve = memo(EvalCurveImpl);
export default EvalCurve;
