// =============================================================================
// Cloudflare Workers AI — Embedding Client (Single Account)
// =============================================================================
//
// Generates embeddings via a single Cloudflare account's Workers AI.
//
// Model: @cf/baai/bge-base-en-v1.5 (768-dim) — supports Swedish text
// API:   POST /accounts/{ACCOUNT_ID}/ai/run/@cf/baai/bge-base-en-v1.5
// Auth:  Bearer token
//
// Usage:
//   import { createEmbeddingClient } from "./embeddings";
//   const client = createEmbeddingClient(env);
//   const vectors = await client.embed(["text1", "text2"]);
// =============================================================================

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBEDDING_DIMENSIONS = 768;
const CF_AI_BASE = "https://api.cloudflare.com/client/v4/accounts";
const MAX_BATCH_SIZE = 100; // Workers AI max per request
const TIMEOUT_MS = 30_000;

type AccountCredentials = {
  accountId: string;
  apiToken: string;
  index: number;
};

type EmbeddingResponse = {
  success: boolean;
  result?: {
    shape: number[];
    data: number[][];
  };
  errors?: Array<{ message: string }>;
};

export type EmbeddingResult = {
  vectors: number[][];
  model: string;
  dimensions: number;
  accountUsed: number;
};

export type EmbeddingClient = {
  embed: (texts: string[]) => Promise<EmbeddingResult>;
  embedBatched: (texts: string[], batchSize?: number) => Promise<number[][]>;
  getAccountCount: () => number;
  getDimensions: () => number;
  getModel: () => string;
};

/**
 * Load account credentials from env vars.
 * Expects: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 */
function loadAccounts(env: Record<string, string | undefined>): AccountCredentials[] {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;

  if (accountId && apiToken) {
    return [{ accountId, apiToken, index: 1 }];
  }

  if (!accountId && !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN not found in env");
  }

  throw new Error("Both CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required");
}

/**
 * Call Workers AI embedding endpoint on a single account.
 */
async function callWorkersAI(
  account: AccountCredentials,
  texts: string[],
): Promise<number[][]> {
  const url = `${CF_AI_BASE}/${account.accountId}/ai/run/${EMBEDDING_MODEL}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${account.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: texts }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Workers AI HTTP ${response.status} (account ${account.index}): ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as EmbeddingResponse;

    if (!data.success || !data.result?.data) {
      const errMsg = data.errors?.map((e) => e.message).join("; ") ?? "Unknown error";
      throw new Error(`Workers AI error (account ${account.index}): ${errMsg}`);
    }

    return data.result.data;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Create an embedding client using a single Cloudflare account.
 */
export function createEmbeddingClient(env: Record<string, string | undefined>): EmbeddingClient {
  const accounts = loadAccounts(env);
  const account = accounts[0];

  /**
   * Embed a batch of texts (up to MAX_BATCH_SIZE).
   */
  async function embed(texts: string[]): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { vectors: [], model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, accountUsed: 0 };
    }

    if (texts.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size ${texts.length} exceeds max ${MAX_BATCH_SIZE}. Use embedBatched() instead.`);
    }

    const vectors = await callWorkersAI(account, texts);

    return {
      vectors,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      accountUsed: account.index,
    };
  }

  /**
   * Embed a large list of texts, batching into chunks of batchSize.
   */
  async function embedBatched(texts: string[], batchSize = MAX_BATCH_SIZE): Promise<number[][]> {
    const allVectors: number[][] = [];
    const safeBatch = Math.min(Math.max(batchSize, 1), MAX_BATCH_SIZE);

    for (let i = 0; i < texts.length; i += safeBatch) {
      const batch = texts.slice(i, i + safeBatch);

      const vectors = await callWorkersAI(account, batch);
      allVectors.push(...vectors);
    }

    return allVectors;
  }

  return {
    embed,
    embedBatched,
    getAccountCount: () => accounts.length,
    getDimensions: () => EMBEDDING_DIMENSIONS,
    getModel: () => EMBEDDING_MODEL,
  };
}
