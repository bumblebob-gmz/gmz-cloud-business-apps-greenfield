import { NextResponse } from 'next/server.js';
import {
  RBAC_POLICY,
  authorizeOperation as authorizeOperationWithPolicy,
  buildDeniedPayload,
  getRequiredRoleForOperation,
  hasMinimumRole
} from './rbac-policy.js';
import {
  getAuthContextFromRequest,
  getAuthContextFromRequestAsync,
  getTrustedTokenExpiryWarningDays,
  getTrustedTokenHealthSummary,
  parseTrustedTokensJson,
  resolveAuthMode,
  type AuthContext,
  type AuthMode,
  type TrustedTokenEntry,
  type TrustedTokenHealthSummary,
  type UserRole
} from './auth-core.ts';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from './audit.ts';

export type { UserRole, AuthMode, AuthContext, TrustedTokenEntry, TrustedTokenHealthSummary };

export type RbacOperation = keyof typeof RBAC_POLICY;

const UNAUTHORIZED_MESSAGE = 'Unauthorized: valid bearer token required for trusted-bearer mode.';

export {
  getAuthContextFromRequest,
  getAuthContextFromRequestAsync,
  parseTrustedTokensJson,
  resolveAuthMode,
  hasMinimumRole,
  getRequiredRoleForOperation,
  getTrustedTokenExpiryWarningDays,
  getTrustedTokenHealthSummary
};

export function authorizeOperation(auth: AuthContext, operation: RbacOperation) {
  return authorizeOperationWithPolicy(auth, operation);
}

function buildUnauthorizedResponse() {
  return NextResponse.json({ error: UNAUTHORIZED_MESSAGE }, { status: 401 });
}

export function buildForbiddenResponse(auth: AuthContext, operation: string, requiredRole: UserRole) {
  return NextResponse.json(buildDeniedPayload(auth, operation, requiredRole), { status: 403 });
}

async function appendDeniedAuditEvent(request: Request, params: {
  operation: string;
  requiredRole: UserRole;
  effectiveRole?: UserRole;
}) {
  await appendAuditEvent(
    buildAuditEvent({
      correlationId: getCorrelationIdFromRequest(request),
      actor: { type: 'user', id: 'unknown', ...(params.effectiveRole ? { role: params.effectiveRole } : {}) },
      tenantId: 'system',
      action: 'auth.guard.denied',
      resource: 'auth',
      outcome: 'denied',
      source: { service: 'webapp', operation: params.operation },
      details: {
        operation: params.operation,
        requiredRole: params.requiredRole,
        effectiveRole: params.effectiveRole ?? null,
        authMode: resolveAuthMode()
      }
    })
  );
}

export async function requireProtectedOperation(request: Request, operation: RbacOperation) {
  const auth = await getAuthContextFromRequestAsync(request);

  if (!auth) {
    const requiredRole = getRequiredRoleForOperation(operation);
    await appendDeniedAuditEvent(request, { operation, requiredRole });
    return { ok: false as const, response: buildUnauthorizedResponse() };
  }

  const authorization = authorizeOperation(auth, operation);
  if (!authorization.ok) {
    await appendDeniedAuditEvent(request, {
      operation,
      requiredRole: authorization.requiredRole,
      effectiveRole: auth.role
    });

    return {
      ok: false as const,
      auth,
      requiredRole: authorization.requiredRole,
      response: buildForbiddenResponse(auth, operation, authorization.requiredRole)
    };
  }

  return { ok: true as const, auth, requiredRole: authorization.requiredRole };
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
