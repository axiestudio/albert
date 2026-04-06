import type { Env } from "../../env";
import {
  CF_API_BASE_LAW,
  LAW_PREPARE_HEADER_LIMIT,
  LAW_PREPARE_RESULT_LIMIT,
  RIKSDAGEN_BASE,
  SFS_EMBEDDING_MODEL,
  SFS_VECTORIZE_INDEX,
  getLawRestAccount,
} from "./law-config";
import { buildRiksdagenDocumentUrl, fetchRiksdagenJson } from "./law-riksdagen";
import type {
  LawExpansionRule,
  LawSearchResult,
  PrepareTracePayload,
} from "./law-types";

const LAW_SEARCH_TOKEN_PATTERN = /[a-z0-9åäö-]+/g;

const LAW_KEYWORD_SYNONYMS: Record<string, string[]> = {
  gdpr: [
    "kompletterande bestämmelser till EU:s dataskyddsförordning",
    "2018:218",
    "dataskyddsförordning",
    "dataskydd",
    "personuppgifter",
  ],
  dataskydd: [
    "kompletterande bestämmelser till EU:s dataskyddsförordning",
    "2018:218",
  ],
  personuppgifter: [
    "dataskydd",
    "dataskyddsförordning",
    "2018:218",
  ],
  fru: [
    "äktenskapsbalken",
    "makars gemensamma bostad",
    "samtycke vid försäljning av gemensam bostad",
  ],
  hustru: [
    "äktenskapsbalken",
    "makars gemensamma bostad",
  ],
  make: [
    "äktenskapsbalken",
    "makars gemensamma bostad",
  ],
  maka: [
    "äktenskapsbalken",
    "makars gemensamma bostad",
  ],
  makar: [
    "äktenskapsbalken",
    "makars gemensamma bostad",
  ],
  gift: [
    "äktenskapsbalken",
    "makars gemensamma bostad",
  ],
  äktenskap: [
    "äktenskapsbalken",
    "makars gemensamma bostad",
  ],
  samtycke: [
    "äktenskapsbalken samtycke",
    "samtycke vid försäljning av gemensam bostad",
  ],
  hus: [
    "gemensam bostad",
    "jordabalk fastighet",
  ],
  huset: [
    "gemensam bostad",
    "jordabalk fastighet",
  ],
  bostad: [
    "gemensam bostad",
    "äktenskapsbalken samtycke",
  ],
  fastighet: [
    "jordabalk fastighet",
    "överlåtelse av fast egendom",
  ],
  sälja: [
    "överlåtelse av fast egendom",
    "försäljning av gemensam bostad",
  ],
  överlåta: [
    "överlåtelse av fast egendom",
  ],
  uppsägning: [
    "lagen om anställningsskydd",
    "anställningsskydd personliga skäl",
    "sakliga skäl uppsägning",
  ],
  uppsagd: [
    "lagen om anställningsskydd",
    "anställningsskydd personliga skäl",
  ],
  arbetsgivare: [
    "lagen om anställningsskydd",
    "sakliga skäl uppsägning",
  ],
  anställningsskydd: [
    "lagen om anställningsskydd",
    "1982:80",
    "sakliga skäl uppsägning",
  ],
  anstallningsskydd: [
    "lagen om anställningsskydd",
    "1982:80",
    "sakliga skäl uppsägning",
  ],
  personliga: [
    "uppsägning av personliga skäl",
    "sakliga skäl uppsägning",
  ],
  skäl: [
    "uppsägning av personliga skäl",
    "sakliga skäl uppsägning",
  ],
  skal: [
    "uppsägning av personliga skäl",
    "sakliga skäl uppsägning",
  ],
  omplacering: [
    "omplaceringsskyldighet las",
    "lagen om anställningsskydd",
  ],
  konsument: [
    "konsumentköplagen",
    "konsumentkreditlagen",
    "konsumenttjänstlagen",
  ],
  konsumentköp: [
    "konsumentköplagen",
    "2022:260",
  ],
  reklamation: [
    "konsumentköplagen",
    "reklamationsrätt",
    "2022:260",
  ],
  garanti: [
    "konsumentköplagen garanti",
    "köplagen garanti",
  ],
  ångerrätt: [
    "distansavtalslagen ångerrätt",
    "2005:59",
  ],
  distansavtal: [
    "distansavtalslagen",
    "2005:59",
    "ångerrätt",
  ],
  reklamera: [
    "konsumentköplagen reklamation",
    "reklamationsrätt",
  ],
  hyra: [
    "hyreslagen",
    "jordabalk hyra",
    "12 kap jordabalken",
  ],
  hyresrätt: [
    "hyreslagen",
    "jordabalk hyra",
    "besittningsskydd hyra",
  ],
  hyresgäst: [
    "hyreslagen",
    "jordabalk hyra",
  ],
  hyresvärd: [
    "hyreslagen",
    "jordabalk hyra",
    "uppsägning hyresavtal",
  ],
  besittningsskydd: [
    "hyreslagen besittningsskydd",
    "jordabalk hyra",
    "12 kap jordabalken",
  ],
  andrahandsuthyrning: [
    "hyreslagen andrahand",
    "uthyrning i andra hand",
    "12 kap jordabalken",
  ],
  hyreshöjning: [
    "bruksvärdessystemet",
    "hyreslagen hyreshöjning",
    "12 kap jordabalken",
  ],
  arv: [
    "ärvdabalken",
    "arvsrätt",
    "testamente",
  ],
  testamente: [
    "ärvdabalken testamente",
    "testamente ogiltighet",
  ],
  vårdnad: [
    "föräldrabalken vårdnad",
    "gemensam vårdnad",
    "ensam vårdnad",
  ],
  umgänge: [
    "föräldrabalken umgänge",
    "umgängesrätt barn",
  ],
  barn: [
    "föräldrabalken",
    "barnkonventionen",
    "2018:1197",
  ],
  diskriminering: [
    "diskrimineringslagen",
    "2008:567",
  ],
  trakasseri: [
    "diskrimineringslagen trakasserier",
    "2008:567",
  ],
  yttrandefrihet: [
    "yttrandefrihetsgrundlagen",
    "tryckfrihetsförordningen",
  ],
  offentlighetsprincipen: [
    "tryckfrihetsförordningen offentlighet",
    "offentlighets- och sekretesslagen",
  ],
  sekretess: [
    "offentlighets- och sekretesslagen",
    "2009:400",
  ],
  skadestånd: [
    "skadeståndslagen",
    "1972:207",
  ],
  avtal: [
    "avtalslagen",
    "1915:218",
  ],
  fullmakt: [
    "avtalslagen fullmakt",
    "1915:218",
  ],
  brott: [
    "brottsbalken",
    "1962:700",
  ],
  straff: [
    "brottsbalken",
    "1962:700",
  ],
};

