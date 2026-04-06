<div align="center">

# ⚖️ Albert — Swedish Law Research Agent

**Open-source AI-powered legal research agent for Swedish law.**

Built with [Vertex AI](https://cloud.google.com/vertex-ai) · [Cloudflare Workers](https://workers.cloudflare.com) · [Astro](https://astro.build) · [Hono](https://hono.dev) · [Vercel AI SDK](https://sdk.vercel.ai)

</div>

---

## What is Albert?

Albert is an agentic AI research assistant that helps you explore Swedish law. Ask a question in natural language, and Albert will:

1. **Search** Swedish legislation via [Riksdagen API](https://data.riksdagen.se) and [lagen.nu](https://lagen.nu)
2. **Retrieve** relevant statutes using semantic search (Cloudflare Vectorize)
3. **Analyze** legal text with reasoning-capable LLMs (Gemini, Claude, GPT-4o, etc.)
4. **Cite** sources with direct links to official publications

It runs as two Cloudflare Workers — a **Hono API backend** (port 3001) and an **Astro + React frontend** (port 3000).

---

## Project Structure

```
Albert/
├── backend/                    # Hono API worker (Cloudflare Workers)
│   ├── src/
│   │   ├── index.ts            # Entry point — routes, CORS, health check
│   │   ├── env.ts              # Environment type definitions
│   │   ├── lib/
│   │   │   ├── providers.ts    # LLM provider factory (Google, OpenAI, Anthropic, Vertex)
│   │   │   ├── vertex-models.ts    # 60+ model catalog for Vertex AI
│   │   │   ├── vertex-regions.ts   # Geo-routing for Vertex AI regions
│   │   │   └── browser-use.ts      # Web research via Browser Use API
│   │   └── routes/executive/
│   │       ├── law-handler.ts  # Main agent loop (AI SDK streamText + tools)
│   │       ├── law-config.ts   # LLM resolution, Vectorize config
│   │       ├── law-prompt.ts   # System prompt & persona
│   │       ├── law-prepare.ts  # Pre-research pipeline
│   │       ├── law.ts          # Tool definitions (searchLaws, getLawDetail, etc.)
│   │       ├── law-lagen.ts    # lagen.nu scraper
│   │       ├── law-riksdagen.ts    # Riksdagen API client
│   │       ├── law-dom.ts      # DOM parsing utilities
│   │       ├── law-source-material.ts  # Source citation builder
│   │       ├── law-types.ts    # TypeScript types
│   │       └── law-utils.ts    # Shared utilities
│   ├── wrangler.toml           # Cloudflare Workers config
│   └── package.json
│
├── frontend/                   # Astro + React frontend (Cloudflare Pages)
│   ├── src/
│   │   ├── pages/              # Astro pages
│   │   ├── components/         # React components (chat UI, model selector, etc.)
│   │   ├── hooks/              # React hooks
│   │   ├── lib/                # Client libraries (transport, state, persistence)
│   │   ├── api/                # API client layer
│   │   └── styles.css          # Tailwind CSS
│   ├── wrangler.toml           # Cloudflare Pages config
│   └── package.json
│
├── scripts/                    # CLI & data pipeline scripts
│   ├── albert.mjs              # Interactive CLI (setup, dev, deploy, etc.)
│   ├── deploy-vectorize.ts     # Create Vectorize index
│   ├── download-sfs-index.ts   # Download Swedish law metadata
│   ├── ingest-sfs-vectorize.ts # Generate embeddings & ingest to Vectorize
│   └── lib/
│       ├── vectorize.ts        # Vectorize REST client
│       ├── vectorize-lb.ts     # Load balancing utilities
│       └── embeddings.ts       # Workers AI embedding client
│
├── tests/e2e/                  # Playwright E2E tests
│   ├── law-agent.e2e.spec.ts
│   └── playwright.law-agent.config.ts
│
├── data/                       # Downloaded law data (gitignored)
├── .env.example                # Root credential template
├── .gitignore
├── package.json                # Workspace scripts (install:all, dev, build, etc.)
└── README.md
```

---

## Prerequisites

- [Bun](https://bun.sh) v1.1+ (runtime & package manager)
- A **Google API Key** for Vertex AI Express Mode — [get one free](https://aistudio.google.com/apikey)
- A **Cloudflare account** — [sign up free](https://dash.cloudflare.com/sign-up) (needed for Vectorize semantic search)

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/axiestudio/albert.git
cd albert
bun run install:all
```

### 2. Configure Environment

Copy the credential template to the backend worker:

```bash
cp .env.example backend/.dev.vars
```

Then edit `backend/.dev.vars` and add your server-side defaults.

The frontend no longer needs a credential file for LLM access. Server 1 Gemini keys and Vertex project IDs can be entered in Albert's Settings modal and are stored locally in the browser.

**Or use the interactive setup:**

```bash
bun run setup
```

### 3. Start Development Servers

```bash
bun run dev
```

This starts both servers concurrently:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health check:** http://localhost:3001/health

### 4. Open the App

Navigate to **http://localhost:3000** and start asking questions about Swedish law!

---

## Environment Variables

### Required

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `GOOGLE_API_KEY` | Backend default for Server 1 Gemini. Users can also enter a local Server 1 key in the frontend settings. | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | [Dashboard](https://dash.cloudflare.com) → Workers & Pages → Overview |
| `CLOUDFLARE_API_TOKEN` | API token with Vectorize + Workers AI permissions | [API Tokens](https://dash.cloudflare.com/profile/api-tokens) |

### Optional — Alternative LLM Providers

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (GPT-4o, o3, etc.) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude) |
| `VERTEX_PROJECT_ID` | Backend default GCP project for Claude/Mistral/DeepSeek via Vertex AI. Users can also enter it locally in the frontend settings. |

### Optional — Enhancements

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_GATEWAY_ACCOUNT_ID` | AI Gateway account (analytics + caching) |
| `CLOUDFLARE_GATEWAY_NAME` | AI Gateway name |
| `CLOUDFLARE_GATEWAY_TOKEN` | AI Gateway token |
| `BROWSER_USE_API_KEY` | [Browser Use](https://cloud.browser-use.com) key for web research |

---

## Available Commands

### Development

```bash
bun run dev              # Start frontend + backend concurrently
bun run dev:frontend     # Start frontend only (port 3000)
bun run dev:backend      # Start backend only (port 3001)
```

### Build & Deploy

```bash
bun run build            # Build both services
bun run deploy:backend   # Deploy backend to Cloudflare Workers
bun run deploy:frontend  # Deploy frontend to Cloudflare Pages
bun run deploy:prod      # Interactive production deploy (both services)
bun run secrets          # Set production secrets on deployed worker
```

### Testing

```bash
bun run check-types      # TypeScript type checking
bun run test:e2e         # Playwright E2E tests (needs both servers running)
```

### Vectorize (Semantic Search)

```bash
bun run vectorize:setup      # Create the Vectorize index
bun run vectorize:status     # Check index status
bun run vectorize:ingest     # Download laws + generate embeddings + ingest
```

### Interactive CLI

```bash
bun run setup            # Interactive setup & management CLI
```

---

## Vectorize Setup (Optional but Recommended)

Vectorize enables semantic search across Swedish legislation. Without it, Albert relies on keyword search via the Riksdagen API alone.

```bash
# 1. Create the Vectorize index on your Cloudflare account
bun run vectorize:setup

# 2. Download Swedish law metadata + ingest embeddings
bun run vectorize:ingest
```

This downloads ~15,000 law metadata entries from [data.riksdagen.se](https://data.riksdagen.se), generates embeddings via Workers AI, and upserts them into your Vectorize index.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Browser                           │
│                    http://localhost:3000                         │
└─────────────────────┬───────────────────────────────────────────┘
                      │ AI SDK useChat() — streaming
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│             Frontend (Astro + React Islands)                     │
│                    Cloudflare Pages                              │
│                                                                  │
│  • Chat UI with assistant-ui components                         │
│  • Model selector (Gemini, Claude, GPT-4o, BYOK)               │
│  • Auto-research mode with live tool call visualization         │
│  • Thread persistence (localStorage)                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │ POST /api/v1/executive/law
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│             Backend (Hono + Vercel AI SDK)                       │
│                    Cloudflare Workers                            │
│                                                                  │
│  • Agent loop with streamText() + maxSteps                      │
│  • Tool calls: searchLaws, getLawDetail, fetchLagenNu,          │
│    vectorSearch, webResearch, analyzeLegalDocument               │
│  • Pre-research pipeline (parallel law + source gathering)      │
│  • Multi-provider LLM routing via AI Gateway                    │
│  • Geo-aware Vertex AI region selection                         │
└────────┬──────────────┬────────────────┬────────────────────────┘
         │              │                │
         ▼              ▼                ▼
   ┌──────────┐  ┌───────────┐  ┌─────────────────┐
   │ Riksdagen│  │ lagen.nu  │  │ Cloudflare       │
   │   API    │  │  scraper  │  │ Vectorize + AI   │
   └──────────┘  └───────────┘  └─────────────────────┘
```

---

## Supported LLM Providers

Albert supports multiple LLM providers through the frontend model selector:

| Mode | Provider | Models | Configuration |
|------|----------|--------|---------------|
| **Server 1** | Google Vertex AI (Express) | Gemini 2.5 Flash, Pro, Flash-Lite | Backend `GOOGLE_API_KEY` or browser-local Server 1 key |
| **Vertex Claude** | Google Cloud (Partner) | Claude Opus 4, Sonnet 4, etc. | Backend `VERTEX_PROJECT_ID` or browser-local Vertex Project ID |
| **Vertex Mistral** | Google Cloud (Partner) | Mistral Medium 3, Small, Codestral | Backend `VERTEX_PROJECT_ID` or browser-local Vertex Project ID |
| **Vertex Open** | Google Cloud (Partner) | DeepSeek V3, Qwen3, Llama 4 | Backend `VERTEX_PROJECT_ID` or browser-local Vertex Project ID |
| **OpenAI** | OpenAI (BYOK) | GPT-4o, o3, o4-mini | User's own key |
| **Anthropic** | Anthropic (BYOK) | Claude Opus 4, Sonnet 4 | User's own key |

---

## E2E Testing

```bash
# Start both servers first
bun run dev

# In another terminal, run the Playwright tests
bun run test:e2e
```

Tests cover page load, chat interface, model selector, tool invocations, auto-research, and response quality.

---

## Deployment

Albert deploys to Cloudflare's free tier — no Docker, no VMs, no monthly bills for small usage.

### Prerequisites

1. A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
2. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) authenticated: `bunx wrangler login`
3. A [Google API Key](https://aistudio.google.com/apikey) for Gemini (free tier available)

### Deploy in 5 Steps

```bash
# 1. Authenticate with Cloudflare
bunx wrangler login

# 2. Deploy the backend API → Cloudflare Workers
bun run deploy:backend
# ▸ Note the URL printed (e.g., https://albert-law-agent.YOUR_SUBDOMAIN.workers.dev)

# 3. Set production secrets on the backend worker
bun run secrets
# ▸ Interactive wizard prompts for GOOGLE_API_KEY + optional Cloudflare/OpenAI/Anthropic keys

# 4. Update frontend/wrangler.toml with your backend URL
# ▸ Edit [env.production] → API_URL to your backend URL from step 2

# 5. Deploy the frontend → Cloudflare Pages
bun run deploy:frontend
```

**Or use the interactive CLI:**

```bash
bun run deploy:prod    # Guided production deployment (both services)
```

### Setting Production Secrets

The backend needs API keys set as [Wrangler secrets](https://developers.cloudflare.com/workers/configuration/secrets/) (not in source code):

```bash
# Interactive (recommended)
bun run secrets

# Or manually, one at a time
cd backend
bunx wrangler secret put GOOGLE_API_KEY
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID    # for Vectorize
bunx wrangler secret put CLOUDFLARE_API_TOKEN      # for Vectorize
```

### Custom Domains

After deploying, you can add a custom domain in the Cloudflare dashboard:
- **Workers & Pages → your worker → Settings → Triggers → Custom Domains**
- Point `api.yourdomain.com` at the backend, `law.yourdomain.com` at the frontend

### What You Get

| Service | Runs on | Free Tier |
|---------|---------|-----------|
| Backend API | Cloudflare Workers | 100K requests/day |
| Frontend | Cloudflare Pages | Unlimited static, 100K SSR/day |
| Semantic Search | Cloudflare Vectorize | 30M vector dimensions stored |
| Embeddings | Workers AI | 10K requests/day |

---

## Security

- **Never commit `.dev.vars`** — it is gitignored by default. Always use `dev.vars.example` as a starting template.
- Production secrets should be set via `bunx wrangler secret put <KEY>`, not checked into source control.
- If you suspect a key has been exposed, rotate it immediately in the relevant provider dashboard (Google Cloud Console, Cloudflare API Tokens, etc.).

---

## License

Apache-2.0

---

<div align="center">

Built by [Axie Studio](https://axiestudio.se) · Powered by Swedish open data from [Riksdagen](https://data.riksdagen.se) and [lagen.nu](https://lagen.nu)

</div>
