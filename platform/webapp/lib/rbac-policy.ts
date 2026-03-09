export type UserRole = 'readonly' | 'technician' | 'admin';

const ROLE_RANK: Record<UserRole, number> = {
  readonly: 1,
  technician: 2,
  admin: 3
};

/**
 * The central RBAC policy map.
 * Keys are the operation strings passed to requireProtectedOperation().
 * The `as const` assertion makes each value a literal type, enabling
 * keyof typeof RBAC_POLICY to produce the full union of valid operation strings
 * and providing compile-time safety at every requireProtectedOperation() call site.
 */
export const RBAC_POLICY = {
  'GET /api/tenants': 'readonly',
  'POST /api/tenants': 'technician',
  'GET /api/tenants/:id/traefik-config': 'admin',
  'GET /api/tenants/:id/ansible-inventory': 'admin',
  'GET /api/jobs': 'readonly',
  'POST /api/jobs': 'technician',
  'GET /api/deployments': 'readonly',
  'POST /api/deployments': 'technician',
  'GET /api/reports': 'readonly',
  'GET /api/reports.csv': 'readonly',
  'POST /api/reports/generate': 'admin',
  'GET /api/provision/preflight': 'readonly',
  'POST /api/provision/tenant': 'technician',
  'POST /api/setup/plan': 'technician',
  'GET /api/audit/events': 'admin',
  'GET /api/audit/events.csv': 'admin',
  'GET /api/auth/health': 'admin',
  'GET /api/auth/alerts': 'admin',
  'POST /api/auth/rotation/plan': 'admin',
  'POST /api/auth/rotation/simulate': 'admin',
  'GET /api/alerts/config': 'admin',
  'POST /api/alerts/config': 'admin',
  'POST /api/alerts/test': 'admin',
  'POST /api/alerts/preview-routing': 'admin',
  'POST /api/auth/alerts/dispatch': 'admin',
  'GET /api/monitoring/status': 'admin'
} as const satisfies Record<string, UserRole>;

/**
 * Union type of every valid RBAC operation string.
 * requireProtectedOperation() accepts RbacOperation, so TypeScript will
 * reject any call with an operation string not present in RBAC_POLICY at
 * compile time.
 */
export type RbacOperation = keyof typeof RBAC_POLICY;

export function hasMinimumRole(role: UserRole, minimumRole: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

export function getRequiredRoleForOperation(operation: RbacOperation): UserRole {
  return RBAC_POLICY[operation];
}

export function authorizeOperation(
  auth: { role: UserRole },
  operation: RbacOperation
): { ok: boolean; requiredRole: UserRole } {
  const requiredRole = getRequiredRoleForOperation(operation);
  return {
    ok: hasMinimumRole(auth.role, requiredRole),
    requiredRole
  };
}

export function buildDeniedPayload(
  auth: { userId: string; role: UserRole },
  operation: string,
  requiredRole: UserRole
): {
  error: string;
  role: UserRole;
  requiredRole: UserRole;
  userId: string;
} {
  return {
    error: `Forbidden: ${operation} requires ${requiredRole} role.`,
    role: auth.role,
    requiredRole,
    userId: auth.userId
  };
}
