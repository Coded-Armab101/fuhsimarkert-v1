/**
 * Minimal fixed-window rate limiter.
 *
 * ⚠️ In-memory and therefore per-process: counters reset on restart and are not
 * shared between instances. On a single Node server (how this app runs today)
 * that is enough to stop one account opening hundreds of Paystack transactions.
 * If this is ever deployed to more than one instance or to serverless, move the
 * counters to Redis/Upstash — the call signature below is deliberately the same
 * shape those libraries use, so only this file changes.
 *
 * Keyed by user id rather than IP: both callers are authenticated, and an IP is
 * shared by everyone on campus wifi.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Stop the Map growing without bound on a long-lived process. */
function evictExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the window resets. 0 when `ok` is true. */
  retryAfterSeconds: number;
};

export function rateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();

  // Cheap amortised cleanup — only sweep when the map has grown a little.
  if (buckets.size > 500) evictExpired(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * Budget for starting a Paystack transaction. Generous enough that a user
 * retrying a failed payment is never blocked, tight enough to stop scripted
 * abuse filling the Paystack dashboard.
 */
export const PAYMENT_INIT_LIMIT = { limit: 8, windowMs: 10 * 60 * 1000 };
