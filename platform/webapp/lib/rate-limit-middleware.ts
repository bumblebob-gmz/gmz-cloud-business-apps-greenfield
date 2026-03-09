/**
 * Rate-limit middleware helper for Next.js App Router route handlers.
 *
 * Usage:
 *   const rl = applyRateLimit(request, 'POST /api/provision/tenant', { limit: 5 });
 *   if (rl) return rl; // 429 response already built
 */

import { NextResponse } from 'next/server';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from './audit.ts';
import { checkRateLimit, getClientKey, type RateLimiterConfig } from './rate-limiter.ts';

export type RateLimitOptions = RateLimiterConfig & {
  /** Optional actor info for the audit event */
  actor?: { type: 'user' | 'service'; id: string; role?: string };
};

/**
 * Checks the rate limit for the given request.
 *
 * Returns `null` when the request is allowed (caller continues normally).
 * Returns a `NextResponse` (429) when the limit is exceeded – the caller
 * should return this response immediately.
 *
 * Audit events for denials are emitted asynchronously (fire-and-forget) so
 * they never block the 429 response.
 */
export async function applyRateLimit(
  request: Request,
  endpointKey: string,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  const clientKey = getClientKey(request);
  const result = checkRateLimit(endpointKey, clientKey, options);

  if (result.allowed) {
    return null;
  }

  const { retryAfterSeconds } = result;
  const correlationId = getCorrelationIdFromRequest(request);
  const actor = options.actor ?? { type: 'service' as const, id: 'rate-limiter' };

  // Emit audit event for rate-limit denial (non-blocking)
  appendAuditEvent(
    buildAuditEvent({
      correlationId,
      actor,
      tenantId: 'system',
      action: 'rate_limit.denied',
      resource: endpointKey,
      outcome: 'denied',
      source: { service: 'webapp', operation: endpointKey },
      details: {
        clientKey,
        retryAfterSeconds,
        limit: options.limit,
        windowMs: options.windowMs ?? 60_000
      }
    })
  ).catch(() => {
    // Audit write failure must not prevent the 429 from being returned
  });

  return NextResponse.json(
    {
      error: 'Too Many Requests',
      retryAfterSeconds,
      correlationId
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Limit': String(options.limit),
        'X-RateLimit-Window': String(Math.round((options.windowMs ?? 60_000) / 1000))
      }
    }
  );
}
