import { createUIMessageStreamResponse } from "ai";
import type { UIMessage, UIMessageChunk } from "ai";
import { z } from "zod";
import { getLawChatRateLimitClientId, takeLawChatRateLimitToken } from "../lib/chat-rate-limit";

const ChatRequestBodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
  }).passthrough()).min(1, "At least one message is required"),
});

type ChatHandlerRequest = Request | {
  method?: string;
  headers?: Headers;
  req?: {
    method?: string;
    headers?: Headers;
    json?: () => Promise<unknown>;
  };
};

type ExecutiveLawRequest = {
  query: string;
  sessionId: string;
  llmApiKey?: string;
  llmMode?: string;
  llmModel?: string;
  vertexProjectId?: string;
  messageHistory: Array<{ role: "user" | "assistant"; content: string }>;
  context: {
    timezone: string;
    locale: string;
    timestamp: string;
    defaultLanguage?: string;
  };
  browserUseApiKey?: string;
};

type LegacyFinishReason = "length" | "error" | "stop" | "content-filter" | "tool-calls" | "other";

type LegacyDataStreamPart =
  | { type: "text"; value: string }
  | { type: "reasoning"; value: string }
  | { type: "source"; value: Record<string, unknown> }
  | { type: "file"; value: { data: string; mimeType: string } }
  | { type: "error"; value: string }
  | {
    type: "tool_call_streaming_start";
    value: { toolCallId: string; toolName: string };
  }
  | {
    type: "tool_call_delta";
    value: { toolCallId: string; argsTextDelta: string };
  }
  | {
    type: "tool_call";
    value: { toolCallId: string; toolName: string; args: unknown };
  }
  | {
    type: "tool_result";
    value: { toolCallId: string; result: unknown };
  }
  | {
    type: "finish_message";
    value: { finishReason: LegacyFinishReason };
  }
  | {
    type: "finish_step";
    value: { finishReason: string; isContinued?: boolean };
  }
  | {
    type: "start_step";
    value: { messageId: string };
  }
  | { type: "ignored"; value: unknown };

const LEGACY_DATA_STREAM_HEADER = "x-vercel-ai-data-stream";

function isLegacyDataStreamResponse(response: Response): boolean {
  return response.headers.get(LEGACY_DATA_STREAM_HEADER) === "v1" && response.body != null;
}

function parseLegacyDataStreamLine(line: string): LegacyDataStreamPart {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) {
    throw new Error("Malformed executive LAW data stream chunk");
  }

  const code = line.slice(0, separatorIndex);
  const rawValue = line.slice(separatorIndex + 1);
  const value = JSON.parse(rawValue) as unknown;

  switch (code) {
    case "0":
      if (typeof value === "string") {
        return { type: "text", value };
      }
      break;
    case "3":
      if (typeof value === "string") {
        return { type: "error", value };
      }
      break;
    case "9":
      if (
        value != null
        && typeof value === "object"
        && "toolCallId" in value
        && "toolName" in value
        && "args" in value
        && typeof value.toolCallId === "string"
        && typeof value.toolName === "string"
      ) {
        return { type: "tool_call", value: value as LegacyDataStreamPart["value"] & { toolCallId: string; toolName: string; args: unknown } };
      }
      break;
    case "a":
      if (
        value != null
        && typeof value === "object"
        && "toolCallId" in value
        && "result" in value
        && typeof value.toolCallId === "string"
      ) {
        return { type: "tool_result", value: value as { toolCallId: string; result: unknown } };
      }
      break;
    case "b":
      if (
        value != null
        && typeof value === "object"
        && "toolCallId" in value
        && "toolName" in value
        && typeof value.toolCallId === "string"
        && typeof value.toolName === "string"
      ) {
        return { type: "tool_call_streaming_start", value: value as { toolCallId: string; toolName: string } };
      }
      break;
    case "c":
      if (
        value != null
        && typeof value === "object"
        && "toolCallId" in value
        && "argsTextDelta" in value
        && typeof value.toolCallId === "string"
        && typeof value.argsTextDelta === "string"
      ) {
        return { type: "tool_call_delta", value: value as { toolCallId: string; argsTextDelta: string } };
      }
      break;
    case "d":
      if (
        value != null
        && typeof value === "object"
        && "finishReason" in value
        && typeof value.finishReason === "string"
      ) {
        const finishValue = value as { finishReason: LegacyFinishReason };
        return {
          type: "finish_message",
          value: { finishReason: finishValue.finishReason },
        };
      }
      break;
    case "e":
      if (
        value != null
        && typeof value === "object"
        && "finishReason" in value
        && typeof value.finishReason === "string"
      ) {
        return {
          type: "finish_step",
          value: {
            finishReason: value.finishReason,
            isContinued: "isContinued" in value && typeof value.isContinued === "boolean" ? value.isContinued : undefined,
          },
        };
      }
      break;
    case "f":
      if (
        value != null
        && typeof value === "object"
        && "messageId" in value
        && typeof value.messageId === "string"
      ) {
        return { type: "start_step", value: { messageId: value.messageId } };
      }
      break;
    case "g":
      if (typeof value === "string") {
        return { type: "reasoning", value };
      }
      break;
    case "h":
      if (value != null && typeof value === "object") {
        return { type: "source", value: value as Record<string, unknown> };
      }
      break;
    case "k":
      if (
        value != null
        && typeof value === "object"
        && "data" in value
        && "mimeType" in value
        && typeof value.data === "string"
        && typeof value.mimeType === "string"
      ) {
        return { type: "file", value: { data: value.data, mimeType: value.mimeType } };
      }
      break;
    case "2":
    case "8":
    case "i":
    case "j":
      return { type: "ignored", value };
  }

  throw new Error(`Unsupported executive LAW data stream chunk: ${line}`);
}

