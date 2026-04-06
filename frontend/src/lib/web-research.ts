type WebResearchAccessInput = {
  authenticated: boolean;
  enabled: boolean;
  apiKey: string;
};

export function canUseWebResearch({ authenticated: _authenticated, enabled, apiKey }: WebResearchAccessInput): boolean {
  return enabled && apiKey.trim().length > 0;
}

export function buildWebResearchHeaders(input: WebResearchAccessInput): Record<string, string> {
  if (!canUseWebResearch(input)) {
    return {};
  }

  return {
    "x-browser-use-key": input.apiKey.trim(),
  };
}