const LAW_SEED_DOK_IDS: Record<string, string[]> = {
  gdpr: ["sfs-2018-218"],
  dataskydd: ["sfs-2018-218"],
  personuppgifter: ["sfs-2018-218"],
  fru: ["sfs-1987-230", "sfs-1970-994"],
  hustru: ["sfs-1987-230", "sfs-1970-994"],
  make: ["sfs-1987-230"],
  maka: ["sfs-1987-230"],
  makar: ["sfs-1987-230"],
  gift: ["sfs-1987-230"],
  äktenskap: ["sfs-1987-230"],
  samtycke: ["sfs-1987-230"],
  hus: ["sfs-1970-994", "sfs-1987-230"],
  huset: ["sfs-1970-994", "sfs-1987-230"],
  bostad: ["sfs-1987-230", "sfs-1970-994"],
  fastighet: ["sfs-1970-994"],
  sälja: ["sfs-1970-994", "sfs-1987-230"],
  överlåta: ["sfs-1970-994"],
  uppsägning: ["sfs-1982-80"],
  uppsagd: ["sfs-1982-80"],
  arbetsgivare: ["sfs-1982-80"],
  anställningsskydd: ["sfs-1982-80"],
  anstallningsskydd: ["sfs-1982-80"],
  personliga: ["sfs-1982-80"],
  skäl: ["sfs-1982-80"],
  skal: ["sfs-1982-80"],
  omplacering: ["sfs-1982-80"],
  konsument: ["sfs-2022-260"],
  konsumentköp: ["sfs-2022-260"],
  reklamation: ["sfs-2022-260"],
  garanti: ["sfs-2022-260"],
  ångerrätt: ["sfs-2005-59"],
  distansavtal: ["sfs-2005-59"],
  reklamera: ["sfs-2022-260"],
  hyra: ["sfs-1970-994"],
  hyresrätt: ["sfs-1970-994"],
  hyresgäst: ["sfs-1970-994"],
  hyresvärd: ["sfs-1970-994"],
  besittningsskydd: ["sfs-1970-994"],
  andrahandsuthyrning: ["sfs-1970-994"],
  hyreshöjning: ["sfs-1970-994"],
  arv: ["sfs-1958-637"],
  testamente: ["sfs-1958-637"],
  vårdnad: ["sfs-1949-381"],
  umgänge: ["sfs-1949-381"],
  barn: ["sfs-1949-381"],
  diskriminering: ["sfs-2008-567"],
  trakasseri: ["sfs-2008-567"],
  yttrandefrihet: ["sfs-1991-1469"],
  offentlighetsprincipen: ["sfs-1949-105"],
  sekretess: ["sfs-2009-400"],
  skadestånd: ["sfs-1972-207"],
  avtal: ["sfs-1915-218"],
  fullmakt: ["sfs-1915-218"],
  brott: ["sfs-1962-700"],
  straff: ["sfs-1962-700"],
};

