/**
 * Tests for the ensureArray utility
 *
 * Riksdagen API quirk (developer guide §12 "Known Issues"):
 * When a document has exactly 1 related item (intressent, aktivitet, referens, etc.),
 * the API returns a single OBJECT instead of an array. ensureArray normalises this.
 */
import { describe, expect, it } from "bun:test";

import { ensureArray } from "../src/api/chat";

describe("ensureArray — Riksdagen single-object quirk (guide §12)", () => {
  it("returns [] for null", () => {
    expect(ensureArray(null)).toEqual([]);
  });

  it("returns [] for undefined", () => {
    expect(ensureArray(undefined)).toEqual([]);
  });

  it("returns [] for empty array", () => {
    expect(ensureArray([])).toEqual([]);
  });

  it("wraps a single object in an array", () => {
    const obj = { namn: "Lotta Edholm", partibet: "L", roll: "Statsråd1" };
    expect(ensureArray(obj)).toEqual([obj]);
  });

  it("returns existing array unchanged", () => {
    const arr = [
      { namn: "Lotta Edholm", partibet: "L" },
      { namn: "Peter Kullgren", partibet: "KD" },
    ];
    expect(ensureArray(arr)).toEqual(arr);
  });

  it("wraps a single string in an array", () => {
    expect(ensureArray("sfs-2022-811")).toEqual(["sfs-2022-811"]);
  });

  it("wraps a single number in an array", () => {
    expect(ensureArray(42)).toEqual([42]);
  });

  it("wraps a single boolean in an array", () => {
    expect(ensureArray(true)).toEqual([true]);
    expect(ensureArray(false)).toEqual([false]);
  });

  // Realistic Riksdagen API edge cases
  it("handles single aktivitet object (1-item timeline)", () => {
    const singleActivity = {
      kod: "INL",
      namn: "Inlämnad",
      datum: "2026-03-20",
      status: "inträffat",
    };
    const result = ensureArray(singleActivity);
    expect(result).toHaveLength(1);
    expect(result[0].namn).toBe("Inlämnad");
  });

  it("handles array of aktiviteter (multi-item timeline)", () => {
    const activities = [
      { kod: "INL", namn: "Inlämnad", datum: "2026-03-20" },
      { kod: "HÄN", namn: "Hänvisad", datum: "2026-03-23" },
      { kod: "MOT", namn: "Motionstid slutar", datum: "2026-04-07" },
    ];
    const result = ensureArray(activities);
    expect(result).toHaveLength(3);
    expect(result[1].namn).toBe("Hänvisad");
  });

  it("handles single referens object (1 dokreferens)", () => {
    const singleRef = {
      ref_dok_id: "HD03205",
      ref_dok_typ: "prop",
      ref_dok_titel: "Beredskapslager i livsmedelskedjan",
    };
    const result = ensureArray(singleRef);
    expect(result).toHaveLength(1);
    expect(result[0].ref_dok_id).toBe("HD03205");
  });
});
