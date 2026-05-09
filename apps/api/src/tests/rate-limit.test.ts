import { describe, expect, it } from "vitest";

import { FixedWindowRateLimiter } from "../services/rate-limit.js";

describe("fixed window rate limiter", () => {
  it("allows the first 10 requests and rejects the 11th with Retry-After", () => {
    let nowMs = 1_000;
    const limiter = new FixedWindowRateLimiter({ now: () => nowMs });

    for (let index = 0; index < 10; index += 1) {
      expect(limiter.check("key-a")).toMatchObject({ allowed: true });
    }

    const limited = limiter.check("key-a");

    expect(limited).toEqual({ allowed: false, retryAfterSeconds: 60 });
    nowMs += 1_000;
    expect(limiter.check("key-a")).toEqual({ allowed: false, retryAfterSeconds: 59 });
  });

  it("resets after the fixed window", () => {
    let nowMs = 1_000;
    const limiter = new FixedWindowRateLimiter({ now: () => nowMs });

    for (let index = 0; index < 10; index += 1) {
      limiter.check("key-a");
    }

    expect(limiter.check("key-a").allowed).toBe(false);

    nowMs += 60_000;

    expect(limiter.check("key-a")).toEqual({ allowed: true, remaining: 9 });
  });

  it("keeps counters independent per key", () => {
    const limiter = new FixedWindowRateLimiter();

    for (let index = 0; index < 10; index += 1) {
      expect(limiter.check("key-a").allowed).toBe(true);
    }

    expect(limiter.check("key-a").allowed).toBe(false);
    expect(limiter.check("key-b")).toEqual({ allowed: true, remaining: 9 });
  });

  it("cleans up expired buckets", () => {
    let nowMs = 1_000;
    const limiter = new FixedWindowRateLimiter({ now: () => nowMs });

    limiter.check("key-a");
    limiter.check("key-b");
    expect(limiter.size()).toBe(2);

    nowMs += 60_000;

    expect(limiter.cleanup()).toBe(2);
    expect(limiter.size()).toBe(0);
  });
});
