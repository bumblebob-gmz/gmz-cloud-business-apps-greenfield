/**
 * JWT/OIDC authentication module.
 *
 * Validates RS256/ES256 JWTs against a remote JWKS endpoint (OIDC issuer).
 * Extracts roles from standard claims and integrates with the existing RBAC
 * system via the shared AuthContext type.
 *
 * Env vars consumed:
 *   WEBAPP_OIDC_ISSUER   – e.g. https://auth.example.com/realms/myrealm
 *   WEBAPP_OIDC_AUDIENCE – e.g. gmz-cloud-webapp
 */

import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';
import type { AuthContext, UserRole } from './auth-core.ts';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type JwtAuthConfig = {
  issuer: string;
  audience: string;
};

export type JwtClaimsResult =
  | { ok: true; userId: string; role: UserRole; claims: JWTPayload }
  | { ok: false; reason: string };

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

/**
 * Simple JWKS URL derivation.  Following OIDC discovery convention:
 *   {issuer}/.well-known/openid-configuration → jwks_uri
 * For simplicity we derive the standard path directly to avoid a round-trip
 * fetch during validation (the remote JWKS set is cached by `jose` anyway).
 */
function deriveJwksUri(issuer: string): URL {
  const base = issuer.endsWith('/') ? issuer : `${issuer}/`;
  return new URL('.well-known/jwks.json', base);
}

const VALID_ROLES = new Set<string>(['admin', 'technician', 'readonly']);
const DEFAULT_ROLE: UserRole = 'readonly';

/**
 * Extracts a UserRole from the JWT payload.
 *
 * Claim priority (first match wins):
 *   1. `roles` (string array) – Keycloak / Azure AD B2C pattern
 *   2. `role` (string)        – single-role claim
 *   3. `groups` (string array, mapped to roles)
 *
 * Falls back to `readonly` when no recognised role is found.
 */
export function extractRoleFromClaims(payload: JWTPayload): UserRole {
  // 1. `roles` array
  if (Array.isArray(payload['roles'])) {
    for (const r of payload['roles'] as unknown[]) {
      const norm = typeof r === 'string' ? r.trim().toLowerCase() : '';
      if (VALID_ROLES.has(norm)) return norm as UserRole;
    }
  }

  // 2. `role` string
  if (typeof payload['role'] === 'string') {
    const norm = payload['role'].trim().toLowerCase();
    if (VALID_ROLES.has(norm)) return norm as UserRole;
  }

  // 3. `groups` array
  if (Array.isArray(payload['groups'])) {
    for (const g of payload['groups'] as unknown[]) {
      const norm = typeof g === 'string' ? g.trim().toLowerCase() : '';
      if (VALID_ROLES.has(norm)) return norm as UserRole;
    }
  }

  return DEFAULT_ROLE;
}

/**
 * Extracts a stable userId from the JWT payload.
 *
 * Priority: `sub` → `preferred_username` → `email` → `client_id`
 */
export function extractUserIdFromClaims(payload: JWTPayload): string {
  for (const key of ['sub', 'preferred_username', 'email', 'client_id'] as const) {
    const val = payload[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return 'jwt-user';
}

// --------------------------------------------------------------------------
// JWKS cache (per-issuer, module-level, lives for the process lifetime)
// --------------------------------------------------------------------------

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUri: URL): ReturnType<typeof createRemoteJWKSet> {
  const key = jwksUri.toString();
  if (!jwksCache.has(key)) {
    jwksCache.set(key, createRemoteJWKSet(jwksUri));
  }
  return jwksCache.get(key)!;
}

/** Clears the JWKS cache – useful in tests to inject fresh mock JWKS URIs. */
export function clearJwksCache(): void {
  jwksCache.clear();
}

// --------------------------------------------------------------------------
// Core validation
// --------------------------------------------------------------------------

/**
 * Validates a raw JWT string against the configured OIDC issuer/audience.
 * Supports RS256 and ES256 signing algorithms.
 *
 * @param rawToken  Bearer token value (without "Bearer " prefix)
 * @param config    Issuer + audience from env
 * @returns         Parsed claims including userId and role, or an error reason
 */
export async function validateJwt(rawToken: string, config: JwtAuthConfig): Promise<JwtClaimsResult> {
  if (!rawToken || !config.issuer || !config.audience) {
    return { ok: false, reason: 'Missing JWT token or OIDC configuration.' };
  }

  try {
    const jwksUri = deriveJwksUri(config.issuer);
    const jwks = getJwks(jwksUri);

    const { payload } = await jwtVerify(rawToken, jwks, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256', 'ES256'],
    });

    const userId = extractUserIdFromClaims(payload);
    const role = extractRoleFromClaims(payload);

    return { ok: true, userId, role, claims: payload };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `JWT validation failed: ${message}` };
  }
}

// --------------------------------------------------------------------------
// Config resolution from env
// --------------------------------------------------------------------------

export function resolveJwtAuthConfig(env: NodeJS.ProcessEnv = process.env): JwtAuthConfig | null {
  const issuer = env.WEBAPP_OIDC_ISSUER?.trim();
  const audience = env.WEBAPP_OIDC_AUDIENCE?.trim();
  if (!issuer || !audience) return null;
  return { issuer, audience };
}

// --------------------------------------------------------------------------
// Request-level helper
// --------------------------------------------------------------------------

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')?.trim();
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Attempts to extract an AuthContext from a JWT bearer token in the request.
 * Returns null if the token is absent or invalid.
 */
export async function getAuthContextFromJwt(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): Promise<AuthContext | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  const config = resolveJwtAuthConfig(env);
  if (!config) return null;

  const result = await validateJwt(token, config);
  if (!result.ok) return null;

  return { userId: result.userId, role: result.role };
}
