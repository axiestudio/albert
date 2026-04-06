import { readBrowserTaskOutputFile } from "../../lib/browser-use";
import {
  LAW_SOURCE_DEFAULT_READ_CHARS,
  LAW_SOURCE_MAX_READ_CHARS,
} from "./law-config";
import { analyzeDomPage } from "./law-dom";
import { fetchLagenNuPage } from "./law-lagen";
import { buildRiksdagenDocumentUrl, fetchRiksdagenDocumentStatus } from "./law-riksdagen";
import type { LawSourceMaterialRequest } from "./law-types";

function clampLawSourceReadOffset(value?: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value ?? 0));
}

function clampLawSourceReadChars(value?: number): number {
  if (!Number.isFinite(value)) {
    return LAW_SOURCE_DEFAULT_READ_CHARS;
  }

  return Math.min(
    LAW_SOURCE_MAX_READ_CHARS,
    Math.max(1, Math.floor(value ?? LAW_SOURCE_DEFAULT_READ_CHARS)),
  );
}

function buildLawSourceChunk(content: string, offset?: number, maxChars?: number) {
  const startOffset = clampLawSourceReadOffset(offset);
  const safeMaxChars = clampLawSourceReadChars(maxChars);
  const chunk = content.slice(startOffset, startOffset + safeMaxChars);
  const endOffsetExclusive = startOffset + chunk.length;

  return {
    content: chunk,
    endOffsetExclusive,
    isComplete: endOffsetExclusive >= content.length,
    nextOffset: endOffsetExclusive < content.length ? endOffsetExclusive : null,
    startOffset,
    totalChars: content.length,
  };
}

export async function readLawSourceMaterial(request: LawSourceMaterialRequest) {
  switch (request.sourceType) {
    case "riksdagen-document": {
      const dokumentstatus = await fetchRiksdagenDocumentStatus(request.dokId);
      if (!dokumentstatus?.dokument) {
        return {
          dokId: request.dokId,
          error: `No document found for dok_id: ${request.dokId}`,
          sourceType: "riksdagen-document" as const,
          _nextAction: `Document ${request.dokId} not found when trying to continue reading. The dok_id may be incorrect — verify it with searchLaws.`,
        };
      }

      const resolvedDokId = dokumentstatus.dokument.dok_id ?? request.dokId;
      return {
        beteckning: dokumentstatus.dokument.beteckning ?? "",
        dokId: resolvedDokId,
        sourceType: "riksdagen-document" as const,
        sourceUrl: buildRiksdagenDocumentUrl(resolvedDokId),
        title: dokumentstatus.dokument.titel ?? "",
        ...buildLawSourceChunk(dokumentstatus.dokument.text ?? "", request.offset, request.maxChars),
      };
    }

    case "lagen-nu": {
      const result = await fetchLagenNuPage(request.input);
      if (result.error) {
        return {
          error: result.error,
          footnoteUrl: result.footnoteUrl,
          input: request.input,
          sourceType: "lagen-nu" as const,
          title: result.title,
          url: result.url,
        };
      }

      return {
        footnoteUrl: result.footnoteUrl,
        input: request.input,
        metadata: result.metadata,
        sfs: result.sfs,
        sourceType: "lagen-nu" as const,
        title: result.title,
        url: result.url,
        ...buildLawSourceChunk(result.fullContent ?? result.content, request.offset, request.maxChars),
      };
    }

    case "dom-page": {
      const result = await analyzeDomPage(request.url);
      if (result.error) {
        return {
          error: result.error,
          sourceType: "dom-page" as const,
          url: result.url,
        };
      }

      return {
        headingCount: result.headings.length,
        lang: result.lang,
        linkCount: result.links.length,
        metaDescription: result.metaDescription,
        sourceType: "dom-page" as const,
        tableCount: result.tables.length,
        title: result.title,
        url: result.url,
        ...buildLawSourceChunk(result.fullMainText ?? result.mainText, request.offset, request.maxChars),
      };
    }

    case "web-research-artifact": {
      if (!request.browserUseApiKey) {
        return {
          error: "Web research artifact reading requires a Browser Use API key",
          fileName: request.fileName,
          sourceType: "web-research-artifact" as const,
          taskId: request.taskId,
          _nextAction: "Browser Use API key not available. The web research artifact cannot be read until a Browser Use key is provided.",
        };
      }

      try {
        return {
          sourceType: "web-research-artifact" as const,
          taskId: request.taskId,
          ...await readBrowserTaskOutputFile(request.browserUseApiKey, request.taskId, request.fileName, {
            offset: request.offset,
            maxChars: request.maxChars,
          }),
        };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : "Failed to read web research artifact",
          fileName: request.fileName,
          sourceType: "web-research-artifact" as const,
          taskId: request.taskId,
          _nextAction: "Failed to read the browser research artifact. Try reading a different file from the outputFiles list, or use the report preview from getWebResearchResult.",
        };
      }
    }
  }
}