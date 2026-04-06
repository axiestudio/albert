#!/usr/bin/env bun
// =============================================================================
//  Albert Law Agent — Interactive CLI
//
//  All-in-one setup, development, build, deploy, and Vectorize management.
//  Modeled after the Axie Studio deploy.mjs orchestrator.
//
//  Usage:
//    bun scripts/albert.mjs                   # Interactive menu
//    bun scripts/albert.mjs setup             # Setup wizard (env + install)
//    bun scripts/albert.mjs dev               # Start both servers
//    bun scripts/albert.mjs build             # Build both services
//    bun scripts/albert.mjs deploy            # Deploy both to Cloudflare
//    bun scripts/albert.mjs deploy:prod       # Deploy both to production
//    bun scripts/albert.mjs secrets           # Set production secrets
//    bun scripts/albert.mjs vectorize         # Vectorize pipeline
//    bun scripts/albert.mjs test              # Run E2E tests
//    bun scripts/albert.mjs health            # Health check
// =============================================================================

import { spawnSync, spawn } from "child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  mkdirSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

// ─── Paths ────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BACKEND = join(ROOT, "backend");
const FRONTEND = join(ROOT, "frontend");

// ─── Colours ──────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
};

const ok = (t) => console.log(`${c.green}  ✅  ${t}${c.reset}`);
const warn = (t) => console.log(`${c.yellow}  ⚠️   ${t}${c.reset}`);
const fail = (t) => console.log(`${c.red}  ❌  ${t}${c.reset}`);
const info = (t) => console.log(`${c.gray}       ${t}${c.reset}`);
const step = (t) => console.log(`\n${c.cyan}${c.bold}  ▶  ${t}${c.reset}`);

function banner() {
  const line = "═".repeat(72);
  console.log();
  console.log(`${c.blue}${c.bold}${line}${c.reset}`);
  console.log(`${c.blue}${c.bold}${c.reset}`);
  console.log(`${c.blue}${c.bold}     █████╗ ██╗     ██████╗ ███████╗██████╗ ████████╗${c.reset}`);
  console.log(`${c.blue}${c.bold}    ██╔══██╗██║     ██╔══██╗██╔════╝██╔══██╗╚══██╔══╝${c.reset}`);
  console.log(`${c.blue}${c.bold}    ███████║██║     ██████╔╝█████╗  ██████╔╝   ██║${c.reset}`);
  console.log(`${c.blue}${c.bold}    ██╔══██║██║     ██╔══██╗██╔══╝  ██╔══██╗   ██║${c.reset}`);
  console.log(`${c.blue}${c.bold}    ██║  ██║███████╗██████╔╝███████╗██║  ██║   ██║${c.reset}`);
  console.log(`${c.blue}${c.bold}    ╚═╝  ╚═╝╚══════╝╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝${c.reset}`);
  console.log(`${c.blue}${c.bold}${c.reset}`);
  console.log(`${c.blue}${c.bold}    ⚖️  Swedish Law Research Agent${c.reset}`);
  console.log(`${c.blue}${c.bold}${c.reset}`);
  console.log(`${c.blue}${c.bold}${line}${c.reset}`);
  console.log();
}

function sectionHeader(label) {
  const line = "─".repeat(60);
  console.log();
  console.log(`${c.cyan}${line}${c.reset}`);
  console.log(`${c.cyan}${c.bold}  ${label}${c.reset}`);
  console.log(`${c.cyan}${line}${c.reset}`);
}

// ─── Readline helpers ─────────────────────────────────────────────────────────

