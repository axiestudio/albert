import { type FC, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircle2Icon,
  LoaderIcon,
  XCircleIcon,
  SearchIcon,
  BookOpenIcon,
  LinkIcon,
  FileTextIcon,
  BrainIcon,
  PanelRightOpenIcon,
  VoteIcon,
  MicIcon,
  GlobeIcon,
  MonitorIcon,
  CloudIcon,
  BookMarkedIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";
import type { CanvasItemType } from "@/stores/canvas-store";
import { useBrowserUseStore } from "@/stores/browser-use-store";

const RIKSDAGEN_DOC_BASE = "https://data.riksdagen.se/dokument";
const RIKSDAGEN_STATUS_BASE = "https://data.riksdagen.se/dokumentstatus";

const TOOL_META: Record<string, { label: string; icon: FC<{ className?: string }>; canvasType?: CanvasItemType }> = {
  searchLaws: { label: "Söker lagar", icon: SearchIcon, canvasType: "search-results" },
  semanticSearchLaws: { label: "Semantisk sökning", icon: BrainIcon, canvasType: "search-results" },
  getLawDetail: { label: "Hämtar lagtext", icon: BookOpenIcon, canvasType: "law" },
  getProposition: { label: "Hämtar proposition", icon: FileTextIcon, canvasType: "proposition" },
  getLegislativeChain: { label: "Spårar lagstiftningskedja", icon: LinkIcon, canvasType: "chain" },
  getVotes: { label: "Hämtar voteringar", icon: VoteIcon, canvasType: "votes" },
  getDebateSpeeches: { label: "Hämtar debattanföranden", icon: MicIcon, canvasType: "debates" },
  fetchLagenNu: { label: "Hämtar från lagen.nu", icon: GlobeIcon, canvasType: "lagen-nu" },
  analyzeDom: { label: "Analyserar sidinnehåll", icon: MonitorIcon, canvasType: "dom-analysis" },
  startWebResearch: { label: "Startar webbforskning", icon: CloudIcon, canvasType: "browser-research" },
  getWebResearchResult: { label: "Hämtar forskningsresultat", icon: CloudIcon, canvasType: "browser-research" },
  readSourceMaterial: { label: "Läser källmaterial", icon: BookMarkedIcon },
  readWebResearchArtifact: { label: "Läser forskningsartefakt", icon: CloudIcon, canvasType: "browser-research" },
};

/** Build Riksdagen document URLs from dok_id */
function buildDocUrls(dokId: string | undefined) {
  if (!dokId) return { htmlUrl: undefined, textUrl: undefined, statusUrl: undefined };
  const encoded = encodeURIComponent(dokId);
  return {
    htmlUrl: `${RIKSDAGEN_DOC_BASE}/${encoded}.html`,
    textUrl: `${RIKSDAGEN_DOC_BASE}/${encoded}.text`,
    statusUrl: `${RIKSDAGEN_STATUS_BASE}/${encoded}`,
  };
}

/** Try to find the "best" document from a search result to open in canvas */
export function extractCanvasItem(
  toolName: string,
  canvasType: CanvasItemType,
  result: unknown,
) {
  const resultObj = typeof result === "object" && result !== null ? result as Record<string, unknown> : {};
  const resultStr = typeof result === "string" ? result : JSON.stringify(result, null, 2);

  // For search results, try to get the first result's dok_id
  if (canvasType === "search-results") {
    const results = resultObj.results as Array<Record<string, unknown>> | undefined;
    const first = results?.[0];
    const dokId = first?.dokId as string | undefined;
    const urls = buildDocUrls(dokId);
    return {
      id: `${toolName}-${Date.now()}`,
      title: first?.titel as string ?? `Search Results (${resultObj.totalHits ?? resultObj.totalMatches ?? "?"} hits)`,
      subtitle: first?.beteckning as string ?? undefined,
      content: resultStr,
      type: canvasType,
      dokId,
      ...urls,
      metadata: {
        ...(resultObj.totalHits != null ? { "Total hits": resultObj.totalHits } : {}),
        ...(resultObj.totalMatches != null ? { "Total matches": resultObj.totalMatches } : {}),
        ...(first?.organ ? { Organ: first.organ } : {}),
        ...(first?.datum ? { Date: first.datum } : {}),
      },
    };
  }

  // For chain results
  if (canvasType === "chain") {
    const chain = resultObj.chain as Array<Record<string, unknown>> | undefined;
    const first = chain?.[0];
    const dokId = first?.dokId as string ?? resultObj.dokId as string;
    const urls = buildDocUrls(dokId);
    return {
      id: `${toolName}-${Date.now()}`,
      title: first?.titel as string ?? "Legislative Chain",
      subtitle: first?.beteckning as string ?? undefined,
      content: resultStr,
      type: canvasType,
      dokId,
      ...urls,
      metadata: {
        ...(first?.typ ? { Type: first.typ } : {}),
        ...(first?.datum ? { Date: first.datum } : {}),
        "Chain length": chain?.length ?? 0,
      },
    };
  }

  // For votes results
  if (canvasType === "votes") {
    const results = resultObj.results as Array<Record<string, unknown>> | undefined;
    const first = results?.[0];
    return {
      id: `${toolName}-${Date.now()}`,
      title: first?.titel as string ?? `Votes (${resultObj.totalHits ?? "?"} records)`,
      subtitle: first?.beteckning as string ?? undefined,
      content: resultStr,
      type: canvasType,
      metadata: {
        ...(resultObj.totalHits != null ? { "Total hits": resultObj.totalHits } : {}),
        ...(first?.datum ? { Date: first.datum } : {}),
        ...(first?.ja ? { Ja: first.ja } : {}),
        ...(first?.nej ? { Nej: first.nej } : {}),
      },
    };
  }

  // For lagen.nu results — preserve footnoteUrl for source linking
  if (canvasType === "lagen-nu") {
    const url = resultObj.url as string | undefined;
    const footnoteUrl = resultObj.footnoteUrl as string ?? url;
    const title = resultObj.title as string || "Lagen.nu Document";
    const sfs = resultObj.sfs as string | undefined;
    const metadata = resultObj.metadata as Record<string, unknown> | undefined;
    return {
      id: `${toolName}-${Date.now()}`,
      title,
      subtitle: sfs ? `SFS ${sfs}` : (url ?? undefined),
      content: resultStr,
      type: canvasType,
      htmlUrl: footnoteUrl ?? url,
      metadata: {
        ...(footnoteUrl ? { "Source": footnoteUrl } : {}),
        ...(sfs ? { SFS: sfs } : {}),
        ...(metadata?.departement ? { Departement: metadata.departement } : {}),
        ...(metadata?.utfardad ? { Utfärdad: metadata.utfardad } : {}),
        ...(resultObj.charCount != null ? { "Content length": resultObj.charCount } : {}),
        ...(resultObj.footnote ? { Footnote: resultObj.footnote } : {}),
      },
    };
  }

  // For DOM analysis results
  if (canvasType === "dom-analysis") {
    const url = resultObj.url as string | undefined;
    const title = resultObj.title as string || "DOM Analysis";
    return {
      id: `${toolName}-${Date.now()}`,
      title,
      subtitle: url ?? undefined,
      content: resultStr,
      type: canvasType,
      htmlUrl: url,
      metadata: {
        ...(url ? { URL: url } : {}),
        ...(resultObj.lang ? { Language: resultObj.lang } : {}),
        ...(resultObj.headingCount != null ? { Headings: resultObj.headingCount } : {}),
        ...(resultObj.linkCount != null ? { Links: resultObj.linkCount } : {}),
        ...(resultObj.wordCount != null ? { "Word count": resultObj.wordCount } : {}),
      },
    };
  }

  // For web research — Phase 1: live view, Phase 2: final report
  if (canvasType === "browser-research") {
    const liveUrl = resultObj.liveUrl as string | undefined;
    const output = resultObj.output as string | undefined;
    const outputFormat = resultObj.outputFormat as string | undefined;
    const outputFiles = resultObj.outputFiles as string[] | undefined;
    const artifactFiles = resultObj.artifactFiles as string[] | undefined;
    const isMarkdown = outputFormat === "markdown-file" || (output?.startsWith("#") ?? false);

    // Phase 1: startWebResearch — show live browser view
    if (toolName === "startWebResearch" && resultObj.status === "running") {
      return {
        id: `${toolName}-${resultObj.taskId ?? Date.now()}`,
        title: "Forskningsagent — Live",
        subtitle: "Forskning pågår...",
        content: resultStr,
        type: canvasType,
        liveUrl: liveUrl ?? undefined,
        taskId: resultObj.taskId as string | undefined,
        metadata: {
          Status: "Pågår",
          ...(resultObj.taskId ? { "Uppgifts-ID": resultObj.taskId } : {}),
        },
      };
    }

    // Phase 2: getWebResearchResult — show final report
    return {
      id: `${toolName}-${resultObj.taskId ?? Date.now()}`,
      title: resultObj.isSuccess ? "Webbforskningsrapport" : `Webbforskning — ${resultObj.status ?? "okänd"}`,
      subtitle: outputFiles?.[0]
        ?? (artifactFiles?.length ? `${artifactFiles.length} artifacts` : undefined)
        ?? (resultObj.stepCount ? `${resultObj.stepCount} steps` : undefined),
      content: output ?? resultStr,
      type: canvasType,
      metadata: {
        ...(resultObj.status ? { Status: resultObj.status } : {}),
        ...(resultObj.isSuccess != null ? { Success: resultObj.isSuccess } : {}),
        ...(resultObj.stepCount != null ? { Steps: resultObj.stepCount } : {}),
        ...(outputFormat ? { Format: outputFormat } : {}),
        ...(artifactFiles?.length ? { Artifacts: artifactFiles.join(", ") } : {}),
      },
    };
  }

  // For debate speeches results
  if (canvasType === "debates") {
    const results = resultObj.results as Array<Record<string, unknown>> | undefined;
    const first = results?.[0];
    return {
      id: `${toolName}-${Date.now()}`,
      title: first?.avsnittsrubrik as string ?? `Debate Speeches (${resultObj.totalHits ?? "?"} results)`,
      subtitle: first?.talare ? `${first.talare} (${first.parti ?? ""})` : undefined,
      content: resultStr,
      type: canvasType,
      metadata: {
        ...(resultObj.totalHits != null ? { "Total hits": resultObj.totalHits } : {}),
        ...(first?.datum ? { Date: first.datum } : {}),
        ...(first?.parti ? { Party: first.parti } : {}),
        ...(first?.talare ? { Speaker: first.talare } : {}),
      },
    };
  }

  // For single law / proposition detail
  const dokId = resultObj.dokId as string | undefined;
  const urls = buildDocUrls(dokId);
  return {
    id: `${toolName}-${Date.now()}`,
    title: resultObj.titel as string ?? resultObj.beteckning as string ?? toolName,
    subtitle: resultObj.beteckning as string ?? dokId ?? undefined,
    content: resultStr,
    type: canvasType,
    dokId,
    ...urls,
    metadata: {
      ...(resultObj.beteckning ? { SFS: resultObj.beteckning } : {}),
      ...(resultObj.datum ? { Date: resultObj.datum } : {}),
      ...(resultObj.organ ? { Organ: resultObj.organ } : {}),
    },
  };
}

type ToolFallbackProps = {
  toolName: string;
  argsText: string;
  result?: unknown;
  status: { type: string; reason?: string; error?: unknown };
  [key: string]: unknown;
};

export const ToolFallback: FC<ToolFallbackProps> = ({
  toolName,
  argsText,
  result,
  status,
}) => {
  const [open, setOpen] = useState(false);
  const openCanvas = useCanvasStore((s) => s.open);
  const browserUseApiKey = useBrowserUseStore((s) => s.apiKey);
  const meta = TOOL_META[toolName] ?? { label: toolName, icon: SearchIcon };
  const Icon = meta.icon;
  const isRunning = status.type === "running";
  const isError = status.type === "incomplete" && status.reason === "error";
  const isCancelled = status.type === "incomplete" && status.reason === "cancelled";
  const isComplete = status.type === "complete";
  const isReadingSource = toolName === "readSourceMaterial";

  let parsedArgs: Record<string, unknown> | null = null;
  try {
    parsedArgs = JSON.parse(argsText);
  } catch {
    // noop
  }

  const readingLabel = (() => {
    if (!isReadingSource || !parsedArgs) return null;
    const sourceType = parsedArgs.sourceType as string | undefined;
    const offset = parsedArgs.offset as number | undefined;
    switch (sourceType) {
      case "riksdagen-document":
        return `Läser Riksdagsdokument${parsedArgs.dokId ? ` (${parsedArgs.dokId})` : ""}${offset ? ` från offset ${offset}` : ""}`;
      case "lagen-nu":
        return `Läser lagen.nu${parsedArgs.input ? ` — ${parsedArgs.input}` : ""}${offset ? ` från offset ${offset}` : ""}`;
      case "dom-page":
        return `Läser sida${parsedArgs.url ? ` — ${(parsedArgs.url as string).slice(0, 60)}` : ""}${offset ? ` från offset ${offset}` : ""}`;
      case "web-research-artifact":
        return `Läser forskningsartefakt${parsedArgs.fileName ? ` — ${parsedArgs.fileName}` : ""}${offset ? ` från offset ${offset}` : ""}`;
      default:
        return null;
    }
  })();

  const readingResultPreview = (() => {
    if (!isReadingSource || !isComplete || result == null) return null;
    const resultObj = typeof result === "object" && result !== null ? result as Record<string, unknown> : null;
    if (!resultObj) return null;
    const chunk = (resultObj.chunk ?? resultObj.content ?? resultObj.mainText) as string | undefined;
    const totalChars = resultObj.totalChars as number | undefined;
    const chunkStart = resultObj.chunkStart as number | undefined;
    const chunkEnd = resultObj.chunkEnd as number | undefined;
    const isCompleteRead = resultObj.isComplete as boolean | undefined;
    const title = resultObj.title as string | undefined;
    return {
      title,
      chunk: chunk?.slice(0, 300),
      chunkLength: chunk?.length,
      totalChars,
      chunkStart,
      chunkEnd,
      isCompleteRead,
    };
  })();

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-lg border transition-colors",
        isRunning && "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30",
        isComplete && "border-border bg-card",
        isError && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30",
        isCancelled && "border-border bg-muted/50 opacity-60",
      )}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Status indicator */}
        {isRunning && (
          <LoaderIcon className="size-4 shrink-0 animate-spin text-blue-500" />
        )}
        {isComplete && (
          <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" />
        )}
        {isError && (
          <XCircleIcon className="size-4 shrink-0 text-red-500" />
        )}
        {isCancelled && (
          <XCircleIcon className="size-4 shrink-0 text-muted-foreground" />
        )}

        <Icon className="size-4 shrink-0 text-muted-foreground" />

        <span className="flex-1 truncate font-medium">
          {isRunning
            ? (readingLabel ?? meta.label)
            : `Använde: ${readingLabel ?? meta.label}`}
        </span>

        {/* Inline arg preview */}
        {parsedArgs && !readingLabel && (
          <span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:inline">
            {Object.values(parsedArgs).filter((v) => typeof v === "string").join(", ")}
          </span>
        )}

        {/* Reading progress for readSourceMaterial */}
        {readingResultPreview && (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {readingResultPreview.chunkLength != null && readingResultPreview.totalChars != null
              ? `${readingResultPreview.chunkLength.toLocaleString()} / ${readingResultPreview.totalChars.toLocaleString()} chars`
              : readingResultPreview.chunkLength != null
                ? `${readingResultPreview.chunkLength.toLocaleString()} chars read`
                : null}
            {readingResultPreview.isCompleteRead ? " ✓" : " →"}
          </span>
        )}

        {open ? (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t px-3 py-2 text-xs">
          {parsedArgs && (
            <div className="mb-2">
              <p className="mb-1 font-medium text-muted-foreground">Argument</p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px] leading-relaxed">
                {JSON.stringify(parsedArgs, null, 2)}
              </pre>
            </div>
          )}
          {isError && (
            <div className="mb-2 rounded bg-red-50 p-2 text-red-700 dark:bg-red-950/50 dark:text-red-300">
              Tool execution failed
            </div>
          )}
          {readingResultPreview && readingResultPreview.chunk && (
            <div className="mb-2">
              <p className="mb-1 font-medium text-muted-foreground">
                Förhandsgranskning{readingResultPreview.title ? ` — ${readingResultPreview.title}` : ""}
              </p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-amber-50/50 p-2 text-[11px] leading-relaxed dark:bg-amber-950/20">
                {readingResultPreview.chunk}{readingResultPreview.chunk.length >= 300 ? "…" : ""}
              </pre>
            </div>
          )}
          {result != null && !readingResultPreview && (
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Resultat</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px] leading-relaxed">
                {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
          {isComplete && result != null && meta.canvasType && (
            <button
              type="button"
              className="mt-2 flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              onClick={(e) => {
                e.stopPropagation();
                openCanvas({
                  ...extractCanvasItem(toolName, meta.canvasType!, result),
                  // Pass the API key for polling — canvas needs it to check task status
                  ...(meta.canvasType === "browser-research" ? { browserUseApiKey } : {}),
                });
              }}
            >
              <PanelRightOpenIcon className="size-3.5" />
              Öppna i Canvas
            </button>
          )}
        </div>
      )}
    </div>
  );
};
