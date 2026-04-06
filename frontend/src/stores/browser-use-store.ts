import { create } from "zustand";
import { persist } from "zustand/middleware";

type BrowserUseStore = {
  /** Whether the web research agent feature is enabled */
  enabled: boolean;
  /** API key (stored in localStorage, never sent to server unless needed for a task) */
  apiKey: string;
  /** Whether the API key is currently visible in the input */
  keyVisible: boolean;

  setEnabled: (enabled: boolean) => void;
  setApiKey: (key: string) => void;
  toggleKeyVisible: () => void;
  clear: () => void;
};

export const useBrowserUseStore = create<BrowserUseStore>()(
  persist(
    (set) => ({
      enabled: false,
      apiKey: "",
      keyVisible: false,

      setEnabled: (enabled) => set({ enabled }),
      setApiKey: (apiKey) => set({ apiKey }),
      toggleKeyVisible: () => set((s) => ({ keyVisible: !s.keyVisible })),
      clear: () => set({ enabled: false, apiKey: "", keyVisible: false }),
    }),
    {
      name: "law-agent-browser-use",
      partialize: (state) => ({
        enabled: state.enabled,
        apiKey: state.apiKey,
      }),
    },
  ),
);
