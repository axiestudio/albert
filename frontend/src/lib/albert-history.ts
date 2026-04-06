import type { UIMessage } from 'ai';
import { getAlbertSupermemoryApiKey } from '@/stores/albert-supermemory-store';

export type AlbertThread = {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  messages?: UIMessage[];
  updatedAt: string;
  createdAt?: string;
};

type ThreadListResponse = {
  threads?: AlbertThread[];
};

type ThreadResponse = {
  thread?: AlbertThread;
};

const LOCAL_STORAGE_KEY = 'albert.local.threads.v1';
const HISTORY_COLLAPSED_STORAGE_KEY = 'albert.history.collapsed.v1';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'albert.sidebar.collapsed.v1';
const ALBERT_PROXY_THREADS_URL = '/api/albert/threads';

export function buildAlbertThreadPath(threadId: string): string {
  return `/chat/${encodeURIComponent(threadId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getMessageText(message: UIMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .map((part) => {
      if (!isRecord(part)) {
        return '';
      }

      const partRecord = part as Record<string, unknown>;

      if (partRecord.type === 'text' && typeof partRecord.text === 'string') {
        return partRecord.text;
      }

      const candidate = partRecord.content;
      if (typeof candidate === 'string') {
        return candidate;
      }

      return '';
    })
    .join(' ')
    .trim();
}

export function buildThreadSummary(threadId: string, messages: UIMessage[]): AlbertThread {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  const titleSource = firstUserMessage ? getMessageText(firstUserMessage) : '';
  const previewSource = [...messages]
    .reverse()
    .map((message) => getMessageText(message))
    .find(Boolean);
  const now = new Date().toISOString();

  return {
    id: threadId,
    title: titleSource ? titleSource.slice(0, 80) : 'New chat',
    preview: previewSource ? previewSource.slice(0, 240) : '',
    messageCount: messages.length,
    messages,
    updatedAt: now,
    createdAt: now,
  };
}

export function loadLocalThreads(): AlbertThread[] {
  if (typeof globalThis.localStorage === 'undefined') {
    return [];
  }

  try {
    const raw = globalThis.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is AlbertThread => isRecord(entry) && typeof entry.id === 'string')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function saveLocalThread(thread: AlbertThread): AlbertThread[] {
  const current = loadLocalThreads().filter((entry) => entry.id !== thread.id);
  const next = [thread, ...current].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  globalThis.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearLocalThreads(): void {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }

  globalThis.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
}

export function deleteLocalThread(threadId: string): AlbertThread[] {
  const next = loadLocalThreads().filter((entry) => entry.id !== threadId);
  globalThis.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function getStoredAlbertHistoryCollapsed(): boolean {
  if (typeof globalThis.localStorage === 'undefined') {
    return false;
  }

  return globalThis.localStorage.getItem(HISTORY_COLLAPSED_STORAGE_KEY) === 'true';
}

export function setStoredAlbertHistoryCollapsed(collapsed: boolean): void {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }

  globalThis.localStorage.setItem(HISTORY_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
}

export function getStoredAlbertSidebarCollapsed(): boolean {
  if (typeof globalThis.localStorage === 'undefined') {
    return false;
  }

  return globalThis.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
}

export function setStoredAlbertSidebarCollapsed(collapsed: boolean): void {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }

  globalThis.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const supermemoryApiKey = getAlbertSupermemoryApiKey();
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(supermemoryApiKey ? { 'x-albert-supermemory-key': supermemoryApiKey } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function listRemoteThreads(): Promise<AlbertThread[]> {
  const data = await fetchJson<ThreadListResponse>(ALBERT_PROXY_THREADS_URL, { method: 'GET' });
  return data.threads ?? [];
}

export async function getRemoteThread(threadId: string): Promise<AlbertThread> {
  const data = await fetchJson<ThreadResponse>(`${ALBERT_PROXY_THREADS_URL}/${threadId}`, { method: 'GET' });
  if (!data.thread) {
    throw new Error('Thread not found');
  }
  return data.thread;
}

export async function saveRemoteThread(threadId: string, messages: UIMessage[]): Promise<AlbertThread> {
  const summary = buildThreadSummary(threadId, messages);
  const data = await fetchJson<ThreadResponse>(`${ALBERT_PROXY_THREADS_URL}/${threadId}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: summary.title,
      preview: summary.preview,
      messages,
      metadata: {
        source: 'remote',
        lastSyncedFrom: 'law-agent',
      },
    }),
  });

  if (!data.thread) {
    throw new Error('Failed to save thread');
  }

  return data.thread;
}

export async function importLocalThreadsToRemote(
  saveThread: (threadId: string, messages: UIMessage[]) => Promise<unknown> = saveRemoteThread,
): Promise<number> {
  const localThreads = loadLocalThreads().filter((thread) => Array.isArray(thread.messages) && thread.messages.length > 0);

  for (const thread of localThreads) {
    await saveThread(thread.id, thread.messages ?? []);
  }

  if (localThreads.length > 0) {
    clearLocalThreads();
  }

  return localThreads.length;
}

export async function deleteRemoteThread(threadId: string): Promise<void> {
  await fetchJson<{ success: boolean }>(`${ALBERT_PROXY_THREADS_URL}/${threadId}`, { method: 'DELETE' });
}

export function createNewThreadId(): string {
  return crypto.randomUUID();
}
