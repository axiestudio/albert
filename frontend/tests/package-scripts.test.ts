import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const workspaceRoot = join(import.meta.dir, "..");
const packageJsonPath = join(workspaceRoot, "package.json");
const astroConfigPath = join(workspaceRoot, "astro.config.mjs");
const viteConfigPath = join(workspaceRoot, "vite.config.ts");
const wranglerPreviewScriptPath = join(workspaceRoot, "scripts", "wrangler-preview.cjs");
const previewServerScriptPath = join(workspaceRoot, "scripts", "preview-server.mjs");

async function readPackageScripts() {
  const packageJson = JSON.parse(await Bun.file(packageJsonPath).text()) as {
    scripts?: Record<string, string>;
  };

  return packageJson.scripts ?? {};
}

describe("law-agent package scripts", () => {
  it("switches package scripts over to Astro while preserving Bun-based workflows", async () => {
    const scripts = await readPackageScripts();

    expect(scripts.dev).toBe("astro dev --port 3000");
    expect(scripts.build).toBe("astro build");
    expect(scripts.deploy).toContain("wrangler deploy");
  });

  it("retires the bespoke Nitro preview wrappers", async () => {
    expect(await Bun.file(wranglerPreviewScriptPath).exists()).toBe(false);
    expect(await Bun.file(previewServerScriptPath).exists()).toBe(false);
  });

  it("keeps Astro config active and stops using the old Vite app entrypoint", async () => {
    expect(await Bun.file(astroConfigPath).exists()).toBe(true);
    const scripts = await readPackageScripts();

    expect(scripts.dev).not.toContain("vite");
    expect(scripts.build).not.toContain("vite");
  });
});