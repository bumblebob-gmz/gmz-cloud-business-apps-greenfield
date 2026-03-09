import { NextResponse } from 'next/server.js';
import {
  RBAC_POLICY,
  authorizeOperation as authorizeOperationWithPolicy,
  buildDeniedPayload,
  getRequiredRoleForOperation,
  hasMinimumRole
} from './rbac-policy';
import {
  getAuthContextFromRequest,
  parseTrustedTokensJson,
  resolveAuthMode,
  type AuthContext,
  type AuthMode,
  type TrustedTokenEntry,
  type UserRole
} from './auth-core';

export type { UserRole, AuthMode, AuthContext, TrustedTokenEntry };

export type RbacOperation = keyof typeof RBAC_POLICY;

const UNAUTHORIZED_MESSAGE = 'Unauthorized: valid bearer token required for trusted-bearer mode.';

export { getAuthContextFromRequest, parseTrustedTokensJson, resolveAuthMode, hasMinimumRole, getRequiredRoleForOperation };

export function authorizeOperation(auth: AuthContext, operation: RbacOperation) {
  return authorizeOperationWithPolicy(auth, operation);
}

function buildUnauthorizedResponse() {
  return NextResponse.json({ error: UNAUTHORIZED_MESSAGE }, { status: 401 });
}

export function buildForbiddenResponse(auth: AuthContext, operation: string, requiredRole: UserRole) {
  return NextResponse.json(buildDeniedPayload(auth, operation, requiredRole), { status: 403 });
}

export function requireOperationRole(request: Request, operation: RbacOperation) {
  const auth = getAuthContextFromRequest(request);
  if (!auth) {
    return { ok: false as const, response: buildUnauthorizedResponse() };
  }

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
  if (!auth) {
    return { ok: false as const, response: buildUnauthorizedResponse() };
  }

  if (!hasMinimumRole(auth.role, minimumRole)) {
    return {
      ok: false as const,
      auth,
      response: buildForbiddenResponse(auth, operation, minimumRole)
    };
  }

  return { ok: true as const, auth };
}
