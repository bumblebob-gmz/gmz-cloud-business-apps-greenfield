import test from 'node:test';
import assert from 'node:assert/strict';
import { maskNotificationConfig, DEFAULT_NOTIFICATION_CONFIG } from '../lib/notification-config.ts';

test('maskNotificationConfig hides webhook and smtp password', () => {
  const masked = maskNotificationConfig({
    channels: {
      teams: { ...DEFAULT_NOTIFICATION_CONFIG.channels.teams, webhookUrl: 'https://example.webhook', bySeverity: { info: true, warning: false, critical: true } },
      email: {
        ...DEFAULT_NOTIFICATION_CONFIG.channels.email,
        smtpPass: 'secret',
        recipientGroups: { ops: 'ops@example.com' },
        severityGroupMap: { warning: 'ops' }
      }
    }
  });

  assert.equal(masked.channels.teams.webhookUrl, '********');
  assert.equal(masked.channels.email.smtpPass, '********');
});
