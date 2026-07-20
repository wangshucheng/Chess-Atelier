// AI 搜索 Web Worker：避免阻塞主线程
// 通过 postMessage 与主线程通信

/// <reference lib="webworker" />
import { searchBestMove, getDifficultyConfig } from './minimax';
import type { SearchResult } from '@/types';

interface WorkerRequest {
  fen: string;
  level: number;        // 1-10
  requestId: number;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { fen, level, requestId } = e.data;
  try {
    const config = getDifficultyConfig(level);
    const result: SearchResult = searchBestMove(fen, config);
    ctx.postMessage({ requestId, result, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ requestId, result: null, error: message });
  }
};
