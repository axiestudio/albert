import {
  type FC,
  type PropsWithChildren,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuiState } from "@assistant-ui/react";
import type { ReasoningGroupComponent } from "@assistant-ui/react";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Reasoning (individual part) ──────────────────────────────────────────
export const Reasoning: FC<{ text: string }> = ({ text }) => {
  return (
    <p className="whitespace-pre-wrap px-4 py-2 text-sm leading-relaxed text-muted-foreground italic">
      {text}
    </p>
  );
};

// ─── ReasoningGroup (wraps consecutive reasoning parts) ───────────────────
export const ReasoningGroup: ReasoningGroupComponent = ({
  children,
  startIndex,
  endIndex,
}) => {
  const isReasoningStreaming = useAuiState((s) => {
    if (s.message.status?.type !== "running") return false;
    const lastIndex = s.message.parts.length - 1;
    if (lastIndex < 0) return false;
    const lastType = s.message.parts[lastIndex]?.type;
    if (lastType !== "reasoning") return false;
    return lastIndex >= startIndex && lastIndex <= endIndex;
  });

  // Check if this reasoning group is the last one in the message
  const isLastReasoningGroup = useAuiState((s) => {
    const parts = s.message.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i]?.type === "reasoning") {
        return i >= startIndex && i <= endIndex;
      }
    }
    return false;
  });

  // Check if message is complete (not streaming)
  const isComplete = useAuiState(
    (s) => s.message.status?.type !== "running",
  );

  // Auto-collapse completed reasoning groups except the last one
  const shouldAutoCollapse = isComplete && !isLastReasoningGroup;

  return (
    <ReasoningRoot
      defaultOpen={isReasoningStreaming}
      autoCollapse={shouldAutoCollapse}
    >
      <ReasoningTrigger active={isReasoningStreaming} />
      <ReasoningContent aria-busy={isReasoningStreaming}>
        {children}
      </ReasoningContent>
    </ReasoningRoot>
  );
};

// ─── ReasoningRoot (collapsible container) ────────────────────────────────
const ReasoningRoot: FC<
  PropsWithChildren<{ defaultOpen?: boolean; autoCollapse?: boolean }>
> = ({ children, defaultOpen = false, autoCollapse = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const prevDefaultOpen = useRef(defaultOpen);

  // Open when streaming starts
  useEffect(() => {
    if (defaultOpen && !prevDefaultOpen.current) {
      setOpen(true);
    }
    prevDefaultOpen.current = defaultOpen;
  }, [defaultOpen]);

  // Auto-collapse completed non-last reasoning groups
  useEffect(() => {
    if (autoCollapse) {
      setOpen(false);
    }
  }, [autoCollapse]);

  return (
    <div
      className="my-2 overflow-hidden rounded-lg border border-border/60"
      data-state={open ? "open" : "closed"}
    >
      {/* Pass open/setOpen through context-like pattern via cloning is too complex;
          instead we use a simple nesting approach with the data attribute */}
      <div
        data-reasoning-open={open ? "true" : "false"}
        onClick={(e) => {
          // Only toggle if the trigger button itself was clicked
          const target = e.target as HTMLElement;
          if (target.closest("[data-reasoning-trigger]")) {
            setOpen((o) => !o);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ─── ReasoningTrigger ─────────────────────────────────────────────────────
const ReasoningTrigger: FC<{ active?: boolean }> = ({ active }) => {
  return (
    <button
      type="button"
      data-reasoning-trigger
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50",
        active && "bg-muted/30",
      )}
    >
      <BrainIcon className={cn(
        "size-4 shrink-0",
        active ? "text-blue-500" : "text-muted-foreground",
      )} />
      <span className="flex items-center gap-2">
        {active ? "Tänker" : "Tanke"}
        {active && (
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
          </span>
        )}
      </span>
      <ChevronDownIcon
        className={cn(
          "ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200",
          "[div[data-reasoning-open='false']_&]:rotate-(-90)",
        )}
      />
    </button>
  );
};

// ─── ReasoningContent (animated collapse) ─────────────────────────────────
const ReasoningContent: FC<PropsWithChildren<{ "aria-busy"?: boolean }>> = ({
  children,
  ...props
}) => {
  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-in-out [div[data-reasoning-open='false']_&]:max-h-0 [div[data-reasoning-open='true']_&]:max-h-[2000px]"
      {...props}
    >
      <div className="border-t border-border/40 px-1 py-2">{children}</div>
    </div>
  );
};
