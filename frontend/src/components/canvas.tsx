import { type FC, useRef, useEffect, useState, useCallback } from "react";
import {
  XIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  CopyIcon,
  CheckIcon,
  ScaleIcon,
  FileTextIcon,
  LinkIcon,
  SearchIcon,
  MaximizeIcon,
  MinimizeIcon,
  GlobeIcon,
  CodeIcon,
  TableIcon,
  MonitorIcon,
  CloudIcon,
} from "lucide-react";
import { useCanvasStore } from "@/stores/canvas-store";
import type { CanvasItemType, CanvasViewMode, ResearchStatus } from "@/stores/canvas-store";
import { cn } from "@/lib/utils";

const TYPE_META: Record<
  CanvasItemType,
  { label: string; icon: FC<{ className?: string }>; color: string }
> = {
  law: { label: "Lagdokument", icon: ScaleIcon, color: "text-blue-600 dark:text-blue-400" },
  proposition: { label: "Proposition", icon: FileTextIcon, color: "text-purple-600 dark:text-purple-400" },
  chain: { label: "Lagstiftningskedja", icon: LinkIcon, color: "text-emerald-600 dark:text-emerald-400" },
  "search-results": { label: "Sökresultat", icon: SearchIcon, color: "text-amber-600 dark:text-amber-400" },
  votes: { label: "Riksdagsvoteringar", icon: TableIcon, color: "text-rose-600 dark:text-rose-400" },
  debates: { label: "Debattanföranden", icon: FileTextIcon, color: "text-teal-600 dark:text-teal-400" },
  "lagen-nu": { label: "Lagen.nu-dokument", icon: GlobeIcon, color: "text-orange-600 dark:text-orange-400" },
  "dom-analysis": { label: "Sidanalys", icon: MonitorIcon, color: "text-cyan-600 dark:text-cyan-400" },
  "browser-research": { label: "Webbforskning", icon: CloudIcon, color: "text-violet-600 dark:text-violet-400" },
};

const VIEW_TABS: Array<{ mode: CanvasViewMode; label: string; icon: FC<{ className?: string }> }> = [
  { mode: "html", label: "Dokument", icon: GlobeIcon },
  { mode: "text", label: "Text", icon: CodeIcon },
  { mode: "metadata", label: "Detaljer", icon: TableIcon },
];

