// 应用整体布局：左侧栏 + 主内容区
// 移动端（< md）：左侧栏变为抽屉，顶部出现菜单按钮
import { type ReactNode, useEffect, useState } from 'react';
import { Menu, X, AlertTriangle } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAppStore } from '@/store/useAppStore';
import { isPersistFailed } from '@/lib/storage';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen);
  const [persistWarn, setPersistWarn] = useState(false);

  // 路由切换时关闭移动端抽屉（通过监听 location 变化更复杂，这里用 hashchange）
  useEffect(() => {
    const onHashChange = () => setMobileNavOpen(false);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [setMobileNavOpen]);

  // Esc 键关闭移动端抽屉
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen, setMobileNavOpen]);

  // 检测 localStorage 保存失败（配额超限 / 隐私模式），提示用户
  useEffect(() => {
    const check = () => setPersistWarn(isPersistFailed());
    check();
    // 每 5 秒轮询一次，避免引入 store 耦合
    const id = window.setInterval(check, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* 桌面端常驻侧栏：md 及以上显示 */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* 移动端抽屉：md 以下显示，按状态切换 */}
      {mobileNavOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="md:hidden fixed left-0 top-0 z-50 h-screen">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </>
      )}

      <main className="flex-1 min-w-0">
        {/* 移动端顶部栏 */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b border-gold/15 bg-ink-900/80 backdrop-blur-md">
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="text-ivory hover:text-gold transition-colors"
            aria-label={mobileNavOpen ? '关闭菜单' : '打开菜单'}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2">
            <span className="font-display text-gold text-lg leading-none">♞</span>
            <span className="font-display text-ivory text-sm tracking-tight-display">Chess Atelier</span>
          </div>
        </div>

        {/* 持久化失败警告横幅 */}
        {persistWarn && (
          <div
            className="bg-wine/15 border-b border-wine/40 px-4 py-2 flex items-center gap-2 text-xs text-wine"
            role="alert"
          >
            <AlertTriangle size={12} className="shrink-0" />
            <span>进度保存失败，可能浏览器存储已满或处于隐私模式，刷新后进度将丢失。</span>
          </div>
        )}

        {children}
      </main>
    </div>
  );
}
