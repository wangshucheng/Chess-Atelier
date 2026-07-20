// 评估值显示组件
import { memo } from 'react';
import { evalToText } from '@/engine/explainer';

interface EvalBarProps {
  evaluation: number;
  showText?: boolean;
  height?: number;
}

// 评估条：白方优势在上方
function EvalBar({ evaluation, showText = true, height = 320 }: EvalBarProps) {
  // 将评估值映射到 0-100 的百分比（白方占比）
  const clampedEval = Math.max(-1000, Math.min(1000, evaluation));
  // 使用 tanh 函数平滑映射
  const whitePercent = 50 + (Math.tanh(clampedEval / 400) * 50);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-3 rounded-sm overflow-hidden border border-gold/20 bg-ink-700 relative"
        style={{ height }}
        role="meter"
        aria-label="局面评估"
        aria-valuemin={-1000}
        aria-valuemax={1000}
        aria-valuenow={evaluation}
        aria-valuetext={evalToText(evaluation)}
      >
        {/* 黑方区域（上） */}
        <div className="bg-ink-900 absolute inset-0" />
        {/* 白方区域（下） */}
        <div
          className="bg-ivory absolute bottom-0 left-0 right-0 transition-all duration-500"
          style={{ height: `${whitePercent}%` }}
        />
      </div>
      {showText && (
        <div className="font-mono text-[10px] text-gold text-center min-w-[3rem]">
          {evalToText(evaluation)}
        </div>
      )}
    </div>
  );
}

export default memo(EvalBar);
