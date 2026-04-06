import { create } from "zustand";

export type CanvasItemType = "law" | "proposition" | "chain" | "search-results" | "votes" | "debates" | "lagen-nu" | "dom-analysis" | "browser-research";
export type CanvasViewMode = "html" | "text" | "metadata";

export type CanvasItem = {
  id: string;
  title: string;
  subtitle?: string;
  /** Raw text / JSON content for the metadata or text tab */
  content: string;
  type: CanvasItemType;
  /** dok_id used to construct Riksdagen URLs */
  dokId?: string;
  /** Direct URL to the HTML version: data.riksdagen.se/dokument/{dok_id}.html */
  htmlUrl?: string;
  /** Direct URL to the text version: data.riksdagen.se/dokument/{dok_id}.text */
  textUrl?: string;
  /** Link to the full dokumentstatus page */
  statusUrl?: string;
  /** Live browser stream URL for web research (embedded in iframe, hidden from user) */
  liveUrl?: string;
  /** Browser Use task ID — used for status polling */
  taskId?: string;
  /** Browser Use API key — needed to poll task status */
  browserUseApiKey?: string;
  metadata?: Record<string, unknown>;
};

export type ResearchStatus = 'running' | 'finished' | 'stopped' | 'error';

type CanvasStore = {
  isOpen: boolean;
  item: CanvasItem | null;
  history: CanvasItem[];
  viewMode: CanvasViewMode;
  /** Live research polling status */
  researchStatus: ResearchStatus | null;
  open: (item: CanvasItem) => void;
  close: () => void;
  back: () => void;
  setViewMode: (mode: CanvasViewMode) => void;
  setResearchStatus: (status: ResearchStatus | null) => void;
  /** Update item content when research completes (from polling) */
  updateItemContent: (content: string, metadata?: Record<string, unknown>) => void;
};

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  isOpen: false,
  item: null,
  history: [],
  viewMode: "html",
  researchStatus: null,
  open: (item) =>
    set((state) => ({
      isOpen: true,
      item,
      viewMode: item.liveUrl ? "html" : item.htmlUrl ? "html" : "text",
      history: state.item ? [...state.history, state.item] : state.history,
      researchStatus: item.type === "browser-research" && item.liveUrl ? "running" : null,
    })),
  close: () => set({ isOpen: false, item: null, history: [], viewMode: "html", researchStatus: null }),
  back: () => {
    const { history } = get();
    if (history.length === 0) {
      set({ isOpen: false, item: null, researchStatus: null });
      return;
    }
    const prev = history[history.length - 1];
    set({ item: prev, history: history.slice(0, -1), viewMode: prev.htmlUrl ? "html" : "text", researchStatus: null });
  },
  setViewMode: (mode) => set({ viewMode: mode }),
  setResearchStatus: (status) => set({ researchStatus: status }),
  updateItemContent: (content, metadata) => {
    const { item } = get();
    if (!item) return;
    set({
      item: {
        ...item,
        content,
        title: "Webbforskningsrapport",
        subtitle: "Forskning avslutad",
        metadata: { ...item.metadata, ...metadata },
      },
      researchStatus: "finished",
    });
  },
}));
