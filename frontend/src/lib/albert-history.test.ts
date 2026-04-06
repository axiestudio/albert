import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { UIMessage } from 'ai';

import {
  buildAlbertThreadPath,
  buildThreadSummary,
  clearLocalThreads,
  getStoredAlbertHistoryCollapsed,
  getStoredAlbertSidebarCollapsed,
  importLocalThreadsToRemote,
  setStoredAlbertHistoryCollapsed,
  setStoredAlbertSidebarCollapsed,
} from './albert-history';

const originalLocalStorage = globalThis.localStorage;

function createStorage() {
  const store = new Map<string, string>();

  return {
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  } satisfies Storage;
}

function createMessage(id: string, role: 'user' | 'assistant', text: string): UIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

describe('albert history helpers', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createStorage(),
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('persists the history collapsed preference', () => {
    expect(getStoredAlbertHistoryCollapsed()).toBe(false);

    setStoredAlbertHistoryCollapsed(true);
    expect(getStoredAlbertHistoryCollapsed()).toBe(true);

    setStoredAlbertHistoryCollapsed(false);
    expect(getStoredAlbertHistoryCollapsed()).toBe(false);
  });

  it('persists the full sidebar collapsed preference', () => {
    expect(getStoredAlbertSidebarCollapsed()).toBe(false);

    setStoredAlbertSidebarCollapsed(true);
    expect(getStoredAlbertSidebarCollapsed()).toBe(true);

    setStoredAlbertSidebarCollapsed(false);
    expect(getStoredAlbertSidebarCollapsed()).toBe(false);
  });

  it('imports local guest threads into remote history and clears local storage', async () => {
    const firstThread = buildThreadSummary('thread-1', [
      createMessage('1', 'user', 'First question'),
      createMessage('2', 'assistant', 'First answer'),
    ]);
    const secondThread = buildThreadSummary('thread-2', [
      createMessage('3', 'user', 'Second question'),
      createMessage('4', 'assistant', 'Second answer'),
    ]);

    globalThis.localStorage.setItem('albert.local.threads.v1', JSON.stringify([firstThread, secondThread]));

    const saveRemote = mock(async () => undefined);

    const imported = await importLocalThreadsToRemote(saveRemote);

    expect(imported).toBe(2);
    expect(saveRemote).toHaveBeenCalledTimes(2);
    expect(saveRemote.mock.calls).toEqual(expect.arrayContaining([
      ['thread-1', firstThread.messages],
      ['thread-2', secondThread.messages],
    ]));
    expect(globalThis.localStorage.getItem('albert.local.threads.v1')).toBe('[]');
  });

  it('keeps local threads if remote import fails', async () => {
    const thread = buildThreadSummary('thread-1', [
      createMessage('1', 'user', 'Keep this history'),
      createMessage('2', 'assistant', 'Still here'),
    ]);

    globalThis.localStorage.setItem('albert.local.threads.v1', JSON.stringify([thread]));

    const saveRemote = mock(async () => {
      throw new Error('failed');
    });

    await expect(importLocalThreadsToRemote(saveRemote)).rejects.toThrow('failed');
    expect(globalThis.localStorage.getItem('albert.local.threads.v1')).toContain('thread-1');
  });

  it('can clear local guest threads directly', () => {
    globalThis.localStorage.setItem('albert.local.threads.v1', JSON.stringify([{ id: 'thread-1' }]));

    clearLocalThreads();

    expect(globalThis.localStorage.getItem('albert.local.threads.v1')).toBe('[]');
  });

  it('builds canonical Albert room paths for dedicated chat URLs', () => {
    expect(buildAlbertThreadPath('wehgowjgow3jhoj3w4o')).toBe('/chat/wehgowjgow3jhoj3w4o');
  });
});
