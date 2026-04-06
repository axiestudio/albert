import { smoothStream, type StreamTextTransform, type ToolSet } from "ai";

export type LawTextStreamTransformOptions = {
  delayInMs?: number;
  _internal?: {
    delay?: (ms: number | null) => Promise<void>;
  };
};

export function createLawTextStreamTransform<TOOLS extends ToolSet = ToolSet>(
  options: LawTextStreamTransformOptions = {},
): StreamTextTransform<TOOLS> {
  return smoothStream<TOOLS>({
    chunking: "word",
    delayInMs: options.delayInMs ?? 12,
    ...(options._internal ? { _internal: options._internal } : {}),
  });
}