export type UserRole = 'readonly' | 'technician' | 'admin';
export type AuthMode = 'dev-header' | 'trusted-bearer';

export type AuthContext = {
  userId: string;
  role: UserRole;
};

export type TrustedTokenEntry = {
  token: string;
  userId: string;
  role: UserRole;
};

const DEFAULT_USER_ID = 'dev-user';
const DEFAULT_ROLE: UserRole = 'technician';
const DEFAULT_AUTH_MODE: AuthMode = 'dev-header';

function normalizeRole(input: string | null | undefined): UserRole {
  const role = input?.trim().toLowerCase();
  if (role === 'admin' || role === 'technician' || role === 'readonly') {
    return role;
  }
  return DEFAULT_ROLE;
}

export function resolveAuthMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  return env.WEBAPP_AUTH_MODE === 'trusted-bearer' ? 'trusted-bearer' : DEFAULT_AUTH_MODE;
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

        if (!token || !userId) return null;
        return { token, userId, role };
      })
      .filter((entry): entry is TrustedTokenEntry => Boolean(entry));
  } catch {
    return [];
  }
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
  const match = trustedTokens.find((entry) => entry.token === token);
  if (!match) return null;

  return { userId: match.userId, role: match.role };
}

function getAuthContextFromDevHeader(request: Request): AuthContext {
  const userId = request.headers.get('x-user-id')?.trim() || DEFAULT_USER_ID;
  const role = normalizeRole(request.headers.get('x-user-role'));

  return { userId, role };
}

export function getAuthContextFromRequest(request: Request, env: NodeJS.ProcessEnv = process.env): AuthContext | null {
  if (resolveAuthMode(env) === 'trusted-bearer') {
    return getAuthContextFromTrustedBearer(request, env);
  }

  return getAuthContextFromDevHeader(request);
}
