import type { FC } from "react";
import { EyeIcon, EyeOffIcon, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlbertSupermemoryStore } from "@/stores/albert-supermemory-store";

type AlbertSupermemorySettingsProps = {
  onClose: () => void;
  open: boolean;
  userLabel?: string;
};

export const AlbertSupermemorySettings: FC<AlbertSupermemorySettingsProps> = ({
  onClose,
  open,
  userLabel,
}) => {
  const { apiKey, clear, keyVisible, setApiKey, toggleKeyVisible } = useAlbertSupermemoryStore();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto overscroll-y-contain bg-black/45 px-3 py-3 sm:items-center sm:px-4 sm:py-6">
      <div className="flex max-h-[min(92dvh,44rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] border border-border bg-background shadow-2xl sm:rounded-3xl">
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-border/60 p-4 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <KeyRound className="size-4 text-primary" />
              Albert Superminne
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Albert använder Supermemory bara när du anger din egen API-nyckel. Nyckeln sparas i denna webbläsare för
              {userLabel ? ` ${userLabel}` : " denna lokala installation"}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Stäng
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-y-contain p-4 sm:p-6">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldCheck className="size-4 text-emerald-600" />
              Lokal konfiguration
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Supermemory är valfri i Albert OSS. När du anger en nyckel använder Albert den från denna webbläsare,
              annars fortsätter appen med lokal chatthistorik utan Supermemory-berikning.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="albert-supermemory-api-key" className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              API-nyckel
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <input
                  id="albert-supermemory-api-key"
                  type={keyVisible ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value.trim())}
                  placeholder="sm_..."
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(
                    "h-11 w-full rounded-xl border border-border bg-background px-3 pr-10 font-mono text-sm",
                    "placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30",
                  )}
                />
                <button
                  type="button"
                  onClick={toggleKeyVisible}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  title={keyVisible ? "Dölj API-nyckel" : "Visa API-nyckel"}
                >
                  {keyVisible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={clear}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:size-11 sm:w-auto"
                title="Rensa API-nyckel"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Om detta fält är tomt hoppar Albert över Supermemory och fortsätter med vanlig lokal historik.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};