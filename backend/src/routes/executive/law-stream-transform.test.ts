import { describe, expect, it } from "bun:test";

import { createLawTextStreamTransform } from "./law-stream-transform";

async function readChunks(stream: ReadableStream<any>) {
  const reader = stream.getReader();
  const chunks: any[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return chunks;
    }

    chunks.push(value);
  }
}

describe("law stream transform", () => {
  it("chunks answer text at word boundaries before the finish signal", async () => {
    const transform = createLawTextStreamTransform({
      delayInMs: 0,
      _internal: {
        delay: async () => {},
      },
    });

    const stream = new ReadableStream<any>({
      start(controller) {
        controller.enqueue({ type: "text-delta", textDelta: "Detta ar ett svar" });
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    }).pipeThrough(transform({ tools: {}, stopStream: () => {} } as never));

    await expect(readChunks(stream)).resolves.toEqual([
      { type: "text-delta", textDelta: "Detta " },
      { type: "text-delta", textDelta: "ar " },
      { type: "text-delta", textDelta: "ett " },
      { type: "text-delta", textDelta: "svar" },
      { type: "finish", finishReason: "stop" },
    ]);
  });
});