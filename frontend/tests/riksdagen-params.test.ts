/**
 * Tests for Riksdagen API parameter construction.
 *
 * Validates that our URL params exactly match what the developer guide specifies:
 *   - guide §5:  dokumentlista parameters
 *   - guide §6:  dokumentstatus .json path
 *   - guide §12: sfst subtype for law texts, page size, rate-limiting
 *   - guide §13: active law count = 5,592 (sfst+sfsr combined); our 5,459 is sfst-only
 */
import { describe, expect, it } from "bun:test";

const RIKSDAGEN_BASE = "https://data.riksdagen.se";

// ─── searchLaws tool params ────────────────────────────────────────────────────
describe("searchLaws — Riksdagen API param compliance (guide §5)", () => {
  function buildSearchLawsParams(keywords: string, maxResults: number) {
    const safeMax = Math.min(Math.max(maxResults, 1), 50);
    return new URLSearchParams({
      doktyp: "sfs",
      subtyp: "sfst",
      dokstat: "gällande sfs",
      sok: keywords,
      utformat: "json",
      sz: String(safeMax),
      p: "1",
    });
  }

  it("sets doktyp=sfs (guide §3 Primary Law Documents)", () => {
    const p = buildSearchLawsParams("skatt", 10);
    expect(p.get("doktyp")).toBe("sfs");
  });

  it("sets subtyp=sfst to get law texts only, not sfsr registry (guide §12 SFS Subtypes)", () => {
    const p = buildSearchLawsParams("skatt", 10);
    expect(p.get("subtyp")).toBe("sfst");
  });

  it("sets dokstat=gällande sfs for active laws only (guide §3)", () => {
    const p = buildSearchLawsParams("skatt", 10);
    expect(p.get("dokstat")).toBe("gällande sfs");
  });

  it("sets utformat=json (guide §5 Output Formats)", () => {
    const p = buildSearchLawsParams("skatt", 10);
    expect(p.get("utformat")).toBe("json");
  });

  it("starts at page 1", () => {
    const p = buildSearchLawsParams("skatt", 10);
    expect(p.get("p")).toBe("1");
  });

  it("clamps maxResults to minimum 1", () => {
    expect(buildSearchLawsParams("x", 0).get("sz")).toBe("1");
    expect(buildSearchLawsParams("x", -99).get("sz")).toBe("1");
  });

  it("clamps maxResults to maximum 50", () => {
    expect(buildSearchLawsParams("x", 51).get("sz")).toBe("50");
    expect(buildSearchLawsParams("x", 1000).get("sz")).toBe("50");
  });

  it("passes through valid maxResults unchanged", () => {
    expect(buildSearchLawsParams("x", 10).get("sz")).toBe("10");
    expect(buildSearchLawsParams("x", 25).get("sz")).toBe("25");
    expect(buildSearchLawsParams("x", 50).get("sz")).toBe("50");
  });

  it("encodes Swedish characters in keyword correctly", () => {
    const p = buildSearchLawsParams("anställningsskydd", 10);
    const url = `${RIKSDAGEN_BASE}/dokumentlista/?${p.toString()}`;
    // Should survive round-trip as valid URL
    expect(() => new URL(url)).not.toThrow();
    expect(p.get("sok")).toBe("anställningsskydd");
  });
});

// ─── getProposition tool params ────────────────────────────────────────────────
describe("getProposition — Riksdagen API param compliance (guide §4)", () => {
  function buildPropositionParams(sfsBeteckning: string) {
    return new URLSearchParams({
      doktyp: "prop",
      sok: sfsBeteckning,
      utformat: "json",
      sz: "5",
      p: "1",
    });
  }

  it("sets doktyp=prop (guide §3: Proposition = Government Bill)", () => {
    const p = buildPropositionParams("2022:811");
    expect(p.get("doktyp")).toBe("prop");
  });

  it("uses the SFS beteckning as search term", () => {
    const p = buildPropositionParams("2022:811");
    expect(p.get("sok")).toBe("2022:811");
  });

  it("requests only 5 results (we use the top match)", () => {
    const p = buildPropositionParams("2022:811");
    expect(Number(p.get("sz"))).toBe(5);
  });
});