function createRL() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(`${c.white}  ${question}${c.reset}`, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function menu(rl, title, options) {
  console.log();
  console.log(`${c.bold}${c.white}  ${title}${c.reset}`);
  console.log();
  options.forEach((opt, i) => {
    const num = `${c.cyan}${c.bold}  [${i + 1}]${c.reset}`;
    const label = `${c.white} ${opt.label}${c.reset}`;
    const desc = opt.desc ? `${c.gray}  — ${opt.desc}${c.reset}` : "";
    console.log(`${num}${label}${desc}`);
  });
  console.log();

  while (true) {
    const answer = await ask(rl, `Select [1-${options.length}]: `);
    const idx = parseInt(answer, 10) - 1;
    if (idx >= 0 && idx < options.length) {
      return options[idx].value;
    }
    warn(`Invalid choice. Enter a number between 1 and ${options.length}.`);
  }
}

// ─── Shell runner ─────────────────────────────────────────────────────────────

function run(cmd, args, cwd, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: opts.silent ? "pipe" : "inherit",
    shell: true,
    encoding: "utf8",
  });
  return { ok: result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function runAsync(cmd, args, cwd) {
  return spawn(cmd, args, { cwd, stdio: "inherit", shell: true });
}

// ─── Env file helpers ─────────────────────────────────────────────────────────

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const map = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map[line.slice(0, idx).trim()] = value;
  }
  return map;
}

function envFileExists(dir) {
  return existsSync(join(dir, ".dev.vars"));
}

// =============================================================================
//  COMMANDS
// =============================================================================

// ─── Setup Wizard ─────────────────────────────────────────────────────────────

async function cmdSetup(rl) {
  sectionHeader("🔧  Environment Setup");

  const backendVars = join(BACKEND, ".dev.vars");
  const envExample = join(ROOT, ".env.example");

  // Check existing configs
  const backendExists = existsSync(backendVars);

  if (backendExists) {
    ok("backend/.dev.vars already exists.");
    const backendEnv = loadEnvFile(backendVars);

    // Validate keys
    let allGood = true;
    if (!backendEnv.GOOGLE_API_KEY || backendEnv.GOOGLE_API_KEY.includes("your_")) {
      warn("backend/.dev.vars: GOOGLE_API_KEY is missing or placeholder.");
      allGood = false;
    }
    if (allGood) {
      ok("Backend defaults look configured.");
    }
    info("Frontend provider keys are entered in Albert's Settings UI and stored locally in the browser.");

    const answer = await ask(rl, "Reconfigure? (y/N): ");
    if (answer.toLowerCase() !== "y") {
      return cmdInstall();
    }
  }

  console.log();
  info("Albert needs at minimum a Google API key for Vertex AI Express Mode.");
  info("Get one free at: https://aistudio.google.com/apikey");
  console.log();

  const googleKey = await ask(rl, "GOOGLE_API_KEY: ");

  if (!googleKey) {
    warn("No key entered. You can edit .dev.vars manually later.");
    warn("Template: cp .env.example backend/.dev.vars");
    info("Frontend Server 1 and Vertex settings can be entered later in the Albert settings modal.");
    return;
  }

  // Optional: Cloudflare credentials for Vectorize
  console.log();
  info("Cloudflare credentials enable semantic search via Vectorize (optional).");
  info("Get your Account ID from: https://dash.cloudflare.com → Workers & Pages → Overview");
  info("Create API Token at: https://dash.cloudflare.com/profile/api-tokens");
  console.log();

  const cfAccountId = await ask(rl, "CLOUDFLARE_ACCOUNT_ID (or press Enter to skip): ");
  const cfApiToken = cfAccountId ? await ask(rl, "CLOUDFLARE_API_TOKEN: ") : "";

  // Write backend .dev.vars
  step("Writing backend/.dev.vars...");
  let backendContent = readFileSync(envExample, "utf8");
  backendContent = backendContent.replace("GOOGLE_API_KEY=your_google_api_key_here", `GOOGLE_API_KEY=${googleKey}`);
  if (cfAccountId) {
    backendContent = backendContent.replace("CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id", `CLOUDFLARE_ACCOUNT_ID=${cfAccountId}`);
  }
  if (cfApiToken) {
    backendContent = backendContent.replace("CLOUDFLARE_API_TOKEN=your_cloudflare_api_token", `CLOUDFLARE_API_TOKEN=${cfApiToken}`);
  }
  writeFileSync(backendVars, backendContent, "utf8");
  ok("backend/.dev.vars written.");
  info("Frontend provider keys can be entered later in the Albert settings modal.");

  // Run install
  return cmdInstall();
}

// ─── Install ──────────────────────────────────────────────────────────────────

