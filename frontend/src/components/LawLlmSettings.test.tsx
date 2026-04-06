import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LawLlmSettings } from './LawLlmSettings';
import { useLawLlmByokStore } from '@/stores/law-llm-byok-store';
import { useLawLlmStore } from '@/stores/law-llm-store';

const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

describe('LawLlmSettings', () => {
  beforeEach(() => {
    console.warn = () => {};
    console.error = () => {};
    useLawLlmStore.getState().clear();
    useLawLlmByokStore.setState({
      anthropicApiKey: '',
      anthropicKeyVisible: false,
      openaiApiKey: '',
      openaiKeyVisible: false,
    });
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    useLawLlmStore.getState().clear();
    useLawLlmByokStore.setState({
      anthropicApiKey: '',
      anthropicKeyVisible: false,
      openaiApiKey: '',
      openaiKeyVisible: false,
    });
  });

  it('renders separate model and key sections for each provider mode without mixing controls', () => {
    const markup = renderToStaticMarkup(
      <LawLlmSettings
        authenticated={false}
        currentMode="anthropic"
        onClose={() => {}}
        open
        userLabel="Test User"
      />,
    );

    expect(markup).toContain('Server 1');
    expect(markup).toContain('OpenAI');
    expect(markup).toContain('Anthropic');

    expect(markup).toContain('Balanced default for fast, tool-capable reasoning');
    expect(markup).toContain('Balanced default for tool use, speed, and cost');
    expect(markup).toContain('Balanced default for agentic work and coding');

    expect(markup).toContain('server-1-law-llm-model');
    expect(markup).toContain('openai-law-llm-model');
    expect(markup).toContain('anthropic-law-llm-model');
    expect(markup).toContain('openai-law-llm-api-key');
    expect(markup).toContain('anthropic-law-llm-api-key');
    expect(markup).toContain('server-1-law-llm-api-key');
    expect(markup).toContain('vertex-project-id');

    expect(markup).toContain('Aktiv');
  });

  it('keeps the modal scrollable on mobile without clipping the provider sections', () => {
    const markup = renderToStaticMarkup(
      <LawLlmSettings
        authenticated={false}
        currentMode="openai"
        onClose={() => {}}
        open
      />,
    );

    expect(markup).toContain('items-end justify-center overflow-y-auto overscroll-y-contain');
    expect(markup).toContain('flex max-h-[min(92dvh,52rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden');
    expect(markup).toContain('min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-5 sm:px-6');
  });
});