import { create } from "zustand";
import { persist } from "zustand/middleware";

type AlbertSupermemoryStore = {
  apiKey: string;
  keyVisible: boolean;
  setApiKey: (apiKey: string) => void;
  toggleKeyVisible: () => void;
  clear: () => void;
};

export const useAlbertSupermemoryStore = create<AlbertSupermemoryStore>()(
  persist(
    (set) => ({
      apiKey: "",
      keyVisible: false,
      setApiKey: (apiKey) => set({ apiKey }),
      toggleKeyVisible: () => set((state) => ({ keyVisible: !state.keyVisible })),
      clear: () => set({ apiKey: "", keyVisible: false }),
    }),
    {
      name: "albert-supermemory",
      partialize: (state) => ({
        apiKey: state.apiKey,
      }),
    },
  ),
);

export function getAlbertSupermemoryApiKey(): string {
  return useAlbertSupermemoryStore.getState().apiKey.trim();
}