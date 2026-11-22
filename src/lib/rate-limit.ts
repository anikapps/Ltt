/**
 * Server-side Sliding Window Rate Limiter for Tourist Verification & Emergency Endpoints.
 * Protects against brute-force guessing of passenger names, passport numbers, or contacts.
 */

interface RateBucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, RateBucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  maxAttempts = 8,
  windowMs = 10 * 60 * 1000 // 10 minutes default
): RateLimitResult {
  const now = Date.now();
  const existing = memoryBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      retryAfterSeconds: 0
    };
  }

  if (existing.count >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    };
  }

  existing.count += 1;
  memoryBuckets.set(key, existing);

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - existing.count),
    retryAfterSeconds: 0
  };
}

export function resetRateLimitKey(key: string): void {
  memoryBuckets.delete(key);
}
