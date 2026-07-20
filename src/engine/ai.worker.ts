// AI 搜索 Web Worker：避免阻塞主线程
// 通过 postMessage 与主线程通信

import { searchBestMove, getDifficultyConfig } from './minimax';
import type { SearchResult } from '@/types';

interface WorkerRequest {
  fen: string;
  level: number;        // 1-10
  requestId: number;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { fen, level, requestId } = e.data;
  try {
    const config = getDifficultyConfig(level);
    const result: SearchResult = searchBestMove(fen, config);
    (self as unknown as Worker).postMessage({ requestId, result, error: null });
  } catch (err) {
    (self as unknown as Worker).postMessage({ requestId, result: null, error: (err as Error).message });
  }
};
