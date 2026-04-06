import type { FC } from "react";
import {
  Cloud,
  EyeIcon,
  EyeOffIcon,
  Globe,
  KeyRound,
  Server,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAvailableLawLlmOptions,
  getLawLlmModelOptions,
  getLawLlmOption,
  isByokLawLlmMode,
  isVertexLawLlmMode,
  type LawLlmMode,
} from "@/lib/law-llm";
import { useLawLlmByokStore } from "@/stores/law-llm-byok-store";
import { useLawLlmStore } from "@/stores/law-llm-store";

type LawLlmSettingsProps = {
  authenticated: boolean;
  currentMode: LawLlmMode;
  onClose: () => void;
  open: boolean;
  userLabel?: string;
};

function getKeyState(
  mode: LawLlmMode,
  state: ReturnType<typeof useLawLlmByokStore.getState>,
): { apiKey: string; keyVisible: boolean } {
  if (mode === "openai") {
    return { apiKey: state.openaiApiKey, keyVisible: state.openaiKeyVisible };
  }

  if (mode === "anthropic") {
    return { apiKey: state.anthropicApiKey, keyVisible: state.anthropicKeyVisible };
  }

  return { apiKey: state.googleApiKey, keyVisible: state.googleKeyVisible };
}

function usesGoogleKey(mode: LawLlmMode): boolean {
  return mode === "server-1" || isVertexLawLlmMode(mode);
}

function getApiKeyPlaceholder(mode: LawLlmMode): string {
  if (mode === "openai") {
    return "sk-...";
  }

  if (mode === "anthropic") {
    return "sk-ant-...";
  }

  return "AQ....";
}

function getApiKeyLabel(mode: LawLlmMode): string {
  return usesGoogleKey(mode) ? "Google API-nyckel" : "API-nyckel";
}

function getApiKeyHint(mode: LawLlmMode): string {
  if (mode === "server-1") {
    return "Valfri lokal override for Alberts Gemini-flode. Lämna tomt för backend-env fallback.";
  }

  if (isVertexLawLlmMode(mode)) {
    return "Delad Google-nyckel for Vertex-partnermodeller. Lämna tomt för backend-env fallback.";
  }

  return "Nyckeln sparas bara lokalt i denna webbläsare.";
}

const SECTION_META: Record<string, { label: string; icon: FC<{ className?: string }>; description: string }> = {
  managed: {
    label: "Hanterad",
    icon: Server,
    description: "Noll konfiguration — Alberts managerade modeller",
  },
  vertex: {
    label: "Vertex AI",
    icon: Cloud,
    description: "Google Cloud-partnermodeller med lokal projektkonfiguration",
  },
  byok: {
    label: "Egen nyckel",
    icon: KeyRound,
    description: "Klistra in din egen API-nyckel",
  },
};

function getModeSection(mode: LawLlmMode): "managed" | "vertex" | "byok" {
  if (mode === "server-1") return "managed";
  if (isVertexLawLlmMode(mode)) return "vertex";
  return "byok";
}

function getModeAccentColor(mode: LawLlmMode): string {
  switch (mode) {
    case "server-1": return "text-blue-600 dark:text-blue-400";
    case "vertex-claude": return "text-amber-600 dark:text-amber-400";
    case "vertex-mistral": return "text-orange-600 dark:text-orange-400";
    case "vertex-open": return "text-emerald-600 dark:text-emerald-400";
    case "openai": return "text-green-600 dark:text-green-400";
    case "anthropic": return "text-rose-600 dark:text-rose-400";
    default: return "text-primary";
  }
}

function getModeIcon(mode: LawLlmMode): FC<{ className?: string }> {
  if (mode === "server-1") return Zap;
  if (isVertexLawLlmMode(mode)) return Globe;
  return KeyRound;
}