const LAW_PREPARE_STOPWORDS = new Set([
  "att",
  "behöver",
  "behova",
  "berätta",
  "beratta",
  "det",
  "den",
  "direkt",
  "faktiskt",
  "för",
  "forklara",
  "förklara",
  "från",
  "fran",
  "har",
  "hela",
  "hennes",
  "hur",
  "i",
  "jag",
  "kan",
  "med",
  "men",
  "min",
  "måste",
  "maste",
  "mig",
  "ni",
  "och",
  "om",
  "praktiskt",
  "rätt",
  "ratt",
  "själv",
  "sjalv",
  "som",
  "ska",
  "styr",
  "till",
  "vad",
  "vill",
  "vilka",
]);

const LAW_PHRASE_EXPANSIONS: LawExpansionRule[] = [
  {
    pattern: /\b(gdpr|dataskydd|personuppgifter)\b/i,
    queries: [
      "kompletterande bestämmelser till EU:s dataskyddsförordning",
      "2018:218",
    ],
    dokIds: ["sfs-2018-218"],
  },
  {
    pattern: /\b(sälja|försälja|överlåta)\b[\s\S]{0,80}\b(hus|huset|bostad|fastighet)\b|\b(hus|huset|bostad|fastighet)\b[\s\S]{0,80}\b(sälja|försälja|överlåta)\b/i,
    queries: [
      "äktenskapsbalken samtycke gemensam bostad",
      "jordabalk överlåtelse fastighet",
      "försäljning av gemensam bostad",
    ],
    dokIds: ["sfs-1987-230", "sfs-1970-994"],
  },
  {
    pattern: /\b(fru|frun|hustru|make|maka|makar|gift|äktenskap)\b/i,
    queries: [
      "äktenskapsbalken samtycke",
      "gemensam bostad makar",
    ],
    dokIds: ["sfs-1987-230"],
  },
  {
    pattern: /\b(personliga skäl|uppsägning|uppsagd|avsked|sakliga skäl|omplacering)\b/i,
    queries: [
      "lagen om anställningsskydd",
      "anställningsskydd personliga skäl",
      "sakliga skäl uppsägning",
      "omplaceringsskyldighet las",
      "1982:80",
    ],
    dokIds: ["sfs-1982-80"],
  },
];

export function expandLawSearchQueries(input: string): string[] {
  const normalized = input.trim();
  if (!normalized) {
    return [];
  }

  const expanded = new Set<string>([normalized]);
  const lowercased = normalized.toLowerCase();

  for (const token of lowercased.match(LAW_SEARCH_TOKEN_PATTERN) ?? []) {
    for (const synonym of LAW_KEYWORD_SYNONYMS[token] ?? []) {
      expanded.add(synonym);
    }
  }

  for (const rule of LAW_PHRASE_EXPANSIONS) {
    if (!rule.pattern.test(lowercased)) {
      continue;
    }

    for (const query of rule.queries ?? []) {
      expanded.add(query);
    }
  }

  return [...expanded];
}

export function expandLawSeedDokIds(input: string): string[] {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const seeded = new Set<string>();
  for (const token of normalized.match(LAW_SEARCH_TOKEN_PATTERN) ?? []) {
    for (const dokId of LAW_SEED_DOK_IDS[token] ?? []) {
      seeded.add(dokId);
    }
  }

  for (const rule of LAW_PHRASE_EXPANSIONS) {
    if (!rule.pattern.test(normalized)) {
      continue;
    }

    for (const dokId of rule.dokIds ?? []) {
      seeded.add(dokId);
    }
  }

  return [...seeded];
}

