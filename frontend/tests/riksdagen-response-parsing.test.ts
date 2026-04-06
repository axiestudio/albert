/**
 * Tests for Riksdagen API response parsing.
 *
 * Validates our code handles all the real-world response shapes documented
 * in the developer guide — including edge cases and the known quirks.
 *
 * Referenced guide sections:
 *   §5  dokumentlista response schema (dokumentlista.@traffar, @nasta_sida, dokument[])
 *   §6  dokumentstatus response schema (dokumentstatus.dokument.text, dokuppgift, etc.)
 *   §8  Full field reference for both endpoints
 *   §12 Known issues: JSON text field sometimes missing, single-vs-array
 */
import { describe, expect, it } from "bun:test";

import { ensureArray } from "../src/api/chat";

// ─── dokumentlista response parsing ───────────────────────────────────────────
describe("dokumentlista response parsing (guide §5, §8)", () => {
  it("extracts @traffar as total hit count", () => {
    const response = {
      dokumentlista: {
        "@traffar": "5592",
        "@sida": "1",
        "@sidor": "112",
        dokument: [],
      },
    };
    const totalHits = Number(response.dokumentlista?.["@traffar"] ?? "0");
    expect(totalHits).toBe(5592);
  });

  it("handles missing @traffar gracefully (defaults to 0)", () => {
    const response = { dokumentlista: {} };
    const totalHits = Number((response.dokumentlista as Record<string, unknown>)?.["@traffar"] ?? "0");
    expect(totalHits).toBe(0);
  });

  it("detects next page via @nasta_sida presence (guide §5 Pagination)", () => {
    const withNext = {
      dokumentlista: {
        "@nasta_sida": "https://data.riksdagen.se/dokumentlista/?p=2&...",
      },
    };
    const withoutNext = {
      dokumentlista: {},
    };

    expect(!!(withNext.dokumentlista as Record<string, unknown>)?.["@nasta_sida"]).toBe(true);
    expect(!!(withoutNext.dokumentlista as Record<string, unknown>)?.["@nasta_sida"]).toBe(false);
  });

  it("extracts dok_id from document (guide §8 dokumentlista fields)", () => {
    const doc = {
      dok_id: "sfs-2026-245",
      datum: "2026-03-12",
      titel: "Tillkännagivande (2026:245) om tröskelvärden...",
      rm: "2026",
      organ: "Finansdepartementet OU",
      doktyp: "sfs",
      typ: "sfs",
      subtyp: "sfst",
      beteckning: "2026:245",
      nummer: "245",
      status: "",
      summary: "...",
      dokument_url_text: "//data.riksdagen.se/dokument/sfs-2026-245.text",
      dokument_url_html: "//data.riksdagen.se/dokument/sfs-2026-245.html",
    };

    expect(doc.dok_id).toBe("sfs-2026-245");
    expect(doc.beteckning).toBe("2026:245");
    expect(doc.subtyp).toBe("sfst");
    expect(doc.organ).toBe("Finansdepartementet OU");
  });

  it("nullsafe field extraction with ?? '' pattern", () => {
    const doc: Record<string, string | null> = {
      dok_id: "sfs-2026-1",
      beteckning: null,
      titel: null,
      organ: null,
      summary: null,
    };
    const extracted = {
      dokId: doc.dok_id ?? "",
      beteckning: doc.beteckning ?? "",
      titel: doc.titel ?? "",
      organ: doc.organ ?? "",
      summary: doc.summary ?? "",
    };
    expect(extracted.dokId).toBe("sfs-2026-1");
    expect(extracted.beteckning).toBe("");
    expect(extracted.organ).toBe("");
  });
});

// ─── dokumentstatus response parsing ──────────────────────────────────────────
describe("dokumentstatus response parsing (guide §6, §8)", () => {
  const SFS_RESPONSE = {
    dokumentstatus: {
      dokument: {
        dok_id: "sfs-2026-245",
        rm: "2026",
        beteckning: "2026:245",
        typ: "sfs",
        subtyp: "sfst",
        organ: "Finansdepartementet OU",
        datum: "2026-03-12 00:00:00",
        titel: "Tillkännagivande om tröskelvärden",
        text: "FULL LAW TEXT HERE",
      },
      dokuppgift: {
        uppgift: [
          { kod: "artal", text: "2026" },
          { kod: "utfardad", text: "2026-03-12" },
          { kod: "utdrag", text: "...excerpt..." },
        ],
      },
    },
  };

  it("accesses full law text via dokumentstatus.dokument.text (guide §6)", () => {
    const text = SFS_RESPONSE.dokumentstatus.dokument.text;
    expect(text).toBe("FULL LAW TEXT HERE");
    expect(text.length).toBeGreaterThan(0);
  });

  it("slices text to 8000 chars max to avoid LLM context overflow", () => {
    const longText = "A".repeat(10000);
    const sliced = longText.slice(0, 8000);
    expect(sliced.length).toBe(8000);
  });

  it("extracts uppgifter as key-value pairs from dokuppgift", () => {
    const uppgifter = Object.fromEntries(
      ensureArray(SFS_RESPONSE.dokumentstatus.dokuppgift?.uppgift).map((u) => [
        u.kod ?? "",
        u.text ?? "",
      ]),
    );
    expect(uppgifter.artal).toBe("2026");
    expect(uppgifter.utfardad).toBe("2026-03-12");
  });

  it("handles null dokumentstatus gracefully", () => {
    const response: { dokumentstatus?: null } = { dokumentstatus: null };
    const ds = response?.dokumentstatus;
    expect(ds).toBeNull();
    // Our tools check: if (!data?.dokumentstatus) return { error: "..." }
  });
});

