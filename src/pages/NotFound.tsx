// 404 路由：未匹配的路径统一回退到此页
import { Link } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="px-6 py-20 max-w-[640px] mx-auto text-center">
      <Compass size={36} className="text-gold/50 mx-auto mb-4" />
      <div className="font-display text-6xl text-gold mb-3">404</div>
      <h2 className="font-display text-2xl text-ivory mb-2">路径不存在</h2>
      <p className="text-sm text-ivoryDim mb-6">
        你访问的页面已不在棋盘上，请返回主页或继续训练。
      </p>
      <Link
        to="/"
        className="btn-gold-solid px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5"
      >
        <ArrowLeft size={12} /> 返回首页
      </Link>
    </div>
  );
}