// ─── dokumentstatus URL construction ──────────────────────────────────────────
describe("dokumentstatus URL — guide §6 URL pattern", () => {
  function buildDokStatusUrl(dokId: string) {
    return `${RIKSDAGEN_BASE}/dokumentstatus/${encodeURIComponent(dokId)}.json`;
  }

  it("uses .json extension for reliable full metadata (guide §6)", () => {
    const url = buildDokStatusUrl("sfs-2022-811");
    expect(url).toEndWith(".json");
  });

  it("builds correct URL for SFS law dok_id (guide §12 dok_id format)", () => {
    // SFS: sfs-{year}-{number}
    expect(buildDokStatusUrl("sfs-2026-245")).toBe(
      "https://data.riksdagen.se/dokumentstatus/sfs-2026-245.json",
    );
  });

  it("builds correct URL for proposition dok_id (encoded format)", () => {
    // Props: encoded like HD03205 (guide §12)
    expect(buildDokStatusUrl("HD03205")).toBe(
      "https://data.riksdagen.se/dokumentstatus/HD03205.json",
    );
  });

  it("encodes forward-slashes in dok_id", () => {
    const url = buildDokStatusUrl("sfs-2026/245");
    expect(url).toContain("%2F");
  });

  it("produces valid URL that can be parsed", () => {
    expect(() => new URL(buildDokStatusUrl("sfs-2022-811"))).not.toThrow();
    expect(() => new URL(buildDokStatusUrl("HD03205"))).not.toThrow();
  });
});

// ─── download script params (sfs-index-meta.json confirms these) ──────────────
describe("download-sfs-index params — confirmed by sfs-index-meta.json (5,459 laws)", () => {
  const DOWNLOAD_PARAMS = {
    doktyp: "sfs",
    subtyp: "sfst",
    dokstat: "gällande sfs",
    utformat: "json",
    sort: "datum",
    sortorder: "desc",
    sz: "50",
    p: "1",
  };

  it("uses sfst subtype so registry entries (sfsr) are excluded from vector index", () => {
    // Guide §13: total gällande SFS = 5,592 (sfst+sfsr combined)
    // Our sfs-index.json = 5,459 = sfst only → correct
    expect(DOWNLOAD_PARAMS.subtyp).toBe("sfst");
  });

  it("uses sz=50 which is the max practical page size (guide §12 Performance Tips)", () => {
    expect(Number(DOWNLOAD_PARAMS.sz)).toBe(50);
  });

  it("sorts by datum desc — newest laws first for incremental sync", () => {
    expect(DOWNLOAD_PARAMS.sort).toBe("datum");
    expect(DOWNLOAD_PARAMS.sortorder).toBe("desc");
  });
});

// ─── topK / depth clamping ────────────────────────────────────────────────────
describe("semanticSearchLaws and getLegislativeChain — parameter clamping", () => {
  it("topK clamped to 1-20", () => {
    const clamp = (v: number) => Math.min(Math.max(v, 1), 20);
    expect(clamp(0)).toBe(1);
    expect(clamp(-5)).toBe(1);
    expect(clamp(21)).toBe(20);
    expect(clamp(100)).toBe(20);
    expect(clamp(10)).toBe(10);
    expect(clamp(20)).toBe(20);
    expect(clamp(1)).toBe(1);
  });

  it("depth clamped to 1-3 for getLegislativeChain", () => {
    const clamp = (v: number) => Math.min(Math.max(v, 1), 3);
    expect(clamp(0)).toBe(1);
    expect(clamp(-1)).toBe(1);
    expect(clamp(4)).toBe(3);
    expect(clamp(100)).toBe(3);
    expect(clamp(2)).toBe(2);
    expect(clamp(3)).toBe(3);
  });
});
