import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { LawAgentChatTransport } from "./law-agent-chat-transport";

describe("LawAgentChatTransport", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock(async () => new Response("ok")) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  it("blocks message sends when the selected BYOK mode is not configured", async () => {
    const onConfigurationRequired = mock(() => {});
    const transport = new LawAgentChatTransport({
      api: "/api/chat",
      headers: {},
      requiresConfiguration: true,
      onConfigurationRequired,
    });

    await expect(transport.sendMessages({} as never)).rejects.toThrow(
      "Configure the selected provider before sending messages.",
    );
    expect(onConfigurationRequired).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});