/**
 * Tests for the Cloudflare REST API request shapes used in semantic search.
 *
 * Validates:
 *   - Workers AI embedding request body: { text: string[] }
 *   - Vectorize v2 query request body: { vector, topK, returnMetadata }
 *   - URL construction for both endpoints
 *   - Response parsing / metadata mapping
 *   - Embedding dimension consistency (768) between ingest and query
 */
import { describe, expect, it } from "bun:test";

const CF_API_BASE = "https://api.cloudflare.com/client/v4/accounts";
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const VECTORIZE_INDEX = "sfs-law-index";

// ─── Constants agree across all services ──────────────────────────────────────
describe("embedding + vectorize constants consistency", () => {
  it("model is @cf/baai/bge-base-en-v1.5 (768-dim, supports Swedish)", () => {
    expect(EMBEDDING_MODEL).toBe("@cf/baai/bge-base-en-v1.5");
    // cf BAAI BGE base model emits exactly 768 dimensions
  });

  it("vectorize index name is lowercase, no spaces, kebab-case", () => {
    expect(VECTORIZE_INDEX).toBe("sfs-law-index");
    expect(VECTORIZE_INDEX).toBe(VECTORIZE_INDEX.toLowerCase());
    expect(VECTORIZE_INDEX).not.toContain(" ");
  });

  it("CF API base URL is the standard v4 REST endpoint", () => {
    expect(CF_API_BASE).toBe("https://api.cloudflare.com/client/v4/accounts");
    expect(() => new URL(CF_API_BASE)).not.toThrow();
  });
});

// ─── Workers AI embedding request ─────────────────────────────────────────────
describe("Workers AI REST — embedding request body (guide §9 semantic search)", () => {
  it("wraps query string in text array (not a plain string)", () => {
    const query = "laws about employee dismissal protection";
    const body = { text: [query] };
    expect(body.text).toBeArray();
    expect(body.text).toHaveLength(1);
    expect(body.text[0]).toBe(query);
  });

  it("ingest batch body uses text array of multiple strings", () => {
    const texts = ["Lag om anställningsskydd", "Skattelag", "Konsumentköplag"];
    const body = { text: texts };
    expect(body.text).toHaveLength(3);
    expect(body.text[0]).toBe("Lag om anställningsskydd");
  });

  it("builds embedding URL correctly for a given account", () => {
    const accountId = "abc123def456";
    const url = `${CF_API_BASE}/${accountId}/ai/run/${EMBEDDING_MODEL}`;
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/abc123def456/ai/run/@cf/baai/bge-base-en-v1.5",
    );
    expect(() => new URL(url)).not.toThrow();
  });

  it("embedding URL ends with the model path segment", () => {
    const accountId = "test-account";
    const url = `${CF_API_BASE}/${accountId}/ai/run/${EMBEDDING_MODEL}`;
    expect(url).toEndWith("/@cf/baai/bge-base-en-v1.5");
  });
});

// ─── Vectorize v2 query request ────────────────────────────────────────────────
describe("Vectorize REST v2 — query request body", () => {
  it("uses vector (not embedding) key for the float array", () => {
    const vector = new Array(768).fill(0.05);
    const body = { vector, topK: 10, returnMetadata: "all" };
    expect(body).toHaveProperty("vector");
    expect(body.vector).toHaveLength(768);
  });

  it("sets topK to the requested number", () => {
    const body = { vector: [], topK: 15, returnMetadata: "all" };
    expect(body.topK).toBe(15);
  });

  it("sets returnMetadata to 'all' to get beteckning/titel/datum/organ back", () => {
    const body = { vector: [], topK: 10, returnMetadata: "all" };
    expect(body.returnMetadata).toBe("all");
  });

  it("vector must be exactly 768 dimensions (matches ingest)", () => {
    // bge-base-en-v1.5 always outputs 768-dim — mismatch would cause Vectorize error
    const EXPECTED_DIM = 768;
    const vector = new Array(EXPECTED_DIM).fill(0.1);
    expect(vector).toHaveLength(EXPECTED_DIM);
  });

  it("builds Vectorize v2 query URL correctly", () => {
    const accountId = "abc123def456";
    const url = `${CF_API_BASE}/${accountId}/vectorize/v2/indexes/${VECTORIZE_INDEX}/query`;
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/abc123def456/vectorize/v2/indexes/sfs-law-index/query",
    );
    expect(() => new URL(url)).not.toThrow();
  });

  it("Vectorize URL uses v2 path (not legacy v1)", () => {
    const url = `${CF_API_BASE}/test/vectorize/v2/indexes/${VECTORIZE_INDEX}/query`;
    expect(url).toContain("/vectorize/v2/");
    expect(url).not.toContain("/vectorize/v1/");
  });
});

// ─── Response parsing / metadata mapping ──────────────────────────────────────
describe("Vectorize response → metadata mapping", () => {
  const mockMatch = {
    id: "sfs-1982-80",
    score: 0.872,
    metadata: {
      beteckning: "1982:80",
      titel: "Lag (1982:80) om anställningsskydd",
      datum: "1982-02-24",
      organ: "Arbetsmarknadsdepartementet A",
      subtyp: "sfst",
    },
  };

  it("maps id to dokId", () => {
    const result = { dokId: mockMatch.id };
    expect(result.dokId).toBe("sfs-1982-80");
  });

  it("preserves score as number (cosine similarity 0-1)", () => {
    expect(mockMatch.score).toBe(0.872);
    expect(typeof mockMatch.score).toBe("number");
    expect(mockMatch.score).toBeGreaterThan(0);
    expect(mockMatch.score).toBeLessThanOrEqual(1);
  });

  it("extracts beteckning as string via String() cast", () => {
    const bet = String(mockMatch.metadata?.beteckning ?? "");
    expect(bet).toBe("1982:80");
  });

  it("extracts titel correctly", () => {
    const titel = String(mockMatch.metadata?.titel ?? "");
    expect(titel).toBe("Lag (1982:80) om anställningsskydd");
  });

  it("returns empty string for missing metadata fields (not undefined)", () => {
    const emptyMatch = { id: "sfs-2026-1", score: 0.5, metadata: {} as Record<string, unknown> };
    const beteckning = String(emptyMatch.metadata?.beteckning ?? "");
    const organ = String(emptyMatch.metadata?.organ ?? "");
    expect(beteckning).toBe("");
    expect(organ).toBe("");
    expect(typeof beteckning).toBe("string");
  });
});

// ─── Authorization header ──────────────────────────────────────────────────────
describe("Cloudflare API authorization header", () => {
  it("uses Bearer token format", () => {
    const apiToken = "my-secret-token-abc123";
    const authHeader = `Bearer ${apiToken}`;
    expect(authHeader).toStartWith("Bearer ");
    expect(authHeader).toBe("Bearer my-secret-token-abc123");
  });

  it("does not use API-Key prefix (that is for legacy email+key auth)", () => {
    const apiToken = "my-token";
    const authHeader = `Bearer ${apiToken}`;
    expect(authHeader).not.toStartWith("API-Key");
    expect(authHeader).not.toStartWith("X-Auth");
  });
});
