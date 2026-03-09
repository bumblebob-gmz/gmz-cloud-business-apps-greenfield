import { NextResponse } from 'next/server';

export type UserRole = 'readonly' | 'technician' | 'admin';

export type AuthContext = {
  userId: string;
  role: UserRole;
};

const DEFAULT_USER_ID = 'dev-user';
const DEFAULT_ROLE: UserRole = 'technician';

const ROLE_RANK: Record<UserRole, number> = {
  readonly: 1,
  technician: 2,
  admin: 3
};

function normalizeRole(input: string | null): UserRole {
  const role = input?.trim().toLowerCase();
  if (role === 'admin' || role === 'technician' || role === 'readonly') {
    return role;
  }
  return DEFAULT_ROLE;
}

export function getAuthContextFromRequest(request: Request): AuthContext {
  const userId = request.headers.get('x-user-id')?.trim() || DEFAULT_USER_ID;
  const role = normalizeRole(request.headers.get('x-user-role'));

  return { userId, role };
}

export function hasMinimumRole(role: UserRole, minimumRole: UserRole) {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

export function requireMinimumRole(request: Request, minimumRole: UserRole, operation: string) {
  const auth = getAuthContextFromRequest(request);

  if (!hasMinimumRole(auth.role, minimumRole)) {
    return {
      ok: false as const,
      auth,
      response: NextResponse.json(
        {
          error: `Forbidden: ${operation} requires ${minimumRole} role.`,
          role: auth.role,
          requiredRole: minimumRole,
          userId: auth.userId
        },
        { status: 403 }
      )
    };
  }

  return { ok: true as const, auth };
}
