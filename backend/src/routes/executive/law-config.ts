import type { Env } from "../../env";
import type { LawLlmRequestOverrides } from "./law-types";

export const RIKSDAGEN_BASE = "https://data.riksdagen.se";
export const RIKSDAGEN_TIMEOUT_MS = 15_000;
export const CF_API_BASE_LAW = "https://api.cloudflare.com/client/v4/accounts";
export const SFS_VECTORIZE_INDEX = "sfs-law-index";
export const SFS_EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const LAGEN_BASE = "https://lagen.nu";
export const LAGEN_TIMEOUT_MS = 20_000;
export const LAGEN_RETRY_COUNT = 2;
export const LAGEN_RETRY_BASE_MS = 1_500;
export const LAGEN_MAX_CHARS = 15_000;
export const LAW_SOURCE_DEFAULT_READ_CHARS = 12_000;
export const LAW_SOURCE_MAX_READ_CHARS = 20_000;

export const LAGEN_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
] as const;

export const LAGEN_CACHE_PREFIX = "https://webcache.googleusercontent.com/search?q=cache:";
export const LAGEN_WAYBACK_PREFIX = "https://web.archive.org/web/2024/";

export const LAW_EXECUTION_MAX_STEPS = 60;
export const LAW_PREPARE_RESULT_LIMIT = 10;
export const LAW_PREPARE_HEADER_LIMIT = 15;
export const LAW_UI_MESSAGE_STREAM_HEADER = "x-vercel-ai-ui-message-stream";
export const DEFAULT_LAW_PROVIDER = "gemini";

const LAW_TOOL_CAPABLE_MODELS = {
  anthropic: [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
  ],
  gemini: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.1-pro-preview",
  ],
  openai: [
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
  ],
  "vertex-claude": [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-opus-4-5",
    "claude-sonnet-4-5",
    "claude-haiku-4-5",
  ],
  "vertex-mistral": [
    "mistral-medium-3",
    "mistral-small-2503",
    "codestral-2",
  ],
  "vertex-open": [
    "deepseek-v3.2-maas",
    "qwen3-235b-a22b-instruct-2507-maas",
    "llama-4-maverick-17b-128e",
  ],
} as const;

function getLawModelCatalogProvider(provider?: string): keyof typeof LAW_TOOL_CAPABLE_MODELS | null {
  switch (provider) {
    case "google":
    case "gemini":
      return "gemini";
    case "openai":
    case "anthropic":
      return provider;
    case "vertex-claude":
    case "vertex-mistral":
    case "vertex-open":
      return provider;
    default:
      return null;
  }
}

function getSupportedLawModels(provider?: string): readonly string[] | null {
  const catalogProvider = getLawModelCatalogProvider(provider);
  return catalogProvider ? LAW_TOOL_CAPABLE_MODELS[catalogProvider] : null;
}

function resolveExplicitLawModel(rawModel?: string, provider?: string): string | null {
  const normalized = rawModel?.trim();
  if (!normalized) {
    return null;
  }

  const supportedModels = getSupportedLawModels(provider);

  if (normalized.toLowerCase() === "random") {
    return null;
  }

  if (normalized.includes(",")) {
    const pool = normalized.split(",").map(model => model.trim()).filter(Boolean);
    const filteredPool = supportedModels
      ? pool.filter(model => supportedModels.includes(model))
      : pool;
    return filteredPool.length > 0 ? filteredPool[Math.floor(Math.random() * filteredPool.length)] ?? filteredPool[0]! : null;
  }

  if (supportedModels && !supportedModels.includes(normalized)) {
    return null;
  }

  return normalized;
}

