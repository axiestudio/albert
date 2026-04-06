// =============================================================================
// Ingest SFS Index → Cloudflare Vectorize (Single Account)
// =============================================================================
//
// Reads the locally downloaded sfs-index.json, generates embeddings via
// Workers AI, and upserts the vectors into the Vectorize "sfs-law-index".
//
// Prerequisites:
//   1. Run download-sfs-index.ts first to create data/sfs-index.json
//   2. Run deploy-vectorize.ts first to create the index
//   3. backend/.dev.vars must have CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
//
// Usage:
//   bun scripts/ingest-sfs-vectorize.ts
//   bun scripts/ingest-sfs-vectorize.ts --dry-run      # no writes
// =============================================================================

import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createEmbeddingClient } from "./lib/embeddings";
import { loadAccounts, upsertVectors, type VectorizeVector } from "./lib/vectorize";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const DATA_DIR = join(__dirname, "..", "data");
const INDEX_FILE = join(DATA_DIR, "sfs-index.json");
const ENV_FILE = join(ROOT, "backend", ".dev.vars");

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// ── Colour helpers ────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
};
const ok = (m: string) => console.log(`${C.green}  ✅  ${m}${C.reset}`);
const warn = (m: string) => console.log(`${C.yellow}  ⚠️   ${m}${C.reset}`);
const fail = (m: string) => console.error(`${C.red}  ❌  ${m}${C.reset}`);
const info = (m: string) => console.log(`${C.gray}       ${m}${C.reset}`);
const step = (m: string) => console.log(`\n${C.cyan}━━━  ${m}${C.reset}`);

// ── Types ─────────────────────────────────────────────────────────────────────
type SfsMetadataEntry = {
  dok_id: string;
  beteckning: string;
  titel: string;
  datum: string;
  organ: string;
  summary: string;
  subtyp: string;
  nummer: string;
  rm: string;
  status: string;
};

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

/**
 * Build the text that gets embedded for each law.
 * Combines titel + beteckning + organ + summary into a single string.
 */
function buildEmbeddingText(law: SfsMetadataEntry): string {
  const parts = [
    law.titel,
    `SFS ${law.beteckning}`,
    law.organ,
    law.summary,
  ].filter(Boolean);

  return parts.join(" — ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(
    `\n${C.magenta}╔══════════════════════════════════════════════════════════════╗${C.reset}`,
  );
  console.log(
    `${C.magenta}║   🔮 SFS → Vectorize Ingestion Pipeline                      ║${C.reset}`,
  );
  console.log(
    `${C.magenta}╚══════════════════════════════════════════════════════════════╝${C.reset}\n`,
  );

  // ── Load SFS index ────────────────────────────────────────────────────────
  if (!existsSync(INDEX_FILE)) {
    fail(`SFS index not found: ${INDEX_FILE}`);
    fail("Run 'bun scripts/download-sfs-index.ts' first.");
    process.exit(1);
  }

  const laws: SfsMetadataEntry[] = JSON.parse(readFileSync(INDEX_FILE, "utf8"));
  ok(`Loaded ${laws.length} laws from sfs-index.json`);

  // ── Load env + account ────────────────────────────────────────────────────
  const env = loadEnvFile(ENV_FILE);
  const accounts = loadAccounts(env);

  if (accounts.length === 0) {
    fail("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN not found in env");
    process.exit(1);
  }

  ok(`Cloudflare account loaded`);

  if (DRY_RUN) {
    warn("DRY RUN — no vectors will be written");
  }

  // ── Step 1: Generate embeddings ───────────────────────────────────────────
  step("Generating embeddings via Workers AI (round-robin)...");

  const embeddingClient = createEmbeddingClient(env);
  info(`Model: ${embeddingClient.getModel()} (${embeddingClient.getDimensions()}-dim)`);
  info(`Accounts for embedding: ${embeddingClient.getAccountCount()}`);

  const texts = laws.map(buildEmbeddingText);
  info(`Embedding ${texts.length} law texts in batches of 100...\n`);

  let allVectors: number[][];

  if (DRY_RUN) {
    info("DRY-RUN: skipping actual embedding calls");
    allVectors = texts.map(() => new Array(768).fill(0));
  } else {
    const startEmbed = Date.now();
    allVectors = await embeddingClient.embedBatched(texts);
    const embedMs = Date.now() - startEmbed;
    ok(`Generated ${allVectors.length} vectors in ${(embedMs / 1000).toFixed(1)}s`);
  }

  // ── Step 2: Build Vectorize vectors with metadata ─────────────────────────
  step("Building vector payloads with metadata...");

  const vectorPayloads: VectorizeVector[] = laws.map((law, i) => ({
    id: law.dok_id,
    values: allVectors[i],
    metadata: {
      beteckning: law.beteckning,
      titel: law.titel.slice(0, 500),
      datum: law.datum,
      organ: law.organ,
      subtyp: law.subtyp || "sfst",
      rm: law.rm,
    },
  }));

  ok(`${vectorPayloads.length} vector payloads ready`);

  // ── Step 3: Upsert to all target accounts ─────────────────────────────────
  step(`Upserting vectors into Vectorize on ${accounts.length} account(s)...`);

  const results: Array<{ account: number; success: boolean; count: number; error?: string }> = [];

  for (const account of accounts) {
    info(`\n  Account ${account.index} (${account.accountId.slice(0, 8)}…):`);

    if (DRY_RUN) {
      info(`  DRY-RUN: would upsert ${vectorPayloads.length} vectors`);
      results.push({ account: account.index, success: true, count: vectorPayloads.length });
      continue;
    }

    try {
      const startUpsert = Date.now();
      const result = await upsertVectors(account, vectorPayloads);
      const upsertMs = Date.now() - startUpsert;
      ok(`  Account ${account.index}: upserted ${result.count} vectors in ${(upsertMs / 1000).toFixed(1)}s`);
      results.push({ account: account.index, success: true, count: result.count });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fail(`  Account ${account.index}: ${message}`);
      results.push({ account: account.index, success: false, count: 0, error: message });
    }

    // Small delay between accounts
    await sleep(500);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  step("Ingestion Summary");

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`
  📊 Results:
     Laws processed:    ${laws.length}
     Vectors generated: ${allVectors.length}
     Accounts targeted: ${accounts.length}
     Succeeded:         ${succeeded}
     Failed:            ${failed}
  `);

  if (failed > 0) {
    warn("Failed accounts:");
    for (const r of results.filter((r) => !r.success)) {
      fail(`  Account ${r.account}: ${r.error}`);
    }
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  fail(`Fatal error: ${err.message}`);
  process.exit(1);
});
