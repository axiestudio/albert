/**
 * Albert Law Agent — Environment Types (Open Source)
 *
 * Defines all environment variables available to the standalone Hono backend.
 * Stripped of SaaS-specific bindings (Stripe, SCIM, multi-tenant, etc.)
 */

// Vectorize index interface
export interface VectorizeIndex {
  query(
    vector: number[],
    options?: {
      topK?: number;
      filter?: Record<string, string | number | boolean>;
      returnMetadata?: boolean;
    },
  ): Promise<{
    matches: Array<{
      id: string;
      score: number;
      metadata?: Record<string, unknown>;
    }>;
  }>;
  upsert(
    vectors: Array<{
      id: string;
      values: number[];
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<void>;
  deleteByIds(ids: string[]): Promise<void>;
}

// Workers AI interface
export interface WorkersAI {
  run<T = unknown>(model: string, inputs: Record<string, unknown>): Promise<T>;
}

export interface Env {
  // ─── Core ───────────────────────────────────────────────────────────────
  ENVIRONMENT: string;


  // ─── Vectorize (optional — for semantic search) ─────────────────────────
  SFS_VECTORIZE?: VectorizeIndex;
  AI?: WorkersAI;

  // ─── Single Cloudflare Account for Vectorize REST API ───────────────────
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;

  // ─── Cloudflare AI Gateway (optional) ───────────────────────────────────
  CLOUDFLARE_GATEWAY_ACCOUNT_ID?: string;
  CLOUDFLARE_GATEWAY_NAME?: string;
  CLOUDFLARE_GATEWAY_TOKEN?: string;

  // ─── LLM Provider Configuration ────────────────────────────────────────
  LLM_PROVIDER?: string;
  LLM_MODEL?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;

  // Law-specific overrides
  LAW_LLM_PROVIDER?: string;
  LAW_LLM_MODEL?: string;
  LAW_LLM_API_KEY?: string;
  LAW_LLM_BASE_URL?: string;

  // Per-provider API keys
  GOOGLE_API_KEY?: string;
  LAW_GOOGLE_API_KEY?: string;
  OPENAI_API_KEY?: string;
  LAW_OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  LAW_ANTHROPIC_API_KEY?: string;

  // ─── Vertex AI (optional — for partner models) ─────────────────────────
  VERTEX_PROJECT_ID?: string;
  LAW_VERTEX_PROJECT_ID?: string;

  // ─── Allow string indexing for dynamic env lookups ─────────────────────
  [key: string]: string | VectorizeIndex | WorkersAI | undefined;
}
