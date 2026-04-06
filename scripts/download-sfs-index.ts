// =============================================================================
// Download ALL Active Swedish Laws (Metadata Only) from Riksdagen API
// =============================================================================
//
// Downloads the full list of "gällande SFS" (currently active laws) from
// data.riksdagen.se/dokumentlista. Saves ONLY the list + metadata, NOT the
// full law text (dokumentstatus).
//
// Output:
//   data/sfs-index.json         — Array of all law metadata entries
//   data/sfs-index-meta.json    — Download stats + timestamp
//
// Usage:
//   bun scripts/download-sfs-index.ts
//   bun scripts/download-sfs-index.ts --force    # re-download even if recent
//
// Rate limiting: 500ms delay between pages (be respectful to Riksdagen API)
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, "..", "data");
const INDEX_FILE = join(DATA_DIR, "sfs-index.json");
const META_FILE = join(DATA_DIR, "sfs-index-meta.json");

// ── Config ────────────────────────────────────────────────────────────────────
const RIKSDAGEN_BASE = "https://data.riksdagen.se";
const PAGE_SIZE = 50; // Max practical page size
const DELAY_MS = 500; // Delay between requests
const TIMEOUT_MS = 20_000;
const FORCE = process.argv.includes("--force");

// ── Colour helpers ────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
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
  publicerad: string;
  systemdatum: string;
  organ: string;
  doktyp: string;
  typ: string;
  subtyp: string;
  nummer: string;
  rm: string;
  status: string;
  relaterat_id: string;
  summary: string;
  dokument_url_text: string;
  dokument_url_html: string;
};