function toFileUrl(value: { data: string; mimeType: string }): string {
  if (value.data.startsWith("http://") || value.data.startsWith("https://") || value.data.startsWith("data:")) {
    return value.data;
  }

  return `data:${value.mimeType};base64,${value.data}`;
}

function toSourceChunk(source: Record<string, unknown>): UIMessageChunk | null {
  const sourceId = typeof source.id === "string" ? source.id : crypto.randomUUID();
  const title = typeof source.title === "string" ? source.title : undefined;

  if (typeof source.url === "string") {
    return {
      type: "source-url",
      sourceId,
      url: source.url,
      ...(title ? { title } : {}),
    };
  }

  if (typeof source.mediaType === "string" && title) {
    return {
      type: "source-document",
      sourceId,
      mediaType: source.mediaType,
      title,
      ...(typeof source.filename === "string" ? { filename: source.filename } : {}),
    };
  }

  return null;
}

function createLegacyDataBridgeResponse(upstreamResponse: Response, headers: Headers): Response {
  const stream = new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const decoder = new TextDecoder();
      const reader = upstreamResponse.body!.getReader();
      let buffer = "";
      let streamStarted = false;
      let messageFinished = false;
      let finishReason: UIMessageChunk["type"] extends "finish" ? never : "stop" | "length" | "error" | "content-filter" | "tool-calls" | "other" = "stop";
      let activeTextId: string | undefined;
      let activeReasoningId: string | undefined;

      const ensureStart = (messageId?: string) => {
        if (streamStarted) {
          return;
        }

        controller.enqueue({
          type: "start",
          ...(messageId ? { messageId } : {}),
        });
        streamStarted = true;
      };

      const closeActiveParts = () => {
        if (activeReasoningId) {
          controller.enqueue({ type: "reasoning-end", id: activeReasoningId });
          activeReasoningId = undefined;
        }

        if (activeTextId) {
          controller.enqueue({ type: "text-end", id: activeTextId });
          activeTextId = undefined;
        }
      };

      const handleLine = (line: string) => {
        const part = parseLegacyDataStreamLine(line);

        switch (part.type) {
          case "start_step":
            ensureStart(part.value.messageId);
            closeActiveParts();
            controller.enqueue({ type: "start-step" });
            break;
          case "text":
            ensureStart();
            if (!activeTextId) {
              activeTextId = crypto.randomUUID();
              controller.enqueue({ type: "text-start", id: activeTextId });
            }
            controller.enqueue({ type: "text-delta", id: activeTextId, delta: part.value });
            break;
          case "reasoning":
            ensureStart();
            if (!activeReasoningId) {
              activeReasoningId = crypto.randomUUID();
              controller.enqueue({ type: "reasoning-start", id: activeReasoningId });
            }
            controller.enqueue({ type: "reasoning-delta", id: activeReasoningId, delta: part.value });
            break;
          case "tool_call_streaming_start":
            ensureStart();
            controller.enqueue({
              type: "tool-input-start",
              toolCallId: part.value.toolCallId,
              toolName: part.value.toolName,
            });
            break;
          case "tool_call_delta":
            ensureStart();
            controller.enqueue({
              type: "tool-input-delta",
              toolCallId: part.value.toolCallId,
              inputTextDelta: part.value.argsTextDelta,
            });
            break;
          case "tool_call":
            ensureStart();
            controller.enqueue({
              type: "tool-input-available",
              toolCallId: part.value.toolCallId,
              toolName: part.value.toolName,
              input: part.value.args,
            });
            break;
          case "tool_result":
            ensureStart();
            controller.enqueue({
              type: "tool-output-available",
              toolCallId: part.value.toolCallId,
              output: part.value.result,
            });
            break;
          case "source": {
            ensureStart();
            const chunk = toSourceChunk(part.value);
            if (chunk) {
              controller.enqueue(chunk);
            }
            break;
          }
          case "file":
            ensureStart();
            controller.enqueue({
              type: "file",
              url: toFileUrl(part.value),
              mediaType: part.value.mimeType,
            });
            break;
          case "finish_step":
            ensureStart();
            closeActiveParts();
            controller.enqueue({ type: "finish-step" });
            break;
          case "finish_message":
            ensureStart();
            closeActiveParts();
            finishReason = part.value.finishReason;
            controller.enqueue({ type: "finish", finishReason });
            messageFinished = true;
            break;
          case "error":
            ensureStart();
            controller.enqueue({ type: "error", errorText: part.value });
            break;
          case "ignored":
            break;
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              continue;
            }

            handleLine(trimmed);
          }
        }

        buffer += decoder.decode();

        const trailingLine = buffer.trim();
        if (trailingLine) {
          handleLine(trailingLine);
        }

        if (!streamStarted) {
          ensureStart();
        }

        if (!messageFinished) {
          closeActiveParts();
          controller.enqueue({ type: "finish", finishReason });
        }

        controller.close();
      } catch (error) {
        controller.enqueue({
          type: "error",
          errorText: error instanceof Error ? error.message : "Failed to bridge executive LAW stream",
        });
        if (!messageFinished) {
          closeActiveParts();
          controller.enqueue({ type: "finish", finishReason: "error" });
        }
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });

  return createUIMessageStreamResponse({
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
    stream,
  });
}

