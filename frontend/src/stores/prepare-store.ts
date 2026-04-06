import { create } from "zustand";

export type PrepareResult = {
  d: string;   // dokId
  s: number;   // score
  b: string;   // beteckning
  t: string;   // titel
  dt: string;  // datum
  o: string;   // organ
  src: "semantic" | "keyword";
};

type PrepareStore = {
  results: PrepareResult[];
  isLoading: boolean;
  setResults: (results: PrepareResult[]) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
};

export const usePrepareStore = create<PrepareStore>((set) => ({
  results: [],
  isLoading: false,
  setResults: (results) => set({ results, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ results: [], isLoading: false }),
}));
