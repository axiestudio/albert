import { type CSSProperties, type FC, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  TextMessagePartProvider,
  ThreadPrimitive,
  type SourceMessagePartComponent,
  type TextMessagePartComponent,
  useAuiState,
} from "@assistant-ui/react";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import "katex/dist/katex.min.css";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  LoaderIcon,
  PanelRightOpenIcon,
  PencilIcon,
  RefreshCwIcon,
  ServerIcon,
  SparklesIcon,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LAW_LLM_OPTIONS, type LawLlmMode } from "@/lib/law-llm";
import { useComposerActionsStore } from "@/stores/composer-actions-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { buildLawEvidenceCanvasItem, collectLawEvidenceFromMessageParts, splitLawResponseEvidence } from "@/lib/law-message-evidence";
import { AlbertIcon } from "./AlbertIcon";
import { EnterpriseChainOfThought } from "./EnterpriseChainOfThought";
import { Sources } from "./sources";

// ─── Drop-up listbox (enterprise bottom-anchor pattern) ───────────────────
function ServerModeSelector({
  onChange,
  value,
}: {
  onChange: (mode: LawLlmMode) => void;
  value: LawLlmMode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });

  const selected = LAW_LLM_OPTIONS.find((o) => o.value === value) ?? LAW_LLM_OPTIONS[0];

  const handleSelect = useCallback(
    (mode: LawLlmMode) => {
      onChange(mode);
      setOpen(false);
    },
    [onChange],
  );

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - rect.top + 6,
      left: rect.left,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Albert inference server"
        className="relative flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-border/50 bg-muted/50 py-0.5 pr-7 pl-7 text-xs font-medium tracking-wide text-foreground transition-colors hover:bg-muted focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10 sm:h-7 sm:text-[10.5px]"
      >
        <ServerIcon className="pointer-events-none absolute left-2 size-3 text-muted-foreground/60" />
        {selected.label}
        <ChevronDownIcon
          className={cn(
            "pointer-events-none absolute right-1.5 size-3 text-muted-foreground/60 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          aria-label="Albert inference server"
          style={{ position: "fixed", bottom: `${pos.bottom}px`, left: `${pos.left}px` }}
          className="z-[60] min-w-[10rem] overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {LAW_LLM_OPTIONS.map((option) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                option.value === value
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <ServerIcon className="size-3 shrink-0 text-muted-foreground/60" />
              <div>
                <span className="block font-medium">{option.label}</span>
                <span className="block text-[10px] text-muted-foreground">{option.description}</span>
              </div>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

// ─── StreamdownText with plugins ──────────────────────────────────────────
const StreamdownText: FC = () => (
  <StreamdownTextPrimitive
    plugins={{ code, math, mermaid }}
    shikiTheme={["github-light", "github-dark"]}
    caret="block"
  />
);

const LawMessageText: TextMessagePartComponent = ({ status, text }) => {
  const { displayText } = splitLawResponseEvidence(text);
  if (!displayText.trim() && status.type !== "running") {
    return null;
  }

  return (
    <TextMessagePartProvider text={displayText} isRunning={status.type === "running"}>
      <StreamdownText />
    </TextMessagePartProvider>
  );
};

const HiddenSource: SourceMessagePartComponent = () => null;

// ─── Main Thread ──────────────────────────────────────────────────────────
export const MyThread: FC = () => {
  return (
    <ThreadPrimitive.Root
      className="flex h-full flex-col bg-background text-[13px]"
      style={{
        "--thread-max-width": "56rem",
      } as CSSProperties}
    >
      <ThreadPrimitive.Viewport
        autoScroll
        turnAnchor="bottom"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-auto overscroll-y-contain px-3 pt-3 sm:px-4 sm:pt-4"
      >
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <WelcomeScreen />
        </AuiIf>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            EditComposer,
            AssistantMessage,
          }}
        />

        <ThreadPrimitive.ViewportFooter className="albert-safe-area-bottom sticky bottom-0 mx-auto mt-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 overflow-visible rounded-t-3xl bg-background pb-3 sm:pb-4">
          <ThreadScrollToBottom />
          <Composer />
          <FooterDisclaimer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

// ─── Welcome Screen ───────────────────────────────────────────────────────
const WelcomeScreen: FC = () => {
  return (
    <div className="mx-auto my-auto flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col">
      <div className="flex w-full flex-grow flex-col items-center justify-center">
        <div className="flex size-full flex-col justify-center px-4 sm:px-8">
          <div className="flex items-center gap-3 text-xl font-semibold sm:text-2xl">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <AlbertIcon size={22} className="text-primary" />
            </div>
            ALBERT
          </div>
          <div className="mt-2 text-base text-muted-foreground/65 sm:text-lg">
            Förklarar svensk rätt i klartext — med juridisk analys,
            spårade rättskällor och eventuella reservationer.
          </div>
        </div>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-3 sm:px-0">
        <ThreadPrimitive.Suggestion
          prompt="Förklara LAS i klarspråk. Vad säger lagen om uppsägning av personliga skäl, vilka paragrafer styr och vilka förbehåll ska jag tänka på?"
          asChild
        >
          <button
            type="button"
            className="flex h-auto w-full flex-col items-start justify-start gap-1 rounded-2xl border px-5 py-4 text-left text-sm transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 font-medium">
              <BookOpenIcon className="size-3.5" />
              LAS i klarspråk
            </span>
            <span className="text-muted-foreground">
              Uppsägning och styrande paragrafer
            </span>
          </button>
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion
          prompt="Which Swedish rules implement GDPR for a SaaS product handling customer data? Cite the relevant SFS numbers, explain them in plain language first, and include the key preparatory works."
          asChild
        >
          <button
            type="button"
            className="flex h-auto w-full flex-col items-start justify-start gap-1 rounded-2xl border px-5 py-4 text-left text-sm transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 font-medium">
              <BrainIcon className="size-3.5" />
              GDPR för SaaS
            </span>
            <span className="text-muted-foreground">
              Svenska regler och förarbeten
            </span>
          </button>
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion
          prompt="Spåra lagstiftningskedjan bakom Arbetsmiljölagen och sammanfatta syftet med propositionen, de viktigaste rättskällorna och eventuella tolkningsrisker."
          asChild
        >
          <button
            type="button"
            className="flex h-auto w-full flex-col items-start justify-start gap-1 rounded-2xl border px-5 py-4 text-left text-sm transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 font-medium">
              <SparklesIcon className="size-3.5" />
              Lagstiftningskedja
            </span>
            <span className="text-muted-foreground">Arbetsmiljölagen</span>
          </button>
        </ThreadPrimitive.Suggestion>
      </div>
    </div>
  );
};

// ─── Thread Scroll To Bottom ──────────────────────────────────────────────
function ThreadScrollToBottom() {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <button
        type="button"
        className="absolute -top-12 z-10 self-center rounded-full border bg-background p-2 shadow-md transition-colors hover:bg-muted disabled:invisible"
        title="Skrolla till botten"
      >
        <ArrowDownIcon className="size-4" />
      </button>
    </ThreadPrimitive.ScrollToBottom>
  );
}

// ─── Footer Disclaimer ────────────────────────────────────────────────────
function FooterDisclaimer() {
  return (
    <div className="flex items-center justify-center gap-1.5 px-4 text-center text-[10.5px] leading-relaxed text-muted-foreground/40 sm:text-[11px]">
      <span>Albert kan göra fel — verifiera alltid med officiella rättskällor.</span>
      <span className="hidden sm:inline" aria-hidden="true">·</span>
      <span className="hidden sm:inline">Driven av Riksdagen &amp; lagen.nu</span>
    </div>
  );
}

// ─── User Message ─────────────────────────────────────────────────────────
function UserMessage() {
  return (
    <MessagePrimitive.Root
      className="mx-auto grid w-full max-w-[var(--thread-max-width)] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-2 fade-in slide-in-from-bottom-1 animate-in duration-150"
      data-role="user"
    >
      <div className="relative col-start-2 min-w-0">
        <div className="rounded-2xl bg-muted px-4 py-2.5 break-words text-foreground">
          <MessagePrimitive.Parts />
        </div>
        <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
}

function UserActionBar() {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Redigera meddelande"
        >
          <PencilIcon className="size-3.5" />
        </button>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
}

// ─── Edit Composer ────────────────────────────────────────────────────────
function EditComposer() {
  return (
    <MessagePrimitive.Root className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col px-2 py-3">
      <ComposerPrimitive.Root className="ml-auto flex w-full max-w-[85%] flex-col rounded-2xl bg-muted">
        <ComposerPrimitive.Input
          className="min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none"
          autoFocus
        />
        <div className="mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background"
            >
              Avbryt
            </button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Uppdatera
            </button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

// ─── Assistant Message ────────────────────────────────────────────────────
function AssistantMessage() {
  return (
    <MessagePrimitive.Root
      className="relative mx-auto w-full max-w-[var(--thread-max-width)] py-2 fade-in slide-in-from-bottom-1 animate-in duration-150"
      data-role="assistant"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <AlbertIcon size={18} className="text-primary" />
      </div>
      <div className="min-w-0 break-words px-2 leading-relaxed text-foreground">
        <MessagePrimitive.Parts
          components={{
            Text: LawMessageText,
            ChainOfThought: EnterpriseChainOfThought,
            Source: HiddenSource,
          }}
        />
        <MessageError />
        <AuiIf
          condition={(s) =>
            s.thread.isRunning && s.message.content.length === 0
          }
        >
          <div className="flex items-center gap-2 py-2 text-muted-foreground">
            <LoaderIcon className="size-4 animate-spin" />
            <span className="text-sm">Tänker...</span>
          </div>
        </AuiIf>
        <AssistantEvidenceFooter />
      </div>

      <div className="mt-1 ml-2 flex min-h-6 items-center">
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantEvidenceFooter() {
  const openCanvas = useCanvasStore((state) => state.open);
  const parts = useAuiState((state) => state.message.parts);
  const evidence = collectLawEvidenceFromMessageParts(parts);

  if (evidence.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        <BookOpenIcon className="size-3.5" />
        Källor
      </div>
      <div className="flex flex-wrap gap-2">
        {evidence.map((entry) => (
          <div key={entry.key} className="flex items-center gap-1">
            <Sources.Root
              href={entry.url}
              className="group gap-2 border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-foreground hover:bg-background"
            >
              <Sources.Icon url={entry.url} />
              {entry.marker ? (
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                  [{entry.marker}]
                </span>
              ) : null}
              <Sources.Title className="max-w-[15rem]">{entry.title}</Sources.Title>
              <ExternalLinkIcon className="size-3.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
            </Sources.Root>
            <button
              type="button"
              onClick={() => openCanvas(buildLawEvidenceCanvasItem(entry))}
              className="flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              title="Öppna i canvas"
              aria-label={`Öppna ${entry.title} i canvas`}
            >
              <PanelRightOpenIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageError() {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
}

// ─── Assistant Action Bar ─────────────────────────────────────────────────
function AssistantActionBar() {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="-ml-1 flex gap-1 text-muted-foreground"
    >
      <ActionBarPrimitive.Copy asChild>
        <button
          type="button"
          className="rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground"
          title="Kopiera"
        >
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="size-3.5" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="size-3.5" />
          </AuiIf>
        </button>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.ExportMarkdown asChild>
        <button
          type="button"
          className="rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground"
          title="Exportera som Markdown"
        >
          <DownloadIcon className="size-3.5" />
        </button>
      </ActionBarPrimitive.ExportMarkdown>
      <ActionBarPrimitive.Reload asChild>
        <button
          type="button"
          className="rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground"
          title="Generera om"
        >
          <RefreshCwIcon className="size-3.5" />
        </button>
      </ActionBarPrimitive.Reload>
      <ActionBarPrimitive.FeedbackPositive asChild>
        <button
          type="button"
          className="rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground data-[submitted]:text-emerald-500"
          title="Bra svar"
        >
          <ThumbsUpIcon className="size-3.5" />
        </button>
      </ActionBarPrimitive.FeedbackPositive>
      <ActionBarPrimitive.FeedbackNegative asChild>
        <button
          type="button"
          className="rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground data-[submitted]:text-red-500"
          title="Dåligt svar"
        >
          <ThumbsDownIcon className="size-3.5" />
        </button>
      </ActionBarPrimitive.FeedbackNegative>
    </ActionBarPrimitive.Root>
  );
}

// ─── Branch Picker ────────────────────────────────────────────────────────
function BranchPicker({ className }: { className?: string }) {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "mr-2 -ml-2 inline-flex items-center text-xs text-muted-foreground",
        className,
      )}
    >
      <BranchPickerPrimitive.Previous asChild>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-muted disabled:opacity-30"
          title="Föregående"
        >
          <ChevronLeftIcon className="size-3.5" />
        </button>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-muted disabled:opacity-30"
          title="Nästa"
        >
          <ChevronRightIcon className="size-3.5" />
        </button>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────
function Composer() {
  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col">
      <div className="flex w-full flex-col rounded-2xl border border-border/50 bg-card shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] transition-all duration-200 has-[textarea:focus-visible]:border-primary/30 has-[textarea:focus-visible]:shadow-[0_0_0_3px_rgb(var(--primary)/0.06),0_1px_3px_0_rgb(0_0_0/0.04)]">
        <ComposerPrimitive.Input
          placeholder="Fråga om svensk rätt..."
          className="max-h-40 min-h-[2.75rem] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-base leading-relaxed outline-none placeholder:text-muted-foreground/45 focus-visible:ring-0 sm:min-h-[3.25rem] sm:px-5 sm:pt-4 sm:text-[13.5px]"
          rows={1}
          autoFocus
          aria-label="Message input"
        />
        <ComposerAction />
      </div>
    </ComposerPrimitive.Root>
  );
}

function ComposerAction() {
  const lawMode = useComposerActionsStore((s) => s.lawMode);
  const onLawModeChange = useComposerActionsStore((s) => s.onLawModeChange);
  const onOpenLawLlmSettings = useComposerActionsStore((s) => s.onOpenLawLlmSettings);
  const onOpenResearchSettings = useComposerActionsStore((s) => s.onOpenResearchSettings);
  const onOpenSupermemorySettings = useComposerActionsStore((s) => s.onOpenSupermemorySettings);
  const lawModeConfigured = useComposerActionsStore((s) => s.lawModeConfigured);
  const researchConfigured = useComposerActionsStore((s) => s.researchConfigured);
  const supermemoryConfigured = useComposerActionsStore((s) => s.supermemoryConfigured);

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5 pt-1 sm:flex-nowrap">
      {/* Server selector — drop-up listbox */}
      {onLawModeChange && (
        <ServerModeSelector value={lawMode} onChange={onLawModeChange} />
      )}

      {/* Divider */}
      {onLawModeChange && (onOpenLawLlmSettings || onOpenResearchSettings || onOpenSupermemorySettings) && (
        <div className="mx-0.5 hidden h-4 w-px bg-border/60 sm:block" />
      )}

      {/* Settings — compact icon buttons with status indicators */}
      <div className="flex items-center gap-0.5">
        {onOpenLawLlmSettings && (
          <button
            type="button"
            onClick={onOpenLawLlmSettings}
            className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground sm:size-7"
            title="AI-nyckelinställningar"
            aria-label="AI-nyckelinställningar"
          >
            <KeyRoundIcon className="size-4 sm:size-3.5" />
            <span
              className={cn(
                "absolute -top-px -right-px size-1.5 rounded-full ring-1 ring-card",
                lawModeConfigured ? "bg-emerald-500" : "bg-muted-foreground/30",
              )}
            />
          </button>
        )}
        {onOpenResearchSettings && (
          <button
            type="button"
            onClick={onOpenResearchSettings}
            className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground sm:size-7"
            title="Forskningsagent-inställningar"
            aria-label="Forskningsagent-inställningar"
          >
            <BotIcon className="size-4 sm:size-3.5" />
            <span
              className={cn(
                "absolute -top-px -right-px size-1.5 rounded-full ring-1 ring-card",
                researchConfigured ? "bg-emerald-500" : "bg-muted-foreground/30",
              )}
            />
          </button>
        )}
        {onOpenSupermemorySettings && (
          <button
            type="button"
            onClick={onOpenSupermemorySettings}
            className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground sm:size-7"
            title="Supermemory-inställningar"
            aria-label="Supermemory-inställningar"
          >
            <BrainIcon className="size-4 sm:size-3.5" />
            <span
              className={cn(
                "absolute -top-px -right-px size-1.5 rounded-full ring-1 ring-card",
                supermemoryConfigured ? "bg-emerald-500" : "bg-muted-foreground/30",
              )}
            />
          </button>
        )}
      </div>

      {/* Spacer + attribution */}
      <span className="ml-auto mr-2 select-none text-[10px] tracking-wide text-muted-foreground/35">
        Riksdagen
      </span>

      {/* Send / Stop */}
      <AuiIf condition={(s) => !s.thread.isRunning}>
        {lawModeConfigured || !onOpenLawLlmSettings
          ? (
              <ComposerPrimitive.Send asChild>
                <button
                  type="button"
                  className="flex size-10 items-center justify-center rounded-xl bg-foreground text-background transition-all duration-150 hover:opacity-85 active:scale-95 disabled:opacity-30 sm:size-8"
                  title="Skicka meddelande"
                  aria-label="Skicka meddelande"
                >
                  <ArrowUpIcon className="size-5 sm:size-4" />
                </button>
              </ComposerPrimitive.Send>
            )
          : (
              <button
                type="button"
                onClick={onOpenLawLlmSettings}
                className="flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-3 text-xs font-medium text-black transition-all duration-150 hover:bg-amber-400 active:scale-95 sm:h-8"
                title="Konfigurera vald AI-leverantör"
                aria-label="Konfigurera vald AI-leverantör"
              >
                <KeyRoundIcon className="size-4" />
                Konfigurera
              </button>
            )}
      </AuiIf>

      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-xl bg-destructive text-destructive-foreground transition-all duration-150 hover:opacity-85 active:scale-95 sm:size-8"
            title="Stoppa genereringen"
            aria-label="Stoppa genereringen"
          >
            <SquareIcon className="size-3.5 fill-current sm:size-3" />
          </button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  );
}