function cmdInstall() {
  sectionHeader("📦  Installing Dependencies");

  step("Installing backend dependencies...");
  const b = run("bun", ["install"], BACKEND);
  if (b.ok) {
    ok("Backend dependencies installed.");
  } else {
    fail("Backend install failed.");
    return false;
  }

  step("Installing frontend dependencies...");
  const f = run("bun", ["install"], FRONTEND);
  if (f.ok) {
    ok("Frontend dependencies installed.");
  } else {
    fail("Frontend install failed.");
    return false;
  }

  ok("All dependencies installed!");
  return true;
}

// ─── Dev ──────────────────────────────────────────────────────────────────────

function cmdDev() {
  sectionHeader("🚀  Starting Development Servers");

  // Validate env files exist
  if (!envFileExists(BACKEND)) {
    fail("backend/.dev.vars not found. Run setup first: bun run setup");
    return false;
  }

  info("Backend:  http://localhost:3001");
  info("Frontend: http://localhost:3000");
  info("Health:   http://localhost:3001/health");
  console.log();
  info("Press Ctrl+C to stop both servers.");
  console.log();

  // Start backend
  const backend = runAsync("bun", ["run", "dev"], BACKEND);
  backend.on("error", (err) => fail(`Backend error: ${err.message}`));

  // Start frontend
  const frontend = runAsync("bun", ["run", "dev"], FRONTEND);
  frontend.on("error", (err) => fail(`Frontend error: ${err.message}`));

  // Handle exit
  const cleanup = () => {
    backend.kill();
    frontend.kill();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Keep alive
  return new Promise(() => {}); // Never resolves — user Ctrl+C to exit
}

// ─── Build ────────────────────────────────────────────────────────────────────

function cmdBuild() {
  sectionHeader("🔨  Building Both Services");

  step("Building backend (wrangler dry-run)...");
  const b = run("bun", ["run", "build"], BACKEND);
  if (b.ok) {
    ok("Backend built successfully.");
  } else {
    fail("Backend build failed.");
    return false;
  }

  step("Building frontend (Astro + Cloudflare adapter)...");
  const f = run("bun", ["run", "build"], FRONTEND);
  if (f.ok) {
    ok("Frontend built successfully.");
  } else {
    fail("Frontend build failed.");
    return false;
  }

  ok("Both services built!");
  return true;
}

// ─── Deploy ───────────────────────────────────────────────────────────────────

async function cmdDeploy(rl) {
  sectionHeader("☁️   Deploying to Cloudflare");

  // Check wrangler auth
  step("Checking wrangler authentication...");
  const auth = run("bunx", ["wrangler", "whoami"], ROOT, { silent: true });
  if (!auth.ok) {
    fail("Not authenticated with wrangler. Run: bunx wrangler login");
    return false;
  }
  ok("Wrangler authenticated.");

  const target = await menu(rl, "Deploy target:", [
    { value: "both", label: "Both services", desc: "Backend worker + Frontend pages" },
    { value: "backend", label: "Backend only", desc: "Hono API worker → Cloudflare Workers" },
    { value: "frontend", label: "Frontend only", desc: "Astro app → Cloudflare Pages" },
  ]);

  if (target === "both" || target === "backend") {
    step("Deploying backend → Cloudflare Workers...");
    const b = run("bun", ["run", "deploy"], BACKEND);
    if (b.ok) {
      ok("Backend deployed!");
    } else {
      fail("Backend deploy failed.");
      if (target === "backend") return false;
    }
  }

  if (target === "both" || target === "frontend") {
    step("Building frontend...");
    const build = run("bun", ["run", "build"], FRONTEND);
    if (!build.ok) {
      fail("Frontend build failed.");
      return false;
    }

    // Write .assetsignore
    const assetsIgnore = join(FRONTEND, "dist", ".assetsignore");
    if (existsSync(join(FRONTEND, "dist"))) {
      writeFileSync(assetsIgnore, "_worker.js\n", "utf8");
    }

    step("Deploying frontend → Cloudflare Pages...");
    const f = run("bunx", ["wrangler", "deploy"], FRONTEND);
    if (f.ok) {
      ok("Frontend deployed!");
    } else {
      fail("Frontend deploy failed.");
      return false;
    }
  }

  ok("Deployment complete!");
  return true;
}

// ─── Vectorize ────────────────────────────────────────────────────────────────

async function cmdVectorize(rl) {
  sectionHeader("🔍  Vectorize Pipeline");

  // Validate Cloudflare credentials
  const env = loadEnvFile(join(BACKEND, ".dev.vars"));
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    fail("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in backend/.dev.vars");
    info("These are required for Vectorize. Run setup to configure.");
    return false;
  }

  const action = await menu(rl, "Vectorize action:", [
    { value: "status", label: "Check status", desc: "Show current index info" },
    { value: "setup", label: "Create index", desc: "Create sfs-law-index on your account" },
    { value: "ingest", label: "Full pipeline", desc: "Download laws → Embed → Ingest" },
    { value: "back", label: "← Back to menu" },
  ]);

  if (action === "back") return true;

  const SCRIPTS = join(ROOT, "scripts");

  if (action === "status") {
    step("Checking Vectorize index status...");
    run("bun", [join(SCRIPTS, "deploy-vectorize.ts"), "--status"], ROOT);
  } else if (action === "setup") {
    step("Creating Vectorize index...");
    run("bun", [join(SCRIPTS, "deploy-vectorize.ts")], ROOT);
  } else if (action === "ingest") {
    step("Step 1/3: Downloading Swedish law metadata from Riksdagen...");
    const dl = run("bun", [join(SCRIPTS, "download-sfs-index.ts"), "--force"], ROOT);
    if (!dl.ok) {
      fail("Download failed.");
      return false;
    }

    step("Step 2/3: Creating Vectorize index (if needed)...");
    run("bun", [join(SCRIPTS, "deploy-vectorize.ts")], ROOT);

    step("Step 3/3: Generating embeddings & ingesting vectors...");
    const ingest = run("bun", [join(SCRIPTS, "ingest-sfs-vectorize.ts")], ROOT);
    if (ingest.ok) {
      ok("Vectorize pipeline complete! Semantic search is ready.");
    } else {
      fail("Ingestion failed.");
      return false;
    }
  }

  return true;
}

