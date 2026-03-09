import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldDispatchChannel } from '../lib/alert-dispatch.ts';
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
