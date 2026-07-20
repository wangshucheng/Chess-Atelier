import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import Home from '@/pages/Home';
import Play from '@/pages/Play';
import Openings from '@/pages/Openings';
import OpeningDetail from '@/pages/OpeningDetail';
import Puzzles from '@/pages/Puzzles';
import PuzzleDetail from '@/pages/PuzzleDetail';
import Review from '@/pages/Review';

export default function App() {
  return (
    <Router>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play" element={<Play />} />
          <Route path="/openings" element={<Openings />} />
          <Route path="/openings/:eco" element={<OpeningDetail />} />
          <Route path="/puzzles" element={<Puzzles />} />
          <Route path="/puzzles/:level" element={<PuzzleDetail />} />
          <Route path="/review" element={<Review />} />
        </Routes>
      </AppLayout>
    </Router>
  );
}
