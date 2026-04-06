import { describe, expect, it } from "bun:test";

import {
  buildLawEvidenceCanvasItem,
  collectLawEvidenceFromMessageParts,
  splitLawResponseEvidence,
} from "./law-message-evidence";

describe("splitLawResponseEvidence", () => {
  it("removes a trailing footnotes block from the rendered message text", () => {
    const result = splitLawResponseEvidence([
      "LAS galler vid uppsagning av personliga skal [1].",
      "",
      "Footnotes:",
      "[1] Lag (1982:80) om anstallningsskydd — https://lagen.nu/1982:80",
      "[2] Prop. 1973:129 — https://data.riksdagen.se/dokument/FR03129",
    ].join("\n"));

    expect(result.displayText).toBe("LAS galler vid uppsagning av personliga skal [1].");
    expect(result.entries).toEqual([
      {
        key: "footnote:1:https://lagen.nu/1982:80",
        kind: "footnote",
        marker: "1",
        title: "Lag (1982:80) om anstallningsskydd",
        url: "https://lagen.nu/1982:80",
      },
      {
        key: "footnote:2:https://data.riksdagen.se/dokument/FR03129",
        kind: "footnote",
        marker: "2",
        title: "Prop. 1973:129",
        url: "https://data.riksdagen.se/dokument/FR03129",
      },
    ]);
  });
});

describe("collectLawEvidenceFromMessageParts", () => {
  it("prefers parsed footnotes over duplicate source parts", () => {
    const result = collectLawEvidenceFromMessageParts([
      {
        type: "text",
        text: [
          "Svar med kallor [1].",
          "",
          "Footnotes:",
          "[1] LAS — https://lagen.nu/1982:80",
        ].join("\n"),
      },
      {
        type: "source",
        id: "source-1",
        title: "LAS",
        url: "https://lagen.nu/1982:80",
      },
    ]);

    expect(result).toEqual([
      {
        key: "footnote:1:https://lagen.nu/1982:80",
        kind: "footnote",
        marker: "1",
        title: "LAS",
        url: "https://lagen.nu/1982:80",
      },
    ]);
  });
});

describe("buildLawEvidenceCanvasItem", () => {
  it("maps lagen.nu evidence to the annotated document canvas", () => {
    const item = buildLawEvidenceCanvasItem({
      key: "footnote:1:https://lagen.nu/1982:80",
      kind: "footnote",
      marker: "1",
      title: "LAS",
      url: "https://lagen.nu/1982:80",
    });

    expect(item).toMatchObject({
      type: "lagen-nu",
      htmlUrl: "https://lagen.nu/1982:80",
      subtitle: "[1]",
    });
  });

  it("derives document urls from a Riksdagen dokumentstatus footnote", () => {
    const item = buildLawEvidenceCanvasItem({
      key: "footnote:2:https://data.riksdagen.se/dokumentstatus/FR03129",
      kind: "footnote",
      marker: "2",
      title: "Prop. 1973:129",
      url: "https://data.riksdagen.se/dokumentstatus/FR03129",
    });

    expect(item).toMatchObject({
      type: "proposition",
      htmlUrl: "https://data.riksdagen.se/dokument/FR03129.html",
      textUrl: "https://data.riksdagen.se/dokument/FR03129.text",
      statusUrl: "https://data.riksdagen.se/dokumentstatus/FR03129",
    });
  });
});