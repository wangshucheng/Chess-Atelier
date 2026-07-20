// AI 引擎 Hook：封装 Web Worker 调用
// 修复：1) 卸载时 reject pending Promise 避免内存泄漏
//      2) 新搜索自动取消旧搜索，避免 Worker 任务堆积
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

interface PendingTask {
  requestId: number;
  resolve: (r: SearchResult) => void;
  reject: (e: Error) => void;
}

export function useAiEngine(options?: UseAiEngineOptions) {
  const workerRef = useRef<Worker | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [lastResult, setLastResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<PendingTask | null>(null);
  const onResultRef = useRef(options?.onResult);
  const requestIdRef = useRef(0);

  useEffect(() => {
    onResultRef.current = options?.onResult;
  }, [options?.onResult]);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../engine/ai.worker.ts', import.meta.url), { type: 'module' });

    const handleMessage = (e: MessageEvent<WorkerResponse>) => {
      const { requestId, result, error: err } = e.data;
      // 仅处理当前 pending 任务（旧任务的结果被丢弃）
      if (pendingRef.current && pendingRef.current.requestId === requestId) {
        if (err) {
          pendingRef.current.reject(new Error(err));
          setError(err);
        } else if (result) {
          pendingRef.current.resolve(result);
          setLastResult(result);
          onResultRef.current?.(result);
        }
        pendingRef.current = null;
        setIsThinking(false);
      }
      // 非 pending 的结果（旧任务）静默丢弃
    };

    // Worker 内未捕获异常或无法结构化克隆时触发，必须传播到 UI
    const handleError = (e: ErrorEvent) => {
      const msg = e.message || 'Worker 内部错误';
      if (pendingRef.current) {
        pendingRef.current.reject(new Error(msg));
        pendingRef.current = null;
        setIsThinking(false);
      }
      setError(msg);
    };
    const handleMessageError = () => {
      const msg = 'Worker 消息序列化失败';
      if (pendingRef.current) {
        pendingRef.current.reject(new Error(msg));
        pendingRef.current = null;
        setIsThinking(false);
      }
      setError(msg);
    };

    workerRef.current.addEventListener('message', handleMessage);
    workerRef.current.addEventListener('error', handleError);
    workerRef.current.addEventListener('messageerror', handleMessageError);

    return () => {
      // 卸载时 reject pending Promise，避免悬挂的 then/catch 闭包泄漏
      if (pendingRef.current) {
        pendingRef.current.reject(new Error('Worker 已卸载'));
        pendingRef.current = null;
      }
      workerRef.current?.removeEventListener('message', handleMessage);
      workerRef.current?.removeEventListener('error', handleError);
      workerRef.current?.removeEventListener('messageerror', handleMessageError);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const search = useCallback((fen: string, level: number): Promise<SearchResult> => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.reject(new Error('AI Worker 未初始化'));
    }
    // 取消上一个未完成的搜索（避免 Worker 任务堆积）
    if (pendingRef.current) {
      pendingRef.current.reject(new Error('已被新搜索取代'));
      pendingRef.current = null;
    }
    setIsThinking(true);
    setError(null);
    const requestId = ++requestIdRef.current;
    return new Promise<SearchResult>((resolve, reject) => {
      pendingRef.current = { requestId, resolve, reject };
      worker.postMessage({ fen, level, requestId });
    });
  }, []);

  const cancel = useCallback(() => {
    if (pendingRef.current) {
      pendingRef.current.reject(new Error('已取消'));
      pendingRef.current = null;
      setIsThinking(false);
    }
  }, []);

  return { isThinking, lastResult, error, search, cancel };
}
