// =============================================================================
// Deploy Vectorize Index → Cloudflare Account
// =============================================================================
//
// Creates the "sfs-law-index" Vectorize index on your Cloudflare account.
// Uses the Cloudflare REST API (not wrangler) for portability.
//
// Usage:
//   bun scripts/deploy-vectorize.ts
//   bun scripts/deploy-vectorize.ts --dry-run        # preview only
//   bun scripts/deploy-vectorize.ts --delete          # delete index
//   bun scripts/deploy-vectorize.ts --status          # check index status
//
// Prerequisites:
//   - .env with CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
// =============================================================================

import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  loadAccounts,
  ensureVectorizeIndex,
  deleteVectorizeIndex,
  getVectorizeIndexInfo,
  VECTORIZE_INDEX_NAME,
} from "./lib/vectorize";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const ENV_FILE = join(ROOT, "backend", ".dev.vars");

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const DELETE_MODE = args.includes("--delete");
const STATUS_MODE = args.includes("--status");

// ── Colour helpers ────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};
const ok = (m: string) => console.log(`${C.green}  ✅  ${m}${C.reset}`);
const warn = (m: string) => console.log(`${C.yellow}  ⚠️   ${m}${C.reset}`);
const fail = (m: string) => console.error(`${C.red}  ❌  ${m}${C.reset}`);
const info = (m: string) => console.log(`${C.gray}       ${m}${C.reset}`);
const step = (m: string) => console.log(`\n${C.cyan}━━━  ${m}${C.reset}`);

const EMBEDDING_DIMENSIONS = 768;

// ── Env loader ────────────────────────────────────────────────────────────────
function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    fail(`Env file not found at: ${path}`);
    fail("Create backend/.dev.vars with CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN");
    process.exit(1);
  }

  const env: Record<string, string> = {};
  const lines = readFileSync(path, "utf8").split("\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const mode = DELETE_MODE ? "DELETE" : STATUS_MODE ? "STATUS" : "CREATE";

  console.log(
    `\n${C.blue}╔══════════════════════════════════════════════════════════════╗${C.reset}`,
  );
  console.log(
    `${C.blue}║   🗂️  Vectorize Index Manager (${mode.padEnd(6)})                    ║${C.reset}`,
  );
  console.log(
    `${C.blue}╚══════════════════════════════════════════════════════════════╝${C.reset}\n`,
  );

  // ── Load account ──────────────────────────────────────────────────────────
  const env = loadEnvFile(ENV_FILE);
  const accounts = loadAccounts(env);

  if (accounts.length === 0) {
    fail("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN not found in env file");
    process.exit(1);
  }

  ok(`${accounts.length} Cloudflare accounts loaded`);
  info(`Index name: ${VECTORIZE_INDEX_NAME}`);
  info(`Dimensions: ${EMBEDDING_DIMENSIONS}`);
  info(`Metric: cosine\n`);

  if (DRY_RUN) warn("DRY RUN — no changes will be made\n");

  const results: Array<{ account: number; success: boolean; detail: string }> = [];

  // ── STATUS mode ───────────────────────────────────────────────────────────
  if (STATUS_MODE) {
    step("Checking Vectorize index status on all accounts...");

    for (const account of accounts) {
      try {
        const indexInfo = await getVectorizeIndexInfo(account);
        if (indexInfo) {
          ok(`Account ${account.index}: ${indexInfo.name} (${indexInfo.config.dimensions}-dim, ${indexInfo.config.metric}) — created ${indexInfo.created_on}`);
          results.push({ account: account.index, success: true, detail: "exists" });
        } else {
          warn(`Account ${account.index}: no index found`);
          results.push({ account: account.index, success: true, detail: "not found" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Account ${account.index}: ${msg}`);
        results.push({ account: account.index, success: false, detail: msg });
      }
      await sleep(200);
    }

    return;
  }

  // ── DELETE mode ───────────────────────────────────────────────────────────
  if (DELETE_MODE) {
    step("Deleting Vectorize indexes on all accounts...");

    for (const account of accounts) {
      if (DRY_RUN) {
        info(`DRY-RUN: would delete index on account ${account.index}`);
        results.push({ account: account.index, success: true, detail: "dry-run" });
        continue;
      }

      try {
        const deleted = await deleteVectorizeIndex(account);
        if (deleted) {
          ok(`Account ${account.index}: index deleted`);
          results.push({ account: account.index, success: true, detail: "deleted" });
        } else {
          warn(`Account ${account.index}: delete returned false (may not exist)`);
          results.push({ account: account.index, success: true, detail: "not found" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Account ${account.index}: ${msg}`);
        results.push({ account: account.index, success: false, detail: msg });
      }
      await sleep(300);
    }

    return;
  }

  // ── CREATE mode (default) ─────────────────────────────────────────────────
  step("Creating/verifying Vectorize indexes on all accounts...");

  for (const account of accounts) {
    if (DRY_RUN) {
      info(`DRY-RUN: would ensure index on account ${account.index} (${account.accountId.slice(0, 8)}…)`);
      results.push({ account: account.index, success: true, detail: "dry-run" });
      continue;
    }

    try {
      const result = await ensureVectorizeIndex(account, EMBEDDING_DIMENSIONS);
      if (result.created) {
        ok(`Account ${account.index}: created ${result.name} (${EMBEDDING_DIMENSIONS}-dim, cosine)`);
      } else {
        ok(`Account ${account.index}: ${result.name} already exists`);
      }
      results.push({ account: account.index, success: true, detail: result.created ? "created" : "exists" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Account ${account.index}: ${msg}`);
      results.push({ account: account.index, success: false, detail: msg });
    }
    await sleep(300);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  step("Summary");

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const created = results.filter((r) => r.detail === "created").length;
  const existed = results.filter((r) => r.detail === "exists").length;

  console.log(`
  📊 Results:
     Accounts processed: ${accounts.length}
     Created:            ${created}
     Already existed:    ${existed}
     Failed:             ${failed}
  `);

  if (failed > 0) {
    warn("Failed accounts:");
    for (const r of results.filter((r) => !r.success)) {
      fail(`  Account ${r.account}: ${r.detail}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  fail(`Fatal error: ${err.message}`);
  process.exit(1);
});
