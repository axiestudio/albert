import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

describe("useAlbertHistory room routing", () => {
  it("accepts the active /chat/$threadId room id as an input", async () => {
    const source = await readFile(new URL("./useAlbertHistory.ts", import.meta.url), "utf8");

    expect(source).toContain("export function useAlbertHistory(routeThreadId?: string)");
  });

  it("hydrates the route-selected room instead of always relying on internal state", async () => {
    const source = await readFile(new URL("./useAlbertHistory.ts", import.meta.url), "utf8");

    expect(source).toContain("if (routeThreadId)");
    expect(source).toContain("setCurrentThreadId(routeThreadId)");
  });
});
