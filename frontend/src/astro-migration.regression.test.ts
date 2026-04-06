import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

describe("law-agent Astro migration regression", () => {
  it("replaces TanStack Start plus Nitro with Astro and Cloudflare adapter wiring", async () => {
    const packageSource = await readFile(new URL("../package.json", import.meta.url), "utf8");

    expect(packageSource).toContain('"astro"');
    expect(packageSource).toContain('"@astrojs/react"');
    expect(packageSource).toContain('"@astrojs/cloudflare"');
    expect(packageSource).not.toContain('"@tanstack/react-start"');
    expect(packageSource).not.toContain('"@tanstack/react-router"');
    expect(packageSource).not.toContain('"nitro"');
  });

  it("defines an Astro server config with React and Cloudflare integrations", async () => {
    const astroConfigSource = await readFile(new URL("../astro.config.mjs", import.meta.url), "utf8");

    expect(astroConfigSource).toContain("cloudflare(");
    expect(astroConfigSource).toContain("react(");
    expect(astroConfigSource).toContain("output: \"server\"");
  });

  it("serves Albert through Astro pages while preserving the existing route contract", async () => {
    const indexPageSource = await readFile(new URL("./pages/index.astro", import.meta.url), "utf8");
    const chatPageSource = await readFile(new URL("./pages/chat/[threadId].astro", import.meta.url), "utf8");
    const chatApiSource = await readFile(new URL("./pages/api/chat.ts", import.meta.url), "utf8");

    expect(indexPageSource).toContain("createNewThreadId");
    expect(indexPageSource).toContain("Astro.redirect");
    expect(chatPageSource).toContain("AlbertChatApp");
    expect(chatPageSource).toContain("client:only=\"react\"");
    expect(chatApiSource).toContain("export const POST");
  });

  it("updates Wrangler to deploy the Astro Cloudflare worker output", async () => {
    const wranglerSource = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");

    expect(wranglerSource).toContain('main = "dist/_worker.js/index.js"');
    expect(wranglerSource).toContain('directory = "dist"');
  });
});