import { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ConfirmProvider } from '@/components/ConfirmModal';
import Home from '@/pages/Home';

// 路由级懒加载：拆分代码包，首屏只加载 Home
const Play = lazy(() => import('@/pages/Play'));
const Openings = lazy(() => import('@/pages/Openings'));
const OpeningDetail = lazy(() => import('@/pages/OpeningDetail'));
const Puzzles = lazy(() => import('@/pages/Puzzles'));
const PuzzleDetail = lazy(() => import('@/pages/PuzzleDetail'));
const Review = lazy(() => import('@/pages/Review'));
const Multiplayer = lazy(() => import('@/pages/Multiplayer'));
const NotFound = lazy(() => import('@/pages/NotFound'));

function RouteFallback() {
  return (
    <div className="px-6 md:px-10 py-16 max-w-[1200px] mx-auto">
      <div className="card-gold rounded-sm p-12 text-center animate-pulse">
        <div className="text-sm text-ivoryDim">加载中…</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <ErrorBoundary>
        <ConfirmProvider>
          <AppLayout>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/play" element={<Play />} />
                <Route path="/openings" element={<Openings />} />
                <Route path="/openings/:eco" element={<OpeningDetail />} />
                <Route path="/puzzles" element={<Puzzles />} />
                <Route path="/puzzles/:level" element={<PuzzleDetail />} />
                <Route path="/review" element={<Review />} />
                <Route path="/multiplayer" element={<Multiplayer />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AppLayout>
        </ConfirmProvider>
      </ErrorBoundary>
    </Router>
  );
}
