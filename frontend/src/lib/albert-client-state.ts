import { clearLocalThreads } from "./albert-history";
import { useAlbertSupermemoryStore } from "@/stores/albert-supermemory-store";
import { useBrowserUseStore } from "@/stores/browser-use-store";
import { useLawLlmByokStore } from "@/stores/law-llm-byok-store";
import { useLawLlmStore } from "@/stores/law-llm-store";

export function clearAlbertClientSessionState(): void {
  clearLocalThreads();
  useBrowserUseStore.getState().clear();
  useAlbertSupermemoryStore.getState().clear();
  useLawLlmStore.getState().clear();
  useLawLlmByokStore.getState().clearAll();
}