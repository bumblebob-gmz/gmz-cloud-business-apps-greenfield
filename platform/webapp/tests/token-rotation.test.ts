import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRotationImpactSummary, findForbiddenRotationSecretKeys } from '../lib/token-rotation.ts';

test('simulate payload validation rejects secret-like keys', () => {
  const forbidden = findForbiddenRotationSecretKeys({
    tokens: [{ tokenId: 'ops-2026', userId: 'ops-admin', role: 'admin', expiresAt: '2026-12-31T23:59:59.000Z' }],
    secret: 'nope',
    nested: { password: 'nope', token: 'nope' }
  });

  assert.deepEqual(forbidden, ['secret', 'nested.password', 'nested.token']);
});

test('computeRotationImpactSummary returns expired/expiring/active counts and priority actions', () => {
  const summary = computeRotationImpactSummary(
    [
      { tokenId: 'a', userId: 'u1', role: 'readonly', expiresAt: '2026-01-15T00:00:00.000Z' },
      { tokenId: 'b', userId: 'u2', role: 'admin', expiresAt: '2026-01-02T00:00:00.000Z' },
      { tokenId: 'c', userId: 'u3', role: 'technician', expiresAt: '2025-12-31T00:00:00.000Z' }
    ],
    { now: Date.parse('2026-01-01T00:00:00.000Z'), warningDays: 7 }
  );

  assert.equal(summary.total, 3);
  assert.equal(summary.expired, 1);
  assert.equal(summary.expiringSoon, 1);
  assert.equal(summary.active, 2);
  assert.equal(summary.warningDays, 7);
  assert.ok(summary.suggestedPriorityActions.length >= 2);
});
