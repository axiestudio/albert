import { type FC, useCallback } from "react";
import {
  BotIcon,
  EyeIcon,
  EyeOffIcon,
  Trash2Icon,
  KeyIcon,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrowserUseStore } from "@/stores/browser-use-store";

export const BrowserUseSettings: FC<{
  authenticated: boolean;
  className?: string;
  onClose: () => void;
  open: boolean;
  userLabel?: string;
}> = ({
  authenticated: _authenticated,
  className,
  onClose,
  open,
  userLabel,
}) => {
  const { enabled, apiKey, keyVisible, setEnabled, setApiKey, toggleKeyVisible, clear } =
    useBrowserUseStore();

  const handleKeyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setApiKey(e.target.value.trim());
    },
    [setApiKey],
  );

  const maskedKey =
    apiKey.length > 8
      ? `${apiKey.slice(0, 4)}${"•".repeat(Math.min(apiKey.length - 8, 20))}${apiKey.slice(-4)}`
      : "•".repeat(apiKey.length);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto overscroll-y-contain bg-black/45 px-3 py-3 sm:items-center sm:px-4 sm:py-6">
      <div
        className={cn(
          "flex max-h-[min(92dvh,44rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] border border-border bg-background shadow-2xl sm:rounded-3xl",
          className,
        )}
      >
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-border/60 p-4 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BotIcon className="size-4 text-violet-500" />
              Forskningsagent
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Albert använder forskningsagenten enbart som komplement efter de centrala svenska rättsverktygen.
              Nyckeln sparas i denna webbläsare för{userLabel ? ` ${userLabel}` : " denna lokala installation"}.
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
              Forskningsagenten i Albert OSS använder bara din lokala nyckel. När den är aktiverad skickar Albert nyckeln till
              backend för uttryckligen begärd kompletterande forskning på godkända juridiska domäner.
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-card/50 p-4">
            <div className="flex items-center gap-2">
              <BotIcon className="size-4 text-violet-500" />
              <div>
                <p className="text-sm font-medium text-foreground">Aktivera forskningsagent</p>
                <p className="text-xs text-muted-foreground">Slår på kompletterande flersidig forskning när Albert behöver djupare navigering.</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors",
                enabled ? "bg-violet-500" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform",
                  enabled ? "translate-x-[18px]" : "translate-x-[3px]",
                )}
              />
            </button>
          </div>

          <div className="space-y-2">
              <label htmlFor="research-agent-api-key" className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                API-nyckel
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <input
                    id="research-agent-api-key"
                    type={keyVisible ? "text" : "password"}
                    value={keyVisible ? apiKey : maskedKey}
                    onChange={handleKeyChange}
                    onFocus={() => { if (!keyVisible) toggleKeyVisible(); }}
                    placeholder="Ange nyckel..."
                    autoComplete="off"
                    spellCheck={false}
                    className={cn(
                      "h-11 w-full rounded-xl border border-border bg-background px-3 pr-10 font-mono text-sm",
                      "placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-500/30",
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
                  <Trash2Icon className="size-4" />
                </button>
              </div>
              {!apiKey && (
                <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  <KeyIcon className="size-3" />
                  Ingen omdirigering. Klistra in din befintliga nyckel här.
                </div>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Nyckel sparas lokalt. Albert skickar den bara när forskningsagenten är aktiverad och behandlar fortfarande
                officiellt Riksdagsmaterial som den primära auktoriteten.
              </p>
            </div>
        </div>
      </div>
    </div>
  );
};