type DownloadMeta = {
  downloadedAt: string;
  totalLaws: number;
  pagesDownloaded: number;
  elapsedMs: number;
  source: string;
  filter: {
    doktyp: string;
    subtyp: string;
    dokstat: string;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(page: number): Promise<{
  documents: SfsMetadataEntry[];
  totalHits: number;
  hasNextPage: boolean;
}> {
  const params = new URLSearchParams({
    doktyp: "sfs",
    subtyp: "sfst",
    dokstat: "gällande sfs",
    utformat: "json",
    sort: "datum",
    sortorder: "desc",
    sz: String(PAGE_SIZE),
    p: String(page),
  });

  const url = `${RIKSDAGEN_BASE}/dokumentlista/?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      dokumentlista?: {
        "@traffar"?: string;
        "@sida"?: string;
        "@sidor"?: string;
        "@nasta_sida"?: string;
        dokument?: Array<Record<string, string | null>>;
      };
    };

    const list = data?.dokumentlista;
    if (!list) throw new Error("Missing dokumentlista in response");

    const totalHits = Number(list["@traffar"] ?? "0");
    const hasNextPage = !!list["@nasta_sida"];
    const rawDocs = list.dokument ?? [];

    const documents: SfsMetadataEntry[] = rawDocs.map((d) => ({
      dok_id: d.dok_id ?? "",
      beteckning: d.beteckning ?? "",
      titel: d.titel ?? "",
      datum: d.datum ?? "",
      publicerad: d.publicerad ?? "",
      systemdatum: d.systemdatum ?? "",
      organ: d.organ ?? "",
      doktyp: d.doktyp ?? "sfs",
      typ: d.typ ?? "sfs",
      subtyp: d.subtyp ?? "sfst",
      nummer: d.nummer ?? "",
      rm: d.rm ?? "",
      status: d.status ?? "",
      relaterat_id: d.relaterat_id ?? "",
      summary: d.summary ?? "",
      dokument_url_text: d.dokument_url_text ?? "",
      dokument_url_html: d.dokument_url_html ?? "",
    }));

    return { documents, totalHits, hasNextPage };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Freshness check ───────────────────────────────────────────────────────────
function isRecentDownload(): boolean {
  if (!existsSync(META_FILE)) return false;
  try {
    const meta: DownloadMeta = JSON.parse(readFileSync(META_FILE, "utf8"));
    const age = Date.now() - new Date(meta.downloadedAt).getTime();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (age < ONE_DAY) {
      info(
        `Last download was ${Math.round(age / 60_000)} minutes ago (${meta.totalLaws} laws). Use --force to re-download.`,
      );
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(
    `\n${C.cyan}╔══════════════════════════════════════════════════════════════╗${C.reset}`,
  );
  console.log(
    `${C.cyan}║   📜 Riksdagen SFS Index Downloader (Metadata Only)         ║${C.reset}`,
  );
  console.log(
    `${C.cyan}╚══════════════════════════════════════════════════════════════╝${C.reset}\n`,
  );

  // Skip if recent download exists (unless --force)
  if (!FORCE && isRecentDownload()) {
    ok("Recent download exists — skipping. Use --force to re-download.");
    return;
  }

  // Ensure data directory
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const startTime = Date.now();
  const allLaws: SfsMetadataEntry[] = [];
  let page = 1;
  let totalHits = 0;

  step("Downloading SFS metadata from Riksdagen API...");
  info(`Filter: doktyp=sfs, subtyp=sfst, dokstat=gällande sfs`);
  info(`Page size: ${PAGE_SIZE}, delay: ${DELAY_MS}ms\n`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const result = await fetchPage(page);
      totalHits = result.totalHits;
      allLaws.push(...result.documents);

      const totalPages = Math.ceil(totalHits / PAGE_SIZE);
      info(
        `Page ${page}/${totalPages} — fetched ${result.documents.length} laws (total: ${allLaws.length}/${totalHits})`,
      );

      if (!result.hasNextPage || result.documents.length === 0) {
        break;
      }

      page++;
      await sleep(DELAY_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warn(`Page ${page} failed: ${message} — retrying in 2s...`);
      await sleep(2000);

      try {
        const retry = await fetchPage(page);
        totalHits = retry.totalHits;
        allLaws.push(...retry.documents);
        page++;
        await sleep(DELAY_MS);
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        fail(`Page ${page} failed on retry: ${retryMsg} — stopping.`);
        break;
      }
    }
  }

  if (allLaws.length === 0) {
    fail("No laws downloaded. Check network / Riksdagen API status.");
    process.exit(1);
  }

  // ── Deduplicate by dok_id (safety) ────────────────────────────────────────
  const seen = new Set<string>();
  const uniqueLaws = allLaws.filter((law) => {
    if (seen.has(law.dok_id)) return false;
    seen.add(law.dok_id);
    return true;
  });

  const dupes = allLaws.length - uniqueLaws.length;
  if (dupes > 0) {
    warn(`Removed ${dupes} duplicate entries`);
  }

  // ── Write index file ──────────────────────────────────────────────────────
  step("Writing SFS index to disk...");

  writeFileSync(INDEX_FILE, JSON.stringify(uniqueLaws, null, 2), "utf8");
  ok(`${INDEX_FILE} — ${uniqueLaws.length} laws`);

  const elapsed = Date.now() - startTime;
  const meta: DownloadMeta = {
    downloadedAt: new Date().toISOString(),
    totalLaws: uniqueLaws.length,
    pagesDownloaded: page,
    elapsedMs: elapsed,
    source: `${RIKSDAGEN_BASE}/dokumentlista/`,
    filter: {
      doktyp: "sfs",
      subtyp: "sfst",
      dokstat: "gällande sfs",
    },
  };

  writeFileSync(META_FILE, JSON.stringify(meta, null, 2), "utf8");
  ok(`${META_FILE} — download stats`);

  // ── Summary ───────────────────────────────────────────────────────────────
  step("Download Complete!");
  console.log(`
  📊 Summary:
     Total laws downloaded:  ${uniqueLaws.length}
     Pages fetched:          ${page}
     Time elapsed:           ${(elapsed / 1000).toFixed(1)}s
     Index file:             data/sfs-index.json
     Meta file:              data/sfs-index-meta.json
  `);
}

main().catch((err) => {
  fail(`Fatal error: ${err.message}`);
  process.exit(1);
});
