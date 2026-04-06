/**
 * lagen.nu — Swedish law with commentary, case law, and cross-references.
 *
 * URL patterns:
 *   Law:          https://lagen.nu/{SFS}           e.g. /1949:381
 *   Chapter:      https://lagen.nu/{SFS}#K{n}      e.g. /1949:381#K6
 *   Paragraph:    https://lagen.nu/{SFS}#K{n}P{m}  e.g. /1949:381#K6P2
 *   Proposition:  https://lagen.nu/prop/{y}/{y:n}   e.g. /prop/2017/18:105
 *   Case:         https://lagen.nu/dom/{court}/{id} e.g. /dom/nja/2008s1190
 *   Concept:      https://lagen.nu/begrepp/{name}
 *   Consolidated: https://lagen.nu/{SFS}/konsolidering/{amend_SFS}
 *   Dataset:      https://lagen.nu/dataset/sfs | /dataset/dv | /dataset/forarbeten
 */

const BASE = "https://lagen.nu";
const TIMEOUT_MS = 20_000;
const MAX_CHARS = 15_000;

// ─── URL builder ─────────────────────────────────────────────────────────────

export function buildUrl(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) return input;
  const cleaned = input.trim().replace(/^\/+/, "");
  return `${BASE}/${cleaned}`;
}

/** Construct a chapter-level deep link. */
export function chapterUrl(sfs: string, chapter: number): string {
  return `${BASE}/${sfs}#K${chapter}`;
}

/** Construct a paragraph-level deep link. */
export function paragraphUrl(sfs: string, chapter: number, paragraph: number): string {
  return `${BASE}/${sfs}#K${chapter}P${paragraph}`;
}

/** Construct a proposition URL. */
export function propositionUrl(ref: string): string {
  // ref e.g. "2017/18:105"
  return `${BASE}/prop/${ref}`;
}

// ─── HTML → structured text ─────────────────────────────────────────────────

/** Convert raw HTML to clean text, preserving markdown links for key cross-references. */
function htmlToStructuredText(html: string): string {
  let text = html;

  // Remove scripts, styles, nav, footer
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");

  // Convert cross-reference links to markdown: [text](url) — keeps lagen.nu URLs visible
  text = text.replace(
    /<a\s+[^>]*href="(https?:\/\/lagen\.nu\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, url, label) => {
      const clean = label.replace(/<[^>]+>/g, "").trim();
      return clean ? `[${clean}](${url})` : url;
    },
  );

  // Convert proposition links
  text = text.replace(
    /<a\s+[^>]*href="(https?:\/\/[^"]*riksdagen[^"]*|https?:\/\/eur-lex[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, url, label) => {
      const clean = label.replace(/<[^>]+>/g, "").trim();
      return clean ? `[${clean}](${url})` : url;
    },
  );

  // Structure: headings → markdown headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n# ${c.replace(/<[^>]+>/g, "").trim()}\n`);
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n## ${c.replace(/<[^>]+>/g, "").trim()}\n`);
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n### ${c.replace(/<[^>]+>/g, "").trim()}\n`);
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `\n#### ${c.replace(/<[^>]+>/g, "").trim()}\n`);
  text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, c) => `\n##### ${c.replace(/<[^>]+>/g, "").trim()}\n`);

  // Block elements → newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<\/tr>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&auml;/g, "ä");
  text = text.replace(/&Auml;/g, "Ä");
  text = text.replace(/&ouml;/g, "ö");
  text = text.replace(/&Ouml;/g, "Ö");
  text = text.replace(/&aring;/g, "å");
  text = text.replace(/&Aring;/g, "Å");

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/** Extract the law's header metadata block from the page HTML. */
function extractMetadata(html: string): Record<string, string> {
  const meta: Record<string, string> = {};

  const fields = [
    { key: "departement", pattern: /Departement\s*<\/\w+>\s*([\s\S]*?)(?=<\/|<\w)/i },
    { key: "utfardad", pattern: /Utfärdad\s*<\/\w+>\s*([\s\S]*?)(?=<\/|<\w)/i },
    { key: "andring", pattern: /Ändring införd\s*<\/\w+>\s*([\s\S]*?)(?=<\/|<\w)/i },
    { key: "ikraft", pattern: /Ikraft\s*<\/\w+>\s*([\s\S]*?)(?=<\/|<\w)/i },
  ];

  for (const { key, pattern } of fields) {
    const m = html.match(pattern);
    if (m) meta[key] = m[1].replace(/<[^>]+>/g, "").trim();
  }

  // Extract the law's canonical SFS reference from the title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    meta.title = titleMatch[1].trim();
    const sfsMatch = meta.title.match(/\((\d{4}:\d+)\)/);
    if (sfsMatch) meta.sfs = sfsMatch[1];
  }

  return meta;
}

// ─── Fetch + parse ──────────────────────────────────────────────────────────

export type LagenNuSection = {
  heading: string;
  text: string;
  crossRefs: string[];
  caseRefs: string[];
};

