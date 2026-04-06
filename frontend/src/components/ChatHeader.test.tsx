import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";

import { ChatHeader } from "./ChatHeader";

function createProps(overrides: Partial<ComponentProps<typeof ChatHeader>> = {}): ComponentProps<typeof ChatHeader> {
  return {
    onNewChat: () => {},
    onToggleHistory: () => {},
    signingOut: false,
    ...overrides,
  };
}

describe("ChatHeader", () => {
  it("renders the ALBERT branding and action buttons without LLM selector", () => {
    const markup = renderToStaticMarkup(<ChatHeader {...createProps()} />);

    expect(markup).toContain("ALBERT");
    expect(markup).toContain("Ny chatt");
    expect(markup).not.toContain('role="radiogroup"');
    expect(markup).not.toContain("Server 1");
    expect(markup).not.toContain("OpenAI");
    expect(markup).not.toContain("Anthropic");
  });

  it("renders sign out button when callback is provided", () => {
    const markup = renderToStaticMarkup(<ChatHeader {...createProps({ onSignOut: () => {} })} />);

    expect(markup).toContain("Logga ut");
  });
});