export function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getChatRequestHeader(request: ChatHandlerRequest, name: string): string | undefined {
  if (request instanceof Request) {
    return request.headers.get(name) ?? undefined;
  }

  return request.headers?.get(name) ?? request.req?.headers?.get(name) ?? undefined;
}

function extractMessageText(message: UIMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const text = parts
    .filter((part): part is { type: "text"; text: string } => {
      return typeof part === "object" && part !== null && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string";
    })
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");

  if (text) {
    return text;
  }

  return typeof (message as { content?: unknown }).content === "string"
    ? ((message as { content?: string }).content ?? "").trim()
    : "";
}

function inferDefaultLanguage(locale: string): "en" | "sv" | "fr" {
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("sv")) {
    return "sv";
  }
  if (normalized.startsWith("fr")) {
    return "fr";
  }
  return "en";
}

const LAW_LLM_MODES = new Set(["server-1", "vertex-claude", "vertex-mistral", "vertex-open", "openai", "anthropic"]);
const VERTEX_LLM_MODES = new Set(["vertex-claude", "vertex-mistral", "vertex-open"]);

type LawLlmMode = "server-1" | "vertex-claude" | "vertex-mistral" | "vertex-open" | "openai" | "anthropic";
type VertexLlmMode = "vertex-claude" | "vertex-mistral" | "vertex-open";

function isLawLlmMode(value?: string): value is LawLlmMode {
  return typeof value === "string" && LAW_LLM_MODES.has(value);
}

function isVertexLawLlmMode(value?: string): value is VertexLlmMode {
  return typeof value === "string" && VERTEX_LLM_MODES.has(value);
}

async function buildExecutiveLawRequest(messages: UIMessage[], request: ChatHandlerRequest): Promise<ExecutiveLawRequest> {
  const normalizedMessages = messages
    .map((message) => ({
      role: message.role,
      content: extractMessageText(message),
    }))
    .filter((message) => message.content.length > 0);

  const lastUserIndex = [...normalizedMessages]
    .map((message, index) => ({ ...message, index }))
    .reverse()
    .find((message) => message.role === "user")
    ?.index;

  if (lastUserIndex == null) {
    throw new TypeError("No user message found in chat payload");
  }

  const locale = getChatRequestHeader(request, "accept-language")?.split(",")[0]?.trim() || "sv-SE";
  const timezone = getChatRequestHeader(request, "x-timezone") || "Europe/Stockholm";
  const query = normalizedMessages[lastUserIndex]!.content;
  const browserUseKey = getChatRequestHeader(request, "x-browser-use-key")?.trim();
  const rawLlmMode = getChatRequestHeader(request, "x-law-llm-mode")?.trim().toLowerCase();
  const llmMode = isLawLlmMode(rawLlmMode) ? rawLlmMode : undefined;
  const llmApiKey = llmMode
    ? getChatRequestHeader(request, "x-law-llm-api-key")?.trim()
    : undefined;
  const llmModel = llmMode
    ? getChatRequestHeader(request, "x-law-llm-model")?.trim()
    : undefined;
  const vertexProjectId = isVertexLawLlmMode(llmMode)
    ? getChatRequestHeader(request, "x-law-vertex-project-id")?.trim()
    : undefined;

  // User geolocation for Vertex AI region routing (from browser Geolocation API)
  const rawUserLat = getChatRequestHeader(request, "x-user-lat")?.trim();
  const rawUserLng = getChatRequestHeader(request, "x-user-lng")?.trim();
  const userLat = rawUserLat ? Number.parseFloat(rawUserLat) : undefined;
  const userLng = rawUserLng ? Number.parseFloat(rawUserLng) : undefined;
  const hasValidCoords = userLat != null && userLng != null
    && Number.isFinite(userLat) && Number.isFinite(userLng)
    && userLat >= -90 && userLat <= 90
    && userLng >= -180 && userLng <= 180;

  return {
    query,
    sessionId: getChatRequestHeader(request, "x-thread-id") || crypto.randomUUID(),
    ...(llmMode ? { llmMode } : {}),
    ...(llmApiKey ? { llmApiKey } : {}),
    ...(llmModel ? { llmModel } : {}),
    ...(vertexProjectId ? { vertexProjectId } : {}),
    ...(hasValidCoords ? { userLat, userLng } : {}),
    messageHistory: normalizedMessages
      .slice(0, lastUserIndex)
      .filter((message): message is { role: "user" | "assistant"; content: string } => {
        return message.role === "user" || message.role === "assistant";
      }),
    context: {
      timezone,
      locale,
      timestamp: new Date().toISOString(),
      defaultLanguage: inferDefaultLanguage(locale),
    },
    ...(browserUseKey ? { browserUseApiKey: browserUseKey } : {}),
  };
}

