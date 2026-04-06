import { create } from "zustand";
import type { LawLlmMode } from "@/lib/law-llm";

type ComposerActionsStore = {
  lawMode: LawLlmMode;
  lawModeConfigured: boolean;
  researchConfigured: boolean;
  supermemoryConfigured: boolean;
  onLawModeChange: ((mode: LawLlmMode) => void) | null;
  onOpenLawLlmSettings: (() => void) | null;
  onOpenResearchSettings: (() => void) | null;
  onOpenSupermemorySettings: (() => void) | null;
  setActions: (actions: Partial<Omit<ComposerActionsStore, "setActions">>) => void;
};

export const useComposerActionsStore = create<ComposerActionsStore>((set) => ({
  lawMode: "server-1",
  lawModeConfigured: true,
  researchConfigured: false,
  supermemoryConfigured: false,
  onLawModeChange: null,
  onOpenLawLlmSettings: null,
  onOpenResearchSettings: null,
  onOpenSupermemorySettings: null,
  setActions: (actions) => set(actions),
}));
