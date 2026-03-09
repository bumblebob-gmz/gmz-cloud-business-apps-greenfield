import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasMinimumRole,
  getRequiredRoleForOperation,
  authorizeOperation,
  buildDeniedPayload
} from '../lib/rbac-policy.js';

test('role ranking works for readonly/technician/admin', () => {
  assert.equal(hasMinimumRole('readonly', 'readonly'), true);
  assert.equal(hasMinimumRole('readonly', 'technician'), false);
  assert.equal(hasMinimumRole('technician', 'readonly'), true);
  assert.equal(hasMinimumRole('technician', 'admin'), false);
  assert.equal(hasMinimumRole('admin', 'readonly'), true);
  assert.equal(hasMinimumRole('admin', 'technician'), true);
});

test('policy requirements for protected GET and POST endpoints', () => {
  assert.equal(getRequiredRoleForOperation('GET /api/tenants'), 'readonly');
  assert.equal(getRequiredRoleForOperation('GET /api/jobs'), 'readonly');
  assert.equal(getRequiredRoleForOperation('GET /api/deployments'), 'readonly');
  assert.equal(getRequiredRoleForOperation('GET /api/reports'), 'readonly');
  assert.equal(getRequiredRoleForOperation('GET /api/reports.csv'), 'readonly');
  assert.equal(getRequiredRoleForOperation('GET /api/provision/preflight'), 'readonly');
  assert.equal(getRequiredRoleForOperation('POST /api/tenants'), 'technician');
  assert.equal(getRequiredRoleForOperation('POST /api/jobs'), 'technician');
  assert.equal(getRequiredRoleForOperation('GET /api/audit/events'), 'admin');
  assert.equal(getRequiredRoleForOperation('GET /api/audit/events.csv'), 'admin');
  assert.equal(getRequiredRoleForOperation('GET /api/auth/health'), 'admin');
  assert.equal(getRequiredRoleForOperation('GET /api/auth/alerts'), 'admin');
  assert.equal(getRequiredRoleForOperation('POST /api/auth/rotation/plan'), 'admin');
  assert.equal(getRequiredRoleForOperation('POST /api/auth/rotation/simulate'), 'admin');
  assert.equal(getRequiredRoleForOperation('GET /api/alerts/config'), 'admin');
  assert.equal(getRequiredRoleForOperation('POST /api/alerts/config'), 'admin');
  assert.equal(getRequiredRoleForOperation('POST /api/alerts/test'), 'admin');
  assert.equal(getRequiredRoleForOperation('POST /api/auth/alerts/dispatch'), 'admin');
});

test('denial helper contract returns consistent payload shape', () => {
  const auth = { userId: 'u-1', role: 'readonly' };
  const result = authorizeOperation(auth, 'POST /api/jobs');
  assert.equal(result.ok, false);
  assert.equal(result.requiredRole, 'technician');

  const denied = buildDeniedPayload(auth, 'POST /api/jobs', result.requiredRole);
  assert.deepEqual(denied, {
    error: 'Forbidden: POST /api/jobs requires technician role.',
    role: 'readonly',
    requiredRole: 'technician',
    userId: 'u-1'
  });
});
