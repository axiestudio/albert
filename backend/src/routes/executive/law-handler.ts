import { streamText, tool } from "ai";
import type { Context } from "hono";
import { z } from "zod";

import type { Env } from "../../env";
import { startBrowserTask, waitForBrowserTask } from "../../lib/browser-use";
import { createModelForRequest } from "../../lib/providers";
import {
  CF_API_BASE_LAW,
  LAW_EXECUTION_MAX_STEPS,
  LAW_SOURCE_DEFAULT_READ_CHARS,
  LAW_UI_MESSAGE_STREAM_HEADER,
  RIKSDAGEN_BASE,
  SFS_EMBEDDING_MODEL,
  SFS_VECTORIZE_INDEX,
  getLawRestAccount,
  resolveLawLlmConfig,
} from "./law-config";
import { analyzeDomPage } from "./law-dom";
import { fetchLagenNuPage, sourceFootnote } from "./law-lagen";
import { buildLawOpeningText, buildLawSystemPrompt, buildWebResearchToolOutput } from "./law-prompt";
import { keywordSearchRiksdagenLaws } from "./law-prepare";
import {
  buildRiksdagenDocumentUrl,
  fetchPropositionFallback,
  fetchRiksdagenJson,
} from "./law-riksdagen";
import { createLawTextStreamTransform } from "./law-stream-transform";
import { readLawSourceMaterial } from "./law-source-material";
import type {
  LawExecutiveRequest,
  LawSourceMaterialRequest,
  LawUiFinishReason,
  LawUiMessageChunk,
} from "./law-types";
import { buildLawToolInputSchema, ensureArray, optionalToolNumber } from "./law-utils";

