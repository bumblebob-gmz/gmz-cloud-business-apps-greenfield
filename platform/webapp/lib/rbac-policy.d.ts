export type UserRole = 'readonly' | 'technician' | 'admin';

export const RBAC_POLICY: {
  readonly 'GET /api/tenants': 'readonly';
  readonly 'POST /api/tenants': 'technician';
  readonly 'GET /api/jobs': 'readonly';
  readonly 'POST /api/jobs': 'technician';
  readonly 'GET /api/deployments': 'readonly';
  readonly 'GET /api/reports': 'readonly';
  readonly 'GET /api/reports.csv': 'readonly';
  readonly 'GET /api/provision/preflight': 'readonly';
  readonly 'POST /api/provision/tenant': 'technician';
  readonly 'POST /api/setup/plan': 'technician';
  readonly 'GET /api/audit/events': 'admin';
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
