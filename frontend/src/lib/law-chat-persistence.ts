/**
 * ✅ 2026 Law Agent Chat Persistence — DB-backed conversation + message storage
 *
 * This module provides the client-side API for saving/loading law agent
 * conversations to the database via the cloudflare-api routes.
 *
 * Architecture:
 *   law-agent UI → /api/law-chat/* (Astro proxy) → gateway → cloudflare-api → DB
 *
 * The legacy albert-history.ts still handles:
 *   - Session-aware hosted deployments
 *   - Local-only thread fallback when no remote persistence is available
 *
 * This module handles:
 *   - DB-backed conversation CRUD when the hosted persistence API is available
 *   - Per-message metadata (model, tokens, tool usage)
 */

import type { UIMessage } from 'ai';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type LawChatConversation = {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  llmMode?: string;
  llmModel?: string;
  metadata: Record<string, unknown>;
  lastMessageAt: string | null;
  updatedAt: string;
  createdAt: string;
};

export type LawChatMessage = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  parts: unknown[];
  llmProvider?: string;
  llmModel?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  latencyMs?: number;
  toolCallCount?: number;
  stepCount?: number;
  finishReason?: string;
  webResearchUsed?: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// ─── API base ──────────────────────────────────────────────────────────────────

const LAW_CHAT_API_BASE = '/api/law-chat';

async function fetchLawChatJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Law chat API request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ─── Conversation CRUD ─────────────────────────────────────────────────────────

export async function listLawConversations(): Promise<LawChatConversation[]> {
  const data = await fetchLawChatJson<{ conversations: LawChatConversation[] }>(
    `${LAW_CHAT_API_BASE}/conversations`,
    { method: 'GET' },
  );
  return data.conversations ?? [];
}

export async function getLawConversation(conversationId: string): Promise<{
  conversation: LawChatConversation;
  messages: LawChatMessage[];
}> {
  return fetchLawChatJson(
    `${LAW_CHAT_API_BASE}/conversations/${conversationId}`,
    { method: 'GET' },
  );
}

export async function saveLawConversation(
  conversationId: string,
  messages: UIMessage[],
  options?: {
    llmMode?: string;
    llmModel?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{
  conversation: LawChatConversation;
  messages: LawChatMessage[];
}> {
  // Transform UIMessages into the format expected by the API
  const apiMessages = messages.map((msg) => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant' | 'system',
    content: extractMessageContent(msg),
    parts: Array.isArray(msg.parts) ? msg.parts : [],
    // Extract model info from assistant message metadata if available
    ...(msg.role === 'assistant' ? extractAssistantMetadata(msg) : {}),
  }));

  return fetchLawChatJson(
    `${LAW_CHAT_API_BASE}/conversations/${conversationId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        messages: apiMessages,
        llmMode: options?.llmMode,
        llmModel: options?.llmModel,
        metadata: options?.metadata,
      }),
    },
  );
}

export async function deleteLawConversation(conversationId: string): Promise<void> {
  await fetchLawChatJson<{ success: boolean }>(
    `${LAW_CHAT_API_BASE}/conversations/${conversationId}`,
    { method: 'DELETE' },
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractMessageContent(message: UIMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const text = parts
    .filter((part): part is { type: 'text'; text: string } =>
      typeof part === 'object'
      && part !== null
      && 'type' in part
      && (part as Record<string, unknown>).type === 'text'
      && 'text' in part
      && typeof (part as Record<string, unknown>).text === 'string',
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n');

  if (text) {
    return text;
  }

  return typeof (message as { content?: unknown }).content === 'string'
    ? ((message as { content?: string }).content ?? '').trim()
    : '';
}

function extractAssistantMetadata(_message: UIMessage): {
  llmProvider?: string;
  llmModel?: string;
} {
  // The resolved provider/model headers are available on the upstream response
  // but not directly on UIMessage. These will be populated by the chat handler
  // when it reads x-law-resolved-provider / x-law-resolved-model headers.
  return {};
}

/**
 * Convert DB-stored messages back to UIMessage format for the AI SDK.
 */
export function lawChatMessagesToUIMessages(messages: LawChatMessage[]): UIMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role as UIMessage['role'],
    content: msg.content,
    parts: (msg.parts ?? []) as UIMessage['parts'],
    createdAt: new Date(msg.createdAt),
  }));
}
