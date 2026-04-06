import {
  RIKSDAGEN_BASE,
  RIKSDAGEN_TIMEOUT_MS,
} from "./law-config";
import type { RiksdagenDocumentStatusResponse } from "./law-types";

const LAW_PROPOSITION_HINTS: Record<string, {
  dokIds?: string[];
  queries?: string[];
}> = {
  "2018:218": {
    dokIds: ["H503105"],
    queries: ["2017/18:105", "Ny dataskyddslag"],
  },
};

export async function fetchRiksdagenJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RIKSDAGEN_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export function buildRiksdagenDocumentUrl(dokId: string): string {
  return `${RIKSDAGEN_BASE}/dokumentstatus/${encodeURIComponent(dokId)}`;
}

function buildSfsDokId(sfsBeteckning: string): string {
  return `sfs-${sfsBeteckning.replace(":", "-")}`;
}

function parseRiksdagenDate(raw?: string): number | null {
  const normalized = raw?.trim().slice(0, 10);
  if (!normalized) {
    return null;
  }

  const value = Date.parse(normalized);
  return Number.isNaN(value) ? null : value;
}

function formatRiksdagenPropositionBeteckning(dokument: Record<string, string | undefined>): string {
  const typrubrik = dokument.typrubrik?.trim() ?? "";
  const typrubrikMatch = typrubrik.match(/(\d{4}\/\d{2}:\d+)/);
  if (typrubrikMatch) {
    return typrubrikMatch[1];
  }

  const raw = dokument.beteckning?.trim() ?? "";
  if (!raw) {
    return "";
  }

  const cleaned = raw.replace(/^Prop\.?\s*/i, "");
  if (cleaned.includes(":")) {
    return cleaned;
  }

  const rm = dokument.rm?.trim() ?? "";
  if (rm && /^\d+$/.test(cleaned)) {
    return `${rm}:${cleaned}`;
  }

  return cleaned;
}

export async function fetchRiksdagenDocumentStatus(dokId: string): Promise<RiksdagenDocumentStatusResponse["dokumentstatus"] | null> {
  const data = await fetchRiksdagenJson(`${buildRiksdagenDocumentUrl(dokId)}.json`) as RiksdagenDocumentStatusResponse | null;
  return data?.dokumentstatus ?? null;
}

async function searchRiksdagenPropositionDokIds(query: string): Promise<string[]> {
  const searchParams = new URLSearchParams({
    doktyp: "prop",
    sok: query,
    utformat: "json",
    sz: "5",
    p: "1",
  });
  const searchUrl = `${RIKSDAGEN_BASE}/dokumentlista/?${searchParams.toString()}`;
  const searchData = await fetchRiksdagenJson(searchUrl) as {
    dokumentlista?: {
      dokument?: Array<Record<string, string>>;
    };
  } | null;

  return (searchData?.dokumentlista?.dokument ?? [])
    .map((candidate) => candidate.dok_id)
    .filter((dokId): dokId is string => typeof dokId === "string" && dokId.length > 0);
}

async function fetchValidatedPropositionByDokId(propDokId: string, lawIssuedAt: number | null): Promise<{
  dokId: string;
  beteckning: string;
  titel: string;
  datum: string;
  organ: string;
  fullText: string;
  text: string;
  url: string;
} | null> {
  const dokumentstatus = await fetchRiksdagenDocumentStatus(propDokId);
  if (!dokumentstatus?.dokument) {
    return null;
  }

  const propositionIssuedAt = parseRiksdagenDate(dokumentstatus.dokument.datum);
  if (lawIssuedAt != null && propositionIssuedAt != null && propositionIssuedAt > lawIssuedAt) {
    return null;
  }

  return {
    dokId: dokumentstatus.dokument.dok_id ?? propDokId,
    beteckning: formatRiksdagenPropositionBeteckning(dokumentstatus.dokument),
    titel: dokumentstatus.dokument.titel ?? "",
    datum: dokumentstatus.dokument.datum ?? "",
    organ: dokumentstatus.dokument.organ ?? "",
    fullText: dokumentstatus.dokument.text ?? "",
    text: (dokumentstatus.dokument.text ?? "").slice(0, 8000),
    url: buildRiksdagenDocumentUrl(dokumentstatus.dokument.dok_id ?? propDokId),
  };
}

export async function fetchPropositionFallback(sfsBeteckning: string): Promise<{
  dokId: string;
  beteckning: string;
  titel: string;
  datum: string;
  organ: string;
  fullText: string;
  text: string;
  url: string;
} | null> {
  const lawStatus = await fetchRiksdagenDocumentStatus(buildSfsDokId(sfsBeteckning));
  const lawIssuedAt = parseRiksdagenDate(lawStatus?.dokument?.datum);
  const hint = LAW_PROPOSITION_HINTS[sfsBeteckning];
  for (const propDokId of hint?.dokIds ?? []) {
    const validated = await fetchValidatedPropositionByDokId(propDokId, lawIssuedAt);
    if (validated) {
      return validated;
    }
  }

  const candidateDokIds = new Set<string>();
  for (const query of [sfsBeteckning, ...(hint?.queries ?? [])]) {
    for (const dokId of await searchRiksdagenPropositionDokIds(query)) {
      candidateDokIds.add(dokId);
    }
  }

  for (const propDokId of candidateDokIds) {
    const validated = await fetchValidatedPropositionByDokId(propDokId, lawIssuedAt);
    if (validated) {
      return validated;
    }
  }

  return null;
}