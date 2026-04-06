import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

describe("law-agent chat room route", () => {
  it("renders Albert through an Astro /chat/[threadId] page", async () => {
    const source = await readFile(new URL("../pages/chat/[threadId].astro", import.meta.url), "utf8");

    expect(source).toContain("AlbertChatPage");
    expect(source).toContain('client:only="react"');
  });
});
