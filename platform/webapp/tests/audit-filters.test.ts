import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAuditEvents } from '../lib/audit.ts';

const FIXTURE = [
  {
    eventId: 'evt-1-aaaaaaaa',
    timestamp: '2026-03-01T10:00:00.000Z',
    correlationId: 'corr-1-aaaaaaaa',
    actor: { type: 'user', id: 'alice', role: 'admin' },
    tenantId: 'tenant-a',
    action: 'tenant.create',
    resource: 'tenant',
    outcome: 'success',
    source: { service: 'webapp', operation: 'POST /api/tenants' }
  },
  {
    eventId: 'evt-2-bbbbbbbb',
    timestamp: '2026-03-02T10:00:00.000Z',
    correlationId: 'corr-2-bbbbbbbb',
    actor: { type: 'user', id: 'bob', role: 'technician' },
    tenantId: 'tenant-a',
    action: 'auth.guard.denied',
    resource: 'auth',
    outcome: 'denied',
    source: { service: 'webapp', operation: 'GET /api/audit/events' }
  },
  {
    eventId: 'evt-3-cccccccc',
    timestamp: '2026-03-03T10:00:00.000Z',
    correlationId: 'corr-3-cccccccc',
    actor: { type: 'service', id: 'scheduler' },
    tenantId: 'tenant-a',
    action: 'token.rotate.failed',
    resource: 'auth',
    outcome: 'failure',
    source: { service: 'webapp', operation: 'POST /api/auth/rotation/plan' }
  }
] as const;

test('filterAuditEvents supports outcome/action/operation/since/limit', () => {
  const filtered = filterAuditEvents([...FIXTURE], {
    outcome: 'failure',
    actionContains: 'rotate',
    operationContains: 'rotation',
    since: '2026-03-03T00:00:00.000Z',
    limit: 10
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.eventId, 'evt-3-cccccccc');
});

test('filterAuditEvents returns newest N after filters', () => {
  const filtered = filterAuditEvents([...FIXTURE], { limit: 2 });
  assert.deepEqual(
    filtered.map((item) => item.eventId),
    ['evt-2-bbbbbbbb', 'evt-3-cccccccc']
  );
});
