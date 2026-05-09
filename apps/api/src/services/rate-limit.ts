export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export type FixedWindowRateLimiterOptions = {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
};

type RateLimitBucket = {
  windowStartMs: number;
  count: number;
};

export class FixedWindowRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(options: FixedWindowRateLimiterOptions = {}) {
    this.maxRequests = options.maxRequests ?? 10;
    this.windowMs = options.windowMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  check(key: string): RateLimitDecision {
    const nowMs = this.now();
    const bucket = this.buckets.get(key);

    if (!bucket || nowMs - bucket.windowStartMs >= this.windowMs) {
      this.buckets.set(key, { windowStartMs: nowMs, count: 1 });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    if (bucket.count >= this.maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((this.windowMs - (nowMs - bucket.windowStartMs)) / 1000),
        ),
      };
    }

    bucket.count += 1;
    return { allowed: true, remaining: this.maxRequests - bucket.count };
  }

  cleanup(): number {
    const nowMs = this.now();
    let removed = 0;

    for (const [key, bucket] of this.buckets.entries()) {
      if (nowMs - bucket.windowStartMs >= this.windowMs) {
        this.buckets.delete(key);
        removed += 1;
      }
    }

    return removed;
  }

  size(): number {
    return this.buckets.size;
  }
}

export const defaultInboundMessageRateLimiter = new FixedWindowRateLimiter();
