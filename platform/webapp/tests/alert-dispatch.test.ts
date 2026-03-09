import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldDispatchChannel, computeRoutingStatus, resolveEmailRecipients } from '../lib/alert-dispatch.ts';
import { DEFAULT_NOTIFICATION_CONFIG } from '../lib/notification-config.ts';

test('shouldDispatchChannel respects enabled + route toggles', () => {
  const config = structuredClone(DEFAULT_NOTIFICATION_CONFIG);
  config.channels.teams.enabled = true;
  config.channels.teams.routes.authAlerts = false;
  config.channels.email.enabled = true;
  config.channels.email.routes.authAlerts = true;

  assert.equal(shouldDispatchChannel(config, 'teams', 'authAlerts'), false);
  assert.equal(shouldDispatchChannel(config, 'email', 'authAlerts'), true);
});

test('computeRoutingStatus enforces per-severity rules', () => {
  const config = structuredClone(DEFAULT_NOTIFICATION_CONFIG);
  config.channels.teams.enabled = true;
  config.channels.email.enabled = true;
  config.channels.teams.bySeverity.warning = false;
  config.channels.email.bySeverity.critical = false;

  const routing = computeRoutingStatus({
    config,
    reason: 'authAlerts',
    alerts: [
      { id: 'tokens-healthy', severity: 'info', title: 'ok', recommendation: 'ok', metrics: { expired: 0, expiringSoon: 0, total: 0, warningDays: 14 } },
      { id: 'tokens-expiring-soon', severity: 'warning', title: 'warn', recommendation: 'warn', metrics: { expired: 0, expiringSoon: 1, total: 1, warningDays: 14 } },
      { id: 'tokens-expired', severity: 'critical', title: 'crit', recommendation: 'crit', metrics: { expired: 1, expiringSoon: 0, total: 1, warningDays: 14 } }
    ]
  });

  const teams = routing.find((x) => x.channel === 'teams');
  const email = routing.find((x) => x.channel === 'email');
  assert.ok(teams);
  assert.ok(email);
  assert.equal(teams!.decisions.find((x) => x.severity === 'warning')?.deliver, false);
  assert.equal(email!.decisions.find((x) => x.severity === 'critical')?.deliver, false);
});

test('resolveEmailRecipients uses severity group mapping when present', () => {
  const config = structuredClone(DEFAULT_NOTIFICATION_CONFIG);
  config.channels.email.to = 'default@example.com';
  config.channels.email.recipientGroups = {
    ops: 'ops1@example.com,ops2@example.com',
    management: 'mgmt@example.com'
  };
  config.channels.email.severityGroupMap = { critical: 'management', warning: 'ops' };

  const warning = resolveEmailRecipients(config, 'warning');
  const critical = resolveEmailRecipients(config, 'critical');
  const info = resolveEmailRecipients(config, 'info');

  assert.deepEqual(warning.recipients, ['ops1@example.com', 'ops2@example.com']);
  assert.equal(warning.recipientGroup, 'ops');
  assert.deepEqual(critical.recipients, ['mgmt@example.com']);
  assert.deepEqual(info.recipients, ['default@example.com']);
});
