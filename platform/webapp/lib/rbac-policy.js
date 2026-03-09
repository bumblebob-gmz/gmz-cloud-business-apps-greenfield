/** @typedef {'readonly' | 'technician' | 'admin'} UserRole */

/** @type {Record<UserRole, number>} */
const ROLE_RANK = {
  readonly: 1,
  technician: 2,
  admin: 3
};

/** @type {const} */
export const RBAC_POLICY = {
  'GET /api/tenants': 'readonly',
  'POST /api/tenants': 'technician',
  'GET /api/jobs': 'readonly',
  'POST /api/jobs': 'technician',
  'GET /api/deployments': 'readonly',
  'GET /api/reports': 'readonly',
  'GET /api/reports.csv': 'readonly',
  'GET /api/provision/preflight': 'readonly',
  'POST /api/provision/tenant': 'technician',
  'POST /api/setup/plan': 'technician',
  'GET /api/audit/events': 'admin',
  'GET /api/auth/health': 'admin'
};

/** @param {UserRole} role @param {UserRole} minimumRole */
export function hasMinimumRole(role, minimumRole) {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

/** @param {keyof typeof RBAC_POLICY} operation */
export function getRequiredRoleForOperation(operation) {
  return RBAC_POLICY[operation];
}

/** @param {{ role: UserRole }} auth @param {keyof typeof RBAC_POLICY} operation */
export function authorizeOperation(auth, operation) {
  const requiredRole = getRequiredRoleForOperation(operation);
  return {
    ok: hasMinimumRole(auth.role, requiredRole),
    requiredRole
  };
}

/** @param {{ userId: string, role: UserRole }} auth @param {string} operation @param {UserRole} requiredRole */
export function buildDeniedPayload(auth, operation, requiredRole) {
  return {
    error: `Forbidden: ${operation} requires ${requiredRole} role.`,
    role: auth.role,
    requiredRole,
    userId: auth.userId
  };
}
