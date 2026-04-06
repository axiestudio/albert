import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { clearAlbertClientSessionState } from "./albert-client-state";
import { useAlbertSupermemoryStore } from "@/stores/albert-supermemory-store";
import { useBrowserUseStore } from "@/stores/browser-use-store";
import { useLawLlmByokStore } from "@/stores/law-llm-byok-store";
import { useLawLlmStore } from "@/stores/law-llm-store";

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

describe("clearAlbertClientSessionState", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createStorage(),
    });

    globalThis.localStorage.setItem("albert.local.threads.v1", JSON.stringify([{ id: "thread-1" }]));
    useLawLlmStore.getState().setMode("anthropic");
    useLawLlmStore.getState().setModel("anthropic", "claude-haiku-4-5");
    useLawLlmByokStore.setState({
      anthropicApiKey: "sk-ant-user",
      anthropicKeyVisible: true,
      openaiApiKey: "sk-user-openai",
      openaiKeyVisible: true,
    });
    useBrowserUseStore.getState().setEnabled(true);
    useBrowserUseStore.getState().setApiKey("browser-use-live-key");
    useAlbertSupermemoryStore.getState().setApiKey("sm-live-key");
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it("clears local thread history and persisted provider secrets on sign-out", () => {
    clearAlbertClientSessionState();

    expect(globalThis.localStorage.getItem("albert.local.threads.v1")).toBe("[]");
    expect(useLawLlmStore.getState().mode).toBe("server-1");
    expect(useLawLlmByokStore.getState().openaiApiKey).toBe("");
    expect(useLawLlmByokStore.getState().anthropicApiKey).toBe("");
    expect(useBrowserUseStore.getState().enabled).toBe(false);
    expect(useBrowserUseStore.getState().apiKey).toBe("");
    expect(useAlbertSupermemoryStore.getState().apiKey).toBe("");
  });
});