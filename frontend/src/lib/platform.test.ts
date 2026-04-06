import { describe, expect, it } from 'bun:test';

import {
  buildPlatformAlbertUrl,
  getPlatformBaseUrl,
} from './platform';

describe('platform URL resolution', () => {
  it('falls back to localhost without a browser location', () => {
    expect(getPlatformBaseUrl()).toBe('http://localhost:3000');
  });

  it('derives platform base from current origin', () => {
    const currentUrl = 'https://law.example.com/';

    expect(getPlatformBaseUrl(currentUrl)).toBe('https://law.example.com');
    expect(buildPlatformAlbertUrl(currentUrl)).toBe('https://law.example.com/albert');
  });

  it('uses the local gateway during development', () => {
    const currentUrl = 'http://localhost:3000/';

    expect(getPlatformBaseUrl(currentUrl)).toBe('http://localhost:8789');
    expect(buildPlatformAlbertUrl(currentUrl)).toBe('http://localhost:8789/albert');
  });

  it('preserves dedicated Albert room paths through the platform URL', () => {
    const currentUrl = 'https://law.example.com/chat/wehgowjgow3jhoj3w4o?tab=history';

    expect(buildPlatformAlbertUrl(currentUrl)).toBe(
      'https://law.example.com/albert/chat/wehgowjgow3jhoj3w4o?tab=history',
    );
  });
});
