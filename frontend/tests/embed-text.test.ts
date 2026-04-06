/**
 * Tests for buildEmbeddingText — the function that creates the string
 * that gets embedded as a vector for each SFS law during ingestion.
 *
 * This mirrors ingest-sfs-vectorize.ts buildEmbeddingText() exactly.
 * Good embedding text = better semantic search quality.
 */
import { describe, expect, it } from "bun:test";

type SfsEntry = {
  dok_id: string;
  beteckning: string;
  titel: string;
  datum: string;
  organ: string;
  summary: string;
  subtyp: string;
  nummer: string;
  rm: string;
  status: string;
};

// Mirror of buildEmbeddingText in ingest-sfs-vectorize.ts
function buildEmbeddingText(law: SfsEntry): string {
  const parts = [
    law.titel,
    `SFS ${law.beteckning}`,
    law.organ,
    law.summary,
  ].filter(Boolean);
  return parts.join(" — ");
}

// ─── Full entry ────────────────────────────────────────────────────────────────
describe("buildEmbeddingText — full entry", () => {
  const ANST = {
    dok_id: "sfs-1982-80",
    beteckning: "1982:80",
    titel: "Lag (1982:80) om anställningsskydd",
    datum: "1982-02-24",
    organ: "Arbetsmarknadsdepartementet A",
    summary: "Skyddar arbetstagares anställning vid uppsägning och avskedande.",
    subtyp: "sfst",
    nummer: "80",
    rm: "1982",
    status: "",
  };

  it("produces the expected 4-part embedding text", () => {
    expect(buildEmbeddingText(ANST)).toBe(
      "Lag (1982:80) om anställningsskydd — SFS 1982:80 — Arbetsmarknadsdepartementet A — Skyddar arbetstagares anställning vid uppsägning och avskedande.",
    );
  });

  it("always prepends titel first", () => {
    expect(buildEmbeddingText(ANST)).toStartWith("Lag (1982:80) om anställningsskydd");
  });

  it("always includes SFS beteckning segment", () => {
    expect(buildEmbeddingText(ANST)).toContain("SFS 1982:80");
  });

  it("parts are joined by ' — ' separator", () => {
    const text = buildEmbeddingText(ANST);
    // 3 separators for 4 parts
    const separatorCount = (text.match(/ — /g) ?? []).length;
    expect(separatorCount).toBe(3);
  });
});

// ─── Partial / missing fields ──────────────────────────────────────────────────
describe("buildEmbeddingText — missing fields are omitted gracefully", () => {
  it("omits organ when empty", () => {
    const law = {
      dok_id: "sfs-2026-1",
      beteckning: "2026:1",
      titel: "Testlag",
      datum: "2026-01-01",
      organ: "",
      summary: "Summering.",
      subtyp: "sfst",
      nummer: "1",
      rm: "2026",
      status: "",
    };
    const text = buildEmbeddingText(law);
    // organ is empty → only 3 parts
    expect(text).toBe("Testlag — SFS 2026:1 — Summering.");
    expect(text).not.toContain(" —  — "); // no empty separator
  });

  it("omits summary when empty", () => {
    const law = {
      dok_id: "sfs-2026-1",
      beteckning: "2026:1",
      titel: "Testlag",
      datum: "2026-01-01",
      organ: "Justitiedepartementet",
      summary: "",
      subtyp: "sfst",
      nummer: "1",
      rm: "2026",
      status: "",
    };
    const text = buildEmbeddingText(law);
    expect(text).toBe("Testlag — SFS 2026:1 — Justitiedepartementet");
  });

  it("handles only titel + beteckning (both organ and summary empty)", () => {
    const law = {
      dok_id: "sfs-2026-99",
      beteckning: "2026:99",
      titel: "Minimal lag",
      datum: "2026-01-01",
      organ: "",
      summary: "",
      subtyp: "sfst",
      nummer: "99",
      rm: "2026",
      status: "",
    };
    const text = buildEmbeddingText(law);
    expect(text).toBe("Minimal lag — SFS 2026:99");
  });
});

// ─── SFS beteckning format ─────────────────────────────────────────────────────
describe("buildEmbeddingText — SFS beteckning format", () => {
  it("prefixes beteckning with 'SFS ' for unambiguous vector space context", () => {
    const law = {
      dok_id: "sfs-2024-100",
      beteckning: "2024:100",
      titel: "Lag om x",
      datum: "2024-01-01",
      organ: "Test",
      summary: "",
      subtyp: "sfst",
      nummer: "100",
      rm: "2024",
      status: "",
    };
    const text = buildEmbeddingText(law);
    // Must contain "SFS 2024:100" not just "2024:100"
    expect(text).toContain("SFS 2024:100");
    expect(text).not.toContain("SFS SFS"); // no double prefix
  });

  it("beteckning format is always YYYY:NNN", () => {
    const examples = ["2026:1", "2026:245", "1982:80", "2018:672"];
    for (const bet of examples) {
      expect(bet).toMatch(/^\d{4}:\d+$/);
    }
  });
});

// ─── Swedish character handling ───────────────────────────────────────────────
describe("buildEmbeddingText — Swedish character handling", () => {
  it("preserves å, ä, ö in organ name", () => {
    const law = {
      dok_id: "sfs-2024-1",
      beteckning: "2024:1",
      titel: "Lag om föräldraledighet",
      datum: "2024-01-01",
      organ: "Socialdepartementet",
      summary: "Ger rätt till ledighet från arbete för föräldrar.",
      subtyp: "sfst",
      nummer: "1",
      rm: "2024",
      status: "",
    };
    const text = buildEmbeddingText(law);
    expect(text).toContain("föräldraledighet");
    expect(text).toContain("rätt");
    expect(text).toContain("föräldrar");
  });
});

// ─── Real law fixtures ─────────────────────────────────────────────────────────
describe("buildEmbeddingText — real law fixtures from SFS index", () => {
  const REAL_LAWS: SfsEntry[] = [
    {
      dok_id: "sfs-2018-672",
      beteckning: "2018:672",
      titel: "Lag (2018:672) om ekonomiska föreningar",
      datum: "2018-05-31",
      organ: "Justitiedepartementet L1",
      summary: "Reglerar ekonomiska föreningars bildande, organisation och verksamhet.",
      subtyp: "sfst",
      nummer: "672",
      rm: "2018",
      status: "",
    },
    {
      dok_id: "sfs-1998-204",
      beteckning: "1998:204",
      titel: "Lag (1998:204) om personuppgifter",
      datum: "1998-04-29",
      organ: "Justitiedepartementet L6",
      summary: "Har upphört att gälla.",
      subtyp: "sfst",
      nummer: "204",
      rm: "1998",
      status: "",
    },
  ];

  it("generates non-empty text for all real fixtures", () => {
    for (const law of REAL_LAWS) {
      const text = buildEmbeddingText(law);
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain(`SFS ${law.beteckning}`);
      expect(text).toContain(law.titel);
    }
  });

  it("economic associations law has correct embedding text", () => {
    const text = buildEmbeddingText(REAL_LAWS[0]);
    expect(text).toStartWith("Lag (2018:672) om ekonomiska föreningar");
    expect(text).toContain("SFS 2018:672");
    expect(text).toContain("Justitiedepartementet L1");
  });
});
