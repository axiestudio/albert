import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AlbertSupermemorySettings } from "./AlbertSupermemorySettings";
import { BrowserUseSettings } from "./BrowserUseSettings";
import { useAlbertSupermemoryStore } from "@/stores/albert-supermemory-store";
import { useBrowserUseStore } from "@/stores/browser-use-store";

const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

describe("settings modal mobile layout regressions", () => {
  beforeEach(() => {
    console.warn = () => {};
    console.error = () => {};
    useBrowserUseStore.setState({
      apiKey: "",
      enabled: false,
      keyVisible: false,
    });
    useAlbertSupermemoryStore.setState({
      apiKey: "",
      keyVisible: false,
    });
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    useBrowserUseStore.setState({
      apiKey: "",
      enabled: false,
      keyVisible: false,
    });
    useAlbertSupermemoryStore.setState({
      apiKey: "",
      keyVisible: false,
    });
  });

  it("keeps Browser Use settings inside a constrained mobile scroll container", () => {
    const markup = renderToStaticMarkup(
      <BrowserUseSettings
        authenticated
        onClose={() => {}}
        open
      />,
    );

    expect(markup).toContain("items-end justify-center overflow-y-auto overscroll-y-contain");
    expect(markup).toContain("max-h-[min(92dvh,44rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden");
    expect(markup).toContain("min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-y-contain");
    expect(markup).toContain("flex flex-col gap-2 sm:flex-row sm:items-center");
  });

  it("keeps Supermemory settings inside a constrained mobile scroll container", () => {
    const markup = renderToStaticMarkup(
      <AlbertSupermemorySettings
        onClose={() => {}}
        open
      />,
    );

    expect(markup).toContain("items-end justify-center overflow-y-auto overscroll-y-contain");
    expect(markup).toContain("max-h-[min(92dvh,44rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden");
    expect(markup).toContain("min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-y-contain");
    expect(markup).toContain("flex flex-col gap-2 sm:flex-row sm:items-center");
  });
});