export async function keywordSearchRiksdagenLaws(
  keywords: string,
  maxResults = LAW_PREPARE_RESULT_LIMIT,
): Promise<LawSearchResult[]> {
  const safeMax = Math.min(maxResults, 50);
  const merged: LawSearchResult[] = [];
  const seen = new Set<string>();

  for (const dokId of expandLawSeedDokIds(keywords)) {
    const data = await fetchRiksdagenJson(`${buildRiksdagenDocumentUrl(dokId)}.json`) as {
      dokumentstatus?: {
        dokument?: Record<string, string>;
      };
    } | null;
    const dokument = data?.dokumentstatus?.dokument;
    if (!dokument) {
      continue;
    }

    const seededDokId = dokument.dok_id ?? dokId;
    if (seen.has(seededDokId)) {
      continue;
    }

    seen.add(seededDokId);
    merged.push({
      dokId: seededDokId,
      score: 1.1,
      beteckning: dokument.beteckning ?? "",
      titel: dokument.titel ?? "",
      datum: dokument.datum ?? "",
      organ: dokument.organ ?? "",
      summary: dokument.summary ?? "",
      source: "keyword",
    });
  }

  for (const query of expandLawSearchQueries(keywords)) {
    const params = new URLSearchParams({
      doktyp: "sfs",
      subtyp: "sfst",
      dokstat: "gällande sfs",
      sok: query,
      utformat: "json",
      sz: String(safeMax),
      p: "1",
    });
    const data = await fetchRiksdagenJson(`${RIKSDAGEN_BASE}/dokumentlista/?${params.toString()}`) as {
      dokumentlista?: {
        dokument?: Array<Record<string, string>>;
      };
    } | null;

    for (const d of data?.dokumentlista?.dokument ?? []) {
      const dokId = d.dok_id ?? "";
      if (!dokId || seen.has(dokId)) {
        continue;
      }

      seen.add(dokId);
      merged.push({
        dokId,
        score: query === keywords ? 1 : 0.96,
        beteckning: d.beteckning ?? "",
        titel: d.titel ?? "",
        datum: d.datum ?? "",
        organ: d.organ ?? "",
        summary: d.summary ?? "",
        source: "keyword",
      });
    }

    if (merged.length >= safeMax) {
      break;
    }
  }

  return merged.slice(0, safeMax);
}

