import { timingSafeEqual } from 'node:crypto';

export type UserRole = 'readonly' | 'technician' | 'admin';
export type AuthMode = 'dev-header' | 'trusted-bearer' | 'jwt' | 'vault';

export type AuthContext = {
  userId: string;
  role: UserRole;
};

export type TrustedTokenEntry = {
  token: string;
  userId: string;
  role: UserRole;
  tokenId?: string;
  expiresAt?: string;
};

export type TrustedTokenHealthSummary = {
  total: number;
  expired: number;
  active: number;
  expiringSoon: number;
  warningDays: number;
};

const DEFAULT_USER_ID = 'dev-user';
const DEFAULT_ROLE: UserRole = 'technician';
const DEFAULT_AUTH_MODE: AuthMode = 'trusted-bearer';
const DEFAULT_TOKEN_EXPIRY_WARNING_DAYS = 14;

function normalizeRole(input: string | null | undefined): UserRole {
  const role = input?.trim().toLowerCase();
  if (role === 'admin' || role === 'technician' || role === 'readonly') {
    return role;
  }
  return DEFAULT_ROLE;
}

function normalizeIsoTimestamp(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return null;

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function isTrustedTokenExpired(entry: TrustedTokenEntry, now = Date.now()): boolean {
  if (!entry.expiresAt) return false;
  return Date.parse(entry.expiresAt) <= now;
}

export function getTrustedTokenExpiryWarningDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.WEBAPP_TRUSTED_TOKEN_EXPIRY_WARNING_DAYS;
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_TOKEN_EXPIRY_WARNING_DAYS;
  return parsed;
}

function isTrustedTokenExpiringSoon(entry: TrustedTokenEntry, warningDays: number, now = Date.now()): boolean {
  if (!entry.expiresAt) return false;
  const expiresAtMs = Date.parse(entry.expiresAt);
  if (expiresAtMs <= now) return false;
  const warningWindowMs = warningDays * 24 * 60 * 60 * 1000;
  return expiresAtMs <= now + warningWindowMs;
}

/**
 * Returns true if dev-header mode is explicitly enabled for the current environment.
 * Requires both NODE_ENV=development AND WEBAPP_ENABLE_DEV_AUTH=true.
 */
function isDevHeaderAllowed(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'development' && env.WEBAPP_ENABLE_DEV_AUTH === 'true';
}

export function resolveAuthMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  if (env.WEBAPP_AUTH_MODE === 'trusted-bearer') return 'trusted-bearer';
  if (env.WEBAPP_AUTH_MODE === 'jwt') return 'jwt';
  if (env.WEBAPP_AUTH_MODE === 'vault') return 'vault';
  if (env.WEBAPP_AUTH_MODE === 'dev-header') {
    if (isDevHeaderAllowed(env)) return 'dev-header';
    // dev-header requested but not permitted — fall through to fail-safe default
  }
  return DEFAULT_AUTH_MODE;
}

/**
 * Startup guard: call once at application boot to detect and reject unsafe auth configuration.
 * Throws in production if dev-header mode is active. Logs a loud warning in development.
 *
 * @param env - process.env (injectable for testing)
 * @param logger - optional logger; defaults to console
 */
export function assertAuthModeSafe(
  env: NodeJS.ProcessEnv = process.env,
  logger: { warn: (msg: string) => void; error: (msg: string) => void } = console
): void {
  const mode = resolveAuthMode(env);
  const isProduction = env.NODE_ENV === 'production';

  if (mode === 'dev-header') {
    const msg =
      '[SEC-001] CRITICAL: auth mode is "dev-header" — the server trusts client-supplied ' +
      'x-user-role headers. This MUST NOT be used in production. ' +
      'Set WEBAPP_AUTH_MODE=trusted-bearer (or jwt) and remove WEBAPP_ENABLE_DEV_AUTH.';

    if (isProduction) {
      logger.error(msg);
      throw new Error(msg);
    } else {
      logger.warn(msg);
    }
  }

  // [SEC-005] Guard: vault auth mode is not yet implemented — reject at startup regardless of environment
  if (env.WEBAPP_AUTH_MODE === 'vault') {
    const msg =
      '[SEC-005] Vault auth mode is not yet implemented. Use trusted-bearer or jwt.';
    logger.error(msg);
    throw new Error(msg);
  }

  // Extra guard: if someone somehow forces dev-header env vars in production, refuse to start
  if (isProduction && env.WEBAPP_AUTH_MODE === 'dev-header') {
    const msg =
      '[SEC-001] CRITICAL: WEBAPP_AUTH_MODE=dev-header is explicitly set in NODE_ENV=production. ' +
      'This configuration is forbidden. Aborting.';
    logger.error(msg);
    throw new Error(msg);
  }
}

