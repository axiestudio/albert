import {
  LAGEN_TIMEOUT_MS,
  LAGEN_USER_AGENTS,
} from "./law-config";
import type { DomAnalysis, DomTable } from "./law-types";
import { decodeEntities, htmlToCleanText, stripTags } from "./law-utils";

function emptyDomResult(url: string, error: string): DomAnalysis {
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

export async function analyzeDomPage(url: string): Promise<DomAnalysis> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LAGEN_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "User-Agent": LAGEN_USER_AGENTS[Math.floor(Math.random() * LAGEN_USER_AGENTS.length)],
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Referer": "https://www.google.com/",
      },
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!response.ok) {
      return emptyDomResult(url, `HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : "";
    const langMatch = html.match(/<html[^>]*\slang="([^"]+)"/i);
    const metaMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i)
      ?? html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*>/i);
    const mainMatch =
      html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
      ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      ?? html.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i);
    const bodyHtml = mainMatch ? mainMatch[1] : html;
    const headings = Array.from(bodyHtml.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi))
      .map((match) => ({
        level: Number(match[1]),
        text: stripTags(match[2]).trim(),
      }))
      .filter((heading) => heading.text.length > 0);
    const links = Array.from(bodyHtml.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi))
      .map((match) => {
        let href = match[1];
        if (!href.startsWith("http")) {
          try {
            href = new URL(href, url).href;
          } catch {
            href = "";
          }
        }
        return {
          text: stripTags(match[2]).trim(),
          href,
        };
      })
      .filter((link) => link.text.length > 0 && link.href.length > 0)
      .slice(0, 50);

    const tables: DomTable[] = [];
    for (const match of bodyHtml.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
      const tableHtml = match[1];
      const headers = Array.from(tableHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi))
        .map((th) => stripTags(th[1]).trim());
      const rows = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi))
        .map((tr) => Array.from(tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((td) => stripTags(td[1]).trim()))
        .filter((row) => row.length > 0)
        .slice(0, 20);
      if (headers.length > 0 || rows.length > 0) {
        tables.push({ headers, rows });
      }
    }

    const lists = Array.from(bodyHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
      .map((match) => ({ text: stripTags(match[1]).trim().slice(0, 500) }))
      .filter((item) => item.text.length > 2)
      .slice(0, 30);

    const fullMainText = htmlToCleanText(bodyHtml);
    const mainText = fullMainText.slice(0, 12_000);

    return {
      url,
      title,
      lang: langMatch?.[1],
      metaDescription: metaMatch ? decodeEntities(metaMatch[1]) : undefined,
      headings,
      links,
      tables: tables.slice(0, 10),
      lists,
      mainText,
      fullMainText,
      wordCount: fullMainText.split(/\s+/).filter(Boolean).length,
    };
  } catch (err) {
    clearTimeout(timer);
    return emptyDomResult(url, err instanceof Error ? err.message : "Unknown fetch error");
  }
}