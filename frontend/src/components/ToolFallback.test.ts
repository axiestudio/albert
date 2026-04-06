import { describe, expect, it } from "bun:test";

import { extractCanvasItem } from "./ToolFallback";

describe("ToolFallback browser research canvas mapping", () => {
  it("shows artifact metadata for web research results", () => {
    const item = extractCanvasItem("getWebResearchResult", "browser-research", {
      taskId: "task-1",
      status: "finished",
      isSuccess: true,
      output: "# Findings\n\n- Example",
      outputFormat: "markdown-file",
      outputFiles: ["research-report.md"],
      artifactFiles: ["todo.md", "research-report.md"],
      stepCount: 7,
    }) as Record<string, unknown>;

    expect(item.title).toBe("Webbforskningsrapport");
    expect(item.subtitle).toBe("research-report.md");
    expect(item.content).toBe("# Findings\n\n- Example");
    expect(item.metadata).toMatchObject({
      Status: "finished",
      Success: true,
      Steps: 7,
      Format: "markdown-file",
      Artifacts: "todo.md, research-report.md",
    });
  });

  it("keeps scratch-only artifacts visible without treating them as the main report", () => {
    const item = extractCanvasItem("getWebResearchResult", "browser-research", {
      taskId: "task-2",
      status: "finished",
      isSuccess: false,
      output: "Structured browser-use output",
      outputFormat: "text",
      outputFiles: [],
      artifactFiles: ["todo.md"],
      stepCount: 15,
    }) as Record<string, unknown>;

    expect(item.title).toBe("Webbforskning — finished");
    expect(item.subtitle).toBe("1 artifacts");
    expect(item.content).toBe("Structured browser-use output");
    expect(item.metadata).toMatchObject({
      Status: "finished",
      Success: false,
      Steps: 15,
      Format: "text",
      Artifacts: "todo.md",
    });
  });
});
