export type UserRole = 'readonly' | 'technician' | 'admin';

export const RBAC_POLICY: {
  readonly 'GET /api/tenants': 'readonly';
  readonly 'POST /api/tenants': 'technician';
  readonly 'GET /api/tenants/:id/traefik-config': 'admin';
  readonly 'GET /api/tenants/:id/ansible-inventory': 'admin';
  readonly 'GET /api/jobs': 'readonly';
  readonly 'POST /api/jobs': 'technician';
  readonly 'GET /api/deployments': 'readonly';
  readonly 'GET /api/reports': 'readonly';
  readonly 'GET /api/reports.csv': 'readonly';
  readonly 'POST /api/reports/generate': 'admin';
  readonly 'GET /api/provision/preflight': 'readonly';
  readonly 'POST /api/provision/tenant': 'technician';
  readonly 'POST /api/setup/plan': 'technician';
  readonly 'GET /api/audit/events': 'admin';
  readonly 'GET /api/audit/events.csv': 'admin';
  readonly 'GET /api/auth/health': 'admin';
  readonly 'GET /api/auth/alerts': 'admin';
  readonly 'POST /api/auth/rotation/plan': 'admin';
  readonly 'POST /api/auth/rotation/simulate': 'admin';
  readonly 'GET /api/alerts/config': 'admin';
  readonly 'POST /api/alerts/config': 'admin';
  readonly 'POST /api/alerts/test': 'admin';
  readonly 'POST /api/alerts/preview-routing': 'admin';
  readonly 'POST /api/auth/alerts/dispatch': 'admin';
  readonly 'GET /api/monitoring/status': 'admin';
};

export function hasMinimumRole(role: UserRole, minimumRole: UserRole): boolean;
export function getRequiredRoleForOperation(operation: keyof typeof RBAC_POLICY): UserRole;
export function authorizeOperation(
  auth: { role: UserRole },
  operation: keyof typeof RBAC_POLICY
): { ok: boolean; requiredRole: UserRole };
export function buildDeniedPayload(
  auth: { userId: string; role: UserRole },
  operation: string,
  requiredRole: UserRole
): {
  error: string;
  role: UserRole;
  requiredRole: UserRole;
  userId: string;
};
