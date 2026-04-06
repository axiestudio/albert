/**
 * Albert Law Agent — Standalone Hono Backend
 *
 * Single-endpoint API server for the Swedish Law Research Agent.
 * Routes:
 *   POST /api/v1/executive/law    — Main law execution endpoint
 *   GET  /health                   — Health check
 *
 * Architecture: Hono → Vercel AI SDK → Cloudflare AI Gateway → LLM Provider
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import type { Env } from "./env";
import { handleLawExecution } from "./routes/executive/law-handler";

const app = new Hono<{ Bindings: Env }>();

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use("*", logger());

app.use("*", cors({
  origin: (origin) => origin || "*",
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "x-thread-id",
    "x-timezone",
    "x-law-llm-mode",
    "x-law-llm-model",
    "x-law-llm-api-key",
    "x-user-lat",
    "x-user-lng",
    "x-browser-use-key",
    "Accept-Language",
  ],
  allowMethods: ["GET", "POST", "OPTIONS"],
  exposeHeaders: [
    "x-vercel-ai-ui-message-stream",
    "x-law-resolved-provider",
    "x-law-resolved-model",
  ],
}));

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "albert-law-agent",
    timestamp: new Date().toISOString(),
  });
});

// POST /api/v1/executive/law — Swedish law research agent
app.post("/api/v1/executive/law", handleLawExecution);

// ─── Export ─────────────────────────────────────────────────────────────────

export default app;
