import {
  LAGEN_BASE,
  LAGEN_CACHE_PREFIX,
  LAGEN_MAX_CHARS,
  LAGEN_RETRY_BASE_MS,
  LAGEN_RETRY_COUNT,
  LAGEN_TIMEOUT_MS,
  LAGEN_USER_AGENTS,
  LAGEN_WAYBACK_PREFIX,
} from "./law-config";
import type { LagenNuResult, LagenNuSection } from "./law-types";
import { decodeEntities, stripTags } from "./law-utils";

function normalizeLagenInput(input: string): string {
  return input.trim().replace(/^sfs\s+/i, "").replace(/^\/+/, "");
}

export function isValidLagenInput(input: string): boolean {
  const normalized = normalizeLagenInput(input);
  if (!normalized) {
    return false;
  }

  return /^https:\/\/lagen\.nu\/[^\s]+$/i.test(normalized)
    || /^\d{4}:\d+(?:[#/][^\s]*)?$/i.test(normalized)
    || /^(?:prop|sou|ds|bet|dir)\/[^\s]+$/i.test(normalized);
}

function buildLagenUrl(input: string): string {
  const normalized = normalizeLagenInput(input);
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  return `${LAGEN_BASE}/${normalized}`;
}

function htmlToStructuredText(html: string): string {
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  text = text.replace(
    /<a\s+[^>]*href="(https?:\/\/lagen\.nu\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, url, label) => {
      const clean = String(label).replace(/<[^>]+>/g, "").trim();
      return clean ? `[${clean}](${url})` : url;
    },
  );
  text = text.replace(
    /<a\s+[^>]*href="(https?:\/\/[^\"]*riksdagen[^\"]*|https?:\/\/eur-lex[^\"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, url, label) => {
      const clean = String(label).replace(/<[^>]+>/g, "").trim();
      return clean ? `[${clean}](${url})` : url;
    },
  );
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n# ${String(c).replace(/<[^>]+>/g, "").trim()}\n`);
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n## ${String(c).replace(/<[^>]+>/g, "").trim()}\n`);
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n### ${String(c).replace(/<[^>]+>/g, "").trim()}\n`);
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `\n#### ${String(c).replace(/<[^>]+>/g, "").trim()}\n`);
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<\/tr>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function extractLagenMetadata(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    meta.title = titleMatch[1].trim();
    const sfsMatch = meta.title.match(/\((\d{4}:\d+)\)/);
    if (sfsMatch) {
      meta.sfs = sfsMatch[1];
    }
  }
  return meta;
}

function extractLagenSections(html: string): LagenNuSection[] {
  const sections: LagenNuSection[] = [];
  const parts = html.split(/(?=<h[123][^>]*>)/i);

  for (const part of parts) {
    const headingMatch = part.match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/i);
    if (!headingMatch) {
      continue;
    }
    const heading = headingMatch[1].replace(/<[^>]+>/g, "").trim();
    if (!heading) {
      continue;
    }

    const crossRefs = Array.from(part.matchAll(/href="(https?:\/\/lagen\.nu\/[^"]+)"/gi))
      .map((match) => match[1])
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 10);

    const caseRefs = Array.from(part.matchAll(/href="(https?:\/\/lagen\.nu\/dom\/[^"]+)"/gi))
      .map((match) => match[1])
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 10);

    sections.push({
      heading,
      crossRefs,
      caseRefs,
    });
  }

  return sections;
}

function truncateAtBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  const lastParagraph = text.lastIndexOf("\n\n", maxLen);
  if (lastParagraph > maxLen * 0.7) {
    return `${text.slice(0, lastParagraph)}\n\n[… truncated — see full law at lagen.nu]`;
  }
  return `${text.slice(0, maxLen)}\n\n[… truncated]`;
}

export function sourceFootnote(result: LagenNuResult): string {
  if (result.metadata.fetchMode === "riksdagen-fallback") {
    const parts = [`📘 ${result.title || "Official fallback"}`];
    if (result.sfs) {
      parts.push(`SFS ${result.sfs}`);
    }
    parts.push(`[Read via Riksdagen](${result.footnoteUrl})`);
    return parts.join(" — ");
  }

  const parts = [`📖 ${result.title || "Lagen.nu"}`];
  if (result.sfs) {
    parts.push(`SFS ${result.sfs}`);
  }
  parts.push(`[Läs på lagen.nu](${result.footnoteUrl})`);
  return parts.join(" — ");
}

function extractSfsBeteckning(input: string): string | null {
  const match = input.match(/(\d{4}:\d+)/);
  return match?.[1] ?? null;
}

function buildLagenUnavailableError(
  input: string,
  url: string,
  cause: string,
): LagenNuResult {
  const sfs = extractSfsBeteckning(input);
  return {
    url,
    title: "lagen.nu unavailable",
    sfs: sfs ?? undefined,
    metadata: {
      availability: "lagen-nu-unavailable",
      fetchMode: "error",
      errorCause: cause,
      originalUrl: url,
    },
    content: "",
    sections: [],
    footnoteUrl: url,
    error: `lagen.nu could not be reached (${cause}). Use getLawDetail for official Riksdagen text instead.`,
    _nextAction: `FALLBACK: lagen.nu is currently unreachable for ${url}. (1) Use getLawDetail data (which you called in parallel). (2) If browser research is available, dispatch startWebResearch targeting ${url} to extract the annotated commentary via the browser agent.`,
  };
}

