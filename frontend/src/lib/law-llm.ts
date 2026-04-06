export const LAW_LLM_OPTIONS = [
  {
    value: "server-1",
    label: "Server 1",
    description: "Albert managed",
  },
  {
    value: "vertex-claude",
    label: "Claude (Vertex AI)",
    description: "Anthropic via Google Cloud",
  },
  {
    value: "vertex-mistral",
    label: "Mistral (Vertex AI)",
    description: "Mistral AI via Google Cloud",
  },
  {
    value: "vertex-open",
    label: "Open Source (Vertex AI)",
    description: "DeepSeek, Qwen, Llama via Google Cloud",
  },
  {
    value: "openai",
    label: "OpenAI",
    description: "Bring your own key",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    description: "Bring your own key",
  },
] as const;

export type LawLlmMode = (typeof LAW_LLM_OPTIONS)[number]["value"];
export type LawLlmByokMode = Extract<LawLlmMode, "openai" | "anthropic">;
export type LawLlmVertexMode = Extract<LawLlmMode, "vertex-claude" | "vertex-mistral" | "vertex-open">;

export type LawLlmModelOption = {
  value: string;
  label: string;
  description: string;
};

export const LAW_LLM_MODEL_OPTIONS = {
  "server-1": [
    {
      value: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      description: "Balanced default for fast, tool-capable reasoning",
    },
    {
      value: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      description: "Stronger reasoning for more complex legal analysis",
    },
    {
      value: "gemini-2.5-flash-lite",
      label: "Gemini 2.5 Flash-Lite",
      description: "Lowest-latency managed Gemini option",
    },
    {
      value: "gemini-3-flash-preview",
      label: "Gemini 3 Flash Preview",
      description: "Preview frontier-speed Gemini model with tool use",
    },
    {
      value: "gemini-3.1-pro-preview",
      label: "Gemini 3.1 Pro Preview",
      description: "Preview high-intelligence Gemini model for harder tasks",
    },
  ],
  "vertex-claude": [
    {
      value: "claude-opus-4-6",
      label: "Claude Opus 4.6",
      description: "Most intelligent Claude — coding, agents, computer use, enterprise",
    },
    {
      value: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      description: "Frontier intelligence at scale — coding, agents, enterprise",
    },
    {
      value: "claude-opus-4-5",
      label: "Claude Opus 4.5",
      description: "Industry-leading coding, computer use, and enterprise workflows",
    },
    {
      value: "claude-sonnet-4-5",
      label: "Claude Sonnet 4.5",
      description: "Mid-sized Claude for coding, computer use, and office files",
    },
    {
      value: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      description: "Near-frontier performance, fast speed, great for high-volume",
    },
  ],
  "vertex-mistral": [
    {
      value: "mistral-medium-3",
      label: "Mistral Medium 3",
      description: "Versatile model for programming, reasoning, and summarization",
    },
    {
      value: "mistral-small-2503",
      label: "Mistral Small 3.1",
      description: "Multimodal with extended context — low-latency efficiency",
    },
    {
      value: "codestral-2",
      label: "Codestral 2",
      description: "Code-specialized model for fill-in-the-middle and generation",
    },
  ],
  "vertex-open": [
    {
      value: "deepseek-v3.2-maas",
      label: "DeepSeek V3.2",
      description: "Latest DeepSeek foundation model with strong reasoning",
    },
    {
      value: "qwen3-235b-a22b-instruct-2507-maas",
      label: "Qwen3 235B Instruct",
      description: "Alibaba's Qwen3 large model with strong multilingual capability",
    },
    {
      value: "llama-4-maverick-17b-128e",
      label: "Llama 4 Maverick 17B",
      description: "Meta's Llama 4 Maverick model with mixture of experts",
    },
  ],
  openai: [
    {
      value: "gpt-5.4",
      label: "GPT-5.4",
      description: "Flagship OpenAI model for the hardest agentic work",
    },
    {
      value: "gpt-5.4-mini",
      label: "GPT-5.4 Mini",
      description: "Balanced default for tool use, speed, and cost",
    },
    {
      value: "gpt-5.4-nano",
      label: "GPT-5.4 Nano",
      description: "Fastest OpenAI tool-capable option for lighter tasks",
    },
  ],
  anthropic: [
    {
      value: "claude-opus-4-6",
      label: "Claude Opus 4.6",
      description: "Highest-intelligence Claude model for deep analysis",
    },
    {
      value: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      description: "Balanced default for agentic work and coding",
    },
    {
      value: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      description: "Fastest current Claude option with tool use",
    },
  ],
} as const satisfies Record<LawLlmMode, readonly LawLlmModelOption[]>;

