import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

describe("law-agent route layout regression", () => {
  it("does not render the prepare results card as a standalone surface above the thread", async () => {
    const source = await readFile(new URL("../components/AlbertChatApp.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("<PrepareResultsCard />");
  });

  it("renders assistant trace content through chain-of-thought instead of an inline prepare card", async () => {
    const threadSource = await readFile(new URL("../components/MyThread.tsx", import.meta.url), "utf8");

    expect(threadSource).toContain("ChainOfThought");
    expect(threadSource).not.toContain("InlinePrepareResultsCard");
  });

  it("keeps the thread bottom-anchored so assistant-ui autoscroll can follow streamed answers", async () => {
    const threadSource = await readFile(new URL("../components/MyThread.tsx", import.meta.url), "utf8");

    expect(threadSource).toContain("autoScroll");
    expect(threadSource).toContain('turnAnchor="bottom"');
    expect(threadSource).not.toContain('turnAnchor="top"');
    expect(threadSource).toContain("overflow-y-auto overscroll-y-contain");
    expect(threadSource).not.toContain("scroll-smooth");
  });

  it("keeps the law welcome copy aligned with Albert's enterprise answer contract", async () => {
    const threadSource = await readFile(new URL("../components/MyThread.tsx", import.meta.url), "utf8");
    const routeSource = await readFile(new URL("../components/AlbertChatApp.tsx", import.meta.url), "utf8");

    expect(threadSource).toContain("klartext");
    expect(threadSource).toContain("juridisk analys");
    expect(routeSource).toContain("Cite the relevant SFS numbers");
    expect(routeSource).toContain("key preparatory works");
  });
});
