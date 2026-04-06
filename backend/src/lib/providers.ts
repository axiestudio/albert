/**
 * Albert Law Agent — LLM Provider Configuration
 *
 * Supports:
 *   - Cloudflare AI Gateway (optional unified proxy)
 *   - Direct provider routing: Google Gemini, Anthropic Claude, OpenAI, Mistral, DeepSeek
 *   - Vertex AI partner models with geolocation-based region routing
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

import type { Env } from '../env';

// Default Vertex AI Express Mode base URL (global, no project/location).
const VERTEX_AI_EXPRESS_BASE_URL = 'https://aiplatform.googleapis.com/v1/publishers/google';
import {
  buildVertexBaseUrl,
  resolveVertexRegionForProvider,
} from './vertex-regions';
import { findVertexModel, resolveVertexPublisher } from './vertex-models';

// ─── Cloudflare AI Gateway ─────────────────────────────────────────────────────

/**
 * Check if Cloudflare AI Gateway is configured
 */
export function isGatewayConfigured(env: Env): boolean {
  return !!(env.CLOUDFLARE_GATEWAY_ACCOUNT_ID && env.CLOUDFLARE_GATEWAY_NAME);
}

/**
 * Build the Cloudflare AI Gateway Unified API base URL
 */
function getGatewayBaseURL(env: Env): string {
  return `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_GATEWAY_ACCOUNT_ID}/${env.CLOUDFLARE_GATEWAY_NAME}/compat`;
}

/**
 * Map provider + model to Gateway's unified model format: "provider/model"
 *
 * @see https://developers.cloudflare.com/ai-gateway/get-started/#unified-api-endpoint
 */
function toGatewayModelId(provider: string, model: string): string {
  switch (provider) {
    case 'openai':
      return `openai/${model}`;
    case 'anthropic':
      return `anthropic/${model}`;
    case 'google':
    case 'gemini':
      return `google/${model}`;
    case 'cloudflare':
      // Workers AI models through the Gateway: workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast
      return model.startsWith('@cf/') ? `workers-ai/${model}` : `workers-ai/@cf/meta/${model}`;
    case 'groq':
      return `groq/${model}`;
    case 'alibaba':
      // DashScope models go through Gateway as-is (no prefix rewrite needed)
      return `alibaba/${model}`;
    default:
      // Pass through for unknown providers — Gateway may still route them
      return model;
  }
}

// ─── Direct Provider Routing (fallback when Gateway is not configured) ────────

/**
 * Get the direct base URL for a provider (no Gateway).
 * Optionally accepts userLat/userLng + projectId for Vertex AI region routing.
 */
export function getProviderBaseUrl(
  provider: string,
  cloudflareAccountId?: string,
  vertexOptions?: { userLat?: number; userLng?: number; projectId?: string; model?: string },
): string | undefined {
  switch (provider) {
    // ── Official AI APIs ────────────────────────────────────────────────────
    case 'anthropic':
      // When routed through Vertex AI (partner model), build a regional URL
      if (vertexOptions?.projectId) {
        const region = resolveVertexRegionForProvider('anthropic', vertexOptions.userLat, vertexOptions.userLng);
        return buildVertexBaseUrl({
          location: region,
          projectId: vertexOptions.projectId,
          publisher: 'anthropic',
        });
      }
      return 'https://api.anthropic.com/v1';
    case 'google':
    case 'gemini':
      return VERTEX_AI_EXPRESS_BASE_URL;
    // ── Vertex AI Partner / Open Models ─────────────────────────────────────
    case 'vertex-claude':
    case 'vertex-mistral':
    case 'vertex-open': {
      const resolvedProvider = provider.replace('vertex-', '');
      const region = resolveVertexRegionForProvider(resolvedProvider, vertexOptions?.userLat, vertexOptions?.userLng);
      const publisher = vertexOptions?.model ? resolveVertexPublisher(vertexOptions.model) : resolvedProvider;
      return buildVertexBaseUrl({
        location: region,
        projectId: vertexOptions?.projectId,
        publisher,
      });
    }
    // ── OpenAI-compatible providers ─────────────────────────────────────────
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'grok':
      return 'https://api.x.ai/v1';
    case 'deepseek':
      return 'https://api.deepseek.com';
    case 'mistral':
      return 'https://api.mistral.ai/v1';
    case 'perplexity':
      return 'https://api.perplexity.ai';
    case 'cerebras':
      return 'https://api.cerebras.ai/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'cohere':
      return 'https://api.cohere.ai/compatibility/v1';
    case 'alibaba':
      return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    case 'together':
      return 'https://api.together.xyz/v1';
    // ── Enterprise / Cloud ──────────────────────────────────────────────────
    case 'cloudflare':
      return cloudflareAccountId
        ? `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/v1`
        : undefined;
    case 'azure-openai':
    case 'aws-bedrock':
      return undefined;
    case 'openai':
    default:
      return undefined;
  }
}

/**
 * Create a model using direct provider SDK (no Gateway)
 */
