import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_LAW_LLM_MODE,
  getDefaultLawLlmModel,
  isLawLlmMode,
  resolveLawLlmModel,
  type LawLlmMode,
} from "@/lib/law-llm";

type LawLlmStore = {
  mode: LawLlmMode;
  modelByMode: Record<LawLlmMode, string>;
  clear: () => void;
  setModel: (mode: LawLlmMode, model: string) => void;
  setMode: (mode: LawLlmMode) => void;
};

const DEFAULT_LAW_LLM_MODEL_BY_MODE: Record<LawLlmMode, string> = {
  "server-1": getDefaultLawLlmModel("server-1"),
  "vertex-claude": getDefaultLawLlmModel("vertex-claude"),
  "vertex-mistral": getDefaultLawLlmModel("vertex-mistral"),
  "vertex-open": getDefaultLawLlmModel("vertex-open"),
  openai: getDefaultLawLlmModel("openai"),
  anthropic: getDefaultLawLlmModel("anthropic"),
};

const noopStorage = {
  getItem: () => null,
  removeItem: () => {},
  setItem: () => {},
};

function getLawLlmPersistStorage() {
  try {
    return globalThis.localStorage ?? noopStorage;
  } catch {
    return noopStorage;
  }
}

function migratePersistedLawMode(rawMode: unknown): LawLlmMode {
  if (typeof rawMode !== "string") {
    return DEFAULT_LAW_LLM_MODE;
  }

  switch (rawMode) {
    case "alibaba":
    case "cloudflare":
    case "vertex":
    case "server-2":
    case "server-3":
      return "server-1";
    default:
      return isLawLlmMode(rawMode) ? rawMode : DEFAULT_LAW_LLM_MODE;
  }
}

function migratePersistedLawModels(rawState: unknown): Record<LawLlmMode, string> {
  const state = (rawState ?? {}) as Record<string, unknown>;
  const persistedModelByMode = state.modelByMode && typeof state.modelByMode === "object"
    ? state.modelByMode as Record<string, unknown>
    : {};

  return {
    "server-1": resolveLawLlmModel(
      "server-1",
      typeof persistedModelByMode["server-1"] === "string" ? persistedModelByMode["server-1"] : undefined,
    ),
    "vertex-claude": resolveLawLlmModel(
      "vertex-claude",
      typeof persistedModelByMode["vertex-claude"] === "string" ? persistedModelByMode["vertex-claude"] : undefined,
    ),
    "vertex-mistral": resolveLawLlmModel(
      "vertex-mistral",
      typeof persistedModelByMode["vertex-mistral"] === "string" ? persistedModelByMode["vertex-mistral"] : undefined,
    ),
    "vertex-open": resolveLawLlmModel(
      "vertex-open",
      typeof persistedModelByMode["vertex-open"] === "string" ? persistedModelByMode["vertex-open"] : undefined,
    ),
    openai: resolveLawLlmModel(
      "openai",
      typeof persistedModelByMode.openai === "string" ? persistedModelByMode.openai : undefined,
    ),
    anthropic: resolveLawLlmModel(
      "anthropic",
      typeof persistedModelByMode.anthropic === "string" ? persistedModelByMode.anthropic : undefined,
    ),
  };
}

export const useLawLlmStore = create<LawLlmStore>()(
  persist(
    set => ({
      mode: DEFAULT_LAW_LLM_MODE,
      modelByMode: DEFAULT_LAW_LLM_MODEL_BY_MODE,
      clear: () => set({
        mode: DEFAULT_LAW_LLM_MODE,
        modelByMode: DEFAULT_LAW_LLM_MODEL_BY_MODE,
      }),
      setModel: (mode, model) => set((state) => ({
        modelByMode: {
          ...state.modelByMode,
          [mode]: resolveLawLlmModel(mode, model),
        },
      })),
      setMode: mode => set({ mode }),
    }),
    {
      name: "law-agent-llm-provider",
      storage: createJSONStorage(getLawLlmPersistStorage),
      version: 5,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Record<string, unknown>;
        const persistedMode = state.mode ?? state.provider;

        return {
          mode: migratePersistedLawMode(persistedMode),
          modelByMode: migratePersistedLawModels(state),
        };
      },
      partialize: state => ({
        mode: state.mode,
        modelByMode: state.modelByMode,
      }),
    },
  ),
);
