/**
 * ✅ 2026 Vertex AI Model Catalog — Partner & Open Source Models
 *
 * Comprehensive catalog of all models available through Google Vertex AI,
 * including partner models (Claude, Mistral) and open models (DeepSeek, Llama, Qwen).
 *
 * Configuration paths in OSS Albert:
 *   - Gemini models: Server 1 path using a Google API key
 *   - Claude, Mistral, and open models: Vertex Project ID path
 *
 * Source (April 2026):
 *   - https://docs.cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-partner-models
 *   - https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations
 */

// ─── Model Definition ──────────────────────────────────────────────────────────

export type VertexModelAccess = "server-key" | "vertex-project";

export type VertexModelCategory = "gemini" | "claude" | "mistral" | "open-source";

export type VertexModel = {
  /** Model ID as used in Vertex AI API calls */
  id: string;
  /** Human-readable display name */
  label: string;
  /** Short description */
  description: string;
  /** The publisher on Vertex AI (google, anthropic, mistralai, meta, etc.) */
  publisher: string;
  /** Provider key for routing in our system */
  provider: string;
  /** Category grouping */
  category: VertexModelCategory;
  /** How OSS Albert configures access to the model */
  access: VertexModelAccess;
  /** Whether the model supports tool/function calling */
  toolCapable: boolean;
  /** Context window size in tokens */
  contextWindow: number;
};

// ─── Gemini Models (Server Key path) ───────────────────────────────────────────

export const GEMINI_MODELS: readonly VertexModel[] = [
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Balanced default for fast, tool-capable reasoning",
    publisher: "google",
    provider: "gemini",
    category: "gemini",
    access: "server-key",
    toolCapable: true,
    contextWindow: 1_000_000,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Stronger reasoning for complex legal analysis",
    publisher: "google",
    provider: "gemini",
    category: "gemini",
    access: "server-key",
    toolCapable: true,
    contextWindow: 1_000_000,
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    description: "Lowest-latency managed Gemini option",
    publisher: "google",
    provider: "gemini",
    category: "gemini",
    access: "server-key",
    toolCapable: true,
    contextWindow: 1_000_000,
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    description: "Preview frontier-speed Gemini model with tool use",
    publisher: "google",
    provider: "gemini",
    category: "gemini",
    access: "server-key",
    toolCapable: true,
    contextWindow: 1_000_000,
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    description: "Preview high-intelligence Gemini model for harder tasks",
    publisher: "google",
    provider: "gemini",
    category: "gemini",
    access: "server-key",
    toolCapable: true,
    contextWindow: 1_000_000,
  },
];

// ─── Claude Models (Vertex Project path) ───────────────────────────────────────

export const CLAUDE_MODELS: readonly VertexModel[] = [
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    description: "Most intelligent Claude — coding, agents, computer use, enterprise",
    publisher: "anthropic",
    provider: "anthropic",
    category: "claude",
    access: "vertex-project",
    toolCapable: true,
    contextWindow: 1_000_000,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    description: "Frontier intelligence at scale — coding, agents, enterprise",
    publisher: "anthropic",
    provider: "anthropic",
    category: "claude",
    access: "vertex-project",
    toolCapable: true,
    contextWindow: 1_000_000,
  },
  {
    id: "claude-opus-4-5",
    label: "Claude Opus 4.5",
    description: "Industry-leading coding, computer use, and enterprise workflows",
    publisher: "anthropic",
    provider: "anthropic",
    category: "claude",
    access: "vertex-project",
    toolCapable: true,
    contextWindow: 200_000,
  },
  {
    id: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    description: "Mid-sized Claude for coding, computer use, and office files",
    publisher: "anthropic",
    provider: "anthropic",
    category: "claude",
    access: "vertex-project",
    toolCapable: true,
    contextWindow: 200_000,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    description: "Near-frontier performance, fast speed, great for high-volume",
    publisher: "anthropic",
    provider: "anthropic",
    category: "claude",
    access: "vertex-project",
    toolCapable: true,
    contextWindow: 200_000,
  },
];

