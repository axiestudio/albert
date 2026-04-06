import type { CanvasItem } from "../stores/canvas-store";

export type LawEvidenceMessagePart = {
  type: string;
  text?: unknown;
  id?: unknown;
  url?: unknown;
  title?: unknown;
};

export type LawEvidenceEntry = {
  key: string;
  title: string;
  url: string;
  marker?: string;
  kind: "footnote" | "source";
};

export type LawEvidenceSplit = {
  displayText: string;
  entries: LawEvidenceEntry[];
};

const FOOTNOTE_HEADER_PATTERN = /^(?:#{1,6}\s*)?(?:Footnotes|Sources|K\u00e4llor|Kallor)\s*:\s*$/i;
const FOOTNOTE_ENTRY_PATTERN = /^\[(\d+)\]\s*(.+)$/;
const URL_PATTERN = /https?:\/\/\S+/i;
const RIKSDAGEN_DOC_BASE = "https://data.riksdagen.se/dokument";
const RIKSDAGEN_STATUS_BASE = "https://data.riksdagen.se/dokumentstatus";

function trimTrailingWhitespace(value: string) {
  return value.replace(/\s+$/u, "");
}

function normalizeEvidenceUrl(value: string) {
  return value.replace(/[),.;\]]+$/u, "");
}

function inferEvidenceTitle(url: string) {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.split("/").filter(Boolean).at(-1);
    return slug ? decodeURIComponent(slug) : parsed.hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}

function parseFootnoteEntry(marker: string, rawContent: string): LawEvidenceEntry | null {
  const urlMatch = rawContent.match(URL_PATTERN);
  if (!urlMatch) {
    return null;
  }

  const url = normalizeEvidenceUrl(urlMatch[0]);
  const title = rawContent
    .slice(0, urlMatch.index)
    .replace(/\s*[-:\u2013\u2014]\s*$/u, "")
    .trim();

  return {
    key: `footnote:${marker}:${url}`,
    kind: "footnote",
    marker,
    title: title || inferEvidenceTitle(url),
    url,
  };
}

function parseFootnoteLines(lines: readonly string[]) {
  const entries: LawEvidenceEntry[] = [];
  let marker: string | null = null;
  let content: string[] = [];

  const flush = () => {
    if (!marker) {
      return;
    }

    const entry = parseFootnoteEntry(marker, content.join(" ").trim());
    if (entry) {
      entries.push(entry);
    }

    marker = null;
    content = [];
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    const entryMatch = FOOTNOTE_ENTRY_PATTERN.exec(trimmedLine);
    if (entryMatch) {
      flush();
      marker = entryMatch[1];
      content = [entryMatch[2].trim()];
      continue;
    }

    if (marker && trimmedLine) {
      content.push(trimmedLine);
    }
  }

  flush();
  return entries;
}

function extractRiksdagenDocumentId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "data.riksdagen.se") {
      return null;
    }

    const match = parsed.pathname.match(/^\/(?:dokumentstatus|dokument)\/([^./?#/]+)(?:\.(?:html|text))?$/iu);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function buildRiksdagenUrls(dokId: string) {
  const encodedDokId = encodeURIComponent(dokId);
  return {
    htmlUrl: `${RIKSDAGEN_DOC_BASE}/${encodedDokId}.html`,
    textUrl: `${RIKSDAGEN_DOC_BASE}/${encodedDokId}.text`,
    statusUrl: `${RIKSDAGEN_STATUS_BASE}/${encodedDokId}`,
  };
}

function isLagenNuUrl(url: string) {
  try {
    return new URL(url).hostname.endsWith("lagen.nu");
  } catch {
    return false;
  }
}

export function splitLawResponseEvidence(text: string): LawEvidenceSplit {
  const normalizedText = text.replace(/\r\n/gu, "\n");
  const lines = normalizedText.split("\n");
  let footnoteHeaderIndex = -1;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (FOOTNOTE_HEADER_PATTERN.test(lines[index].trim())) {
      footnoteHeaderIndex = index;
      break;
    }
  }

  if (footnoteHeaderIndex === -1) {
    return {
      displayText: text,
      entries: [],
    };
  }

  return {
    displayText: trimTrailingWhitespace(lines.slice(0, footnoteHeaderIndex).join("\n")),
    entries: parseFootnoteLines(lines.slice(footnoteHeaderIndex + 1)),
  };
}

export function collectLawEvidenceFromMessageParts(parts: readonly LawEvidenceMessagePart[]): LawEvidenceEntry[] {
  const evidenceEntries = parts.flatMap((part) => {
    if (part.type !== "text" || typeof part.text !== "string") {
      return [];
    }

    return splitLawResponseEvidence(part.text).entries;
  });

  const seenUrls = new Set(evidenceEntries.map((entry) => entry.url));

  for (const part of parts) {
    if (part.type !== "source" || typeof part.url !== "string") {
      continue;
    }

    const url = normalizeEvidenceUrl(part.url);
    if (seenUrls.has(url)) {
      continue;
    }

    evidenceEntries.push({
      key: typeof part.id === "string" ? `source:${part.id}` : `source:${url}`,
      kind: "source",
      title: typeof part.title === "string" && part.title.trim() ? part.title.trim() : inferEvidenceTitle(url),
      url,
    });
    seenUrls.add(url);
  }

  return evidenceEntries;
}

export function buildLawEvidenceCanvasItem(entry: LawEvidenceEntry): CanvasItem {
  const content = `${entry.title}\n\n${entry.url}`;
  const subtitle = entry.marker ? `[${entry.marker}]` : entry.url;

  if (isLagenNuUrl(entry.url)) {
    return {
      id: entry.key,
      title: entry.title,
      subtitle,
      content,
      type: "lagen-nu",
      htmlUrl: entry.url,
      metadata: {
        Source: entry.url,
      },
    };
  }

  const dokId = extractRiksdagenDocumentId(entry.url);
  if (dokId) {
    const urls = buildRiksdagenUrls(dokId);
    return {
      id: entry.key,
      title: entry.title,
      subtitle,
      content,
      type: /^prop\.?/iu.test(entry.title) ? "proposition" : "law",
      dokId,
      ...urls,
      metadata: {
        Source: entry.url,
      },
    };
  }

  return {
    id: entry.key,
    title: entry.title,
    subtitle,
    content,
    type: "dom-analysis",
    htmlUrl: entry.url,
    metadata: {
      Source: entry.url,
    },
  };
}