function createDirectModel(
  provider: string,
  model: string,
  apiKey: string,
  baseUrl?: string,
  cloudflareAccountId?: string,
  vertexOptions?: { userLat?: number; userLng?: number; projectId?: string },
) {
  const baseURL = baseUrl || getProviderBaseUrl(provider, cloudflareAccountId, { ...vertexOptions, model });

  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey, baseURL })(model);
    case 'google':
    case 'gemini':
      // Vertex AI Express Mode — API key as ?key= query param, not header.
      // URL: aiplatform.googleapis.com/v1/publishers/google/models/{model}:streamGenerateContent?key=KEY
      return createGoogleGenerativeAI({
        apiKey,
        baseURL: VERTEX_AI_EXPRESS_BASE_URL,
        fetch: async (url, init) => {
          const u = typeof url === 'string' ? url : url.toString();
          const sep = u.includes('?') ? '&' : '?';
          // Strip x-goog-api-key header — Vertex AI wants ?key= instead
          const rawHeaders = (init as any)?.headers;
          const clean: Record<string, string> = {};
          if (rawHeaders) {
            for (const [k, v] of Object.entries(rawHeaders)) {
              if (k.toLowerCase() !== 'x-goog-api-key') clean[k] = v as string;
            }
          }
          return globalThis.fetch(`${u}${sep}key=${apiKey}`, { ...(init as any), headers: clean });
        },
      })(model);
    // ── Vertex AI Partner Models (Claude, Mistral, Open Source via Vertex) ──
    case 'vertex-claude':
    case 'vertex-mistral':
    case 'vertex-open': {
      // Partner models on Vertex AI use regional endpoints with service account auth.
      // The baseURL is already resolved to the correct regional endpoint by getProviderBaseUrl.
      // These use rawPredict/streamRawPredict, but through the AI SDK Anthropic adapter:
      const vertexModel = findVertexModel(model);
      if (vertexModel?.publisher === 'anthropic') {
        return createAnthropic({ apiKey, baseURL })(model);
      }
      // For non-Anthropic partner models, use OpenAI-compatible adapter
      return createOpenAICompatible({
        name: provider,
        baseURL: baseURL || VERTEX_AI_EXPRESS_BASE_URL,
        apiKey,
      }).chatModel(model);
    }
    case 'openai':
    case 'cloudflare':
    case 'groq':
    case 'together':
    default:
      // AI SDK 4 in this worker only accepts V1 models. Route providers with
      // OpenAI-compatible transports through the compatibility adapter.
      return createOpenAICompatible({
        name: provider,
        baseURL: baseURL || 'https://api.openai.com/v1',
        apiKey,
      }).chatModel(model);
  }
}

// ─── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Create an AI SDK model for a request.
 *
 * This is the SINGLE function all routes should call for LLM model creation.
 *
 * Routing logic:
 * 1. If Cloudflare AI Gateway is configured → route through Gateway Unified API
 * 2. Fallback → Direct provider SDK calls (when Gateway is not configured)
 *
 * @example
 * ```ts
 * const model = createModelForRequest(c.env, {
 *   provider: 'openai',
 *   model: 'gpt-5.4-mini',
 *   apiKey: userApiKey,
 * });
 * const result = streamText({ model, messages, temperature: 0.7 });
 * ```
 */
export function createModelForRequest(
  env: Env,
  config: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
    cloudflareAccountId?: string;
    /** User latitude for Vertex AI region routing */
    userLat?: number;
    /** User longitude for Vertex AI region routing */
    userLng?: number;
    /** Vertex AI project ID for partner/open model routing */
    vertexProjectId?: string;
  },
) {
  const { provider, model, apiKey, baseUrl, cloudflareAccountId, userLat, userLng, vertexProjectId } = config;

  // ── Cloudflare AI Gateway: Unified API routing ──────────────────────────
  if (isGatewayConfigured(env) && !baseUrl) {
    const gatewayBaseURL = getGatewayBaseURL(env);
    const gatewayModelId = toGatewayModelId(provider, model);

    const headers: Record<string, string> = {};
    if (env.CLOUDFLARE_GATEWAY_TOKEN) {
      headers['cf-aig-authorization'] = `Bearer ${env.CLOUDFLARE_GATEWAY_TOKEN}`;
    }

    console.log(
      `[Providers] Gateway routing: ${provider}/${model} → ${gatewayModelId}`,
    );

    // Cloudflare AI Gateway exposes an OpenAI-compatible compat endpoint, which
    // keeps this AI SDK 4 worker on the V1 model contract.
    return createOpenAICompatible({
      name: provider,
      apiKey,
      headers,
      baseURL: gatewayBaseURL,
    }).chatModel(gatewayModelId);
  }

  // ── Direct provider routing (Gateway not configured or custom baseUrl) ──
  console.log(`[Providers] Direct routing: ${provider}/${model}`);
  return createDirectModel(provider, model, apiKey, baseUrl, cloudflareAccountId, {
    userLat,
    userLng,
    projectId: vertexProjectId,
  });
}
