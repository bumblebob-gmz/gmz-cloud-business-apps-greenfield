// Force Node.js runtime — this route uses node:crypto / node:fs (not Edge-compatible).
// If this file is ever moved to Edge Middleware, migrate to the Web Crypto API.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { requireProtectedOperation } from '@/lib/auth-context';
import { dispatchAlertsToConfiguredChannels } from '@/lib/alert-dispatch';
import { readNotificationConfig } from '@/lib/notification-config';
import type { AuthAlert } from '@/lib/auth-alerts';

type RequestBody = { channels?: Array<'teams' | 'email'> };

const TEST_ALERT: AuthAlert = {
  id: 'tokens-healthy',
  severity: 'info',
  title: 'Test notification from Admin Security',
  recommendation: 'If you can read this, alert channel delivery is configured correctly.',
  metrics: { expired: 0, expiringSoon: 0, total: 0, warningDays: 14 }
};

export async function POST(request: Request) {
  const correlationId = getCorrelationIdFromRequest(request);
  const authz = await requireProtectedOperation(request, 'POST /api/alerts/test');
  if (!authz.ok) {
    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: 'unknown' },
      tenantId: 'system',
      action: 'alerts.test.denied',
      resource: 'alerts',
      outcome: 'denied',
      source: { service: 'webapp', operation: 'POST /api/alerts/test' }
    }));
    return authz.response;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const config = await readNotificationConfig();
    const status = await dispatchAlertsToConfiguredChannels({
      config,
      reason: 'testAlerts',
      subject: 'GMZ Cloud alert test',
      alerts: [TEST_ALERT],
      selectedChannels: body.channels
    });

    const success = status.some((item) => item.ok);
    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: 'system',
      action: success ? 'alerts.test.success' : 'alerts.test.failure',
      resource: 'alerts',
      outcome: success ? 'success' : 'failure',
      source: { service: 'webapp', operation: 'POST /api/alerts/test' },
      details: { status }
    }));

    return NextResponse.json({ status, correlationId }, { status: success ? 200 : 500 });
  } catch (error) {
    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: 'system',
      action: 'alerts.test.failure',
      resource: 'alerts',
      outcome: 'failure',
      source: { service: 'webapp', operation: 'POST /api/alerts/test' },
      details: { reason: error instanceof Error ? error.message : 'unknown_error' }
    }));

    return NextResponse.json({ error: 'Failed to send test alert.', correlationId }, { status: 500 });
  }
}
