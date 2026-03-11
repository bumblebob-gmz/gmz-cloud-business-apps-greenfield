// Force Node.js runtime — this route uses node:crypto / node:fs (not Edge-compatible).
// If this file is ever moved to Edge Middleware, migrate to the Web Crypto API.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { buildAuthAlerts, type AuthAlert } from '@/lib/auth-alerts';
import { getTrustedTokenHealthSummary, requireProtectedOperation } from '@/lib/auth-context';
import { computeRoutingStatus } from '@/lib/alert-dispatch';
import { readNotificationConfig } from '@/lib/notification-config';

type RequestBody = {
  alerts?: AuthAlert[];
  reason?: 'authAlerts' | 'testAlerts';
  channels?: Array<'teams' | 'email'>;
};

export async function POST(request: Request) {
  const correlationId = getCorrelationIdFromRequest(request);
  const authz = await requireProtectedOperation(request, 'POST /api/alerts/preview-routing');
  if (!authz.ok) {
    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: 'unknown' },
      tenantId: 'system',
      action: 'alerts.preview-routing.denied',
      resource: 'alerts-routing',
      outcome: 'denied',
      source: { service: 'webapp', operation: 'POST /api/alerts/preview-routing' }
    }));
    return authz.response;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const reason = body.reason ?? 'authAlerts';
    const alerts = Array.isArray(body.alerts)
      ? body.alerts
      : buildAuthAlerts(getTrustedTokenHealthSummary(process.env.WEBAPP_TRUSTED_TOKENS_JSON, { env: process.env }));
    const config = await readNotificationConfig();
    const routing = computeRoutingStatus({ config, reason, alerts, selectedChannels: body.channels });

    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: 'system',
      action: 'alerts.preview-routing.success',
      resource: 'alerts-routing',
      outcome: 'success',
      source: { service: 'webapp', operation: 'POST /api/alerts/preview-routing' },
      details: { reason, alertsCount: alerts.length }
    }));

    return NextResponse.json({ reason, alerts, routing, correlationId });
  } catch (error) {
    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: 'system',
      action: 'alerts.preview-routing.failure',
      resource: 'alerts-routing',
      outcome: 'failure',
      source: { service: 'webapp', operation: 'POST /api/alerts/preview-routing' },
      details: { reason: error instanceof Error ? error.message : 'unknown_error' }
    }));

    return NextResponse.json({ error: 'Failed to preview alert routing.', correlationId }, { status: 500 });
  }
}
