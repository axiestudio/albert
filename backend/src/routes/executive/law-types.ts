/**
 * Type definitions for the Executive Law Route.
 */

export type LawUiFinishReason = "length" | "error" | "stop" | "content-filter" | "tool-calls" | "other";

export type PrepareTraceResult = {
  d: string;
  s: number;
  b: string;
  t: string;
  dt: string;
  o: string;
  src: "semantic" | "keyword";
};

export type PrepareTracePayload = {
  results: PrepareTraceResult[];
  extractedKeywords: string[];
  semanticCount: number;
  keywordCount: number;
};

export type LawLlmRequestOverrides = {
  llmApiKey?: string;
  llmMode?: string;
  llmModel?: string;
  llmProvider?: string;
  vertexProjectId?: string;
};

export type LawExecutiveRequest = {
  query: string;
  sessionId: string;
  llmApiKey?: string;
  llmMode?: string;
  llmModel?: string;
  llmProvider?: string;
  vertexProjectId?: string;
  userId?: string;
  /** User latitude for Vertex AI region routing (from browser geolocation) */
  userLat?: number;
  /** User longitude for Vertex AI region routing (from browser geolocation) */
  userLng?: number;
  messageHistory?: Array<{ role: string; content: string }>;
  context?: {
    timezone: string;
    locale: string;
    timestamp: string;
    defaultLanguage?: string;
  };
  reasoning?: {
    thought?: string;
    action?: string;
    confidence?: number;
    entities?: Record<string, unknown>;
  };
  /** Pre-fetched search results from the LAW prepare pipeline. */
  lawSearchResults?: Array<{
    dokId: string;
    beteckning: string;
    titel: string;
    datum: string;
    organ: string;
    summary: string;
    source?: "semantic" | "keyword";
  }>;
  /** Extracted Swedish keywords from the prepare pipeline. */
  extractedKeywords?: string[];
  /** Browser Use Cloud API key for conditional web research tools. */
  browserUseApiKey?: string;
};

export type LawSearchResult = {
  dokId: string;
  score: number;
  beteckning: string;
  titel: string;
  datum: string;
  organ: string;
  summary: string;
  source: "semantic" | "keyword";
};

export type LagenNuSection = {
  heading: string;
  crossRefs: string[];
  caseRefs: string[];
};

export type LagenNuResult = {
  url: string;
  title: string;
  sfs?: string;
  metadata: Record<string, string>;
  content: string;
  fullContent?: string;
  sections: LagenNuSection[];
  footnoteUrl: string;
  error?: string;
  _nextAction?: string;
};

export type RiksdagenDocumentStatusResponse = {
  dokumentstatus?: {
    dokument?: Record<string, string>;
    dokintressent?: { intressent?: Array<Record<string, string>> };
    dokaktivitet?: { aktivitet?: Array<Record<string, string>> };
    dokuppgift?: { uppgift?: Array<Record<string, string>> };
    dokreferens?: { referens?: Array<Record<string, string>> };
  };
};

export type DomHeading = { level: number; text: string };
export type DomLink = { text: string; href: string };
export type DomTable = { headers: string[]; rows: string[][] };
export type DomListItem = { text: string; nested?: string[] };

export type DomAnalysis = {
  url: string;
  title: string;
  lang?: string;
  metaDescription?: string;
  headings: DomHeading[];
  links: DomLink[];
  tables: DomTable[];
  lists: DomListItem[];
  mainText: string;
  fullMainText?: string;
  wordCount: number;
  error?: string;
};

export type LawSourceMaterialRequest =
  | {
      sourceType: "dom-page";
      maxChars?: number;
      offset?: number;
      url: string;
    }
  | {
      dokId: string;
      maxChars?: number;
      offset?: number;
      sourceType: "riksdagen-document";
    }
  | {
      input: string;
      maxChars?: number;
      offset?: number;
      sourceType: "lagen-nu";
    }
  | {
      browserUseApiKey?: string;
      fileName: string;
      maxChars?: number;
      offset?: number;
      sourceType: "web-research-artifact";
      taskId: string;
    };

export type LawExpansionRule = {
  pattern: RegExp;
  queries?: string[];
  dokIds?: string[];
};

export type LawUiMessageChunk = {
  type: string;
  [key: string]: unknown;
};
