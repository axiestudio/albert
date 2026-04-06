// =============================================================================
// Vectorize Query Client — Runtime Client for Law Mode (Single Account)
// =============================================================================
//
// Used at query time by the law agent to:
//   1. Embed the user query via Workers AI
//   2. Query the Vectorize "sfs-law-index"
//   3. Return top-K law metadata matches
//
// This is the runtime counterpart to the ingestion scripts.
// =============================================================================

const VECTORIZE_INDEX = "sfs-law-index";
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const CF_API_BASE = "https://api.cloudflare.com/client/v4/accounts";
const TIMEOUT_MS = 10_000;

type AccountCredentials = {
  accountId: string;
  apiToken: string;
  index: number;
};

export type LawSearchMatch = {
  dokId: string;
  score: number;
  beteckning: string;
  titel: string;
  datum: string;
  organ: string;
  subtyp: string;
  rm: string;
};

export type VectorizeLoadBalancer = {
  search: (query: string, topK?: number) => Promise<LawSearchMatch[]>;
  getAccountCount: () => number;
};

function loadAccounts(env: Record<string, string | undefined>): AccountCredentials[] {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;

  if (accountId && apiToken) {
    return [{ accountId, apiToken, index: 1 }];
  }

  return [];
}

async function embedQuery(
  account: AccountCredentials,
  text: string,
): Promise<number[]> {
  const url = `${CF_API_BASE}/${account.accountId}/ai/run/${EMBEDDING_MODEL}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${account.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: [text] }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!response.ok) throw new Error(`Embedding HTTP ${response.status}`);

    const data = (await response.json()) as {
      success: boolean;
      result?: { data: number[][] };
    };

    if (!data.success || !data.result?.data?.[0]) {
      throw new Error("Embedding response empty");
    }

    return data.result.data[0];
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function queryVectorize(
  account: AccountCredentials,
  vector: number[],
  topK: number,
): Promise<LawSearchMatch[]> {
  const url = `${CF_API_BASE}/${account.accountId}/vectorize/v2/indexes/${VECTORIZE_INDEX}/query`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${account.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vector,
        topK,
        returnMetadata: "all",
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!response.ok) throw new Error(`Vectorize query HTTP ${response.status}`);

    const data = (await response.json()) as {
      success: boolean;
      result?: {
        matches: Array<{
          id: string;
          score: number;
          metadata?: Record<string, string | number>;
        }>;
      };
    };

    if (!data.success) throw new Error("Vectorize query failed");

    return (data.result?.matches ?? []).map((m) => ({
      dokId: m.id,
      score: m.score,
      beteckning: String(m.metadata?.beteckning ?? ""),
      titel: String(m.metadata?.titel ?? ""),
      datum: String(m.metadata?.datum ?? ""),
      organ: String(m.metadata?.organ ?? ""),
      subtyp: String(m.metadata?.subtyp ?? "sfst"),
      rm: String(m.metadata?.rm ?? ""),
    }));
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Create a Vectorize query client using a single Cloudflare account.
 */
export function createVectorizeLoadBalancer(
  env: Record<string, string | undefined>,
): VectorizeLoadBalancer {
  const accounts = loadAccounts(env);
  if (accounts.length === 0) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required in env");
  }

  const account = accounts[0];

  async function search(query: string, topK = 10): Promise<LawSearchMatch[]> {
    const vector = await embedQuery(account, query);
    return await queryVectorize(account, vector, topK);
  }

  return {
    search,
    getAccountCount: () => 1,
  };
}
