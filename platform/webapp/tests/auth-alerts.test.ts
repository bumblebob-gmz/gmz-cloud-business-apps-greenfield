import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthAlerts } from '../lib/auth-alerts.ts';

test('buildAuthAlerts includes critical + warning alerts when tokens are risky', () => {
  const alerts = buildAuthAlerts({ total: 5, active: 4, expired: 1, expiringSoon: 2, warningDays: 14 });
  assert.equal(alerts.some((alert) => alert.id === 'tokens-expired' && alert.severity === 'critical'), true);
  assert.equal(alerts.some((alert) => alert.id === 'tokens-expiring-soon' && alert.severity === 'warning'), true);
});

test('buildAuthAlerts includes healthy info alert when no risks present', () => {
  const alerts = buildAuthAlerts({ total: 2, active: 2, expired: 0, expiringSoon: 0, warningDays: 14 });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.id, 'tokens-healthy');
  assert.equal(alerts[0]?.severity, 'info');
});