// ─── Mistral Models (Vertex Project path) ──────────────────────────────────────

export const MISTRAL_MODELS: readonly VertexModel[] = [
  {
    id: "mistral-medium-3",
    label: "Mistral Medium 3",
    description: "Versatile model for programming, reasoning, and summarization",
    publisher: "mistralai",
    provider: "mistral",
    category: "mistral",
    access: "vertex-project",
    toolCapable: true,
    contextWindow: 128_000,
  },
  {
    id: "mistral-small-2503",
    label: "Mistral Small 3.1",
    description: "Multimodal with extended context — low-latency efficiency",
    publisher: "mistralai",
    provider: "mistral",
    category: "mistral",
    access: "vertex-project",
    toolCapable: true,
    contextWindow: 128_000,
  },
  {
    id: "codestral-2",
    label: "Codestral 2",
    description: "Code-specialized model for fill-in-the-middle and generation",
    publisher: "mistralai",
    provider: "mistral",
    category: "mistral",
    access: "vertex-project",
    toolCapable: false,
    contextWindow: 128_000,
  },
];

// ─── Open Source Models (Vertex Project path via Vertex AI MaaS) ──────────────

export const OPEN_SOURCE_MODELS: readonly VertexModel[] = [
  {
    id: "deepseek-v3.2-maas",
    label: "DeepSeek V3.2",
    description: "Latest DeepSeek foundation model with strong reasoning",
    publisher: "deepseek",
    provider: "deepseek",
    category: "open-source",
    access: "vertex-project",
    toolCapable: true,
    contextWindow: 128_000,
  },
  {
    id: "qwen3-235b-a22b-instruct-2507-maas",
    label: "Qwen3 235B Instruct",
    description: "Alibaba's Qwen3 large model with strong multilingual capability",
    publisher: "qwen",
    provider: "qwen",
    category: "open-source",
    access: "vertex-project",
    toolCapable: true,
    contextWindow: 128_000,
  },
  {
    id: "llama-4-maverick-17b-128e",
    label: "Llama 4 Maverick 17B",
    description: "Meta's Llama 4 Maverick model with mixture of experts",
    publisher: "meta",
    provider: "llama",
    category: "open-source",
    access: "vertex-project",
    toolCapable: true,
    contextWindow: 128_000,
  },
];

// ─── Full Catalog ──────────────────────────────────────────────────────────────

export const ALL_VERTEX_MODELS: readonly VertexModel[] = [
  ...GEMINI_MODELS,
  ...CLAUDE_MODELS,
  ...MISTRAL_MODELS,
  ...OPEN_SOURCE_MODELS,
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get the full Vertex catalog exposed by OSS Albert.
 */
export function getAvailableModels(): readonly VertexModel[] {
  return ALL_VERTEX_MODELS;
}

/**
 * Get models grouped by category for UI display.
 */
export function getModelsByCategory(): Record<VertexModelCategory, readonly VertexModel[]> {
  const models = getAvailableModels();
  return {
    gemini: models.filter(m => m.category === "gemini"),
    claude: models.filter(m => m.category === "claude"),
    mistral: models.filter(m => m.category === "mistral"),
    "open-source": models.filter(m => m.category === "open-source"),
  };
}

/**
 * Find a model by ID in the full catalog.
 */
export function findVertexModel(modelId: string): VertexModel | undefined {
  return ALL_VERTEX_MODELS.find(m => m.id === modelId);
}

/**
 * Check if a model uses the Vertex Project ID configuration path.
 */
export function requiresVertexProjectModel(modelId: string): boolean {
  const model = findVertexModel(modelId);
  return model?.access === "vertex-project";
}

/**
 * Resolve the Vertex AI publisher for a model.
 * Partner models need their specific publisher in the URL path.
 */
export function resolveVertexPublisher(modelId: string): string {
  const model = findVertexModel(modelId);
  return model?.publisher ?? "google";
}
