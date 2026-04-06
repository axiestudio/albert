import type { FC } from "react";
import { LogOut, PanelLeft, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlbertIcon } from "./AlbertIcon";

type ChatHeaderProps = {
  onToggleHistory?: () => void;
  onNewChat?: () => void;
  onSignOut?: () => void;
  signingOut?: boolean;
};

export const ChatHeader: FC<ChatHeaderProps> = ({
  onNewChat,
  onSignOut,
  onToggleHistory,
  signingOut = false,
}) => {
  return (
    <header
      role="banner"
      className="sticky top-0 z-50 flex h-16 shrink-0 items-center border-b border-border/40 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60 sm:h-14"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-2.5 sm:gap-3 sm:px-4">
        {/* Left: Logo + Brand */}
        <div className="flex min-w-0 items-center gap-2.5">
          {onToggleHistory && (
            <button
              type="button"
              onClick={onToggleHistory}
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="Växla sidopanel"
              aria-label="Växla sidopanel"
            >
              <PanelLeft className="size-4.5" />
            </button>
          )}

          <div className="relative shrink-0">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <AlbertIcon size={20} />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-[1.5px] border-background bg-emerald-500" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="m-0 truncate text-[13px] font-semibold leading-tight sm:text-sm">
                ALBERT
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <Sparkles className="size-3" />
                AI
              </span>
            </div>
            <p className="m-0 max-w-[48vw] truncate text-[10.5px] text-muted-foreground sm:max-w-none sm:text-[11px]">
              Svensk rätt i klartext med spårade källor och guidat forskningsstöd
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {onNewChat && (
            <button
              type="button"
              onClick={onNewChat}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors sm:px-3 sm:py-1.5",
                "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              title="Ny chatt"
            >
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">Ny chatt</span>
            </button>
          )}
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors sm:px-3 sm:py-1.5",
                "text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60",
              )}
              title="Logga ut"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">{signingOut ? 'Loggar ut...' : 'Logga ut'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
