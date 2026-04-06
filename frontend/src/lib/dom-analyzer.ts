/**
 * DOM-based page analyzer — inspired by Alibaba Page Agent's
 * "high-intensity dehydration" approach.
 *
 * Fetches a web page and extracts structured DOM data (headings, links,
 * tables, lists, metadata) without relying on screenshots or visual
 * recognition. Pure text-based analysis.
 *
 * This runs server-side as an agent tool for legal research.
 */

const FETCH_TIMEOUT_MS = 20_000;

// ─── Types ──────────────────────────────────────────────────────────────────

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
  wordCount: number;
  error?: string;
};

// ─── Fetch + analyze ────────────────────────────────────────────────────────

export async function analyzePage(url: string): Promise<DomAnalysis> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html",
        "User-Agent": "LawAgent-DOMAnalyzer/1.0",
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return emptyResult(url, `HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return parseHtml(url, html);
  } catch (err) {
    clearTimeout(timer);
    return emptyResult(url, err instanceof Error ? err.message : "Unknown fetch error");
  }
}

// ─── HTML parser ────────────────────────────────────────────────────────────

function parseHtml(url: string, html: string): DomAnalysis {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : "";

  // Extract lang
  const langMatch = html.match(/<html[^>]*\slang="([^"]+)"/i);
  const lang = langMatch ? langMatch[1] : undefined;

  // Extract meta description
  const metaMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i)
    ?? html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*>/i);
  const metaDescription = metaMatch ? decodeEntities(metaMatch[1]) : undefined;

  // Get main content area (strip nav/footer/scripts)
  const bodyHtml = extractMainContent(html);

  // Extract headings
  const headings = extractHeadings(bodyHtml);

  // Extract links (with href and text)
  const links = extractLinks(bodyHtml, url);

  // Extract tables
  const tables = extractTables(bodyHtml);

  // Extract lists
  const lists = extractLists(bodyHtml);

  // Extract main text
  const mainText = htmlToCleanText(bodyHtml);
  const wordCount = mainText.split(/\s+/).filter(Boolean).length;

  return {
    url,
    title,
    lang,
    metaDescription,
    headings,
    links: links.slice(0, 50),
    tables: tables.slice(0, 10),
    lists: lists.slice(0, 30),
    mainText: mainText.slice(0, 12_000),
    wordCount,
  };
}

// ─── Extractors ─────────────────────────────────────────────────────────────

function extractMainContent(html: string): string {
  let content = html;
  // Remove non-content elements
  content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  content = content.replace(/<!--[\s\S]*?-->/g, "");

  // Try to find main content area
  const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    ?? content.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    ?? content.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i);

  return mainMatch ? mainMatch[1] : content;
}

function extractHeadings(html: string): DomHeading[] {
  const headings: DomHeading[] = [];
  const pattern = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const text = stripTags(match[2]).trim();
    if (text) {
      headings.push({ level: Number(match[1]), text });
    }
  }
  return headings;
}

function extractLinks(html: string, baseUrl: string): DomLink[] {
  const links: DomLink[] = [];
  const seen = new Set<string>();
  const pattern = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const text = stripTags(match[2]).trim();
    let href = match[1];
    if (!text || href.startsWith("#") || href.startsWith("javascript:")) continue;
    // Resolve relative URLs
    if (!href.startsWith("http")) {
      try {
        href = new URL(href, baseUrl).href;
      } catch { continue; }
    }
    if (!seen.has(href)) {
      seen.add(href);
      links.push({ text, href });
    }
  }
  return links;
}

function extractTables(html: string): DomTable[] {
  const tables: DomTable[] = [];
  const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tablePattern.exec(html)) !== null) {
    const tableHtml = tableMatch[1];

    // Extract headers
    const headers: string[] = [];
    const thPattern = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let thMatch;
    while ((thMatch = thPattern.exec(tableHtml)) !== null) {
      headers.push(stripTags(thMatch[1]).trim());
    }

    // Extract rows
    const rows: string[][] = [];
    const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trPattern.exec(tableHtml)) !== null) {
      const cells: string[] = [];
      const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      while ((tdMatch = tdPattern.exec(trMatch[1])) !== null) {
        cells.push(stripTags(tdMatch[1]).trim());
      }
      if (cells.length > 0) rows.push(cells);
    }

    if (headers.length > 0 || rows.length > 0) {
      tables.push({ headers, rows: rows.slice(0, 20) });
    }
  }
  return tables;
}

function extractLists(html: string): DomListItem[] {
  const items: DomListItem[] = [];
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liPattern.exec(html)) !== null) {
    const text = stripTags(liMatch[1]).trim();
    if (text && text.length > 2) {
      items.push({ text: text.slice(0, 500) });
    }
  }
  return items;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&aring;/g, "å");
}

function htmlToCleanText(html: string): string {
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/h[1-6]>/gi, "\n\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<\/tr>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = stripTags(text);
  text = decodeEntities(text);
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function emptyResult(url: string, error: string): DomAnalysis {
  return {
    url,
    title: "",
    headings: [],
    links: [],
    tables: [],
    lists: [],
    mainText: "",
    wordCount: 0,
    error,
  };
}
