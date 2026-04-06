import { describe, expect, it } from "bun:test";

import { resolveLawLlmConfig } from "./law-config";

describe("resolveLawLlmConfig", () => {
  it("prefers a request-supplied Google key for Server 1 over env fallback", () => {
    const resolved = resolveLawLlmConfig({
      GOOGLE_API_KEY: "env-google-key",
    } as never, {
      llmMode: "server-1",
      llmApiKey: "request-google-key",
    });

    expect(resolved.provider).toBe("gemini");
    expect(resolved.model).toBe("gemini-2.5-flash");
    expect(resolved.apiKey).toBe("request-google-key");
  });

  it("accepts request-supplied Google key and project id for vertex modes", () => {
    const resolved = resolveLawLlmConfig({
      GOOGLE_API_KEY: "env-google-key",
      VERTEX_PROJECT_ID: "env-vertex-project",
    } as never, {
      llmMode: "vertex-open",
      llmApiKey: "request-google-key",
      vertexProjectId: "request-vertex-project",
    });

    expect(resolved.provider).toBe("vertex-open");
    expect(resolved.model).toBe("deepseek-v3.2-maas");
    expect(resolved.apiKey).toBe("request-google-key");
    expect(resolved.vertexProjectId).toBe("request-vertex-project");
  });
});