export type LagenNuResult = {
  url: string;
  title: string;
  sfs?: string;
  metadata: Record<string, string>;
  content: string;
  sections: LagenNuSection[];
  footnoteUrl: string;
  error?: string;
};

/**
 * Fetch a page from lagen.nu.
 *
 * @param input — SFS number ("1949:381"), SFS + chapter ("1949:381#K6"),
 *   proposition path ("prop/2017/18:105"), or full URL.
 */
export async function fetchPage(input: string): Promise<LagenNuResult> {
  const url = buildUrl(input);
  const footnoteUrl = url; // always provide a proper source URL

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/html", "User-Agent": "LawAgent/1.0 (Swedish legal research)" },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return {
        url,
        title: "",
        metadata: {},
        content: "",
        sections: [],
        footnoteUrl,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();
    const metadata = extractMetadata(html);
    const title = metadata.title ?? "";

    // Extract main content area
    const mainMatch =
      html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
      ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      ?? html.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i);
    const bodyHtml = mainMatch ? mainMatch[1] : html;

    // Parse structured content with cross-references preserved as markdown links
    const content = htmlToStructuredText(bodyHtml);

    // Extract sections (chapters / rubrics) for structured browsing
    const sections = extractSections(bodyHtml);

    // Truncate if needed but try to break at a paragraph boundary
    const truncated = truncateAtBoundary(content, MAX_CHARS);

    return {
      url,
      title,
      sfs: metadata.sfs,
      metadata,
      content: truncated,
      sections: sections.slice(0, 30), // Cap sections to prevent huge payloads
      footnoteUrl,
    };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { url, title: "", metadata: {}, content: "", sections: [], footnoteUrl, error: msg };
  }
}

/**
 * Fetch a specific chapter from a law on lagen.nu.
 * This is more efficient than fetching the whole law for targeted questions.
 */
export async function fetchChapter(
  sfs: string,
  chapter: number,
): Promise<LagenNuResult> {
  // Fetch the full page — lagen.nu doesn't have chapter-only endpoints
  // but we filter the content to only the requested chapter
  const result = await fetchPage(sfs);
  if (result.error) return result;

  const chapterHeading = `${chapter} kap.`;
  const nextChapter = `${chapter + 1} kap.`;

  // Find content between this chapter heading and the next
  const startIdx = result.content.indexOf(chapterHeading);
  if (startIdx === -1) return result; // Chapter not found, return full

  const endIdx = result.content.indexOf(nextChapter, startIdx + chapterHeading.length);
  const chapterContent = endIdx === -1
    ? result.content.slice(startIdx)
    : result.content.slice(startIdx, endIdx);

  return {
    ...result,
    url: chapterUrl(sfs, chapter),
    content: chapterContent.trim(),
    sections: result.sections.filter((s) =>
      s.heading.includes(chapterHeading) || s.heading.startsWith(`## `),
    ),
  };
}

// ─── Section extraction ─────────────────────────────────────────────────────

function extractSections(html: string): LagenNuSection[] {
  const sections: LagenNuSection[] = [];

  // Split on h1/h2/h3 tags to get document structure
  const parts = html.split(/(?=<h[123][^>]*>)/i);

  for (const part of parts) {
    const headingMatch = part.match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/i);
    if (!headingMatch) continue;

    const heading = headingMatch[1].replace(/<[^>]+>/g, "").trim();
    if (!heading) continue;

    const text = htmlToStructuredText(part);

    // Extract cross-references (links to other lagen.nu pages)
    const crossRefs: string[] = [];
    const crossRefPattern = /href="(https?:\/\/lagen\.nu\/[^"]+)"/gi;
    let match;
    while ((match = crossRefPattern.exec(part)) !== null) {
      if (!crossRefs.includes(match[1])) crossRefs.push(match[1]);
    }

    // Extract case law references (NJA, RH, etc.)
    const caseRefs: string[] = [];
    const casePattern = /href="(https?:\/\/lagen\.nu\/dom\/[^"]+)"/gi;
    while ((match = casePattern.exec(part)) !== null) {
      if (!caseRefs.includes(match[1])) caseRefs.push(match[1]);
    }

    sections.push({
      heading,
      text: text.slice(0, 2000),
      crossRefs: crossRefs.slice(0, 10),
      caseRefs: caseRefs.slice(0, 10),
    });
  }

  return sections;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncateAtBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // Try to break at a paragraph boundary
  const lastParagraph = text.lastIndexOf("\n\n", maxLen);
  if (lastParagraph > maxLen * 0.7) {
    return `${text.slice(0, lastParagraph)}\n\n[… truncated — see full law at lagen.nu]`;
  }
  return `${text.slice(0, maxLen)}\n\n[… truncated]`;
}

/**
 * Build a footnote/source line for the agent to include in its response.
 */
export function sourceFootnote(result: LagenNuResult): string {
  const parts = [`📖 ${result.title || "Lagen.nu"}`];
  if (result.sfs) parts.push(`SFS ${result.sfs}`);
  parts.push(`[Läs på lagen.nu](${result.footnoteUrl})`);
  return parts.join(" — ");
}