function encodeLawUiChunk(chunk: LawUiMessageChunk): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`);
}

function encodeLawUiDone(): Uint8Array {
  return new TextEncoder().encode("data: [DONE]\n\n");
}

function toLawUiSourceChunk(source: unknown): LawUiMessageChunk | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const sourceRecord = source as Record<string, unknown>;
  const sourceId = typeof sourceRecord.id === "string" ? sourceRecord.id : crypto.randomUUID();
  const title = typeof sourceRecord.title === "string" ? sourceRecord.title : undefined;

  if (sourceRecord.sourceType === "url" && typeof sourceRecord.url === "string") {
    return {
      type: "source-url",
      sourceId,
      url: sourceRecord.url,
      ...(title ? { title } : {}),
    };
  }

  if (sourceRecord.sourceType === "document" && typeof sourceRecord.mediaType === "string" && title) {
    return {
      type: "source-document",
      sourceId,
      mediaType: sourceRecord.mediaType,
      title,
      ...(typeof sourceRecord.filename === "string" ? { filename: sourceRecord.filename } : {}),
    };
  }

  return null;
}

function toLawUiFileChunk(file: Record<string, unknown>): LawUiMessageChunk | null {
  if (typeof file.mimeType !== "string" || typeof file.base64 !== "string") {
    return null;
  }

  return {
    type: "file",
    mediaType: file.mimeType,
    url: `data:${file.mimeType};base64,${file.base64}`,
  };
}

export function createLawUiMessageStream(
  fullStream: AsyncIterable<Record<string, unknown>>,
  openingText?: string,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let started = false;
      let finished = false;
      let openingTextInjected = false;
      let activeTextId: string | undefined;
      let activeReasoningId: string | undefined;
      let textCounter = 0;
      let reasoningCounter = 0;

      const enqueue = (chunk: LawUiMessageChunk) => {
        controller.enqueue(encodeLawUiChunk(chunk));
      };

      const ensureStarted = (messageId?: string) => {
        if (started) {
          return;
        }

        enqueue({
          type: "start",
          ...(messageId ? { messageId } : {}),
        });
        started = true;
      };

      const closeActiveParts = () => {
        if (activeReasoningId) {
          enqueue({ type: "reasoning-end", id: activeReasoningId });
          activeReasoningId = undefined;
        }

        if (activeTextId) {
          enqueue({ type: "text-end", id: activeTextId });
          activeTextId = undefined;
        }
      };

      const injectOpeningText = () => {
        if (openingTextInjected || !openingText?.trim()) {
          return;
        }

        ensureStarted();
        openingTextInjected = true;
        textCounter += 1;
        const openingTextId = `text-${textCounter}`;
        enqueue({ type: "text-start", id: openingTextId });
        enqueue({ type: "text-delta", id: openingTextId, delta: openingText });
        enqueue({ type: "text-end", id: openingTextId });
      };

      try {
        for await (const part of fullStream) {
          const partType = part.type;

          switch (partType) {
            case "step-start":
              ensureStarted(typeof part.messageId === "string" ? part.messageId : undefined);
              injectOpeningText();
              enqueue({ type: "start-step" });
              break;
            case "reasoning":
              ensureStarted();
              injectOpeningText();
              if (!activeReasoningId) {
                reasoningCounter += 1;
                activeReasoningId = `reasoning-${reasoningCounter}`;
                enqueue({ type: "reasoning-start", id: activeReasoningId });
              }
              if (typeof part.textDelta === "string") {
                enqueue({ type: "reasoning-delta", id: activeReasoningId, delta: part.textDelta });
              }
              break;
            case "text-delta":
              ensureStarted();
              injectOpeningText();
              if (!activeTextId) {
                textCounter += 1;
                activeTextId = `text-${textCounter}`;
                enqueue({ type: "text-start", id: activeTextId });
              }
              if (typeof part.textDelta === "string") {
                enqueue({ type: "text-delta", id: activeTextId, delta: part.textDelta });
              }
              break;
            case "source": {
              ensureStarted();
              injectOpeningText();
              const chunk = toLawUiSourceChunk(part.source);
              if (chunk) {
                enqueue(chunk);
              }
              break;
            }
            case "file": {
              ensureStarted();
              injectOpeningText();
              const chunk = toLawUiFileChunk(part);
              if (chunk) {
                enqueue(chunk);
              }
              break;
            }
            case "tool-call-streaming-start":
              ensureStarted();
              injectOpeningText();
              if (typeof part.toolCallId === "string" && typeof part.toolName === "string") {
                enqueue({
                  type: "tool-input-start",
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                });
              }
              break;
            case "tool-call-delta":
              ensureStarted();
              injectOpeningText();
              if (typeof part.toolCallId === "string" && typeof part.argsTextDelta === "string") {
                enqueue({
                  type: "tool-input-delta",
                  toolCallId: part.toolCallId,
                  inputTextDelta: part.argsTextDelta,
                });
              }
              break;
            case "tool-call":
              ensureStarted();
              injectOpeningText();
              if (typeof part.toolCallId === "string" && typeof part.toolName === "string") {
                enqueue({
                  type: "tool-input-available",
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: "args" in part ? part.args : {},
                });
              }
              break;
            case "tool-result":
              ensureStarted();
              injectOpeningText();
              if (typeof part.toolCallId === "string") {
                enqueue({
                  type: "tool-output-available",
                  toolCallId: part.toolCallId,
                  output: "result" in part ? part.result : null,
                });
              }
              break;
            case "step-finish":
              ensureStarted();
              closeActiveParts();
              enqueue({ type: "finish-step" });
              break;
            case "finish":
              ensureStarted();
              injectOpeningText();
              closeActiveParts();
              enqueue({
                type: "finish",
                finishReason: (typeof part.finishReason === "string" ? part.finishReason : "stop") as LawUiFinishReason,
              });
              finished = true;
              break;
            case "error":
              ensureStarted();
              console.error("[Executive/Law] Stream part error:", JSON.stringify(part.error, Object.getOwnPropertyNames(part.error ?? {}), 2));
              enqueue({
                type: "error",
                errorText: part.error instanceof Error
                  ? part.error.message
                  : typeof part.error === "string"
                    ? part.error
                    : "Law execution failed",
              });
              break;
            default:
              break;
          }
        }

        if (!started) {
          ensureStarted();
          injectOpeningText();
        }

        if (!finished) {
          closeActiveParts();
          enqueue({ type: "finish", finishReason: "stop" });
        }

        controller.enqueue(encodeLawUiDone());
        controller.close();
      } catch (error) {
        console.error("[Executive/Law] Stream catch error:", error);
        if (error instanceof Error && "cause" in error) {
          console.error("[Executive/Law] Error cause:", error.cause);
        }
        if (error && typeof error === "object" && "data" in error) {
          console.error("[Executive/Law] Error data:", (error as { data?: unknown }).data);
        }
        if (error && typeof error === "object" && "responseBody" in error) {
          console.error("[Executive/Law] Response body:", (error as { responseBody?: unknown }).responseBody);
        }
        ensureStarted();
        enqueue({
          type: "error",
          errorText: error instanceof Error ? error.message : "Law execution failed",
        });
        closeActiveParts();
        enqueue({ type: "finish", finishReason: "error" });
        controller.enqueue(encodeLawUiDone());
        controller.close();
      }
    },
  });
}

export async function handleLawExecution(c: Context<{ Bindings: Env }>) {
  try {
    const body: LawExecutiveRequest = await c.req.json();
    const {
      query,
      sessionId = "",
      llmApiKey,
      llmMode,
      llmModel,
      userLat,
      userLng,
      messageHistory = [],
      context,
      lawSearchResults = [],
      extractedKeywords = [],
      browserUseApiKey,
    } = body;

    if (!query) {
      return c.json({ error: "Query is required" }, 400);
    }

    const lawStartMs = Date.now();
    const isFollowUp = messageHistory.length > 0;
    const {
      provider: resolvedLlmProvider,
      model: resolvedLlmModel,
      apiKey: resolvedLlmApiKey,
      baseUrl: resolvedLlmBaseUrl,
      userLat: resolvedUserLat,
      userLng: resolvedUserLng,
      vertexProjectId,
    } = resolveLawLlmConfig(c.env as Partial<Env> & Record<string, string | undefined>, {
      llmApiKey,
      llmMode,
      llmModel,
      userLat,
      userLng,
    });

    if (!resolvedLlmApiKey) {
      const stringEnv = c.env as unknown as Record<string, string | undefined>;
      console.warn(
        `[Executive/Law] Missing LLM API key`
        + ` | provider=${resolvedLlmProvider}`
        + ` | model=${resolvedLlmModel}`
        + ` | hasProvider=${Boolean(stringEnv.LLM_PROVIDER)}`
        + ` | hasModel=${Boolean(stringEnv.LLM_MODEL)}`
        + ` | hasLlmApiKey=${Boolean(stringEnv.LLM_API_KEY)}`
        + ` | hasLawProvider=${Boolean(c.env.LAW_LLM_PROVIDER)}`
        + ` | hasLawModel=${Boolean(c.env.LAW_LLM_MODEL)}`
        + ` | hasLawApiKey=${Boolean(c.env.LAW_LLM_API_KEY)}`
        + ` | hasGoogleApiKey=${Boolean(stringEnv.GOOGLE_API_KEY || stringEnv.LAW_GOOGLE_API_KEY)}`,
      );
      return c.json({ error: "No law LLM API key configured" }, 400);
    }

    const model = createModelForRequest(c.env, {
      provider: resolvedLlmProvider,
      model: resolvedLlmModel,
      apiKey: resolvedLlmApiKey,
      baseUrl: resolvedLlmBaseUrl,
      userLat: resolvedUserLat,
      userLng: resolvedUserLng,
      vertexProjectId,
    });

    const hasWebResearch = typeof browserUseApiKey === "string" && browserUseApiKey.trim().length > 0;
    const systemPrompt = buildLawSystemPrompt(context, hasWebResearch, query, isFollowUp);
    const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of messageHistory.slice(-10)) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: query });

    console.log(
      `[Executive/Law] Starting law execution`
      + ` | query="${query.slice(0, 80)}"`
      + ` | sessionId=${sessionId || "none"}`
      + ` | provider=${resolvedLlmProvider}`
      + ` | model=${resolvedLlmModel}`
      + ` | isFollowUp=${isFollowUp}`
      + ` | webResearch=${hasWebResearch}`
      + ` | preparedResults=${lawSearchResults.length}`
      + ` | extractedKeywords=${extractedKeywords.length}`,
    );

    const headers = new Headers({
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      [LAW_UI_MESSAGE_STREAM_HEADER]: "v1",
      "x-accel-buffering": "no",
      // ✅ 2026: Expose which provider/model the backend actually resolved.
      // The frontend can display this for transparency — no more guessing.
      "x-law-resolved-provider": resolvedLlmProvider,
      "x-law-resolved-model": resolvedLlmModel,
    });
    // ✅ 2026: Opening text removed — let the real LLM generate its own greeting.
    // Previously `buildLawOpeningText()` injected a hardcoded greeting before the
    // model's actual output, making it look like the agent said something it didn't.
    const openingText = undefined;

    const readSourceMaterialParameters = z.object({
      sourceType: z.enum(["riksdagen-document", "lagen-nu", "dom-page", "web-research-artifact"]).describe("The type of source material to continue reading."),
      dokId: z.string().optional().describe("Required for riksdagen-document: the exact Riksdagen dok_id, such as 'sfs-2022-811'."),
      input: z.string().optional().describe("Required for lagen-nu: the lagen.nu reference, such as '2018:218', '2018:218#K3', or a full lagen.nu URL."),
      url: z.string().optional().describe("Required for dom-page: the exact URL previously analyzed with analyzeDom."),
      taskId: z.string().optional().describe("Required for web-research-artifact: the exact UUID taskId returned by startWebResearch."),
      fileName: z.string().optional().describe("Required for web-research-artifact: the exact file name listed in getWebResearchResult.outputFiles."),
      offset: optionalToolNumber(0).describe("Zero-based character offset for continued reading when the source is longer than one chunk."),
      maxChars: optionalToolNumber(LAW_SOURCE_DEFAULT_READ_CHARS).describe("Maximum number of characters to read in this chunk (default: 12000, max: 20000)."),
    });

    const activeTools = {
      searchLaws: tool({
        description: "Keyword discovery across active Swedish laws (gällande SFS) via Riksdagen. Use when the user mentions a law name, SFS number, agency term, or Swedish legal phrase. This is a discovery tool only; verify any cited law with getLawDetail.",
        parameters: buildLawToolInputSchema({
          keywords: z.string().describe("Swedish legal keywords to search for (e.g., 'anställningsskydd', 'uppsägning')"),
        }),
        execute: async ({ keywords }) => {
          const results = await keywordSearchRiksdagenLaws(keywords, 50);
          const topResults = results.map((result) => ({
            dokId: result.dokId,
            beteckning: result.beteckning,
            titel: result.titel,
            datum: result.datum,
            organ: result.organ,
            summary: result.summary,
          }));
          return {
            totalHits: topResults.length,
            results: topResults,
            _nextAction: topResults.length > 0
              ? "Discovery complete. Now call getLawDetail AND fetchLagenNu for each relevant dokId in parallel to verify the actual law text before answering."
              : "No results found. Try semanticSearchLaws with a different query, or rephrase with broader Swedish legal terms.",
          };
        },
      }),
      semanticSearchLaws: tool({
        description: "Conceptual discovery across indexed Swedish laws using AI embeddings. Use when the user describes a legal concept rather than the exact statute name, such as employment protection, privacy rights, procurement, or platform liability. This is discovery only; verify any cited law with getLawDetail.",
        parameters: buildLawToolInputSchema({
          query: z.string().describe("Natural language query describing the legal topic (e.g., 'laws about employee dismissal protection', 'consumer rights for online purchases')"),
        }),
        execute: async ({ query: searchQuery }) => {
          const safeTopK = 20;
          const restAccount = getLawRestAccount(c.env);

          if (restAccount) {
            try {
              const embedUrl = `${CF_API_BASE_LAW}/${restAccount.accountId}/ai/run/${SFS_EMBEDDING_MODEL}`;
              const embedRes = await fetch(
                embedUrl,
                {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${restAccount.apiToken}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ text: [searchQuery] }),
                },
              );
              if (!embedRes.ok) throw new Error(`Embed HTTP ${embedRes.status}`);
              const embedData = await embedRes.json() as { success: boolean; result?: { data: number[][] } };
              const vector = embedData?.result?.data?.[0];
              if (!vector) throw new Error("Embedding vector empty");

              const queryRes = await fetch(
                `${CF_API_BASE_LAW}/${restAccount.accountId}/vectorize/v2/indexes/${SFS_VECTORIZE_INDEX}/query`,
                {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${restAccount.apiToken}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ vector, topK: safeTopK, returnMetadata: "all" }),
                },
              );
              if (!queryRes.ok) throw new Error(`Vectorize HTTP ${queryRes.status}`);
              const queryData = await queryRes.json() as {
                success: boolean;
                result?: { matches: Array<{ id: string; score: number; metadata?: Record<string, string | number> }> };
              };
              if (!queryData.success) throw new Error("Vectorize query failed");

              const results = (queryData.result?.matches ?? []).map((match) => ({
                dokId: match.id,
                score: match.score,
                beteckning: String(match.metadata?.beteckning ?? ""),
                titel: String(match.metadata?.titel ?? ""),
                datum: String(match.metadata?.datum ?? ""),
                organ: String(match.metadata?.organ ?? ""),
                subtyp: String(match.metadata?.subtyp ?? "sfst"),
              }));

              return {
                totalMatches: results.length,
                source: "rest-lb",
                results,
                _nextAction: results.length > 0
                  ? "Call getLawDetail AND fetchLagenNu for each relevant dokId in parallel."
                  : "No semantic matches. Try searchLaws with specific Swedish legal keywords.",
              };
            } catch (err) {
              console.warn("[Executive/Law] REST semantic search failed, falling back to native binding:", err);
            }
          }

          const sfsVectorize = c.env.SFS_VECTORIZE;
          const ai = c.env.AI;

          if (!sfsVectorize || !ai) {
            return {
              error: "Semantic search not configured — set CLOUDFLARE_ACCOUNT_ID_N/CLOUDFLARE_API_TOKEN_N secrets or bind SFS_VECTORIZE + AI",
              _nextAction: "Semantic search unavailable. Use searchLaws with specific Swedish keywords instead.",
            };
          }

          try {
            const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
              text: [searchQuery],
            }) as { data?: number[][] };

            const vector = embeddingResult?.data?.[0];
            if (!vector) {
              return {
                error: "Failed to generate embedding for query",
                _nextAction: "Embedding generation failed. Fall back to searchLaws with specific Swedish keywords.",
              };
            }

            const matches = await sfsVectorize.query(vector, {
              topK: safeTopK,
              returnMetadata: true,
            });

            const nativeResults = matches.matches.map((match) => ({
              dokId: match.id,
              score: match.score,
              beteckning: String(match.metadata?.beteckning ?? ""),
              titel: String(match.metadata?.titel ?? ""),
              datum: String(match.metadata?.datum ?? ""),
              organ: String(match.metadata?.organ ?? ""),
              subtyp: String(match.metadata?.subtyp ?? "sfst"),
            }));

            return {
              totalMatches: nativeResults.length,
              source: "native",
              results: nativeResults,
              _nextAction: nativeResults.length > 0
                ? "Call getLawDetail AND fetchLagenNu for each relevant dokId in parallel."
                : "No semantic matches. Try searchLaws with specific Swedish legal keywords.",
            };
          } catch (err) {
            console.error("[Executive/Law] Native semantic search failed:", err);
            return {
              error: "Semantic search failed — falling back to keyword search",
              _nextAction: "Semantic search failed. Call searchLaws immediately with the same query translated to Swedish legal keywords.",
            };
          }
        },
      }),
      getLawDetail: tool({
        description: "Fetch the official Riksdagen document record for a specific law or document by dok_id. Use this before citing, quoting, or summarizing legal content. Returns the primary text, metadata, stakeholders, activities, and references.",
        parameters: buildLawToolInputSchema({
          dokId: z.string().describe("The dok_id of the law (e.g., 'sfs-2022-811')"),
        }),
        execute: async ({ dokId }) => {
          const data = await fetchRiksdagenJson(`${buildRiksdagenDocumentUrl(dokId)}.json`) as {
            dokumentstatus?: {
              dokument?: Record<string, string>;
              dokintressent?: { intressent?: Array<Record<string, string>> };
              dokaktivitet?: { aktivitet?: Array<Record<string, string>> };
              dokuppgift?: { uppgift?: Array<Record<string, string>> };
              dokreferens?: { referens?: Array<Record<string, string>> };
            };
          } | null;

          if (!data?.dokumentstatus) {
            return {
              error: `No document found for dok_id: ${dokId}`,
              _nextAction: `Document ${dokId} not found in Riksdagen. Verify the dok_id is correct. Try searchLaws with the law title or SFS number to find the correct dok_id.`,
            };
          }

          const ds = data.dokumentstatus;
          const fullText = ds.dokument?.text ?? "";
          const text = fullText.slice(0, 8000);
          const textWasTruncated = text.length < fullText.length;
          const resolvedDokId = ds.dokument?.dok_id ?? dokId;

          return {
            dokId: resolvedDokId,
            beteckning: ds.dokument?.beteckning ?? "",
            titel: ds.dokument?.titel ?? "",
            datum: ds.dokument?.datum ?? "",
            organ: ds.dokument?.organ ?? "",
            text,
            textWasTruncated,
            totalTextChars: fullText.length,
            nextOffset: textWasTruncated ? text.length : null,
            recommendedNextTool: textWasTruncated ? "readSourceMaterial" : undefined,
            readSourceHint: textWasTruncated
              ? { sourceType: "riksdagen-document", dokId: resolvedDokId, offset: text.length }
              : undefined,
            intressenter: ensureArray(ds.dokintressent?.intressent).map((interest) => ({
              namn: interest.namn ?? "",
              partibet: interest.partibet ?? "",
              roll: interest.roll ?? "",
            })),
            aktiviteter: ensureArray(ds.dokaktivitet?.aktivitet).map((activity) => ({
              datum: activity.datum ?? "",
              kod: activity.kod ?? "",
              beskrivning: activity.process ?? activity.aktivitet ?? "",
            })),
            uppgifter: Object.fromEntries(
              ensureArray(ds.dokuppgift?.uppgift).map((entry) => [entry.kod ?? "", entry.text ?? ""]),
            ),
            referenser: ensureArray(ds.dokreferens?.referens).map((reference) => ({
              dokId: reference.ref_dok_id ?? "",
              beteckning: reference.ref_dok_beteckning ?? "",
              typ: reference.ref_dok_typ ?? "",
              titel: reference.ref_dok_titel ?? "",
            })),
            _nextAction: textWasTruncated
              ? `Text was truncated at ${text.length}/${fullText.length} chars. Call readSourceMaterial with sourceType "riksdagen-document" and dokId "${resolvedDokId}" to read the remaining text. Also call fetchLagenNu for the structured law text.`
              : "Law text fully loaded. If you need the structured lagen.nu version, call fetchLagenNu. If citing this law, verify you have specific chapter/section references.",
          };
        },
      }),
      getProposition: tool({
        description: "Fetch the validated government bill (proposition) linked to a specific SFS law. Use when explaining legislative purpose, preparatory works, or why the law exists. Never guess the proposition from the title alone.",
        parameters: buildLawToolInputSchema({
          sfsBeteckning: z.string().describe("The SFS beteckning number (e.g., '2022:811')"),
        }),
        execute: async ({ sfsBeteckning }) => {
          const proposition = await fetchPropositionFallback(sfsBeteckning);
          if (!proposition) {
            return {
              error: `Could not automatically validate a linked proposition for SFS ${sfsBeteckning}`,
              _nextAction: `No proposition auto-linked for SFS ${sfsBeteckning}. Try searchLaws with query "proposition ${sfsBeteckning}" to find the government bill manually.`,
            };
          }

          const textWasTruncated = proposition.text.length < proposition.fullText.length;
          return {
            dokId: proposition.dokId,
            beteckning: proposition.beteckning,
            titel: proposition.titel,
            datum: proposition.datum,
            organ: proposition.organ,
            text: proposition.text,
            textWasTruncated,
            totalTextChars: proposition.fullText.length,
            nextOffset: textWasTruncated ? proposition.text.length : null,
            recommendedNextTool: textWasTruncated ? "readSourceMaterial" : undefined,
            readSourceHint: textWasTruncated
              ? { sourceType: "riksdagen-document", dokId: proposition.dokId, offset: proposition.text.length }
              : undefined,
            _nextAction: textWasTruncated
              ? `Proposition text was truncated. Call readSourceMaterial with sourceType "riksdagen-document" and dokId "${proposition.dokId}" to read the full preparatory works.`
              : "Proposition fully loaded. Use this to explain the legislative purpose behind the law.",
          };
        },
      }),
      getLegislativeChain: tool({
        description: "Trace the official legislative chain for a law or document, including linked propositions, committee reports, and investigations. Use when the user asks how a law was made, what documents led to it, or how related documents connect.",
        parameters: buildLawToolInputSchema({
          dokId: z.string().describe("The dok_id to trace the chain from (e.g., 'sfs-2022-811')"),
          depth: optionalToolNumber(2).describe("How many levels deep to trace (default: 2, max: 3)"),
        }),
        execute: async ({ dokId, depth }) => {
          const safeDepth = Math.min(Math.max(depth ?? 2, 1), 3);
          const chain: Array<{
            level: number;
            dokId: string;
            beteckning: string;
            typ: string;
            titel: string;
            datum: string;
            references: Array<{ dokId: string; beteckning: string; typ: string }>;
          }> = [];
          let currentIds = [dokId];

          for (let level = 0; level < safeDepth && currentIds.length > 0; level++) {
            const nextIds: string[] = [];

            for (const id of currentIds.slice(0, 3)) {
              const data = await fetchRiksdagenJson(`${buildRiksdagenDocumentUrl(id)}.json`) as {
                dokumentstatus?: {
                  dokument?: Record<string, string>;
                  dokreferens?: { referens?: Array<Record<string, string>> };
                };
              } | null;

              if (!data?.dokumentstatus) {
                continue;
              }

              const ds = data.dokumentstatus;
              const refs = ensureArray(ds.dokreferens?.referens).map((reference) => ({
                dokId: reference.ref_dok_id ?? "",
                beteckning: reference.ref_dok_beteckning ?? "",
                typ: reference.ref_dok_typ ?? "",
              }));

              chain.push({
                level,
                dokId: ds.dokument?.dok_id ?? id,
                beteckning: ds.dokument?.beteckning ?? "",
                typ: ds.dokument?.typ ?? ds.dokument?.doktyp ?? "",
                titel: ds.dokument?.titel ?? "",
                datum: ds.dokument?.datum ?? "",
                references: refs,
              });

              for (const ref of refs.slice(0, 3)) {
                if (ref.dokId) {
                  nextIds.push(ref.dokId);
                }
              }
            }

            currentIds = nextIds;
          }

          return {
            chain,
            _nextAction: chain.length > 0
              ? `Legislative chain traced with ${chain.length} document(s). Use the dok_ids to call getLawDetail for any documents you need to cite.`
              : `No legislative chain found for ${dokId}. The document may not exist or have linked references.`,
          };
        },
      }),
      getVotes: tool({
        description: "Fetch official parliamentary voting records tied to a law, proposition, or committee report. Use only when the user asks about support, opposition, or how the Riksdag voted.",
        parameters: buildLawToolInputSchema({
          beteckning: z.string().describe("The beteckning or search term to look votes up for."),
          rm: z.string().optional().describe("Parliamentary session/year such as '2024/25'."),
          maxResults: optionalToolNumber(10).describe("Maximum number of vote records to return (default: 10, max: 50)."),
        }),
        execute: async ({ beteckning, rm, maxResults }) => {
          const safeMax = Math.min(Math.max(maxResults ?? 10, 1), 50);
          const params = new URLSearchParams({
            sok: beteckning,
            utformat: "json",
            sz: String(safeMax),
            p: "1",
          });
          if (rm) {
            params.set("rm", rm);
          }

          const data = await fetchRiksdagenJson(`${RIKSDAGEN_BASE}/voteringlista/?${params.toString()}`) as {
            voteringlista?: {
              votering?: Array<Record<string, string>>;
              "@traffar"?: string;
            };
          } | null;

          const votes = ensureArray(data?.voteringlista?.votering);
          const totalHits = data?.voteringlista?.["@traffar"] ?? "0";

          return {
            totalHits: Number(totalHits),
            results: votes.map((vote) => ({
              voteringId: vote.votering_id ?? "",
              beteckning: vote.beteckning ?? "",
              punkt: vote.punkt ?? "",
              titel: vote.titel ?? "",
              datum: vote.datum ?? "",
              ja: vote.Ja ?? vote.ja ?? "",
              nej: vote.Nej ?? vote.nej ?? "",
              avstar: vote.Avstar ?? vote.avstar ?? "",
              franvarande: vote.Franvarande ?? vote.franvarande ?? "",
              sourceUrl: `${RIKSDAGEN_BASE}/voteringlista/?bet=${encodeURIComponent(vote.beteckning ?? "")}&utformat=json`,
            })),
          };
        },
      }),
      getDebateSpeeches: tool({
        description: "Fetch official parliamentary debate speeches tied to a law, topic, or document. Use for parliamentary context, party positions, or statements made during legislative debate.",
        parameters: buildLawToolInputSchema({
          search: z.string().describe("Law name, SFS number, topic, or beteckning to search speeches for."),
          rm: z.string().optional().describe("Parliamentary session such as '2024/25'."),
          party: z.string().optional().describe("Optional party code filter such as 'S', 'M', or 'SD'."),
          maxResults: optionalToolNumber(10).describe("Maximum number of speeches to return (default: 10, max: 20)."),
        }),
        execute: async ({ search, rm, party, maxResults }) => {
          const safeMax = Math.min(Math.max(maxResults ?? 10, 1), 20);
          const params = new URLSearchParams({
            sok: search,
            utformat: "json",
            sz: String(safeMax),
            p: "1",
          });
          if (rm) {
            params.set("rm", rm);
          }
          if (party) {
            params.set("parti", party);
          }

          const data = await fetchRiksdagenJson(`${RIKSDAGEN_BASE}/anforandelista/?${params.toString()}`) as {
            anforandelista?: {
              anforande?: Array<Record<string, string>>;
              "@traffar"?: string;
            };
          } | null;

          const speeches = ensureArray(data?.anforandelista?.anforande);
          const totalHits = data?.anforandelista?.["@traffar"] ?? "0";

          return {
            totalHits: Number(totalHits),
            results: speeches.map((speech) => ({
              anforandeId: speech.anforande_id ?? "",
              talare: speech.talare ?? "",
              parti: speech.parti ?? "",
              datum: speech.datum ?? "",
              avsnittsrubrik: speech.avsnittsrubrik ?? "",
              kammaraktivitet: speech.kammaraktivitet ?? "",
              anforandetext: (speech.anforandetext ?? "").slice(0, 4000),
              dokId: speech.dok_id ?? "",
              protokollUrl: speech.protokoll_url_www ?? "",
            })),
          };
        },
      }),
      fetchLagenNu: tool({
        description: "Fetch lagen.nu annotated text, commentary, chapter anchors, and case references. This is an independent legal source that provides community annotations and cross-references alongside official Riksdagen material. Always call this in parallel with getLawDetail for comprehensive coverage. Only use an SFS number, proposition path, chapter anchor, or full lagen.nu URL as input.",
        parameters: buildLawToolInputSchema({
          input: z.string().describe("SFS number, proposition path, chapter anchor, or full lagen.nu URL. Do not pass free-text keywords."),
        }),
        execute: async ({ input }) => {
          const result = await fetchLagenNuPage(input);
          if (result.error) {
            return { error: result.error, url: result.url, footnoteUrl: result.footnoteUrl, _nextAction: result._nextAction };
          }

          const fullContent = result.fullContent ?? result.content;
          const contentWasTruncated = result.content.length < fullContent.length;
          return {
            url: result.url,
            title: result.title,
            sfs: result.sfs,
            content: result.content,
            charCount: result.content.length,
            totalContentChars: fullContent.length,
            contentWasTruncated,
            nextOffset: contentWasTruncated ? result.content.length : null,
            recommendedNextTool: contentWasTruncated ? "readSourceMaterial" : undefined,
            readSourceHint: contentWasTruncated
              ? { sourceType: "lagen-nu", input, offset: result.content.length }
              : undefined,
            sections: result.sections.slice(0, 15).map((section) => ({
              heading: section.heading,
              crossRefs: section.crossRefs.slice(0, 5),
              caseRefs: section.caseRefs.slice(0, 5),
            })),
            metadata: result.metadata,
            footnote: sourceFootnote(result),
            footnoteUrl: result.footnoteUrl,
            _nextAction: contentWasTruncated
              ? `Lagen.nu content was truncated at ${result.content.length}/${fullContent.length} chars. Call readSourceMaterial with sourceType "lagen-nu" and input "${input}" to read the rest.`
              : result.sections.length > 0
                ? "Lagen.nu text fully loaded. Cross-references and case refs are available in sections — consider investigating key cross-references if they address the user's question."
                : "Lagen.nu text fully loaded. Proceed with analysis.",
          };
        },
      }),
      analyzeDom: tool({
        description: "Analyze a specific legal or government web page into headings, links, tables, and main text. Use when you already know the URL and need structured extraction without broader browsing.",
        parameters: buildLawToolInputSchema({
          url: z.string().url().describe("The URL to analyze."),
        }),
        execute: async ({ url }) => {
          const result = await analyzeDomPage(url);
          if (result.error) {
            return {
              error: result.error,
              url: result.url,
              _nextAction: `DOM analysis failed for ${url}. If this URL is important, try startWebResearch (if available) to extract the page via browser agent instead.`,
            };
          }

          const fullMainText = result.fullMainText ?? result.mainText;
          const mainTextWasTruncated = result.mainText.length < fullMainText.length;
          return {
            url: result.url,
            title: result.title,
            lang: result.lang,
            metaDescription: result.metaDescription,
            headingCount: result.headings.length,
            headings: result.headings.slice(0, 20),
            linkCount: result.links.length,
            links: result.links.slice(0, 20),
            tableCount: result.tables.length,
            tables: result.tables.slice(0, 5),
            listItemCount: result.lists.length,
            mainText: result.mainText,
            totalTextChars: fullMainText.length,
            mainTextWasTruncated,
            nextOffset: mainTextWasTruncated ? result.mainText.length : null,
            recommendedNextTool: mainTextWasTruncated ? "readSourceMaterial" : undefined,
            readSourceHint: mainTextWasTruncated
              ? { sourceType: "dom-page", url, offset: result.mainText.length }
              : undefined,
            wordCount: result.wordCount,
            _nextAction: mainTextWasTruncated
              ? `DOM text was truncated at ${result.mainText.length}/${fullMainText.length} chars. Call readSourceMaterial with sourceType "dom-page" and url "${url}" to continue reading.`
              : "DOM analysis complete. Use the extracted data in your answer.",
          };
        },
      }),
      readSourceMaterial: tool({
        description: "Continue reading long-form source material in chunks after a prior tool returned only an excerpt. Supports official Riksdagen document text, lagen.nu page text, structured DOM page text, and web research report artifacts.",
        parameters: readSourceMaterialParameters,
        execute: async (input) => {
          return await readLawSourceMaterial({
            ...input,
            ...(input.sourceType === "web-research-artifact" ? { browserUseApiKey } : {}),
          } as LawSourceMaterialRequest);
        },
      }),
      ...(hasWebResearch ? {
        startWebResearch: tool({
          description: "Dispatch an autonomous browser research agent for multi-page browsing on approved legal domains. Use proactively for complex queries — dispatch early in parallel with core tools for enterprise-grade analysis. Returns immediately with a taskId and live browser stream URL.",
          parameters: buildLawToolInputSchema({
            task: z.string().describe("Detailed research brief for the sub-agent. Include exact URLs to visit first, the legal question being resolved, the concrete facts to extract, comparative instructions when relevant, and request output sections named Findings, Source URLs, and Open Questions. Prefer one clean final report and avoid scratch files like todo.md unless absolutely necessary."),
            startUrl: z.string().url().optional().describe("Optional starting URL for the browser (e.g., 'https://lagen.nu/1982:80')"),
          }),
          execute: async ({ task, startUrl }) => {
            try {
              const result = await startBrowserTask(browserUseApiKey!, task, {
                startUrl,
                maxSteps: 50,
                allowedDomains: ["lagen.nu", "data.riksdagen.se", "riksdagen.se", "www.riksdagen.se"],
              });
              return {
                taskId: result.taskId,
                sessionId: result.sessionId,
                liveUrl: result.liveUrl,
                status: "running",
                message: "Research agent dispatched. Do not finalize the answer yet if this research is material. Call getWebResearchResult with the taskId before answering.",
                nextAction: "call-getWebResearchResult-before-final-answer",
              };
            } catch (err) {
              return {
                error: err instanceof Error ? err.message : "Failed to start web research task",
                status: "failed",
                taskStarted: false,
                canPoll: false,
                _nextAction: "Browser research dispatch failed. Continue with data from searchLaws, getLawDetail, and fetchLagenNu. Note the browser limitation in your answer.",
              };
            }
          },
        }),
        getWebResearchResult: tool({
          description: "Retrieve the structured result of a previously dispatched web research task. Polls until the task finishes and returns the extracted report so you can synthesize it with official legal sources.",
          parameters: buildLawToolInputSchema({
            taskId: z.string().uuid().describe("The exact UUID taskId returned by startWebResearch. Never invent or placeholder this value."),
          }),
          execute: async ({ taskId }) => {
            try {
              const result = await waitForBrowserTask(browserUseApiKey!, taskId);
              return buildWebResearchToolOutput(result);
            } catch (err) {
              return {
                error: err instanceof Error ? err.message : "Failed to get web research result",
                _nextAction: "Browser research result retrieval failed. Use available data from other tools to answer. Consider re-dispatching startWebResearch if the question requires web-only sources.",
              };
            }
          },
        }),
        readWebResearchArtifact: tool({
          description: "Legacy alias for readSourceMaterial(sourceType='web-research-artifact'). Read the full text of a specific web research report or appendix file returned by getWebResearchResult.",
          parameters: buildLawToolInputSchema({
            taskId: z.string().uuid().describe("The exact UUID taskId returned by startWebResearch."),
            fileName: z.string().describe("The exact file name listed in getWebResearchResult.outputFiles."),
            offset: optionalToolNumber(0).describe("Zero-based character offset for continued reading when a file is longer than one chunk."),
            maxChars: optionalToolNumber(12000).describe("Maximum number of characters to read in this chunk (default: 12000, max: 20000)."),
          }),
          execute: async ({ taskId, fileName, offset, maxChars }) => {
            return await readLawSourceMaterial({
              sourceType: "web-research-artifact",
              browserUseApiKey,
              taskId,
              fileName,
              offset,
              maxChars,
            });
          },
        }),
      } : {}),
    };

    const result = streamText({
      model: model as any,
      messages,
      temperature: 0,
      maxTokens: 12288,
      maxSteps: LAW_EXECUTION_MAX_STEPS,
      toolChoice: "auto",
      experimental_transform: createLawTextStreamTransform(),
      onError: ({ error }) => {
        console.error(`[Executive/Law] Stream error | provider=${resolvedLlmProvider} | model=${resolvedLlmModel} | error=`, error);
      },
      onFinish: ({ text, finishReason, usage, steps }) => {
        const totalMs = Date.now() - lawStartMs;
        const toolCallCount = steps?.reduce((count, step) => count + (step.toolCalls?.length ?? 0), 0) ?? 0;
        const toolStepCount = steps?.filter((step) => (step.toolCalls?.length ?? 0) > 0).length ?? 0;
        const toolNames = steps?.reduce<string[]>((names, step) => {
          for (const toolCall of step.toolCalls ?? []) {
            if (typeof toolCall?.toolName === "string") {
              names.push(toolCall.toolName);
            }
          }
          return names;
        }, []) ?? [];
        const toolUsage = toolNames.reduce<Record<string, number>>((acc, name) => {
          acc[name] = (acc[name] ?? 0) + 1;
          return acc;
        }, {});
        const browserDispatched = toolUsage.startWebResearch ?? 0;
        const browserRetrieved = toolUsage.getWebResearchResult ?? 0;
        const errorCount = steps?.reduce((count, step) => {
          const toolErrors = (step.toolResults ?? []).filter((toolResult) => {
            const toolResultValue = toolResult?.result;
            return toolResultValue != null
              && typeof toolResultValue === "object"
              && "error" in toolResultValue
              && typeof toolResultValue.error === "string";
          }).length;
          return count + toolErrors;
        }, 0) ?? 0;

        console.log(
          `[Executive/Law] Completed law execution`
          + ` | provider=${resolvedLlmProvider}`
          + ` | model=${resolvedLlmModel}`
          + ` | durationMs=${totalMs}`
          + ` | finishReason=${finishReason}`
          + ` | toolCalls=${toolCallCount}`
          + ` | toolSteps=${toolStepCount}`
          + ` | browserDispatched=${browserDispatched}`
          + ` | browserRetrieved=${browserRetrieved}`
          + ` | toolErrors=${errorCount}`
          + ` | toolUsage=${JSON.stringify(toolUsage)}`
          + ` | promptTokens=${usage?.promptTokens ?? "?"}`
          + ` | completionTokens=${usage?.completionTokens ?? "?"}`
          + ` | totalTokens=${usage?.totalTokens ?? "?"}`
          + ` | textChars=${text.length}`,
        );
      },
      tools: activeTools,
    });

    const fullStream = result.fullStream as AsyncIterable<Record<string, unknown>>;
    const lawMs = Date.now() - lawStartMs;
    console.log(`[Executive/Law] Streaming response (setup took ${lawMs}ms)`);

    return new Response(createLawUiMessageStream(fullStream, openingText), {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[Executive/Law] Handler error:", err);
    return c.json(
      { error: "Law execution failed", details: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
}