// ─── E2E Tests ────────────────────────────────────────────────────────────────

function cmdTest() {
  sectionHeader("🧪  Running E2E Tests");

  info("Ensure both servers are running (bun run dev) in another terminal.");
  console.log();

  // Quick health check
  step("Checking backend health...");
  const health = run("curl", ["-sf", "http://localhost:3001/health"], ROOT, { silent: true });
  if (!health.ok) {
    fail("Backend not responding at http://localhost:3001/health");
    info("Start servers first: bun run dev");
    return false;
  }
  ok("Backend is healthy.");

  step("Running Playwright tests...");
  const configPath = join(ROOT, "tests", "e2e", "playwright.law-agent.config.ts");
  const result = run("bunx", ["playwright", "test", "--config", configPath], ROOT);

  if (result.ok) {
    ok("All E2E tests passed!");
  } else {
    fail("Some tests failed.");
  }
  return result.ok;
}

// ─── Health Check ─────────────────────────────────────────────────────────────

function cmdHealth() {
  sectionHeader("💚  Health Check");

  // Backend
  step("Checking backend (http://localhost:3001/health)...");
  const backend = run("curl", ["-sf", "http://localhost:3001/health"], ROOT, { silent: true });
  if (backend.ok) {
    ok(`Backend: ${backend.stdout.trim()}`);
  } else {
    fail("Backend not responding.");
  }

  // Frontend
  step("Checking frontend (http://localhost:3000)...");
  const frontend = run("curl", ["-sf", "-o", "/dev/null", "-w", '"%{http_code}"', "http://localhost:3000"], ROOT, { silent: true });
  if (frontend.ok) {
    ok(`Frontend: HTTP ${frontend.stdout.replace(/"/g, "").trim()}`);
  } else {
    fail("Frontend not responding.");
  }

  return backend.ok;
}

// ─── Type Check ───────────────────────────────────────────────────────────────