async function fetchLagenResponse(url: string, signal: AbortSignal): Promise<Response> {
  const ua = LAGEN_USER_AGENTS[Math.floor(Math.random() * LAGEN_USER_AGENTS.length)];
  return await fetch(url, {
    signal,
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "User-Agent": ua,
      "Cache-Control": "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      "Referer": "https://www.google.com/",
    },
    redirect: "follow",
  });
}

async function fetchLagenWithRetry(
  url: string,
  timeoutMs: number,
): Promise<{ response: Response; source: "origin" | "google-cache" | "wayback" }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= LAGEN_RETRY_COUNT; attempt++) {
    if (attempt > 0) {
      const delay = LAGEN_RETRY_BASE_MS * (2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchLagenResponse(url, controller.signal);
      clearTimeout(timer);

      if (response.ok) {
        return { response, source: "origin" };
      }

      if (response.status === 404) {
        return { response, source: "origin" };
      }

      lastError = new Error(`HTTP ${response.status}${response.statusText ? `: ${response.statusText}` : ""}`);
      console.warn(`[Executive/Law] lagen.nu attempt ${attempt + 1}/${LAGEN_RETRY_COUNT + 1} failed: ${lastError.message}`);
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error("Unknown error");
      console.warn(`[Executive/Law] lagen.nu attempt ${attempt + 1}/${LAGEN_RETRY_COUNT + 1} threw: ${lastError.message}`);
    }
  }

  try {
    const cacheUrl = `${LAGEN_CACHE_PREFIX}${encodeURIComponent(url)}`;
    const cacheController = new AbortController();
    const cacheTimer = setTimeout(() => cacheController.abort(), timeoutMs);
    const cacheResponse = await fetch(cacheUrl, {
      signal: cacheController.signal,
      headers: {
        "Accept": "text/html",
        "User-Agent": LAGEN_USER_AGENTS[0],
      },
      redirect: "follow",
    });
    clearTimeout(cacheTimer);

    if (cacheResponse.ok) {
      console.log("[Executive/Law] lagen.nu origin down — served from Google Cache");
      return { response: cacheResponse, source: "google-cache" };
    }
  } catch {
  }

  try {
    const waybackUrl = `${LAGEN_WAYBACK_PREFIX}${url}`;
    const waybackController = new AbortController();
    const waybackTimer = setTimeout(() => waybackController.abort(), timeoutMs);
    const waybackResponse = await fetch(waybackUrl, {
      signal: waybackController.signal,
      headers: {
        "Accept": "text/html",
        "User-Agent": LAGEN_USER_AGENTS[0],
      },
      redirect: "follow",
    });
    clearTimeout(waybackTimer);

    if (waybackResponse.ok) {
      console.log("[Executive/Law] lagen.nu origin down — served from Wayback Machine");
      return { response: waybackResponse, source: "wayback" };
    }
  } catch {
  }

  throw lastError ?? new Error("lagen.nu unreachable after retries and fallbacks");
}

export async function fetchLagenNuPage(input: string): Promise<LagenNuResult> {
  if (!isValidLagenInput(input)) {
    return {
      url: LAGEN_BASE,
      title: "Invalid lagen.nu lookup",
      metadata: {
        availability: "invalid-input",
        fetchMode: "input-validation",
      },
      content: "",
      sections: [],
      footnoteUrl: LAGEN_BASE,
      error: "fetchLagenNu requires an SFS number, proposition path, chapter anchor, or full lagen.nu URL. Free-text keywords are not valid input.",
      _nextAction: "Invalid input format. Use getLawDetail or searchLaws first to find the correct SFS number, then call fetchLagenNu with that SFS number.",
    };
  }

  const url = buildLagenUrl(input);
  const footnoteUrl = url;

  try {
    const { response, source } = await fetchLagenWithRetry(url, LAGEN_TIMEOUT_MS);

    if (!response.ok) {
      return buildLagenUnavailableError(
        input,
        url,
        `HTTP ${response.status}${response.statusText ? `: ${response.statusText}` : ""}`,
      );
    }

    const html = await response.text();
    const metadata = extractLagenMetadata(html);
    const mainMatch =
      html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
      ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      ?? html.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i);
    const bodyHtml = mainMatch ? mainMatch[1] : html;
    const fullContent = htmlToStructuredText(bodyHtml);
    const content = truncateAtBoundary(fullContent, LAGEN_MAX_CHARS);

    return {
      url,
      title: metadata.title ?? "",
      sfs: metadata.sfs,
      metadata: {
        ...metadata,
        ...(source !== "origin" && { fetchedVia: source }),
      },
      content,
      fullContent,
      sections: extractLagenSections(bodyHtml).slice(0, 30),
      footnoteUrl,
    };
  } catch (err) {
    return buildLagenUnavailableError(
      input,
      url,
      err instanceof Error ? err.message : "Unknown error",
    );
  }
}