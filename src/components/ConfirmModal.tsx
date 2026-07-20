// 通用确认弹窗：替代原生 confirm()
// 用法：通过 useConfirm hook 获取 confirm 函数，await confirm(options) 返回布尔值
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm 必须在 ConfirmProvider 内使用');
  return ctx;
}

interface PendingState {
  opts: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // 弹窗出现时聚焦取消按钮（安全默认），并绑定 ESC 关闭，同时锁定 body 滚动
  useEffect(() => {
    if (!pending) return;
    cancelBtnRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        resolve(false);
      } else if (e.key === 'Enter') {
        resolve(true);
      } else if (e.key === 'Tab') {
        // 焦点陷阱：在取消/确认按钮间循环，防止 Tab 离开模态框
        e.preventDefault();
        const cancel = cancelBtnRef.current;
        const confirm = confirmBtnRef.current;
        if (!cancel || !confirm) return;
        if (document.activeElement === confirm) {
          cancel.focus();
        } else {
          confirm.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve });
    });
  }, []);

  const resolve = useCallback((ok: boolean) => {
    setPending((cur) => {
      if (cur) cur.resolve(ok);
      return null;
    });
  }, []);

  const ctxValue = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={ctxValue}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => resolve(false)}
        >
          <div
            className="card-gold rounded-sm w-full max-w-md p-6 relative animate-fade-up"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => resolve(false)}
              className="absolute top-3 right-3 text-ivoryDim hover:text-ivory transition-colors"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
            <div className="flex items-start gap-3 mb-5">
              <div className={`shrink-0 w-10 h-10 rounded-sm flex items-center justify-center border ${
                pending.opts.danger
                  ? 'border-wine/40 text-wine bg-wine/10'
                  : 'border-gold/40 text-gold bg-gold/10'
              }`}>
                <AlertTriangle size={18} />
              </div>
              <div className="pt-1">
                <h3 id="confirm-title" className="font-display text-xl text-ivory leading-tight tracking-tight-display">
                  {pending.opts.title}
                </h3>
                {pending.opts.message && (
                  <p className="text-sm text-ivoryDim mt-2 leading-relaxed">{pending.opts.message}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                ref={cancelBtnRef}
                onClick={() => resolve(false)}
                className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest"
              >
                {pending.opts.cancelText ?? '取消'}
              </button>
              <button
                ref={confirmBtnRef}
                onClick={() => resolve(true)}
                className={`px-4 py-2 rounded-sm text-xs uppercase tracking-widest transition-colors ${
                  pending.opts.danger
                    ? 'bg-wine/20 border border-wine/50 text-wine hover:bg-wine/30'
                    : 'btn-gold-solid'
                }`}
              >
                {pending.opts.confirmText ?? '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