export const LawLlmSettings: FC<LawLlmSettingsProps> = ({
  authenticated: _authenticated,
  currentMode,
  onClose,
  open,
  userLabel,
}) => {
  const store = useLawLlmByokStore();
  const modelByMode = useLawLlmStore((state) => state.modelByMode);
  const setLawLlmModel = useLawLlmStore((state) => state.setModel);

  if (!open) {
    return null;
  }

  const availableModes = getAvailableLawLlmOptions(_authenticated);

  const grouped = {
    managed: availableModes.filter(o => getModeSection(o.value) === "managed"),
    vertex: availableModes.filter(o => getModeSection(o.value) === "vertex"),
    byok: availableModes.filter(o => getModeSection(o.value) === "byok"),
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto overscroll-y-contain bg-black/45 px-3 py-3 sm:items-center sm:px-4 sm:py-6">
      <div className="flex max-h-[min(92dvh,52rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] border border-border bg-background shadow-2xl sm:rounded-3xl">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                <KeyRound className="size-3.5 text-primary" />
              </div>
              AI-modeller och nycklar
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Välj modellkälla för Albert.
              {userLabel ? ` Inställningar för ${userLabel}.` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Stäng
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-5 sm:px-6">
          {/* ── Privacy notice ───────────────────────────────── */}
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Lokala nycklar sparas <span className="font-medium text-foreground">enbart i denna webbläsare</span>. Tomma fält använder Alberts backend-env som fallback när sådan finns.
            </p>
          </div>

          {/* ── Sections ─────────────────────────────────────── */}
          {(["managed", "vertex", "byok"] as const).map((section) => {
            const modes = grouped[section];
            if (modes.length === 0) return null;
            const meta = SECTION_META[section];
            const SectionIcon = meta.icon;

            return (
              <div key={section} className="mb-6 last:mb-0">
                {/* Section header */}
                <div className="mb-3 flex items-center gap-2">
                  <SectionIcon className="size-3.5 text-muted-foreground/70" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {meta.label}
                  </span>
                  <span className="hidden text-[11px] text-muted-foreground/50 sm:inline">
                    — {meta.description}
                  </span>
                </div>

                {/* Mode cards */}
                <div className="space-y-3">
                  {modes.map(({ value: mode }) => {
                    const selected = currentMode === mode;
                    const option = getLawLlmOption(mode);
                    const selectedModel = modelByMode[mode];
                    const modelOptions = getLawLlmModelOptions(mode);
                    const apiKeyState = getKeyState(mode, store);
                    const isVertex = isVertexLawLlmMode(mode);
                    const ModeIcon = getModeIcon(mode);
                    const accentColor = getModeAccentColor(mode);

                    return (
                      <div
                        key={mode}
                        className={cn(
                          "rounded-2xl border transition-colors",
                          selected
                            ? "border-primary/30 bg-primary/[0.03] ring-1 ring-primary/10"
                            : "border-border/60 hover:border-border",
                        )}
                      >
                        {/* Card header */}
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className={cn("flex size-8 items-center justify-center rounded-lg bg-muted/60", selected && "bg-primary/10")}>
                            <ModeIcon className={cn("size-4", selected ? "text-primary" : accentColor)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {option.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {option.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {selected && (
                              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                                Aktiv
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Model selector + config — collapsible area */}
                        <div className="border-t border-border/40 px-4 py-3">
                          <label
                            htmlFor={`${mode}-law-llm-model`}
                            className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70"
                          >
                            Modell
                          </label>
                          <select
                            id={`${mode}-law-llm-model`}
                            value={selectedModel}
                            onChange={(event) => setLawLlmModel(mode, event.target.value)}
                            className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            {modelOptions.map((modelOption) => (
                              <option key={modelOption.value} value={modelOption.value}>
                                {modelOption.label}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
                            {modelOptions.find((m) => m.value === selectedModel)?.description}
                          </p>

                          {(isByokLawLlmMode(mode) || usesGoogleKey(mode)) && (
                            <div className="mt-3 border-t border-border/30 pt-3">
                              <label
                                htmlFor={`${mode}-law-llm-api-key`}
                                className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70"
                              >
                                {getApiKeyLabel(mode)}
                              </label>
                              <div className="mt-1.5 flex gap-2">
                                <div className="relative flex-1">
                                  <input
                                    id={`${mode}-law-llm-api-key`}
                                    type={apiKeyState.keyVisible ? "text" : "password"}
                                    value={apiKeyState.apiKey}
                                    onChange={(event) => store.setApiKey(mode, event.target.value.trim())}
                                    placeholder={getApiKeyPlaceholder(mode)}
                                    autoComplete="off"
                                    spellCheck={false}
                                    className={cn(
                                      "h-10 w-full rounded-xl border border-border bg-background px-3 pr-10 font-mono text-sm",
                                      "placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20",
                                    )}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => store.toggleKeyVisible(mode)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
                                    title={apiKeyState.keyVisible ? "Dölj" : "Visa"}
                                  >
                                    {apiKeyState.keyVisible ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => store.clearApiKey(mode)}
                                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground/60 transition-colors hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                                  title="Rensa"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
                                {getApiKeyHint(mode)}
                              </p>
                            </div>
                          )}

                          {isVertex && (
                            <div className="mt-3 border-t border-border/30 pt-3">
                              <label
                                htmlFor={`${mode}-vertex-project-id`}
                                className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70"
                              >
                                Vertex Project ID
                              </label>
                              <div className="mt-1.5 flex gap-2">
                                <input
                                  id={`${mode}-vertex-project-id`}
                                  type="text"
                                  value={store.vertexProjectId}
                                  onChange={(event) => store.setVertexProjectId(event.target.value.trim())}
                                  placeholder="my-gcp-project"
                                  autoComplete="off"
                                  spellCheck={false}
                                  className={cn(
                                    "h-10 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm",
                                    "placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20",
                                  )}
                                />
                                <button
                                  type="button"
                                  onClick={() => store.clearVertexProjectId()}
                                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground/60 transition-colors hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                                  title="Rensa"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
                                Krävs bara för Vertex-partnermodeller. Lämna tomt för backend-env fallback.
                              </p>
                            </div>
                          )}

                          {/* Vertex AI region note */}
                          {isVertex && (
                            <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                              <Globe className="size-3" />
                              Region väljs automatiskt baserat på din plats
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