function readTrimmedEnv(
  env: Partial<Env> & Record<string, string | undefined>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readTrimmedValue(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function getDefaultLawModelForProvider(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "claude-sonnet-4-6";
    case "google":
    case "gemini":
      return "gemini-2.5-flash";
    case "openai":
      return "gpt-5.4-mini";
    case "vertex-claude":
      return "claude-sonnet-4-6";
    case "vertex-mistral":
      return "mistral-medium-3";
    case "vertex-open":
      return "deepseek-v3.2-maas";
    default:
      return "gemini-2.5-flash";
  }
}

function resolveLawProviderFromMode(mode?: string): string | null {
  switch (mode) {
    case "server-1":
      return "gemini";
    case "openai":
    case "anthropic":
      return mode;
    case "vertex-claude":
    case "vertex-mistral":
    case "vertex-open":
      return mode;
    default:
      return null;
  }
}

function resolveLawModelFromMode(
  env: Partial<Env> & Record<string, string | undefined>,
  mode?: string,
): string | null {
  switch (mode) {
    case "server-1":
      return resolveExplicitLawModel(
        readTrimmedEnv(env, "LAW_GEMINI_MODEL", "GEMINI_MODEL", "LAW_LLM_MODEL", "LLM_MODEL"),
        "gemini",
      );
    default:
      return null;
  }
}

function resolveEnvLawModel(
  env: Partial<Env> & Record<string, string | undefined>,
  provider: string,
): string | null {
  switch (getLawModelCatalogProvider(provider)) {
    case "anthropic":
      return resolveExplicitLawModel(
        readTrimmedEnv(env, "LAW_ANTHROPIC_MODEL", "ANTHROPIC_MODEL", "LAW_LLM_MODEL", "LLM_MODEL"),
        provider,
      );
    case "gemini":
      return resolveExplicitLawModel(
        readTrimmedEnv(env, "LAW_GEMINI_MODEL", "GEMINI_MODEL", "LAW_LLM_MODEL", "LLM_MODEL"),
        provider,
      );
    case "openai":
      return resolveExplicitLawModel(
        readTrimmedEnv(env, "LAW_OPENAI_MODEL", "OPENAI_MODEL", "LAW_LLM_MODEL", "LLM_MODEL"),
        provider,
      );
    default:
      return resolveExplicitLawModel(readTrimmedEnv(env, "LAW_LLM_MODEL", "LLM_MODEL"), provider);
  }
}

function isByokLawMode(mode?: string): mode is "openai" | "anthropic" {
  return mode === "openai" || mode === "anthropic";
}

function isVertexPartnerMode(mode?: string): boolean {
  return mode === "vertex-claude" || mode === "vertex-mistral" || mode === "vertex-open";
}

export function resolveLawLlmConfig(
  env: Partial<Env> & Record<string, string | undefined>,
  overrides?: LawLlmRequestOverrides & { userLat?: number; userLng?: number },
): {
  provider: string;
  model: string;
  apiKey: string | null;
  baseUrl?: string;
  userLat?: number;
  userLng?: number;
  vertexProjectId?: string;
} {
  const requestedMode = readTrimmedValue(overrides?.llmMode)?.toLowerCase();
  const requestedProvider = resolveLawProviderFromMode(requestedMode);
  const provider = requestedProvider
    || readTrimmedEnv(env, "LAW_LLM_PROVIDER", "LLM_PROVIDER")?.toLowerCase()
    || DEFAULT_LAW_PROVIDER;
  const requestApiKey = readTrimmedValue(overrides?.llmApiKey);
  const requestedModel = requestedMode
    ? resolveExplicitLawModel(readTrimmedValue(overrides?.llmModel), provider)
    : null;
  const modeModel = resolveLawModelFromMode(env, requestedMode);
  const envModel = resolveEnvLawModel(env, provider);

  const model = requestedModel
    || modeModel
    || (requestedProvider ? null : envModel)
    || getDefaultLawModelForProvider(provider);

  const envApiKey = readTrimmedEnv(env, "LAW_LLM_API_KEY", "LLM_API_KEY")
    || (provider === "google" || provider === "gemini"
      ? readTrimmedEnv(env, "LAW_GOOGLE_API_KEY", "GOOGLE_API_KEY")
      : provider === "anthropic"
        ? readTrimmedEnv(env, "LAW_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY")
        : provider === "openai"
          ? readTrimmedEnv(env, "LAW_OPENAI_API_KEY", "OPENAI_API_KEY")
          : undefined)
    // Vertex partner/open models use the Google API key.
    || (isVertexPartnerMode(provider)
      ? readTrimmedEnv(env, "LAW_GOOGLE_API_KEY", "GOOGLE_API_KEY")
      : undefined)
    || null;
  const apiKey = isByokLawMode(requestedMode)
    ? requestApiKey ?? null
    : requestApiKey ?? envApiKey;

  // Vertex partner models need project ID for regional endpoint construction.
  const vertexProjectId = isVertexPartnerMode(provider)
    ? readTrimmedValue(overrides?.vertexProjectId)
      || readTrimmedEnv(env, "LAW_VERTEX_PROJECT_ID", "VERTEX_PROJECT_ID")
    : undefined;

  return {
    provider,
    model,
    apiKey,
    baseUrl: readTrimmedEnv(env, "LAW_LLM_BASE_URL", "LLM_BASE_URL"),
    userLat: overrides?.userLat,
    userLng: overrides?.userLng,
    vertexProjectId,
  };
}

let rrLawExecIdx = 0;

export function getLawRestAccount(env: Env): { accountId: string; apiToken: string } | null {
  const envAny = env as unknown as Record<string, string | undefined>;
  const accountId = envAny.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = envAny.CLOUDFLARE_API_TOKEN;
  if (accountId && apiToken) {
    return { accountId, apiToken };
  }
  return null;
}