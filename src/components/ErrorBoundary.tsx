// 全局错误边界：捕获子树渲染异常，避免整页白屏
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 控制台保留诊断信息，便于排查
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    // 直接清空 error state 在脏状态场景下会立即复现错误，
    // 改为整页重载更稳健
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="px-6 py-20 max-w-[640px] mx-auto text-center">
        <AlertTriangle size={36} className="text-wine mx-auto mb-4" />
        <h2 className="font-display text-3xl text-ivory mb-2">页面渲染异常</h2>
        <p className="text-sm text-ivoryDim mb-6">
          {this.state.message || '未知错误'}
        </p>
        <button
          onClick={this.handleReset}
          className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5"
        >
          <RotateCcw size={12} /> 重新加载
        </button>
      </div>
    );
  }
}
