const DEFAULT_API_BASE_URL = "http://localhost:3001";

/**
 * The platform proxy is intentionally tolerant of both standard Fetch Requests
 * and framework-wrapped request shapes so the handler remains reusable across
 * tests and HTTP runtimes.
 */
type PlatformHandlerRequest = Request | {
  method?: string;
  url?: string;
  headers?: Headers;
  body?: ReadableStream | null;
  req?: {
    method?: string;
    url?: string;
    headers?: Headers;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
};

function resolveUpstreamPath(pathname: string): string | null {
  if (pathname === "/api/albert/threads") {
    return "/api/v1/albert/threads";
  }

  if (pathname.startsWith("/api/albert/threads/")) {
    return pathname.replace("/api/albert", "/api/v1/albert");
  }

  // ✅ 2026: Law agent chat persistence routes
  // /api/law-chat/* → /api/v1/law-chat/*
  if (pathname === "/api/law-chat/conversations") {
    return "/api/v1/law-chat/conversations";
  }

  if (pathname.startsWith("/api/law-chat/conversations/")) {
    return pathname.replace("/api/law-chat", "/api/v1/law-chat");
  }

  return null;
}

function getRequestMethod(request: PlatformHandlerRequest): string {
  if (request instanceof Request) {
    return request.method;
  }
  return request.method ?? request.req?.method ?? "GET";
}

function getRequestUrl(request: PlatformHandlerRequest): string {
  if (request instanceof Request) {
    return request.url;
  }
  return request.url ?? request.req?.url ?? "";
}

function getRequestHeaders(request: PlatformHandlerRequest): Headers {
  if (request instanceof Request) {
    return request.headers;
  }
  return request.headers ?? request.req?.headers ?? new Headers();
}

function buildUpstreamHeaders(request: PlatformHandlerRequest): Headers {
  const headers = new Headers(getRequestHeaders(request));

  headers.delete("content-length");
  headers.delete("host");

  return headers;
}

function methodCanHaveBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

async function getRequestBody(request: PlatformHandlerRequest): Promise<ArrayBuffer | undefined> {
  const method = getRequestMethod(request);
  if (!methodCanHaveBody(method)) {
    return undefined;
  }

  if (request instanceof Request) {
    return await request.arrayBuffer();
  }

  if (typeof request.req?.arrayBuffer === "function") {
    return await request.req.arrayBuffer();
  }

  // h3 may expose a ReadableStream body
  if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged.buffer;
  }

  return undefined;
}

type RuntimeEnv = Record<string, string | undefined>;

export default async function platformHandler(request: PlatformHandlerRequest, runtimeEnv?: RuntimeEnv): Promise<Response> {
  const env = runtimeEnv ?? process.env;
  const method = getRequestMethod(request);
  const rawUrl = getRequestUrl(request);
  const requestUrl = new URL(rawUrl, "http://localhost");
  const upstreamPath = resolveUpstreamPath(requestUrl.pathname);

  if (!upstreamPath) {
    return new Response("Not Found", { status: 404 });
  }

  const upstreamBaseUrl = env.API_URL || DEFAULT_API_BASE_URL;
  const upstreamUrl = new URL(upstreamPath, upstreamBaseUrl).toString();
  const body = await getRequestBody(request);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(new Request(upstreamUrl, {
      method,
      headers: buildUpstreamHeaders(request),
      ...(body ? { body } : {}),
    }));
  } catch (error) {
    throw error;
  }

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
