import { createHash } from 'node:crypto';

/**
 * In-process sliding-window rate limiter.
 *
 * Uses a Map<key, number[]> where each value is an array of request timestamps
 * (epoch ms) within the current window. No external dependencies required.
 *
 * Thread-safety note: Node.js is single-threaded so Map mutations are safe
 * within a single process. In a multi-replica deployment, use an external
 * store (Redis) instead – but that is out of scope for SEC-004.
 */

export type RateLimiterConfig = {
  /** Maximum requests allowed within windowMs */
  limit: number;
  /** Rolling window length in milliseconds (default: 60 000 = 1 minute) */
  windowMs?: number;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Per-endpoint store: endpoint-key → Map<client-key, timestamp[]> */
const stores = new Map<string, Map<string, number[]>>();

function getStore(endpointKey: string): Map<string, number[]> {
  let store = stores.get(endpointKey);
  if (!store) {
    store = new Map();
    stores.set(endpointKey, store);
  }
  return store;
}

/**
 * Check whether `clientKey` is within the rate limit for `endpointKey`.
 * Records the request if allowed.
 */
export function checkRateLimit(
  endpointKey: string,
  clientKey: string,
  config: RateLimiterConfig
): RateLimitResult {
  const { limit, windowMs = 60_000 } = config;
  const now = Date.now();
  const windowStart = now - windowMs;

  const store = getStore(endpointKey);
  const timestamps = store.get(clientKey) ?? [];

  // Prune timestamps that have left the window
  const active = timestamps.filter((t) => t > windowStart);

  if (active.length >= limit) {
    // Oldest active timestamp tells us when the window will free a slot
    const oldestInWindow = active[0]!;
    const retryAfterMs = oldestInWindow + windowMs - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  // Record this request
  active.push(now);
  store.set(clientKey, active);

  return { allowed: true };
}

function hashRateLimitKey(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

/**
 * Extract a stable per-client key from an HTTP request.
 * Preference order: Bearer token (hashed) > X-Forwarded-For (validated) > "anonymous".
 *
 * Bearer tokens are hashed to avoid storing raw secrets in the rate-limit map.
 * X-Forwarded-For values are validated to prevent header injection attacks.
 */
export function getClientKey(request: Request): string {
  const authHeader = request.headers.get('authorization')?.trim();
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (token) return `bearer:${hashRateLimitKey(token)}`;
  }

  const xff = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (xff && (IPV4_RE.test(xff) || IPV6_RE.test(xff))) return `ip:${xff}`;

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp && (IPV4_RE.test(realIp) || IPV6_RE.test(realIp))) return `ip:${realIp}`;

  return 'anonymous';
}

/**
 * Clear all rate-limit state for a given endpoint (useful in tests).
 */
export function clearRateLimitStore(endpointKey?: string): void {
  if (endpointKey) {
    stores.delete(endpointKey);
  } else {
    stores.clear();
  }
}

/** Expose store size for observability / tests */
export function getRateLimitStoreSize(endpointKey: string): number {
  return stores.get(endpointKey)?.size ?? 0;
}
