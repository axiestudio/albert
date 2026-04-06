type LawChatRateLimitConfig = {
  cooldownMs: number;
  maxRequests: number;
  windowMs: number;
};

type LawChatRateLimitEntry = {
  cooldownUntil: number;
  timestamps: number[];
};

const DEFAULT_LAW_CHAT_RATE_LIMIT_CONFIG: LawChatRateLimitConfig = {
  cooldownMs: 10_000,
  maxRequests: 5,
  windowMs: 60_000,
};

const lawChatRateLimitEntries = new Map<string, LawChatRateLimitEntry>();

export function getLawChatRateLimitClientId(readHeader: (name: string) => string | undefined): string | null {
  const cfConnectingIp = readHeader("cf-connecting-ip")?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const forwardedFor = readHeader("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  if (forwardedFor) {
    return forwardedFor;
  }

  const realIp = readHeader("x-real-ip")?.trim();
  return realIp || null;
}

export function takeLawChatRateLimitToken(
  clientId: string | null,
  now = Date.now(),
  config: LawChatRateLimitConfig = DEFAULT_LAW_CHAT_RATE_LIMIT_CONFIG,
): { allowed: boolean; retryAfterMs: number } {
  if (!clientId) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const current = lawChatRateLimitEntries.get(clientId) ?? {
    cooldownUntil: 0,
    timestamps: [],
  };

  if (now < current.cooldownUntil) {
    return {
      allowed: false,
      retryAfterMs: current.cooldownUntil - now,
    };
  }

  const timestamps = current.timestamps.filter((timestamp) => now - timestamp < config.windowMs);

  if (timestamps.length >= config.maxRequests) {
    const cooldownUntil = now + config.cooldownMs;
    lawChatRateLimitEntries.set(clientId, {
      cooldownUntil,
      timestamps,
    });

    return {
      allowed: false,
      retryAfterMs: config.cooldownMs,
    };
  }

  lawChatRateLimitEntries.set(clientId, {
    cooldownUntil: 0,
    timestamps: [...timestamps, now],
  });

  return { allowed: true, retryAfterMs: 0 };
}