import { type FC, useState } from "react";
import {
  BrainIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  LoaderIcon,
  SearchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";
import type { PrepareResult } from "@/stores/prepare-store";

export const PrepareResultsCard: FC<{
  results: PrepareResult[];
  extractedKeywords?: string[];
  isLoading?: boolean;
  inline?: boolean;
  className?: string;
}> = ({ results, extractedKeywords = [], isLoading = false, inline = false, className }) => {
  const [expanded, setExpanded] = useState(false);

  if (results.length === 0 && !isLoading) {
    return null;
  }

  const semanticCount = results.filter((result) => result.src === "semantic").length;
  const keywordCount = results.filter((result) => result.src === "keyword").length;

  return (
    <div className={cn(
      inline ? "w-full pb-2" : "mx-auto w-full max-w-2xl px-3 pb-2 sm:px-4",
      className,
    )}>
      <div className="overflow-hidden rounded-lg border border-indigo-200 bg-indigo-50/50 dark:border-indigo-900 dark:bg-indigo-950/30">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30"
          onClick={() => setExpanded((open) => !open)}
        >
          {isLoading && results.length === 0
            ? <LoaderIcon className="size-4 shrink-0 animate-spin text-indigo-500" />
            : <DatabaseIcon className="size-4 shrink-0 text-indigo-500" />}
          <span className="flex-1 truncate font-medium text-indigo-900 dark:text-indigo-100">
            {results.length > 0 ? `RAG Pipeline - ${results.length} laws` : "RAG Pipeline - searching laws"}
          </span>
          {extractedKeywords.length > 0 && (
            <span className="hidden max-w-56 truncate text-[11px] text-indigo-600 sm:inline dark:text-indigo-300">
              {extractedKeywords.join(", ")}
            </span>
          )}
          <span className="hidden items-center gap-2 text-[11px] text-indigo-600 sm:flex dark:text-indigo-300">
            {semanticCount > 0 && (
              <span className="flex items-center gap-1">
                <BrainIcon className="size-3" />
                {semanticCount} semantic
              </span>
            )}
            {keywordCount > 0 && (
              <span className="flex items-center gap-1">
                <SearchIcon className="size-3" />
                {keywordCount} keyword
              </span>
            )}
          </span>
          {expanded ? (
            <ChevronDownIcon className="size-4 shrink-0 text-indigo-400" />
          ) : (
            <ChevronRightIcon className="size-4 shrink-0 text-indigo-400" />
          )}
        </button>

        {expanded && results.length > 0 && (
          <div className="border-t border-indigo-200 dark:border-indigo-800">
            <div className="max-h-64 overflow-y-auto">
              {results.map((result, index) => (
                <PrepareResultRow key={`${result.d}-${index}`} result={result} index={index} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PrepareResultRow: FC<{
  result: { d: string; s: number; b: string; t: string; dt: string; o: string; src: "semantic" | "keyword" };
  index: number;
}> = ({ result, index }) => {
  const openCanvas = useCanvasStore((state) => state.open);

  const handleOpenCanvas = () => {
    const encoded = encodeURIComponent(result.d);
    openCanvas({
      id: `prepare-${result.d}-${Date.now()}`,
      title: result.t || result.b,
      subtitle: result.b,
      content: JSON.stringify(result, null, 2),
      type: "search-results",
      dokId: result.d,
      htmlUrl: `https://data.riksdagen.se/dokument/${encoded}.html`,
      textUrl: `https://data.riksdagen.se/dokument/${encoded}.text`,
      statusUrl: `https://data.riksdagen.se/dokumentstatus/${encoded}`,
      metadata: {
        Score: result.s.toFixed(3),
        Source: result.src,
        Date: result.dt,
        Organ: result.o,
      },
    });
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-indigo-100/50 dark:hover:bg-indigo-900/20",
        index % 2 === 0 ? "bg-transparent" : "bg-indigo-50/30 dark:bg-indigo-950/20",
      )}
    >
      <span className="w-5 shrink-0 text-center text-[10px] font-medium text-indigo-400">
        {index + 1}
      </span>

      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
          result.src === "semantic"
            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
        )}
      >
        {result.src === "semantic" ? `score ${result.s.toFixed(2)}` : "exact"}
      </span>

      <div className="min-w-0 flex-1">
        <span className="font-medium text-foreground">{result.b}</span>
        {result.t && (
          <span className="ml-1.5 text-muted-foreground">
            {result.t.length > 60 ? `${result.t.slice(0, 60)}...` : result.t}
          </span>
        )}
      </div>

      {result.dt && (
        <span className="shrink-0 text-[10px] text-muted-foreground">{result.dt}</span>
      )}

      <button
        type="button"
        onClick={handleOpenCanvas}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-indigo-200/50 hover:text-foreground dark:hover:bg-indigo-800/50"
        title="Open in Canvas"
      >
        <ExternalLinkIcon className="size-3" />
      </button>
    </div>
  );
};
