# Law Agent

Swedish law research agent built with Astro, React, Cloudflare Workers, and assistant-ui. This package targets the Bun runtime for install, development, and build workflows.

## Runtime

- Bun `1.3.11`
- Install dependencies with the existing `bun.lock`
- Run scripts through Bun instead of npm or pnpm

## Quick Start

### Install

```bash
bun install --frozen-lockfile
```

### Environment Variables

No frontend credential file is required for local LLM access.

```bash
API_URL=http://localhost:3001
```

Server 1 Gemini keys and Vertex Project IDs are configured from Albert's Settings modal and stored locally in the browser. Set `API_URL` only if you need the frontend to proxy to a non-default backend.

### Local Development

```bash
bun run dev
```

### Production Build

```bash
bun run build
```

### Deploy

```bash
bun run deploy:prod
```

## Notes

- Astro builds a Cloudflare Worker entry at `dist/_worker.js/index.js` and serves static assets from `dist/`.
- The React assistant-ui surface now renders through Astro pages while keeping the existing `/chat/:threadId` and `/api/*` contract intact.
- The server route in `src/api/chat.ts` uses standard Web APIs and runs under Bun without Node-specific shims.
- `process.env` remains supported under Bun, so no source-level env migration is required.

## Related Documentation

- [assistant-ui Documentation](https://www.assistant-ui.com/docs)
- [Astro Documentation](https://docs.astro.build)
- [Bun Documentation](https://bun.sh/docs)
