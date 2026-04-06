import { describe, expect, it } from "bun:test";

import type { PrepareResult } from "@/stores/prepare-store";

import { decodePrepareResultsHeader, encodePrepareResultsHeader } from "./prepare-results";

const sampleResults: PrepareResult[] = [
  {
    b: "2021:555",
    d: "sfs-2021-555",
    dt: "2021-06-10",
    o: "Försvarsdepartementet",
    s: 0.768,
    src: "semantic",
    t: "Förordning (2021:555) med kompletterande bestämmelser till EU:s cybersäkerhet…",
  },
];

describe("prepare results header helpers", () => {
  it("encodes results into an ASCII-safe header value", () => {
    const encoded = encodePrepareResultsHeader(sampleResults);

    expect(/^[\x20-\x7E]+$/.test(encoded)).toBe(true);
    expect(() => new Headers({ "X-Prepare-Results": encoded })).not.toThrow();
  });

  it("decodes encoded header payloads back into prepare results", () => {
    const encoded = encodePrepareResultsHeader(sampleResults);

    expect(decodePrepareResultsHeader(encoded)).toEqual(sampleResults);
  });

  it("keeps compatibility with legacy plain JSON header values", () => {
    expect(decodePrepareResultsHeader(JSON.stringify(sampleResults))).toEqual(sampleResults);
  });
});
