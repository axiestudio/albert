/**
 * Fallback when no browser URL is available (SSR, tests, etc.).
 * Override with the PLATFORM_BASE_URL environment variable when deploying
 * behind a custom domain.
 */
const DEFAULT_PLATFORM_BASE_URL = 'http://localhost:3000';

function getSafeCurrentUrl(currentUrl?: string): string | null {
  if (typeof currentUrl === 'string' && currentUrl.length > 0) {
    return currentUrl;
  }

  if (typeof globalThis.location !== 'undefined' && typeof globalThis.location.href === 'string') {
    return globalThis.location.href;
  }

  return null;
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host.startsWith('127.');
}

export function getPlatformBaseUrl(currentUrl?: string): string {
  const resolvedUrl = getSafeCurrentUrl(currentUrl);
  if (!resolvedUrl) {
    return DEFAULT_PLATFORM_BASE_URL;
  }

  const url = new URL(resolvedUrl);
  const host = url.hostname;

  if (isLoopbackHost(host)) {
    return 'http://localhost:8789';
  }

  // For any non-loopback host, derive the platform base from the current origin.
  return `${url.protocol}//${url.host}`;
}

export function buildPlatformAlbertUrl(currentUrl?: string): string {
  const baseUrl = getPlatformBaseUrl(currentUrl);
  const resolvedUrl = getSafeCurrentUrl(currentUrl);
  if (!resolvedUrl) {
    return new URL('/albert', baseUrl).toString();
  }

  const url = new URL(resolvedUrl);
  const pathname = url.pathname === '/'
    ? '/albert'
    : url.pathname.startsWith('/albert')
      ? url.pathname
      : `/albert${url.pathname}`;
  const albertUrl = new URL(pathname, baseUrl);

  albertUrl.search = url.search;
  albertUrl.hash = url.hash;

  return albertUrl.toString();
}
