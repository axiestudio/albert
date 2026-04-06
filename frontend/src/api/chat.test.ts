import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import chatHandler, { getChatRequestBody, getChatRequestMethod } from "./chat";

describe("chat request adapters", () => {
  it("reads method and body from a Fetch Request", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "Hej" }] }],
      }),
    });

    expect(getChatRequestMethod(request)).toBe("POST");

    await expect(getChatRequestBody(request)).resolves.toEqual({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "Hej" }] }],
    });
  });

  it("reads method and body from an h3-style event", async () => {
    const eventLike = {
      method: "POST",
      req: {
        json: async () => ({
          messages: [{ id: "2", role: "user", parts: [{ type: "text", text: "Hello" }] }],
        }),
      },
    };

    expect(getChatRequestMethod(eventLike)).toBe("POST");

    await expect(getChatRequestBody(eventLike)).resolves.toEqual({
      messages: [{ id: "2", role: "user", parts: [{ type: "text", text: "Hello" }] }],
    });
  });
});

describe("chat handler (integration)", () => {
  const originalEnv = {
    API_URL: process.env.API_URL,
  };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.API_URL = "http://localhost:3001";
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

  it("returns 405 for non-POST Fetch Request", async () => {
    const request = new Request("http://localhost/api/chat", { method: "GET" });
    const response = await chatHandler(request);
    expect(response.status).toBe(405);
    expect(await response.text()).toBe("Method Not Allowed");
  });

  it("returns 405 for non-POST h3-style event", async () => {
    const eventLike = { method: "GET", req: {} };
    const response = await chatHandler(eventLike);
    expect(response.status).toBe(405);
    expect(await response.text()).toBe("Method Not Allowed");
  });

  it("bridges executive LAW data streams into UI message streams", async () => {
    globalThis.fetch = mock(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('f:{"messageId":"assistant-1"}\n'));
          controller.enqueue(encoder.encode("0:\"Albert is tracing the GDPR implementation.\"\n"));
          controller.enqueue(encoder.encode('9:{"toolCallId":"tool-1","toolName":"fetchLaw","args":{"sfs":"2018:218"}}\n'));
          controller.enqueue(encoder.encode('a:{"toolCallId":"tool-1","result":{"sfs":"2018:218","title":"Lag med kompletterande bestÃ¤mmelser till EU:s dataskyddsfÃ¶rordning"}}\n'));
          controller.enqueue(encoder.encode('d:{"finishReason":"stop"}\n'));
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Prepare-Results": "W10=",
          "X-Vercel-AI-Data-Stream": "v1",
        },
      });
    }) as unknown as typeof globalThis.fetch;

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "What Swedish laws implement GDPR?" }],
          },
        ],
      }),
    });

    const response = await chatHandler(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(response.headers.get("x-vercel-ai-data-stream")).toBeNull();
    expect(response.headers.get("x-prepare-results")).toBe("W10=");
    expect(body).toContain('"type":"start"');
    expect(body).toContain('"type":"text-start"');
    expect(body).toContain('"type":"text-delta"');
    expect(body).toContain('"type":"tool-input-available"');
    expect(body).toContain('"type":"tool-output-available"');
    expect(body).toContain('"type":"finish"');
  });

  it("forwards the raw law query to the executive route without internal auth headers or proxy-side prepare work", async () => {
    let executivePayload: Record<string, unknown> | undefined;
    let executiveAuthorizationHeader: string | null = null;

    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url === "http://localhost:3001/api/v1/executive/law") {
        executivePayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        executiveAuthorizationHeader = new Headers(init?.headers).get("Authorization");
        return new Response("ok", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof globalThis.fetch;

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "What Swedish laws implement GDPR?" }],
          },
        ],
      }),
    });

    const response = await chatHandler(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(executivePayload).toBeDefined();
    expect(executiveAuthorizationHeader).toBeNull();
    expect(executivePayload).toMatchObject({
      query: "What Swedish laws implement GDPR?",
    });
    expect(executivePayload).not.toHaveProperty("extractedKeywords");
    expect(executivePayload).not.toHaveProperty("lawSearchResults");
  });

  it("forwards a browser-local Google API key for Server 1", async () => {
    let executivePayload: Record<string, unknown> | undefined;

    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url === "http://localhost:3001/api/v1/executive/law") {
        executivePayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response("ok", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof globalThis.fetch;

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-law-llm-mode": "server-1",
        "x-law-llm-api-key": "test-google-key",
      },
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Summarize dataskyddslagen." }],
          },
        ],
      }),
    });

    const response = await chatHandler(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(executivePayload).toMatchObject({
      query: "Summarize dataskyddslagen.",
      llmMode: "server-1",
      llmApiKey: "test-google-key",
    });
  });

  it("forwards browser-local Vertex project settings for Vertex AI modes", async () => {
    let executivePayload: Record<string, unknown> | undefined;

    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url === "http://localhost:3001/api/v1/executive/law") {
        executivePayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response("ok", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof globalThis.fetch;

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-law-llm-mode": "vertex-open",
        "x-law-llm-model": "deepseek-v3.2-maas",
        "x-law-llm-api-key": "test-google-key",
        "x-law-vertex-project-id": "test-vertex-project",
      },
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Summarize dataskyddslagen." }],
          },
        ],
      }),
    });

    const response = await chatHandler(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(executivePayload).toMatchObject({
      query: "Summarize dataskyddslagen.",
      llmMode: "vertex-open",
      llmModel: "deepseek-v3.2-maas",
      llmApiKey: "test-google-key",
      vertexProjectId: "test-vertex-project",
    });
  });

  it("forwards the optional Browser Use key to the executive route when research is enabled client-side", async () => {
    let executivePayload: Record<string, unknown> | undefined;

    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url === "http://localhost:3001/api/v1/executive/law") {
        executivePayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response("ok", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof globalThis.fetch;

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-browser-use-key": "browser-use-live-key",
      },
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Compare the official law and lagen.nu commentary for dataskyddslagen." }],
          },
        ],
      }),
    });

    const response = await chatHandler(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(executivePayload).toMatchObject({
      query: "Compare the official law and lagen.nu commentary for dataskyddslagen.",
      browserUseApiKey: "browser-use-live-key",
    });
  });

  it("forwards opaque Albert server modes from request headers to the executive route", async () => {
    let executivePayload: Record<string, unknown> | undefined;

    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url === "http://localhost:3001/api/v1/executive/law") {
        executivePayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response("ok", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof globalThis.fetch;

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-law-llm-mode": "server-1",
      },
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Summarize dataskyddslagen." }],
          },
        ],
      }),
    });

    const response = await chatHandler(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(executivePayload).toMatchObject({
      query: "Summarize dataskyddslagen.",
      llmMode: "server-1",
    });
    expect(executivePayload).not.toHaveProperty("llmProvider");
    expect(executivePayload).not.toHaveProperty("llmModel");
  });

  it("forwards BYOK headers only for user-supplied providers", async () => {
    let executivePayload: Record<string, unknown> | undefined;

    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url === "http://localhost:3001/api/v1/executive/law") {
        executivePayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response("ok", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof globalThis.fetch;

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-law-llm-mode": "openai",
        "x-law-llm-model": "gpt-5.4-nano",
        "x-law-llm-api-key": "sk-user-openai",
      },
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Summarize dataskyddslagen." }],
          },
        ],
      }),
    });

    const response = await chatHandler(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(executivePayload).toMatchObject({
      query: "Summarize dataskyddslagen.",
      llmMode: "openai",
      llmModel: "gpt-5.4-nano",
      llmApiKey: "sk-user-openai",
    });
  });

  it("forwards the active law model without leaking an old provider selection", async () => {
    let executivePayload: Record<string, unknown> | undefined;

    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url === "http://localhost:3001/api/v1/executive/law") {
        executivePayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response("ok", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof globalThis.fetch;

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-law-llm-mode": "anthropic",
        "x-law-llm-model": "claude-haiku-4-5",
        "x-law-llm-provider": "openai",
      },
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Summarize dataskyddslagen." }],
          },
        ],
      }),
    });

    const response = await chatHandler(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(executivePayload).toMatchObject({
      query: "Summarize dataskyddslagen.",
      llmMode: "anthropic",
      llmModel: "claude-haiku-4-5",
    });
    expect(executivePayload).not.toHaveProperty("llmProvider");
  });

  it("rejects bursts from the same public client before they hit the executive route", async () => {
    let upstreamCalls = 0;

    globalThis.fetch = mock(async () => {
      upstreamCalls += 1;
      return new Response("ok", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }) as unknown as typeof globalThis.fetch;

    const createRequest = () => new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
      },
      body: JSON.stringify({
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: "Summarize dataskyddslagen." }],
          },
        ],
      }),
    });

    for (let index = 0; index < 5; index += 1) {
      const response = await chatHandler(createRequest());
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
    }

    const rateLimitedResponse = await chatHandler(createRequest());

    expect(rateLimitedResponse.status).toBe(429);
    expect(rateLimitedResponse.headers.get("Retry-After")).not.toBeNull();
    expect(upstreamCalls).toBe(5);
  });

  it("rejects direct provider overrides outside the public law mode contract", async () => {
    let executivePayload: Record<string, unknown> | undefined;

    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url === "http://localhost:3001/api/v1/executive/law") {
        executivePayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response("ok", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof globalThis.fetch;

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-law-llm-provider": "openai",
        "x-law-llm-model": "gpt-5.4",
      },
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Summarize dataskyddslagen." }],
          },
        ],
      }),
    });

    const response = await chatHandler(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(executivePayload).toMatchObject({
      query: "Summarize dataskyddslagen.",
    });
    expect(executivePayload).not.toHaveProperty("llmProvider");
    expect(executivePayload).not.toHaveProperty("llmModel");
  });
});
