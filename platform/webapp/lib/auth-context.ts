import { NextResponse } from 'next/server';
import {
  RBAC_POLICY,
  authorizeOperation as authorizeOperationWithPolicy,
  buildDeniedPayload,
  getRequiredRoleForOperation,
  hasMinimumRole
} from '@/lib/rbac-policy';

export type UserRole = 'readonly' | 'technician' | 'admin';

export type AuthContext = {
  userId: string;
  role: UserRole;
};

export type RbacOperation = keyof typeof RBAC_POLICY;

const DEFAULT_USER_ID = 'dev-user';
const DEFAULT_ROLE: UserRole = 'technician';

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

export { hasMinimumRole, getRequiredRoleForOperation };

export function authorizeOperation(auth: AuthContext, operation: RbacOperation) {
  return authorizeOperationWithPolicy(auth, operation);
}

export function buildForbiddenResponse(auth: AuthContext, operation: string, requiredRole: UserRole) {
  return NextResponse.json(buildDeniedPayload(auth, operation, requiredRole), { status: 403 });
}

export function requireOperationRole(request: Request, operation: RbacOperation) {
  const auth = getAuthContextFromRequest(request);
  const authorization = authorizeOperation(auth, operation);

  if (!authorization.ok) {
    return {
      ok: false as const,
      auth,
      requiredRole: authorization.requiredRole,
      response: buildForbiddenResponse(auth, operation, authorization.requiredRole)
    };
  }

  return { ok: true as const, auth, requiredRole: authorization.requiredRole };
}

export function requireMinimumRole(request: Request, minimumRole: UserRole, operation: string) {
  const auth = getAuthContextFromRequest(request);

  if (!hasMinimumRole(auth.role, minimumRole)) {
    return {
      ok: false as const,
      auth,
      response: buildForbiddenResponse(auth, operation, minimumRole)
    };
  }

  return { ok: true as const, auth };
}
