import { type FC, useEffect, useRef, useState } from "react";
import {
  ChainOfThoughtPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import {
  BrainIcon,
  ChevronDownIcon,
  LoaderIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Reasoning } from "./reasoning";
import { ToolFallback } from "./ToolFallback";

export const EnterpriseChainOfThought: FC = () => {
  const isRunning = useAuiState((s) => s.message.status?.type === "running");
  // Start expanded while streaming, collapsed for completed messages
  const [isOpen, setIsOpen] = useState(isRunning);
  const prevRunning = useRef(isRunning);

  useEffect(() => {
    // Auto-expand when streaming starts
    if (isRunning && !prevRunning.current) {
      setIsOpen(true);
    }
    // Auto-collapse after thinking finishes
    if (!isRunning && prevRunning.current) {
      const timer = setTimeout(() => setIsOpen(false), 800);
      return () => clearTimeout(timer);
    }
    prevRunning.current = isRunning;
  }, [isRunning]);

  return (
    <ChainOfThoughtPrimitive.Root className="my-3 overflow-hidden rounded-xl border border-border/60 bg-card/70 shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50",
          isRunning && "bg-muted/30",
        )}
      >
        {isRunning ? (
          <LoaderIcon className="size-4 shrink-0 animate-spin text-blue-500" />
        ) : (
          <BrainIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1">
          {isRunning ? "Undersöker rättskällorna" : "Agent-spårning"}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            !isOpen && "-rotate-90",
          )}
        />
      </button>

      {/* Animated collapse via CSS grid-rows trick */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/40 px-2 py-2">
            <ChainOfThoughtPrimitive.Parts>
              {({ part }) => {
                if (part.type === "reasoning") {
                  return <Reasoning text={part.text} />;
                }
                if (part.type === "tool-call") {
                  return (
                    <ToolFallback
                      toolName={part.toolName}
                      argsText={part.argsText}
                      result={part.result}
                      status={part.status}
                    />
                  );
                }
                return null;
              }}
            </ChainOfThoughtPrimitive.Parts>
          </div>
        </div>
      </div>
    </ChainOfThoughtPrimitive.Root>
  );
};