export function getChatRequestMethod(request: ChatHandlerRequest): string {
  if (request instanceof Request) {
    return request.method;
  }

  return request.method ?? request.req?.method ?? "GET";
}

export async function getChatRequestBody(request: ChatHandlerRequest): Promise<unknown> {
  if (request instanceof Request) {
    return await request.json();
  }

  if (typeof request.req?.json === "function") {
    return await request.req.json();
  }

  throw new TypeError("Unsupported request body reader for /api/chat");
}

type RuntimeEnv = Record<string, string | undefined>;

export default async function chatHandler(request: ChatHandlerRequest, runtimeEnv?: RuntimeEnv): Promise<Response> {
  if (getChatRequestMethod(request) !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const env = runtimeEnv ?? process.env;

  const { allowed, retryAfterMs } = takeLawChatRateLimitToken(
    getLawChatRateLimitClientId((name) => getChatRequestHeader(request, name)),
  );
  if (!allowed) {
    return Response.json({
      error: "Too many requests",
    }, {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
      },
    });
  }

  try {
    const rawBody = await getChatRequestBody(request);
    const parsed = ChatRequestBodySchema.safeParse(rawBody);

    if (!parsed.success) {
      return Response.json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const executiveBody = await buildExecutiveLawRequest(parsed.data.messages as unknown as UIMessage[], request);
    const executiveBaseUrl = env.API_URL || "http://localhost:3001";
    const executiveUrl = new URL("/api/v1/executive/law", executiveBaseUrl).toString();

    const upstreamHeaders = new Headers({
      "Content-Type": "application/json",
    });

    const acceptLanguage = getChatRequestHeader(request, "accept-language");
    if (acceptLanguage) {
      upstreamHeaders.set("Accept-Language", acceptLanguage);
    }

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(executiveUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(executiveBody),
      });
    } catch (fetchError) {
      const isLocal = executiveBaseUrl.includes("localhost") || executiveBaseUrl.includes("127.0.0.1");
      const hint = isLocal
        ? "Is the Albert backend running on port 3001? Start it with: cd Albert/backend && bun run dev"
        : `Could not reach upstream at ${executiveBaseUrl}`;
      console.error("[law-agent/chat] Upstream fetch failed:", fetchError, `| url=${executiveUrl} | hint=${hint}`);
      return Response.json({
        error: "Law chat proxy failed",
        details: fetchError instanceof Error ? fetchError.message : "Upstream unreachable",
        hint,
      }, { status: 502 });
    }

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");

    if (!upstreamResponse.ok && !isLegacyDataStreamResponse(upstreamResponse)) {
      let upstreamError: string | undefined;
      try {
        const body = await upstreamResponse.text();
        upstreamError = body.slice(0, 500);
      } catch { /* ignore read errors */ }
      console.error(`[law-agent/chat] Upstream returned ${upstreamResponse.status}: ${upstreamError ?? "(no body)"}`);
      return Response.json({
        error: "Law chat proxy failed",
        details: upstreamError ?? `Upstream returned ${upstreamResponse.status}`,
      }, { status: upstreamResponse.status });
    }

    if (isLegacyDataStreamResponse(upstreamResponse)) {
      responseHeaders.delete("content-type");
      responseHeaders.delete(LEGACY_DATA_STREAM_HEADER);
      return createLegacyDataBridgeResponse(upstreamResponse, responseHeaders);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return Response.json({
      error: "Law chat proxy failed",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
