import { describe, expect, it } from "bun:test";

import {
  buildLawLlmHeaders,
  getAvailableLawLlmOptions,
  getDefaultLawLlmModel,
  getLawLlmModelOptions,
  getLawLlmOption,
  isAuthRequiredMode,
  isLawLlmMode,
  isLawLlmModeConfigured,
  isByokLawLlmMode,
  isVertexLawLlmMode,
  resolveLawLlmModel,
} from "./law-llm";

describe("law llm client config", () => {
  it("uses opaque server labels for managed Albert infrastructure", () => {
    expect(getLawLlmOption("server-1")).toMatchObject({
      label: "Server 1",
      description: "Albert managed",
    });
  });

  it("marks only OpenAI and Anthropic as BYOK providers", () => {
    expect(isByokLawLlmMode("server-1")).toBe(false);
    expect(isByokLawLlmMode("openai")).toBe(true);
    expect(isByokLawLlmMode("anthropic")).toBe(true);
  });

  it("exposes only tool-capable Gemini models for Server 1", () => {
    expect(getDefaultLawLlmModel("server-1")).toBe("gemini-2.5-flash");
    expect(getLawLlmModelOptions("server-1").map(option => option.value)).toEqual([
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite",
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
    ]);
  });

  it("exposes only tool-capable OpenAI models", () => {
    expect(getDefaultLawLlmModel("openai")).toBe("gpt-5.4-mini");
    expect(getLawLlmModelOptions("openai").map(option => option.value)).toEqual([
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
    ]);
  });

  it("exposes current Anthropic agent models", () => {
    expect(getDefaultLawLlmModel("anthropic")).toBe("claude-sonnet-4-6");
    expect(getLawLlmModelOptions("anthropic").map(option => option.value)).toEqual([
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ]);
  });

  it("sanitizes invalid model selections back to the active mode default", () => {
    expect(resolveLawLlmModel("openai", "claude-sonnet-4-6")).toBe("gpt-5.4-mini");
    expect(resolveLawLlmModel("anthropic", "gpt-5.4")).toBe("claude-sonnet-4-6");
    expect(resolveLawLlmModel("server-1", "gpt-5.4-mini")).toBe("gemini-2.5-flash");
  });

  it("treats BYOK modes as unavailable until the matching provider key is configured", () => {
    expect(isLawLlmModeConfigured("server-1")).toBe(true);
    expect(isLawLlmModeConfigured("openai", "")).toBe(false);
    expect(isLawLlmModeConfigured("openai", "  ")).toBe(false);
    expect(isLawLlmModeConfigured("openai", "sk-user-openai")).toBe(true);
    expect(isLawLlmModeConfigured("anthropic", "sk-ant-user")).toBe(true);
  });

  it("forwards only the opaque mode header for managed servers", () => {
    expect(buildLawLlmHeaders("server-1")).toEqual({
      "x-law-llm-mode": "server-1",
      "x-law-llm-model": "gemini-2.5-flash",
    });

    expect(buildLawLlmHeaders("server-1", {
      apiKey: "test-google-key",
    })).toEqual({
      "x-law-llm-mode": "server-1",
      "x-law-llm-model": "gemini-2.5-flash",
      "x-law-llm-api-key": "test-google-key",
    });
  });

  it("forwards the current mode model and BYOK key only for user-supplied providers", () => {
    expect(buildLawLlmHeaders("openai", {
      apiKey: "sk-user-openai",
      model: "gpt-5.4-nano",
    })).toEqual({
      "x-law-llm-mode": "openai",
      "x-law-llm-model": "gpt-5.4-nano",
      "x-law-llm-api-key": "sk-user-openai",
    });

    expect(buildLawLlmHeaders("anthropic", {
      model: "gpt-5.4-mini",
    })).toEqual({
      "x-law-llm-mode": "anthropic",
      "x-law-llm-model": "claude-sonnet-4-6",
    });
  });

  it("recognises all six valid LLM modes", () => {
    expect(isLawLlmMode("server-1")).toBe(true);
    expect(isLawLlmMode("vertex-claude")).toBe(true);
    expect(isLawLlmMode("vertex-mistral")).toBe(true);
    expect(isLawLlmMode("vertex-open")).toBe(true);
    expect(isLawLlmMode("openai")).toBe(true);
    expect(isLawLlmMode("anthropic")).toBe(true);
    expect(isLawLlmMode("invalid")).toBe(false);
    expect(isLawLlmMode("")).toBe(false);
  });

  it("marks vertex modes as vertex and not BYOK", () => {
    expect(isVertexLawLlmMode("vertex-claude")).toBe(true);
    expect(isVertexLawLlmMode("vertex-mistral")).toBe(true);
    expect(isVertexLawLlmMode("vertex-open")).toBe(true);
    expect(isVertexLawLlmMode("server-1")).toBe(false);
    expect(isVertexLawLlmMode("openai")).toBe(false);

    expect(isByokLawLlmMode("vertex-claude")).toBe(false);
    expect(isByokLawLlmMode("vertex-mistral")).toBe(false);
    expect(isByokLawLlmMode("vertex-open")).toBe(false);
  });

  it("does not require login for any OSS Albert mode", () => {
    expect(isAuthRequiredMode("vertex-claude")).toBe(false);
    expect(isAuthRequiredMode("vertex-mistral")).toBe(false);
    expect(isAuthRequiredMode("vertex-open")).toBe(false);
    expect(isAuthRequiredMode("server-1")).toBe(false);
    expect(isAuthRequiredMode("openai")).toBe(false);
    expect(isAuthRequiredMode("anthropic")).toBe(false);
  });

  it("exposes Vertex Claude models with correct default", () => {
    expect(getDefaultLawLlmModel("vertex-claude")).toBe("claude-sonnet-4-6");
    expect(getLawLlmModelOptions("vertex-claude").map(option => option.value)).toEqual([
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-opus-4-5",
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
    ]);
  });

  it("exposes Vertex Mistral models with correct default", () => {
    expect(getDefaultLawLlmModel("vertex-mistral")).toBe("mistral-medium-3");
    expect(getLawLlmModelOptions("vertex-mistral").map(option => option.value)).toEqual([
      "mistral-medium-3",
      "mistral-small-2503",
      "codestral-2",
    ]);
  });

  it("exposes Vertex Open models with correct default", () => {
    expect(getDefaultLawLlmModel("vertex-open")).toBe("deepseek-v3.2-maas");
    expect(getLawLlmModelOptions("vertex-open").map(option => option.value)).toEqual([
      "deepseek-v3.2-maas",
      "qwen3-235b-a22b-instruct-2507-maas",
      "llama-4-maverick-17b-128e",
    ]);
  });

  it("sanitizes cross-mode models for vertex modes", () => {
    expect(resolveLawLlmModel("vertex-claude", "gpt-5.4-mini")).toBe("claude-sonnet-4-6");
    expect(resolveLawLlmModel("vertex-mistral", "claude-sonnet-4-6")).toBe("mistral-medium-3");
    expect(resolveLawLlmModel("vertex-open", "gemini-2.5-flash")).toBe("deepseek-v3.2-maas");
  });

  it("vertex modes are always configured (server-managed keys)", () => {
    expect(isLawLlmModeConfigured("vertex-claude")).toBe(true);
    expect(isLawLlmModeConfigured("vertex-mistral")).toBe(true);
    expect(isLawLlmModeConfigured("vertex-open")).toBe(true);
  });

  it("forwards mode and model headers for vertex modes, plus optional OSS overrides", () => {
    expect(buildLawLlmHeaders("vertex-claude")).toEqual({
      "x-law-llm-mode": "vertex-claude",
      "x-law-llm-model": "claude-sonnet-4-6",
    });

    expect(buildLawLlmHeaders("vertex-mistral", { model: "codestral-2" })).toEqual({
      "x-law-llm-mode": "vertex-mistral",
      "x-law-llm-model": "codestral-2",
    });

    expect(buildLawLlmHeaders("vertex-open", {
      apiKey: "test-google-key",
      vertexProjectId: "test-vertex-project",
    })).toEqual({
      "x-law-llm-mode": "vertex-open",
      "x-law-llm-model": "deepseek-v3.2-maas",
      "x-law-llm-api-key": "test-google-key",
      "x-law-vertex-project-id": "test-vertex-project",
    });
  });

  it("includes geolocation headers for vertex modes when provided", () => {
    expect(buildLawLlmHeaders("vertex-open", {
      userLat: 59.3293,
      userLng: 18.0686,
    })).toEqual({
      "x-law-llm-mode": "vertex-open",
      "x-law-llm-model": "deepseek-v3.2-maas",
      "x-user-lat": "59.3293",
      "x-user-lng": "18.0686",
    });
  });

  it("shows all OSS Albert modes even without login", () => {
    const authed = getAvailableLawLlmOptions(true);
    const unauthed = getAvailableLawLlmOptions(false);

    expect(authed.length).toBe(6);
    expect(unauthed.length).toBe(6);
    expect(unauthed.map(o => o.value)).toEqual([
      "server-1",
      "vertex-claude",
      "vertex-mistral",
      "vertex-open",
      "openai",
      "anthropic",
    ]);
  });
});
