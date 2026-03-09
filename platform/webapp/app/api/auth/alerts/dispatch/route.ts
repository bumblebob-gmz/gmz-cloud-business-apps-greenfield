import { NextResponse } from 'next/server';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { buildAuthAlerts } from '@/lib/auth-alerts';
import { getTrustedTokenHealthSummary, requireProtectedOperation } from '@/lib/auth-context';
import { dispatchAlertsToConfiguredChannels } from '@/lib/alert-dispatch';
import { readNotificationConfig } from '@/lib/notification-config';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export async function POST(request: Request) {
  // Rate-limit: 20 requests per minute per token (SEC-004)
  const rateLimited = await applyRateLimit(request, 'POST /api/alerts/dispatch', { limit: 20 });
  if (rateLimited) return rateLimited;

  const correlationId = getCorrelationIdFromRequest(request);
  const authz = await requireProtectedOperation(request, 'POST /api/auth/alerts/dispatch');

  if (!authz.ok) {
    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: 'unknown' },
      tenantId: 'system',
      action: 'auth.alerts.dispatch.denied',
      resource: 'auth-alerts',
      outcome: 'denied',
      source: { service: 'webapp', operation: 'POST /api/auth/alerts/dispatch' }
    }));
    return authz.response;
  }

  try {
    const summary = getTrustedTokenHealthSummary(process.env.WEBAPP_TRUSTED_TOKENS_JSON, { env: process.env });
    const alerts = buildAuthAlerts(summary);
    const config = await readNotificationConfig();

    const status = await dispatchAlertsToConfiguredChannels({
      config,
      reason: 'authAlerts',
      subject: 'GMZ Cloud auth alerts',
      alerts
    });

    const success = status.some((item) => item.ok);

    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: 'system',
      action: success ? 'auth.alerts.dispatch.success' : 'auth.alerts.dispatch.failure',
      resource: 'auth-alerts',
      outcome: success ? 'success' : 'failure',
      source: { service: 'webapp', operation: 'POST /api/auth/alerts/dispatch' },
      details: { status, alertsCount: alerts.length }
    }));

    return NextResponse.json({ alerts, status, correlationId }, { status: success ? 200 : 500 });
  } catch (error) {
    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: 'system',
      action: 'auth.alerts.dispatch.failure',
      resource: 'auth-alerts',
      outcome: 'failure',
      source: { service: 'webapp', operation: 'POST /api/auth/alerts/dispatch' },
      details: { reason: error instanceof Error ? error.message : 'unknown_error' }
    }));

    return NextResponse.json({ error: 'Failed to dispatch auth alerts.', correlationId }, { status: 500 });
  }
}