export const DEFAULT_LAW_LLM_MODEL_BY_MODE: Record<LawLlmMode, string> = {
  "server-1": "gemini-2.5-flash",
  "vertex-claude": "claude-sonnet-4-6",
  "vertex-mistral": "mistral-medium-3",
  "vertex-open": "deepseek-v3.2-maas",
  openai: "gpt-5.4-mini",
  anthropic: "claude-sonnet-4-6",
};

export const DEFAULT_LAW_LLM_MODE: LawLlmMode = "server-1";

export function isLawLlmMode(value: string): value is LawLlmMode {
  return LAW_LLM_OPTIONS.some(option => option.value === value);
}

export function isByokLawLlmMode(value: LawLlmMode | string): value is LawLlmByokMode {
  return value === "openai" || value === "anthropic";
}

export function isVertexLawLlmMode(value: LawLlmMode | string): value is LawLlmVertexMode {
  return value === "vertex-claude" || value === "vertex-mistral" || value === "vertex-open";
}

export function isAuthRequiredMode(_value: LawLlmMode | string): boolean {
  return false;
}

/**
 * Albert OSS exposes every supported law LLM mode regardless of session state.
 * Server 1 and Vertex partner modes can be configured through backend defaults
 * or browser-local settings supplied by the user.
 */
export function getAvailableLawLlmOptions(_authenticated: boolean) {
  return LAW_LLM_OPTIONS;
}

export function isLawLlmModeConfigured(mode: LawLlmMode, apiKey?: string): boolean {
  if (!isByokLawLlmMode(mode)) {
    // server-1 and vertex-* modes use server-managed keys
    return true;
  }

  return (apiKey?.trim().length ?? 0) > 0;
}

export function getLawLlmOption(mode: LawLlmMode) {
  return LAW_LLM_OPTIONS.find(option => option.value === mode) ?? LAW_LLM_OPTIONS[0];
}

export function getLawLlmModelOptions(mode: LawLlmMode): readonly LawLlmModelOption[] {
  return LAW_LLM_MODEL_OPTIONS[mode];
}

export function getDefaultLawLlmModel(mode: LawLlmMode): string {
  return DEFAULT_LAW_LLM_MODEL_BY_MODE[mode];
}

export function isLawLlmModelForMode(mode: LawLlmMode, model: string): boolean {
  return LAW_LLM_MODEL_OPTIONS[mode].some(option => option.value === model);
}

export function resolveLawLlmModel(mode: LawLlmMode, model?: string): string {
  const trimmedModel = model?.trim();
  if (trimmedModel && isLawLlmModelForMode(mode, trimmedModel)) {
    return trimmedModel;
  }

  return getDefaultLawLlmModel(mode);
}

export function getLawLlmModelOption(mode: LawLlmMode, model?: string): LawLlmModelOption {
  const resolvedModel = resolveLawLlmModel(mode, model);
  return LAW_LLM_MODEL_OPTIONS[mode].find(option => option.value === resolvedModel)
    ?? LAW_LLM_MODEL_OPTIONS[mode].find(option => option.value === getDefaultLawLlmModel(mode))
    ?? LAW_LLM_MODEL_OPTIONS[mode][0]!;
}

export function buildLawLlmHeaders(
  mode: LawLlmMode,
  options: {
    apiKey?: string;
    model?: string;
    userLat?: number;
    userLng?: number;
    vertexProjectId?: string;
  } = {},
): Record<string, string> {
  const trimmedApiKey = options.apiKey?.trim() ?? "";
  const trimmedVertexProjectId = options.vertexProjectId?.trim() ?? "";
  const resolvedModel = resolveLawLlmModel(mode, options.model);

  return {
    "x-law-llm-mode": mode,
    "x-law-llm-model": resolvedModel,
    ...((isByokLawLlmMode(mode) || mode === "server-1" || isVertexLawLlmMode(mode)) && trimmedApiKey
      ? { "x-law-llm-api-key": trimmedApiKey }
      : {}),
    ...(isVertexLawLlmMode(mode) && trimmedVertexProjectId
      ? { "x-law-vertex-project-id": trimmedVertexProjectId }
      : {}),
    ...(options.userLat != null && Number.isFinite(options.userLat)
      ? { "x-user-lat": String(options.userLat) }
      : {}),
    ...(options.userLng != null && Number.isFinite(options.userLng)
      ? { "x-user-lng": String(options.userLng) }
      : {}),
  };
}