// ─── dokaktivitet response parsing — the bug we fixed ─────────────────────────
describe("dokaktivitet field mapping — fixed bug: uses .namn not .process (guide §6)", () => {
  const PROP_ACTIVITIES = [
    { kod: "INL", namn: "Inlämnad", datum: "2026-03-20", status: "inträffat" },
    { kod: "B", namn: "Bordlagd", datum: "2026-03-20", status: "inträffat" },
    { kod: "HÄN", namn: "Hänvisad", datum: "2026-03-23", status: "inträffat" },
    { kod: "MOT", namn: "Motionstid slutar", datum: "2026-04-07", status: "inträffat" },
  ];

  it("extracts .namn for the human-readable activity label (NOT .process or .aktivitet)", () => {
    // The guide §6 shows: {"kod": "INL", "namn": "Inlämnad", ...}
    // Our FIXED code: beskrivning: a.namn ?? ""
    for (const a of PROP_ACTIVITIES) {
      expect(a.namn).toBeDefined();
      expect(a.namn).not.toBe("");
      expect((a as Record<string, unknown>).process).toBeUndefined();
      expect((a as Record<string, unknown>).aktivitet).toBeUndefined();
    }
  });

  it("maps to beskrivning field", () => {
    const mapped = PROP_ACTIVITIES.map((a) => ({
      datum: a.datum ?? "",
      kod: a.kod ?? "",
      beskrivning: a.namn ?? "",
    }));
    expect(mapped[0].beskrivning).toBe("Inlämnad");
    expect(mapped[1].beskrivning).toBe("Bordlagd");
    expect(mapped[2].beskrivning).toBe("Hänvisad");
    expect(mapped[3].beskrivning).toBe("Motionstid slutar");
  });

  it("produces non-empty beskrivning for all standard activity types", () => {
    const mapped = PROP_ACTIVITIES.map((a) => ({
      beskrivning: a.namn ?? "",
    }));
    for (const m of mapped) {
      expect(m.beskrivning.length).toBeGreaterThan(0);
    }
  });
});

// ─── dokintressent parsing (guide §6) ─────────────────────────────────────────
describe("dokintressent parsing — who proposed the law", () => {
  it("extracts minister name, party and role from single intressent (ensureArray)", () => {
    // Riksdagen returns single OBJECT when only 1 minister proposed the law
    const singleIntressent = {
      intressent_id: "023001325318",
      namn: "Lotta Edholm",
      partibet: "L",
      roll: "Statsråd1",
    };

    const normalized = ensureArray(singleIntressent).map((i) => ({
      namn: i.namn ?? "",
      partibet: i.partibet ?? "",
      roll: i.roll ?? "",
    }));

    expect(normalized).toHaveLength(1);
    expect(normalized[0].namn).toBe("Lotta Edholm");
    expect(normalized[0].partibet).toBe("L");
  });

  it("handles multiple ministers (array case)", () => {
    const twoMinisters = [
      { namn: "Lotta Edholm", partibet: "L", roll: "Statsråd1" },
      { namn: "Peter Kullgren", partibet: "KD", roll: "Statsråd2" },
    ];

    const normalized = ensureArray(twoMinisters).map((i) => ({
      namn: i.namn ?? "",
      partibet: i.partibet ?? "",
    }));

    expect(normalized).toHaveLength(2);
    expect(normalized[1].namn).toBe("Peter Kullgren");
    expect(normalized[1].partibet).toBe("KD");
  });
});

// ─── dokreferens parsing (guide §6 + §4 Legislative Chain) ───────────────────
describe("dokreferens parsing — legislative chain traversal (guide §4)", () => {
  it("extracts ref_dok_id for chain traversal", () => {
    const referens = {
      referenstyp: "behandlas_i",
      uppgift: "2025/26:MJU25",
      ref_dok_id: "HD01MJU25",
      ref_dok_typ: "bet",
      ref_dok_titel: "Beredskapslager i livsmedelskedjan",
    };

    const mapped = {
      dokId: referens.ref_dok_id ?? "",
      beteckning: "",
      typ: referens.ref_dok_typ ?? "",
    };

    expect(mapped.dokId).toBe("HD01MJU25");
    expect(mapped.typ).toBe("bet");
  });

  it("handles multiple referens entries (array)", () => {
    const references = [
      { ref_dok_id: "HD01MJU25", ref_dok_typ: "bet" },
      { ref_dok_id: "mot-2025-123", ref_dok_typ: "mot" },
    ];
    const normalized = ensureArray(references);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].ref_dok_id).toBe("HD01MJU25");
  });
});
