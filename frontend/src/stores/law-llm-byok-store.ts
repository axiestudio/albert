import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { LawLlmMode, LawLlmVertexMode } from "@/lib/law-llm";

const noopStorage = {
  getItem: () => null,
  removeItem: () => {},
  setItem: () => {},
};

function getLawLlmByokPersistStorage() {
  try {
    return globalThis.localStorage ?? noopStorage;
  } catch {
    return noopStorage;
  }
}

type LawLlmByokStore = {
  anthropicApiKey: string;
  anthropicKeyVisible: boolean;
  googleApiKey: string;
  googleKeyVisible: boolean;
  openaiApiKey: string;
  openaiKeyVisible: boolean;
  vertexProjectId: string;
  clearAll: () => void;
  clearApiKey: (mode: LawLlmMode) => void;
  clearVertexProjectId: () => void;
  setApiKey: (mode: LawLlmMode, apiKey: string) => void;
  setVertexProjectId: (projectId: string) => void;
  toggleKeyVisible: (mode: LawLlmMode) => void;
};

function isGoogleCredentialMode(mode: LawLlmMode): mode is "server-1" | LawLlmVertexMode {
  return mode === "server-1" || mode === "vertex-claude" || mode === "vertex-mistral" || mode === "vertex-open";
}

function keyFieldForMode(mode: LawLlmMode): "googleApiKey" | "openaiApiKey" | "anthropicApiKey" {
  if (mode === "openai") {
    return "openaiApiKey";
  }

  if (mode === "anthropic") {
    return "anthropicApiKey";
  }

  return "googleApiKey";
}

function keyVisibleFieldForMode(mode: LawLlmMode): "googleKeyVisible" | "openaiKeyVisible" | "anthropicKeyVisible" {
  if (mode === "openai") {
    return "openaiKeyVisible";
  }

  if (mode === "anthropic") {
    return "anthropicKeyVisible";
  }

  return "googleKeyVisible";
}

export const useLawLlmByokStore = create<LawLlmByokStore>()(
  persist(
    set => ({
      anthropicApiKey: "",
      anthropicKeyVisible: false,
      googleApiKey: "",
      googleKeyVisible: false,
      openaiApiKey: "",
      openaiKeyVisible: false,
      vertexProjectId: "",
      clearAll: () => set({
        anthropicApiKey: "",
        anthropicKeyVisible: false,
        googleApiKey: "",
        googleKeyVisible: false,
        openaiApiKey: "",
        openaiKeyVisible: false,
        vertexProjectId: "",
      }),
      clearApiKey: (mode) => set({
        [keyFieldForMode(mode)]: "",
        [keyVisibleFieldForMode(mode)]: false,
      } as Pick<LawLlmByokStore, "anthropicApiKey" | "anthropicKeyVisible" | "googleApiKey" | "googleKeyVisible" | "openaiApiKey" | "openaiKeyVisible">),
      clearVertexProjectId: () => set({ vertexProjectId: "" }),
      setApiKey: (mode, apiKey) => set({
        [keyFieldForMode(mode)]: apiKey,
      } as Pick<LawLlmByokStore, "anthropicApiKey" | "googleApiKey" | "openaiApiKey">),
      setVertexProjectId: (projectId) => set({ vertexProjectId: projectId }),
      toggleKeyVisible: (mode) => set((state) => ({
        [keyVisibleFieldForMode(mode)]: !state[keyVisibleFieldForMode(mode)],
      }) as Pick<LawLlmByokStore, "anthropicKeyVisible" | "googleKeyVisible" | "openaiKeyVisible">),
    }),
    {
      name: "law-agent-llm-byok",
      storage: createJSONStorage(getLawLlmByokPersistStorage),
      partialize: state => ({
        anthropicApiKey: state.anthropicApiKey,
        googleApiKey: state.googleApiKey,
        openaiApiKey: state.openaiApiKey,
        vertexProjectId: state.vertexProjectId,
      }),
    },
  ),
);

export function getLawLlmByokApiKey(mode: LawLlmMode): string {
  const state = useLawLlmByokStore.getState();

  if (isGoogleCredentialMode(mode)) {
    return state.googleApiKey.trim();
  }

  if (mode === "openai") {
    return state.openaiApiKey.trim();
  }

  if (mode === "anthropic") {
    return state.anthropicApiKey.trim();
  }

  return "";
}

export function getLawLlmVertexProjectId(mode: LawLlmMode): string {
  if (!isGoogleCredentialMode(mode) || mode === "server-1") {
    return "";
  }

  return useLawLlmByokStore.getState().vertexProjectId.trim();
}
