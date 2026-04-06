/**
 * Tests for the 15-account round-robin load balancer logic.
 *
 * We replicate the getVectorizeAccount() function from chat.ts in isolation
 * so we can control env vars and test every edge case without side effects.
 *
 * This mirrors the exact same pattern used in all three services:
 *   - law-agent/src/api/chat.ts  → getVectorizeAccount()
 *   - cloudflare-agent           → getRestLawAccount()
 *   - cloudflare-api             → getLawRestAccount()
 */
import { describe, expect, it } from "bun:test";

// Replicates getVectorizeAccount but with injected env (pure / testable)
function makeRoundRobin(env: Record<string, string | undefined>) {
  let rrIndex = 0;
  return function pick(): { accountId: string; apiToken: string; slot: number } | null {
    const accounts: Array<{ accountId: string; apiToken: string; slot: number }> = [];
    for (let i = 1; i <= 15; i++) {
      const accountId = env[`CLOUDFLARE_ACCOUNT_ID_${i}`];
      const apiToken = env[`CLOUDFLARE_API_TOKEN_${i}`];
      if (accountId && apiToken) {
        accounts.push({ accountId, apiToken, slot: i });
      }
    }
    if (accounts.length === 0) return null;
    const account = accounts[rrIndex % accounts.length];
    rrIndex++;
    return account;
  };
}

// Helper: build N-account env
function buildEnv(n: number): Record<string, string> {
  const env: Record<string, string> = {};
  for (let i = 1; i <= n; i++) {
    env[`CLOUDFLARE_ACCOUNT_ID_${i}`] = `acc-${i.toString().padStart(3, "0")}`;
    env[`CLOUDFLARE_API_TOKEN_${i}`] = `tok-${i.toString().padStart(3, "0")}`;
  }
  return env;
}

// ─── No accounts ──────────────────────────────────────────────────────────────
describe("round-robin — no accounts configured", () => {
  it("returns null when env is empty", () => {
    const pick = makeRoundRobin({});
    expect(pick()).toBeNull();
    expect(pick()).toBeNull();
    expect(pick()).toBeNull();
  });

  it("returns null when only accountId is set (missing token)", () => {
    const pick = makeRoundRobin({ CLOUDFLARE_ACCOUNT_ID_1: "acc-001" });
    expect(pick()).toBeNull();
  });

  it("returns null when only apiToken is set (missing accountId)", () => {
    const pick = makeRoundRobin({ CLOUDFLARE_API_TOKEN_1: "tok-001" });
    expect(pick()).toBeNull();
  });
});

// ─── Single account ───────────────────────────────────────────────────────────
describe("round-robin — single account", () => {
  it("always returns the same account", () => {
    const pick = makeRoundRobin(buildEnv(1));
    for (let i = 0; i < 10; i++) {
      expect(pick()?.accountId).toBe("acc-001");
    }
  });
});

// ─── Two accounts ─────────────────────────────────────────────────────────────
describe("round-robin — two accounts", () => {
  it("alternates between the two accounts", () => {
    const pick = makeRoundRobin(buildEnv(2));
    expect(pick()?.accountId).toBe("acc-001");
    expect(pick()?.accountId).toBe("acc-002");
    expect(pick()?.accountId).toBe("acc-001");
    expect(pick()?.accountId).toBe("acc-002");
  });
});

// ─── Full 15-account setup ────────────────────────────────────────────────────
describe("round-robin — 15 accounts (production setup)", () => {
  it("cycles through all 15 accounts in order", () => {
    const pick = makeRoundRobin(buildEnv(15));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i <= 15; i++) {
        const result = pick();
        expect(result?.accountId).toBe(`acc-${i.toString().padStart(3, "0")}`);
        expect(result?.apiToken).toBe(`tok-${i.toString().padStart(3, "0")}`);
      }
    }
  });

  it("correctly wraps at index 15 back to account 1", () => {
    const pick = makeRoundRobin(buildEnv(15));
    // Exhaust one full cycle
    for (let i = 0; i < 15; i++) pick();
    // 16th call should wrap to account 1
    expect(pick()?.accountId).toBe("acc-001");
  });

  it("distributes 1000 calls evenly across all 15 accounts", () => {
    const pick = makeRoundRobin(buildEnv(15));
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const a = pick()!;
      counts[a.accountId] = (counts[a.accountId] ?? 0) + 1;
    }
    // 1000 / 15 ≈ 66.67, so each account gets 66 or 67 calls
    for (let i = 1; i <= 15; i++) {
      const key = `acc-${i.toString().padStart(3, "0")}`;
      expect(counts[key]).toBeGreaterThanOrEqual(66);
      expect(counts[key]).toBeLessThanOrEqual(67);
    }
  });
});

// ─── Gaps in account sequence ─────────────────────────────────────────────────
describe("round-robin — sparse / partial account configs", () => {
  it("skips missing accounts in the sequence (1 and 3, no 2)", () => {
    const pick = makeRoundRobin({
      CLOUDFLARE_ACCOUNT_ID_1: "acc-001",
      CLOUDFLARE_API_TOKEN_1: "tok-001",
      // Account 2: intentionally absent
      CLOUDFLARE_ACCOUNT_ID_3: "acc-003",
      CLOUDFLARE_API_TOKEN_3: "tok-003",
    });
    expect(pick()?.accountId).toBe("acc-001");
    expect(pick()?.accountId).toBe("acc-003");
    expect(pick()?.accountId).toBe("acc-001"); // wraps
  });

  it("ignores account with only accountId (missing token)", () => {
    const pick = makeRoundRobin({
      CLOUDFLARE_ACCOUNT_ID_1: "acc-001",
      // no token for account 1
      CLOUDFLARE_ACCOUNT_ID_2: "acc-002",
      CLOUDFLARE_API_TOKEN_2: "tok-002",
    });
    // Only account 2 is valid
    expect(pick()?.accountId).toBe("acc-002");
    expect(pick()?.accountId).toBe("acc-002");
  });

  it("ignores account with empty string credentials", () => {
    const pick = makeRoundRobin({
      CLOUDFLARE_ACCOUNT_ID_1: "",
      CLOUDFLARE_API_TOKEN_1: "",
      CLOUDFLARE_ACCOUNT_ID_2: "acc-002",
      CLOUDFLARE_API_TOKEN_2: "tok-002",
    });
    // Empty strings are falsy — account 1 skipped
    expect(pick()?.accountId).toBe("acc-002");
  });

  it("honors slots > 9 (double-digit account indices)", () => {
    const env: Record<string, string> = {};
    // Only accounts 10, 11, 15
    env["CLOUDFLARE_ACCOUNT_ID_10"] = "acc-010";
    env["CLOUDFLARE_API_TOKEN_10"] = "tok-010";
    env["CLOUDFLARE_ACCOUNT_ID_11"] = "acc-011";
    env["CLOUDFLARE_API_TOKEN_11"] = "tok-011";
    env["CLOUDFLARE_ACCOUNT_ID_15"] = "acc-015";
    env["CLOUDFLARE_API_TOKEN_15"] = "tok-015";

    const pick = makeRoundRobin(env);
    expect(pick()?.accountId).toBe("acc-010");
    expect(pick()?.accountId).toBe("acc-011");
    expect(pick()?.accountId).toBe("acc-015");
    expect(pick()?.accountId).toBe("acc-010"); // wraps
  });
});