export const Canvas: FC = () => {
  const { isOpen, item, history, viewMode, researchStatus, close, back, setViewMode, setResearchStatus, updateItemContent } = useCanvasStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
    setTextContent(null);
  }, [item?.id]);

  // Fetch plain text version on demand
  useEffect(() => {
    if (viewMode !== "text" || !item?.textUrl || textContent !== null) return;
    let cancelled = false;
    setTextLoading(true);
    fetch(item.textUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("fetch failed"))))
      .then((text) => { if (!cancelled) setTextContent(text); })
      .catch(() => { if (!cancelled) setTextContent("[Failed to load text content]"); })
      .finally(() => { if (!cancelled) setTextLoading(false); });
    return () => { cancelled = true; };
  }, [viewMode, item?.textUrl, textContent]);

  // ── Research status polling ─────────────────────────────────────────
  // When the canvas shows a live browser research session, poll the task
  // status every 6 seconds. When the task finishes, update the canvas
  // content with the final output and switch to the report view.
  // NOTE: This hook MUST be called before any early return to satisfy
  // the Rules of Hooks (consistent call order on every render).
  const isBrowserResearch = item?.type === "browser-research";
  useEffect(() => {
    if (!isBrowserResearch || !item?.taskId || !item?.browserUseApiKey || researchStatus !== "running") {
      return;
    }

    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 40; // ~4 minutes at 6s intervals

    const poll = async () => {
      if (cancelled || pollCount >= maxPolls) {
        if (!cancelled) setResearchStatus("stopped");
        return;
      }
      pollCount++;

      try {
        const res = await fetch(`/api/research-poll?taskId=${item.taskId}`, {
          headers: { "x-browser-use-key": item.browserUseApiKey! },
        });
        if (!res.ok || cancelled) return;

        const data = await res.json() as {
          status?: string;
          output?: string;
          isSuccess?: boolean;
          steps?: unknown[];
          outputFiles?: Array<{ fileName: string }>;
        };

        if (data.status === "finished" || data.status === "stopped") {
          if (!cancelled) {
            updateItemContent(
              data.output || item.content,
              {
                Status: data.status,
                Success: data.isSuccess ?? false,
                Steps: data.steps?.length ?? 0,
                Artifacts: data.outputFiles?.map((f) => f.fileName).join(", ") ?? "",
              },
            );
            // Auto-switch to text/report view
            setViewMode("text");
          }
          return;
        }
      } catch {
        // Non-fatal — continue polling
      }

      if (!cancelled) {
        globalThis.setTimeout(poll, 6000);
      }
    };

    // Start first poll after 5 seconds (give the task time to initialize)
    const initialTimer = globalThis.setTimeout(poll, 5000);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(initialTimer);
    };
  }, [isBrowserResearch, item?.taskId, item?.browserUseApiKey, researchStatus, setResearchStatus, updateItemContent, setViewMode, item?.content]);

  if (!isOpen || !item) return null;

  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const hasLiveUrl = !!item.liveUrl;
  const hasHtmlUrl = !!item.htmlUrl;
  const hasTextUrl = !!item.textUrl;
  const isResearchRunning = isBrowserResearch && researchStatus === "running";
  const isResearchFinished = isBrowserResearch && researchStatus === "finished";

  const handleCopy = async () => {
    const text = viewMode === "text" && textContent ? textContent : item.content;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Only show Riksdagen link for non-browser-research items
  const riksdagenUrl = isBrowserResearch ? undefined : (item.statusUrl ?? item.htmlUrl);

  return (
    <div
      className={cn(
        "flex flex-col border-border bg-background transition-all duration-300",
        // Mobile: full-screen overlay; Desktop: side panel
        "fixed inset-0 z-40 border-l md:static md:inset-auto md:z-auto",
        expanded ? "md:w-[60%]" : "md:w-[40%] md:min-w-80 md:max-w-xl",
      )}
    >
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-4">
        {history.length > 0 && (
          <button
            type="button"
            onClick={back}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Gå tillbaka"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
        )}

        <div className={cn("flex size-7 items-center justify-center rounded-md", meta.color)}>
          <Icon className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{item.title}</p>
          {item.subtitle && (
            <p className="truncate text-[11px] text-muted-foreground">{item.subtitle}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {riksdagenUrl && (
            <a
              href={riksdagenUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Öppna på Riksdagen"
            >
              <ExternalLinkIcon className="size-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Kopiera innehåll"
          >
            {copied ? (
              <CheckIcon className="size-3.5 text-emerald-500" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={expanded ? "Fäll ihop" : "Expandera"}
          >
            {expanded ? <MinimizeIcon className="size-3.5" /> : <MaximizeIcon className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={close}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Stäng canvas"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex border-b border-border/40 bg-muted/20">
        {/* Live tab for browser research */}
        {hasLiveUrl && (
          <button
            type="button"
            onClick={() => setViewMode("html")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors",
              viewMode === "html"
                ? "border-b-2 border-violet-500 text-violet-600 dark:text-violet-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CloudIcon className="size-3.5" />
            Liveförhandsvisning
          </button>
        )}
        {VIEW_TABS.filter((tab) => {
          if (tab.mode === "html") return !hasLiveUrl && hasHtmlUrl;
          if (tab.mode === "text") return hasTextUrl || item.content;
          return true;
        }).map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.mode}
              type="button"
              onClick={() => setViewMode(tab.mode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors",
                viewMode === tab.mode
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <TabIcon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Metadata bar */}
      {item.metadata && Object.keys(item.metadata).length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border/40 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          {Object.entries(item.metadata)
            .filter(([, v]) => v != null && v !== "")
            .slice(0, 6)
            .map(([key, value]) => (
              <span key={key}>
                <span className="font-medium text-foreground/70">
                  {formatMetaLabel(key)}:
                </span>{" "}
                {String(value)}
              </span>
            ))}
        </div>
      )}

      {/* Content area */}
      <div ref={contentRef} className="flex-1 overflow-hidden">
        {/* Live browser stream for web research — URL is hidden from user */}
        {viewMode === "html" && hasLiveUrl && (
          <div className="relative size-full">
            {isResearchRunning && (
              <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-violet-500/90 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <div className="size-2 animate-pulse rounded-full bg-white" />
                Forskningsagenten arbetar — livevy från webbläsaren
              </div>
            )}
            {isResearchFinished && (
              <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-emerald-500/90 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <CheckIcon className="size-3.5" />
                Forskning avslutad — byt till textfliken för att läsa rapporten
              </div>
            )}
            {!isResearchRunning && !isResearchFinished && (
              <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-violet-500/90 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <div className="size-2 animate-pulse rounded-full bg-white" />
                Forskningsagenten arbetar — livevy från webbläsaren
              </div>
            )}
            <iframe
              src={item.liveUrl!}
              title="Forskningsvy"
              className="size-full border-0 pt-7"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        )}

        {viewMode === "html" && !hasLiveUrl && item.htmlUrl && (
          <iframe
            src={item.htmlUrl}
            title={item.title}
            className="size-full border-0"
            sandbox="allow-same-origin"
          />
        )}

        {viewMode === "text" && (
          <div className="size-full overflow-y-auto scroll-smooth px-5 py-4">
            {textLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                Laddar textinnehåll…
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-foreground/90">
                {(hasTextUrl && textContent) || item.content}
              </pre>
            )}
          </div>
        )}

        {viewMode === "metadata" && (
          <div className="size-full overflow-y-auto scroll-smooth px-5 py-4">
            <div className="space-y-4">
              {item.metadata && Object.keys(item.metadata).length > 0 && (
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="mb-3 text-sm font-semibold">Dokumentinformation</h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    {Object.entries(item.metadata)
                      .filter(([, v]) => v != null && v !== "")
                      .map(([key, value]) => (
                        <div key={key} className="contents">
                          <dt className="font-medium text-muted-foreground">{formatMetaLabel(key)}</dt>
                          <dd className="break-words">{String(value)}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              )}
              {item.content && (
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="mb-3 text-sm font-semibold">Rådata</h3>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                    {item.content}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
        <span>{meta.label}</span>
        {isBrowserResearch && isResearchRunning && (
          <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
            <div className="size-1.5 animate-pulse rounded-full bg-violet-500" />
            Live
          </span>
        )}
        {isBrowserResearch && isResearchFinished && (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckIcon className="size-3" />
            Avslutad
          </span>
        )}
        {riksdagenUrl && (
          <a
            href={riksdagenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            View on Riksdagen
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
};

function formatMetaLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/_/g, " ")
    .trim();
}