function cmdCheckTypes() {
  sectionHeader("📐  Type Checking");

  step("Type-checking backend...");
  const b = run("bun", ["run", "check-types"], BACKEND);
  if (b.ok) {
    ok("Backend types OK.");
  } else {
    fail("Backend type errors found.");
  }

  step("Type-checking frontend...");
  const f = run("bun", ["run", "check-types"], FRONTEND);
  if (f.ok) {
    ok("Frontend types OK.");
  } else {
    fail("Frontend type errors found.");
  }

  return b.ok && f.ok;
}

// ─── Production Secrets ───────────────────────────────────────────────────────

async function cmdSecrets(rl) {
  sectionHeader("🔐  Set Production Secrets");

  // Check wrangler auth
  step("Checking wrangler authentication...");
  const auth = run("bunx", ["wrangler", "whoami"], ROOT, { silent: true });
  if (!auth.ok) {
    fail("Not authenticated. Run: bunx wrangler login");
    return false;
  }
  ok("Wrangler authenticated.");

  console.log();
  info("This sets secrets on the deployed backend worker.");
  info("You must deploy the backend first: bun run deploy:backend");
  console.log();

  const secrets = [
    { key: "GOOGLE_API_KEY", required: true, desc: "Google Vertex AI Express Mode key" },
    { key: "CLOUDFLARE_ACCOUNT_ID", required: false, desc: "Cloudflare Account ID (for Vectorize)" },
    { key: "CLOUDFLARE_API_TOKEN", required: false, desc: "Cloudflare API Token (for Vectorize)" },
    { key: "OPENAI_API_KEY", required: false, desc: "OpenAI key (optional)" },
    { key: "ANTHROPIC_API_KEY", required: false, desc: "Anthropic key (optional)" },
    { key: "VERTEX_PROJECT_ID", required: false, desc: "GCP project for Vertex partner models (optional)" },
  ];

  // Try to read existing .dev.vars for defaults
  const existing = loadEnvFile(join(BACKEND, ".dev.vars"));

  let setCount = 0;

  for (const { key, required, desc } of secrets) {
    const marker = required ? `${c.red}(required)${c.reset}` : `${c.gray}(optional)${c.reset}`;
    const current = existing[key];
    const hint = current && !current.includes("your_") ? ` [current: ${current.slice(0, 8)}...]` : "";

    console.log();
    info(`${desc} ${marker}${hint}`);
    const value = await ask(rl, `${key} (Enter to skip): `);

    if (!value) {
      if (required) warn(`Skipped ${key} — you'll need to set it manually later.`);
      continue;
    }

    step(`Setting ${key}...`);
    const result = run("bash", ["-c", `echo "${value}" | bunx wrangler secret put ${key}`], BACKEND, { silent: true });
    if (!result.ok) {
      // Fallback for Windows
      const winResult = run("cmd", ["/c", `echo ${value}| bunx wrangler secret put ${key}`], BACKEND, { silent: true });
      if (winResult.ok) {
        ok(`${key} set.`);
        setCount++;
      } else {
        fail(`Failed to set ${key}. Set manually: cd backend && echo "VALUE" | bunx wrangler secret put ${key}`);
      }
    } else {
      ok(`${key} set.`);
      setCount++;
    }
  }

  console.log();
  if (setCount > 0) {
    ok(`${setCount} secret(s) configured on production worker.`);
  } else {
    warn("No secrets were set. You can set them manually:");
    info("  cd backend && bunx wrangler secret put GOOGLE_API_KEY");
  }

  return true;
}

// ─── Deploy Production ────────────────────────────────────────────────────────

