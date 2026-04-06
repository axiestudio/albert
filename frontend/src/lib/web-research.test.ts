import { describe, expect, it } from "bun:test";

import {
  buildWebResearchHeaders,
  canUseWebResearch,
} from "./web-research";

describe("web research access", () => {
  it("enables web research whenever the local key is present and the toggle is enabled", () => {
    expect(canUseWebResearch({ authenticated: false, enabled: true, apiKey: "sm_key" })).toBe(true);
    expect(canUseWebResearch({ authenticated: true, enabled: false, apiKey: "sm_key" })).toBe(false);
    expect(canUseWebResearch({ authenticated: true, enabled: true, apiKey: "" })).toBe(false);
    expect(canUseWebResearch({ authenticated: true, enabled: true, apiKey: "sm_key" })).toBe(true);
  });

  it("forwards the web research key whenever access is allowed", () => {
    expect(buildWebResearchHeaders({ authenticated: false, enabled: true, apiKey: "abc" })).toEqual({
      "x-browser-use-key": "abc",
    });
    expect(buildWebResearchHeaders({ authenticated: true, enabled: false, apiKey: "abc" })).toEqual({});
    expect(buildWebResearchHeaders({ authenticated: true, enabled: true, apiKey: "abc" })).toEqual({
      "x-browser-use-key": "abc",
    });
  });
});