export function parseTrustedTokensJson(raw: string | undefined): TrustedTokenEntry[] {
  if (!raw?.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const token = typeof entry.token === 'string' ? entry.token.trim() : '';
        const userId = typeof entry.userId === 'string' ? entry.userId.trim() : '';
        const role = normalizeRole(typeof entry.role === 'string' ? entry.role : null);
        const tokenId = typeof entry.tokenId === 'string' ? entry.tokenId.trim() : '';

        let expiresAt: string | undefined;
        if (entry.expiresAt != null) {
          const normalized = normalizeIsoTimestamp(entry.expiresAt);
          if (!normalized) return null;
          expiresAt = normalized;
        }

        if (!token || !userId) return null;

        return {
          token,
          userId,
          role,
          ...(tokenId ? { tokenId } : {}),
          ...(expiresAt ? { expiresAt } : {})
        };
      })
      .filter((entry): entry is TrustedTokenEntry => Boolean(entry));
  } catch {
    return [];
  }
}

export function getTrustedTokenHealthSummary(
  rawTrustedTokensJson: string | undefined,
  options: { now?: number; warningDays?: number; env?: NodeJS.ProcessEnv } = {}
): TrustedTokenHealthSummary {
  const now = options.now ?? Date.now();
  const warningDays = options.warningDays ?? getTrustedTokenExpiryWarningDays(options.env);
  const trustedTokens = parseTrustedTokensJson(rawTrustedTokensJson);
  const expired = trustedTokens.filter((entry) => isTrustedTokenExpired(entry, now)).length;
  const expiringSoon = trustedTokens.filter((entry) => isTrustedTokenExpiringSoon(entry, warningDays, now)).length;

  return {
    total: trustedTokens.length,
    expired,
    active: trustedTokens.length - expired,
    expiringSoon,
    warningDays
  };
}

function timingSafeTokenCompare(a: string, b: string): boolean {
  // Pad both buffers to the same length before comparing so that
  // differing token lengths do not create a timing side-channel.
  // timingSafeEqual requires equal-length inputs — we always compare
  // max(lenA, lenB) bytes, which means a length mismatch still returns
  // false (padded bytes differ) without revealing which side is shorter.
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  const len = Math.max(bufA.length, bufB.length);
  const padA = Buffer.concat([bufA, Buffer.alloc(len - bufA.length)]);
  const padB = Buffer.concat([bufB, Buffer.alloc(len - bufB.length)]);
  return timingSafeEqual(padA, padB);
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')?.trim();
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getAuthContextFromTrustedBearer(request: Request, env: NodeJS.ProcessEnv): AuthContext | null {
  const token = getBearerToken(request);
  if (!token) return null;

  const trustedTokens = parseTrustedTokensJson(env.WEBAPP_TRUSTED_TOKENS_JSON);
  const match = trustedTokens.find((entry) => timingSafeTokenCompare(entry.token, token));
  if (!match || isTrustedTokenExpired(match)) return null;

  return { userId: match.userId, role: match.role };
}

function getAuthContextFromDevHeader(request: Request): AuthContext {
  const userId = request.headers.get('x-user-id')?.trim() || DEFAULT_USER_ID;
  const role = normalizeRole(request.headers.get('x-user-role'));

  return { userId, role };
}

export function getAuthContextFromRequest(request: Request, env: NodeJS.ProcessEnv = process.env): AuthContext | null {
  const mode = resolveAuthMode(env);
  if (mode === 'trusted-bearer') {
    return getAuthContextFromTrustedBearer(request, env);
  }
  // JWT mode is async – callers that need JWT support should use
  // getAuthContextFromRequestAsync() or auth-context.ts guard helpers.
  if (mode === 'jwt') {
    // Synchronous path cannot await; return null so callers fall through.
    // Async callers use getAuthContextFromRequestAsync.
    return null;
  }

  return getAuthContextFromDevHeader(request);
}

/**
 * Async variant of getAuthContextFromRequest that supports all auth modes,
 * including jwt (which requires an async JWKS fetch/cache lookup).
 */
export async function getAuthContextFromRequestAsync(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): Promise<AuthContext | null> {
  const mode = resolveAuthMode(env);
  if (mode === 'trusted-bearer') {
    return getAuthContextFromTrustedBearer(request, env);
  }
  if (mode === 'jwt') {
    // Lazy import to avoid loading jose in non-JWT deployments.
    const { getAuthContextFromJwt } = await import('./jwt-oidc.ts');
    return getAuthContextFromJwt(request, env);
  }
  return getAuthContextFromDevHeader(request);
}