async function cmdDeployProd(rl) {
  sectionHeader("🚀  Deploy to Production");

  // Check wrangler auth
  step("Checking wrangler authentication...");
  const auth = run("bunx", ["wrangler", "whoami"], ROOT, { silent: true });
  if (!auth.ok) {
    fail("Not authenticated. Run: bunx wrangler login");
    return false;
  }
  ok("Wrangler authenticated.");

  // Step 1: Deploy backend
  step("Step 1/3: Deploying backend → Cloudflare Workers...");
  const b = run("bun", ["run", "deploy"], BACKEND);
  if (!b.ok) {
    fail("Backend deploy failed.");
    return false;
  }
  ok("Backend deployed!");
  console.log();
  warn("Note your backend URL (shown above). Update frontend/wrangler.toml");
  info("[env.production] → API_URL if you haven't already.");
  console.log();

  const proceed = await ask(rl, "Continue with frontend deploy? (Y/n): ");
  if (proceed.toLowerCase() === "n") return true;

  // Step 2: Build + deploy frontend
  step("Step 2/3: Building frontend (Astro + Cloudflare adapter)...");
  const build = run("bun", ["run", "build"], FRONTEND);
  if (!build.ok) {
    fail("Frontend build failed.");
    return false;
  }

  // Write .assetsignore
  const assetsIgnore = join(FRONTEND, "dist", ".assetsignore");
  if (existsSync(join(FRONTEND, "dist"))) {
    writeFileSync(assetsIgnore, "_worker.js\n", "utf8");
  }

  step("Step 3/3: Deploying frontend → Cloudflare Pages...");
  const f = run("bunx", ["wrangler", "deploy"], FRONTEND);
  if (!f.ok) {
    fail("Frontend deploy failed.");
    return false;
  }
  ok("Frontend deployed!");

  console.log();
  ok("Both services are live on Cloudflare! 🎉");
  info("If you haven't set production secrets yet, run: bun run secrets");

  return true;
}

// =============================================================================
//  MAIN
// =============================================================================

async function main() {
  banner();

  // CLI arg shortcut: bun scripts/albert.mjs <command>
  const arg = process.argv[2]?.toLowerCase();

  if (arg === "setup") {
    const rl = createRL();
    await cmdSetup(rl);
    rl.close();
    return;
  }
  if (arg === "dev") return cmdDev();
  if (arg === "build") return cmdBuild();
  if (arg === "install") return cmdInstall();
  if (arg === "deploy") {
    const rl = createRL();
    await cmdDeploy(rl);
    rl.close();
    return;
  }
  if (arg === "deploy:prod" || arg === "deploy-prod") {
    const rl = createRL();
    await cmdDeployProd(rl);
    rl.close();
    return;
  }
  if (arg === "secrets") {
    const rl = createRL();
    await cmdSecrets(rl);
    rl.close();
    return;
  }
  if (arg === "vectorize") {
    const rl = createRL();
    await cmdVectorize(rl);
    rl.close();
    return;
  }
  if (arg === "test") return cmdTest();
  if (arg === "health") return cmdHealth();
  if (arg === "check-types") return cmdCheckTypes();

  // Interactive menu
  const rl = createRL();

  let running = true;
  while (running) {
    const choice = await menu(rl, "What would you like to do?", [
      { value: "setup", label: "Setup", desc: "Configure API keys + install dependencies" },
      { value: "dev", label: "Dev", desc: "Start frontend + backend dev servers" },
      { value: "build", label: "Build", desc: "Build both services" },
      { value: "deploy", label: "Deploy", desc: "Deploy to Cloudflare (dev)" },
      { value: "deploy:prod", label: "Deploy Prod", desc: "Deploy both services to production" },
      { value: "secrets", label: "Secrets", desc: "Set production secrets on deployed worker" },
      { value: "vectorize", label: "Vectorize", desc: "Semantic search pipeline" },
      { value: "test", label: "Test", desc: "Run E2E tests (Playwright)" },
      { value: "check-types", label: "Type Check", desc: "TypeScript type checking" },
      { value: "health", label: "Health", desc: "Check running services" },
      { value: "exit", label: "Exit" },
    ]);

    switch (choice) {
      case "setup":
        await cmdSetup(rl);
        break;
      case "dev":
        rl.close();
        await cmdDev();
        return; // Never returns — Ctrl+C exits
      case "build":
        cmdBuild();
        break;
      case "deploy":
        await cmdDeploy(rl);
        break;
      case "deploy:prod":
        await cmdDeployProd(rl);
        break;
      case "secrets":
        await cmdSecrets(rl);
        break;
      case "vectorize":
        await cmdVectorize(rl);
        break;
      case "test":
        cmdTest();
        break;
      case "check-types":
        cmdCheckTypes();
        break;
      case "health":
        cmdHealth();
        break;
      case "exit":
        running = false;
        break;
    }
  }

  rl.close();
  console.log();
  info("Goodbye! 👋");
}

main().catch((err) => {
  fail(err.message);
  process.exit(1);
});
