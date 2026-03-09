/**
 * Next.js Edge Middleware
 *
 * Runs before every request. Currently handles:
 *   1. CORS headers (ARCH-005)
 *      - Reads WEBAPP_ALLOWED_ORIGINS (comma-separated origin list)
 *      - Validates Origin header against the allow-list
 *      - Sets Access-Control-Allow-Origin accordingly
 *      - Handles OPTIONS preflight requests with a 204 short-circuit
 *      - Default: same-origin only (no wildcard, no open CORS)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

/**
 * Parse WEBAPP_ALLOWED_ORIGINS into a Set of lowercase origin strings.
 * Origins must be in the form "scheme://host[:port]" (no trailing slash).
 * Empty or missing env var → empty set (same-origin only).
 */
function getAllowedOrigins(): Set<string> {
  const raw = process.env.WEBAPP_ALLOWED_ORIGINS ?? '';
  if (!raw.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((o) => o.trim().toLowerCase().replace(/\/$/, ''))
      .filter(Boolean)
  );
}

/**
 * Determine the Access-Control-Allow-Origin value for the given request Origin.
 *
 * Rules:
 *  - If no Origin header is present → no CORS header added (same-origin request)
 *  - If the origin is in the allow-list → reflect it exactly
 *  - Otherwise → null (origin not allowed; no CORS header, browser will block)
 */
function resolveAllowOrigin(origin: string | null, allowedOrigins: Set<string>): string | null {
  if (!origin) return null;
  const normalized = origin.trim().toLowerCase().replace(/\/$/, '');
  if (allowedOrigins.has(normalized)) return origin; // reflect original casing
  return null;
}

// Standard CORS headers for preflight and simple cross-origin requests
const CORS_ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const CORS_ALLOW_HEADERS = 'Content-Type, Authorization, X-Requested-With, X-Correlation-ID';
const CORS_MAX_AGE = '86400'; // 24 h preflight cache

// ---------------------------------------------------------------------------
// Middleware entry point
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin = resolveAllowOrigin(origin, allowedOrigins);

  // OPTIONS preflight – short-circuit with 204
  if (request.method === 'OPTIONS') {
    const preflightHeaders: Record<string, string> = {
      'Access-Control-Allow-Methods': CORS_ALLOW_METHODS,
      'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
      'Access-Control-Max-Age': CORS_MAX_AGE,
      'Vary': 'Origin',
    };

    if (allowOrigin) {
      preflightHeaders['Access-Control-Allow-Origin'] = allowOrigin;
      preflightHeaders['Access-Control-Allow-Credentials'] = 'true';
    }

    return new NextResponse(null, { status: 204, headers: preflightHeaders });
  }

  // Normal request – continue, then annotate response with CORS headers
  const response = NextResponse.next();

  if (allowOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowOrigin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
    response.headers.set('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
  }

  // Always add Vary: Origin so caches key on it
  response.headers.set('Vary', 'Origin');

  return response;
}

// ---------------------------------------------------------------------------
// Matcher – run on all routes except Next.js internals and static assets
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    /*
     * Match everything except:
     *   - _next/static  (static files)
     *   - _next/image   (image optimisation)
     *   - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
