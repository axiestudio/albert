/**
 * Rate-limited transport wrapper for AssistantChatTransport.
 *
 * Implements a sliding-window token bucket:
 *   - Max N requests per window (default: 5 per 60s)
 *   - Cooldown period after hitting the limit (default: 10s)
 *   - Persists timestamps in memory (resets on page refresh — acceptable for anti-spam)
 */

import type { UIMessage } from "ai";
import { AssistantChatTransport } from "@assistant-ui/react-ai-sdk";

export type RateLimitConfig = {
  /** Max requests allowed per window */
  maxRequests: number;
  /** Window duration in ms */
  windowMs: number;
  /** Cooldown after hitting limit in ms */
  cooldownMs: number;
};

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 5,
  windowMs: 60_000,
  cooldownMs: 10_000,
};

export type RateLimitedChatTransportOptions<T extends UIMessage = UIMessage> = {
  api: string;
  headers?: Record<string, string>;
  onRateLimited?: (retryAfterMs: number) => void;
  rateLimit?: Partial<RateLimitConfig>;
};

export class RateLimitedChatTransport<
  T extends UIMessage = UIMessage,
> extends AssistantChatTransport<T> {
  private timestamps: number[] = [];
  private cooldownUntil = 0;
  private rlConfig: RateLimitConfig;
  private onRateLimited?: (retryAfterMs: number) => void;

  constructor(opts: RateLimitedChatTransportOptions<T>) {
    super({ api: opts.api, headers: opts.headers });
    this.rlConfig = { ...DEFAULT_CONFIG, ...opts.rateLimit };
    this.onRateLimited = opts.onRateLimited;
  }

  /** Check if the request should be allowed */
  private checkRateLimit(): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();

    // In cooldown period?
    if (now < this.cooldownUntil) {
      return { allowed: false, retryAfterMs: this.cooldownUntil - now };
    }

    // Purge timestamps outside the sliding window
    this.timestamps = this.timestamps.filter(
      (t) => now - t < this.rlConfig.windowMs,
    );

    if (this.timestamps.length >= this.rlConfig.maxRequests) {
      // Enter cooldown
      this.cooldownUntil = now + this.rlConfig.cooldownMs;
      return { allowed: false, retryAfterMs: this.rlConfig.cooldownMs };
    }

    this.timestamps.push(now);
    return { allowed: true, retryAfterMs: 0 };
  }

  override async sendMessages(
    options: Parameters<AssistantChatTransport<T>["sendMessages"]>[0],
  ) {
    const { allowed, retryAfterMs } = this.checkRateLimit();
    if (!allowed) {
      this.onRateLimited?.(retryAfterMs);
      throw new Error(
        `Rate limited. Please wait ${Math.ceil(retryAfterMs / 1000)}s before sending another message.`,
      );
    }
    return super.sendMessages(options);
  }
}
