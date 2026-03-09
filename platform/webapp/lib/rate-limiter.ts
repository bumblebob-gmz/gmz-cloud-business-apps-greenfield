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

/**
 * Extract a stable per-client key from an HTTP request.
 * Preference order: Bearer token > X-Forwarded-For > "anonymous".
 *
 * We hash nothing here – the token itself IS the key (it's already opaque
 * within the process; we never log it).
 */
export function getClientKey(request: Request): string {
  const authHeader = request.headers.get('authorization')?.trim();
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (token) return `bearer:${token}`;
  }

  const xff = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (xff) return `ip:${xff}`;

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return `ip:${realIp}`;

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
