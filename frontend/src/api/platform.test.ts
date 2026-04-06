import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import platformHandler from "./platform";

describe("platform proxy handler", () => {
  const originalEnv = {
    API_URL: process.env.API_URL,
  };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.API_URL = "https://api.example.com";
  });

  afterEach(() => {
    if (originalEnv.API_URL === undefined) {
      delete process.env.API_URL;
    } else {
      process.env.API_URL = originalEnv.API_URL;
    }

    globalThis.fetch = originalFetch;
    mock.restore();
  });

  it("proxies Albert thread writes with session cookies and optional memory headers", async () => {
    let upstreamRequest: Request | undefined;

    globalThis.fetch = mock(async (input: string | URL | Request) => {
      upstreamRequest = input instanceof Request ? input : new Request(input);

      return Response.json({
        thread: {
          id: "thread-123",
          title: "New chat",
        },
      });
    }) as unknown as typeof globalThis.fetch;

    const response = await platformHandler(new Request("https://law.example.com/api/albert/threads/thread-123", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Cookie": "session_token=session-123",
        "x-albert-supermemory-key": "supermemory-key",
      },
      body: JSON.stringify({
        title: "New chat",
        preview: "",
        messages: [{ role: "user", parts: [{ type: "text", text: "Hej Albert" }] }],
        metadata: { source: "remote" },
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      thread: {
        id: "thread-123",
        title: "New chat",
      },
    });
    expect(upstreamRequest).toBeDefined();
    expect(upstreamRequest?.url).toBe("https://api.example.com/api/v1/albert/threads/thread-123");
    expect(upstreamRequest?.method).toBe("PUT");
    expect(upstreamRequest?.headers.get("cookie")).toBe("session_token=session-123");
    expect(upstreamRequest?.headers.get("x-albert-supermemory-key")).toBe("supermemory-key");
    expect(await upstreamRequest?.text()).toContain("\"Hej Albert\"");
  });

  it("returns 404 for routes outside the supported platform proxy surface", async () => {
    const response = await platformHandler(new Request("https://law.example.com/api/not-supported", {
      method: "GET",
    }));

    expect(response.status).toBe(404);
  });
});
