// AI 引擎 Hook：封装 Web Worker 调用
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SearchResult } from '@/types';

interface WorkerResponse {
  requestId: number;
  result: SearchResult | null;
  error: string | null;
}

interface UseAiEngineOptions {
  onResult?: (result: SearchResult) => void;
}

export function useAiEngine(options?: UseAiEngineOptions) {
  const workerRef = useRef<Worker | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [lastResult, setLastResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<{ requestId: number; resolve: (r: SearchResult) => void; reject: (e: Error) => void } | null>(null);
  const onResultRef = useRef(options?.onResult);
  const requestIdRef = useRef(0);

  useEffect(() => {
    onResultRef.current = options?.onResult;
  }, [options?.onResult]);

  useEffect(() => {
    // 创建 Worker
    workerRef.current = new Worker(new URL('../engine/ai.worker.ts', import.meta.url), { type: 'module' });

    const handleMessage = (e: MessageEvent<WorkerResponse>) => {
      const { requestId, result, error } = e.data;
      if (pendingRef.current && pendingRef.current.requestId === requestId) {
        if (error) {
          pendingRef.current.reject(new Error(error));
        } else if (result) {
          pendingRef.current.resolve(result);
        }
        pendingRef.current = null;
        setIsThinking(false);
      }
      if (result) {
        setLastResult(result);
        onResultRef.current?.(result);
      }
      if (error) setError(error);
    };

    workerRef.current.addEventListener('message', handleMessage);

    return () => {
      workerRef.current?.removeEventListener('message', handleMessage);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const search = useCallback((fen: string, level: number): Promise<SearchResult> => {
    if (!workerRef.current) {
      return Promise.reject(new Error('AI Worker 未初始化'));
    }
    setIsThinking(true);
    setError(null);
    const requestId = ++requestIdRef.current;
    return new Promise<SearchResult>((resolve, reject) => {
      pendingRef.current = { requestId, resolve, reject };
      workerRef.current!.postMessage({ fen, level, requestId });
    });
  }, []);

  const cancel = useCallback(() => {
    pendingRef.current?.reject(new Error('已取消'));
    pendingRef.current = null;
    setIsThinking(false);
  }, []);

  return { isThinking, lastResult, error, search, cancel };
}