export async function semanticSearchLawsForPrepare(
  env: Env,
  query: string,
  topK = LAW_PREPARE_RESULT_LIMIT,
): Promise<LawSearchResult[]> {
  const safeTopK = Math.min(Math.max(topK, 1), 20);
  const restAccount = getLawRestAccount(env);

  if (restAccount) {
    try {
      const embedRes = await fetch(
        `${CF_API_BASE_LAW}/${restAccount.accountId}/ai/run/${SFS_EMBEDDING_MODEL}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${restAccount.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: [query] }),
        },
      );
      if (!embedRes.ok) {
        throw new Error(`Embed HTTP ${embedRes.status}`);
      }
      const embedData = await embedRes.json() as { success: boolean; result?: { data: number[][] } };
      const vector = embedData?.result?.data?.[0];
      if (!vector) {
        throw new Error("Embedding vector empty");
      }

      const queryRes = await fetch(
        `${CF_API_BASE_LAW}/${restAccount.accountId}/vectorize/v2/indexes/${SFS_VECTORIZE_INDEX}/query`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${restAccount.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ vector, topK: safeTopK, returnMetadata: "all" }),
        },
      );
      if (!queryRes.ok) {
        throw new Error(`Vectorize HTTP ${queryRes.status}`);
      }
      const queryData = await queryRes.json() as {
        success: boolean;
        result?: { matches: Array<{ id: string; score: number; metadata?: Record<string, string | number> }> };
      };
      if (!queryData.success) {
        throw new Error("Vectorize query failed");
      }

      return (queryData.result?.matches ?? []).map((m) => ({
        dokId: m.id,
        score: m.score,
        beteckning: String(m.metadata?.beteckning ?? ""),
        titel: String(m.metadata?.titel ?? ""),
        datum: String(m.metadata?.datum ?? ""),
        organ: String(m.metadata?.organ ?? ""),
        summary: "",
        source: "semantic",
      }));
    } catch (err) {
      console.warn("[Executive/Law] REST semantic search failed during prepare, falling back to native binding:", err);
    }
  }

  if (!env.SFS_VECTORIZE || !env.AI) {
    return [];
  }

  try {
    const embeddingResult = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
      text: [query],
    }) as { data?: number[][] };
    const vector = embeddingResult?.data?.[0];
    if (!vector) {
      return [];
    }

    const matches = await env.SFS_VECTORIZE.query(vector, {
      topK: safeTopK,
      returnMetadata: true,
    });

    return matches.matches.map((m) => ({
      dokId: m.id,
      score: m.score,
      beteckning: String(m.metadata?.beteckning ?? ""),
      titel: String(m.metadata?.titel ?? ""),
      datum: String(m.metadata?.datum ?? ""),
      organ: String(m.metadata?.organ ?? ""),
      summary: "",
      source: "semantic",
    }));
  } catch (err) {
    if (err instanceof Error && err.message.includes("needs to be run remotely")) {
      console.warn("[Executive/Law] Native semantic search unavailable locally; continuing with keyword prepare only.");
      return [];
    }

    console.error("[Executive/Law] Native semantic search failed during prepare:", err);
    return [];
  }
}

function extractLawKeywords(query: string): string[] {
  const extractedKeywords = new Set<string>();
  const addKeyword = (keyword: string) => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword || normalizedKeyword.length < 3 || LAW_PREPARE_STOPWORDS.has(normalizedKeyword)) {
      return;
    }
    extractedKeywords.add(normalizedKeyword);
  };

  for (const token of query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .match(LAW_SEARCH_TOKEN_PATTERN) ?? []) {
    addKeyword(token);
  }

  for (const expandedQuery of expandLawSearchQueries(query)) {
    for (const token of expandedQuery.toLowerCase().match(LAW_SEARCH_TOKEN_PATTERN) ?? []) {
      addKeyword(token);
    }
  }

  return [...extractedKeywords].slice(0, 8);
}

export async function prepareLawContext(
  env: Env,
  query: string,
): Promise<{ results: LawSearchResult[]; extractedKeywords: string[] }> {
  if (!query.trim()) {
    return { results: [], extractedKeywords: [] };
  }

  const extractedKeywords = extractLawKeywords(query);
  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearchLawsForPrepare(env, query, LAW_PREPARE_RESULT_LIMIT),
    keywordSearchRiksdagenLaws(query, LAW_PREPARE_RESULT_LIMIT),
  ]);

  const merged: LawSearchResult[] = [];
  const seen = new Set<string>();

  for (const result of keywordResults) {
    if (result.dokId && !seen.has(result.dokId)) {
      seen.add(result.dokId);
      merged.push(result);
    }
  }

  for (const result of semanticResults) {
    if (result.dokId && !seen.has(result.dokId)) {
      seen.add(result.dokId);
      merged.push(result);
    }
  }

  return {
    results: merged,
    extractedKeywords,
  };
}

function buildPrepareResultsHeaderValue(results: LawSearchResult[]): string {
  return JSON.stringify(
    results.slice(0, LAW_PREPARE_HEADER_LIMIT).map((r) => ({
      d: r.dokId,
      s: Math.round(r.score * 1000) / 1000,
      b: r.beteckning,
      t: r.titel.length > 80 ? `${r.titel.slice(0, 77)}…` : r.titel,
      dt: r.datum,
      o: r.organ,
      src: r.source,
    })),
  );
}

export function buildAsciiSafePrepareResultsHeaderValue(results: LawSearchResult[]): string {
  return buildPrepareResultsHeaderValue(results).replace(
    /[^\x20-\x7E]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function buildPrepareContextToolResult(
  results: LawSearchResult[],
  extractedKeywords: string[],
): PrepareTracePayload {
  return {
    results: results.slice(0, LAW_PREPARE_HEADER_LIMIT).map((result) => ({
      d: result.dokId,
      s: Math.round(result.score * 1000) / 1000,
      b: result.beteckning,
      t: result.titel.length > 80 ? `${result.titel.slice(0, 77)}...` : result.titel,
      dt: result.datum,
      o: result.organ,
      src: result.source,
    })),
    extractedKeywords,
    semanticCount: results.filter((result) => result.source === "semantic").length,
    keywordCount: results.filter((result) => result.source === "keyword").length,
  };
}