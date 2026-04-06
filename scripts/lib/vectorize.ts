// =============================================================================
// Cloudflare Vectorize — REST Client for Single-Account Index Management
// =============================================================================
//
// Manages the "sfs-law-index" Vectorize index on a single Cloudflare account.
//
// API Docs: https://developers.cloudflare.com/api/resources/vectorize/
// =============================================================================

const VECTORIZE_INDEX_NAME = "sfs-law-index";
const CF_API_BASE = "https://api.cloudflare.com/client/v4/accounts";
const TIMEOUT_MS = 30_000;
const UPSERT_BATCH_SIZE = 100; // Vectorize max per upsert

export type VectorizeVector = {
  id: string;
  values: number[];
  metadata?: Record<string, string | number | boolean>;
};

export type VectorizeQueryResult = {
  id: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
};

type VectorizeApiResponse<T = unknown> = {
  success: boolean;
  result: T;
  errors?: Array<{ code: number; message: string }>;
};

type VectorizeIndexInfo = {
  name: string;
  config: {
    dimensions: number;
    metric: string;
  };
  created_on: string;
  modified_on: string;
};

type AccountCredentials = {
  accountId: string;
  apiToken: string;
  index: number;
};

/**
 * Make an authenticated request to the Cloudflare API.
 */
async function cfApiRequest<T>(
  accountId: string,
  apiToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<VectorizeApiResponse<T>> {
  const url = `${CF_API_BASE}/${accountId}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiToken}`,
  };

  const init: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
  }

  try {
    const response = await fetch(url, init);
    clearTimeout(timer);
    const data = await response.json();
    return data as VectorizeApiResponse<T>;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Create or verify the Vectorize index on a single account.
 */
export async function ensureVectorizeIndex(
  account: AccountCredentials,
  dimensions = 768,
): Promise<{ created: boolean; name: string }> {
  // Check if index exists
  const listResp = await cfApiRequest<VectorizeIndexInfo[]>(
    account.accountId,
    account.apiToken,
    "GET",
    "/vectorize/v2/indexes",
  );

  if (listResp.success && Array.isArray(listResp.result)) {
    const existing = listResp.result.find((idx) => idx.name === VECTORIZE_INDEX_NAME);
    if (existing) {
      return { created: false, name: VECTORIZE_INDEX_NAME };
    }
  }

  // Create index
  const createResp = await cfApiRequest<VectorizeIndexInfo>(
    account.accountId,
    account.apiToken,
    "POST",
    "/vectorize/v2/indexes",
    {
      name: VECTORIZE_INDEX_NAME,
      config: {
        dimensions,
        metric: "cosine",
      },
    },
  );

  if (!createResp.success) {
    const errMsg = createResp.errors?.map((e) => e.message).join("; ") ?? "Unknown error";
    throw new Error(`Failed to create Vectorize index on account ${account.index}: ${errMsg}`);
  }

  return { created: true, name: VECTORIZE_INDEX_NAME };
}

/**
 * Upsert vectors into the Vectorize index on a specific account.
 * Vectorize v2 uses NDJSON format for upserts.
 */
export async function upsertVectors(
  account: AccountCredentials,
  vectors: VectorizeVector[],
): Promise<{ count: number }> {
  let totalUpserted = 0;

  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);

    // Vectorize v2 expects NDJSON (newline-delimited JSON)
    const ndjson = batch.map((v) => JSON.stringify({
      id: v.id,
      values: v.values,
      metadata: v.metadata ?? {},
    })).join("\n");

    const url = `${CF_API_BASE}/${account.accountId}/vectorize/v2/indexes/${VECTORIZE_INDEX_NAME}/upsert`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${account.apiToken}`,
          "Content-Type": "application/x-ndjson",
        },
        body: ndjson,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Vectorize upsert HTTP ${response.status} (account ${account.index}): ${body.slice(0, 200)}`);
      }

      const data = (await response.json()) as VectorizeApiResponse<{ mutationId: string }>;
      if (!data.success) {
        const errMsg = data.errors?.map((e) => e.message).join("; ") ?? "Unknown error";
        throw new Error(`Vectorize upsert error (account ${account.index}): ${errMsg}`);
      }

      totalUpserted += batch.length;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  return { count: totalUpserted };
}

/**
 * Query the Vectorize index on a specific account.
 */
export async function queryVectorize(
  account: AccountCredentials,
  vector: number[],
  topK = 10,
  filter?: Record<string, string | number | boolean>,
): Promise<VectorizeQueryResult[]> {
  const body: Record<string, unknown> = {
    vector,
    topK,
    returnMetadata: "all",
  };
  if (filter) body.filter = filter;

  const resp = await cfApiRequest<{ matches: VectorizeQueryResult[] }>(
    account.accountId,
    account.apiToken,
    "POST",
    `/vectorize/v2/indexes/${VECTORIZE_INDEX_NAME}/query`,
    body,
  );

  if (!resp.success) {
    const errMsg = resp.errors?.map((e) => e.message).join("; ") ?? "Unknown error";
    throw new Error(`Vectorize query error (account ${account.index}): ${errMsg}`);
  }

  return resp.result?.matches ?? [];
}

/**
 * Delete the Vectorize index on a specific account (for cleanup).
 */
export async function deleteVectorizeIndex(
  account: AccountCredentials,
): Promise<boolean> {
  const resp = await cfApiRequest<null>(
    account.accountId,
    account.apiToken,
    "DELETE",
    `/vectorize/v2/indexes/${VECTORIZE_INDEX_NAME}`,
  );

  return resp.success;
}

/**
 * Get info about the Vectorize index on a specific account.
 */
export async function getVectorizeIndexInfo(
  account: AccountCredentials,
): Promise<VectorizeIndexInfo | null> {
  const resp = await cfApiRequest<VectorizeIndexInfo>(
    account.accountId,
    account.apiToken,
    "GET",
    `/vectorize/v2/indexes/${VECTORIZE_INDEX_NAME}`,
  );

  if (!resp.success) return null;
  return resp.result;
}

/**
 * Load account credentials from env vars.
 */
export function loadAccounts(env: Record<string, string | undefined>): AccountCredentials[] {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;

  if (accountId && apiToken) {
    return [{ accountId, apiToken, index: 1 }];
  }

  return [];
}

export { VECTORIZE_INDEX_NAME };
