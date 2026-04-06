import type { UIMessage } from 'ai';
import { useCallback, useEffect, useState } from 'react';
import {
  buildThreadSummary,
  createNewThreadId,
  deleteLocalThread,
  loadLocalThreads,
  saveLocalThread,
  type AlbertThread,
} from '@/lib/albert-history';

export function useAlbertHistory(routeThreadId?: string) {
  const [threads, setThreads] = useState<AlbertThread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string>(() => routeThreadId ?? createNewThreadId());
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [runtimeSeed, setRuntimeSeed] = useState(0);
  const [loadingThread, setLoadingThread] = useState(false);

  useEffect(() => {
    if (!routeThreadId || routeThreadId === currentThreadId) {
      return;
    }

    setCurrentThreadId(routeThreadId);
    setInitialMessages([]);
  }, [currentThreadId, routeThreadId]);

  useEffect(() => {
    setThreads(loadLocalThreads());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const activeThreadId = routeThreadId ?? currentThreadId;

    const hydrateActiveThread = async () => {
      setLoadingThread(true);

      try {
        if (routeThreadId) {
          setCurrentThreadId(routeThreadId);
        }

        const thread = loadLocalThreads().find((entry) => entry.id === activeThreadId);
        if (cancelled) {
          return;
        }

        setInitialMessages(thread?.messages ?? []);

        if (!cancelled) {
          setRuntimeSeed((seed) => seed + 1);
        }
      } finally {
        if (!cancelled) {
          setLoadingThread(false);
        }
      }
    };

    void hydrateActiveThread();

    return () => {
      cancelled = true;
    };
  }, [currentThreadId, routeThreadId]);

  const selectThread = useCallback(async (threadId: string) => {
    setCurrentThreadId(threadId);
  }, []);

  const createNewThread = useCallback(() => {
    const nextThreadId = createNewThreadId();
    setCurrentThreadId(nextThreadId);
    setInitialMessages([]);
    setRuntimeSeed((seed) => seed + 1);
    return nextThreadId;
  }, []);

  const persistThread = useCallback(async (threadId: string, messages: UIMessage[]) => {
    if (messages.length === 0) {
      return;
    }

    const savedThreads = saveLocalThread(buildThreadSummary(threadId, messages));
    setThreads(savedThreads);
  }, []);

  const removeThread = useCallback(async (threadId: string) => {
    setThreads(deleteLocalThread(threadId));

    if (currentThreadId === threadId) {
      return createNewThread();
    }

    return null;
  }, [createNewThread, currentThreadId]);

  return {
    createNewThread,
    currentThreadId,
    initialMessages,
    loadingThread,
    persistThread,
    removeThread,
    runtimeSeed,
    selectThread,
    threads,
  };
}
