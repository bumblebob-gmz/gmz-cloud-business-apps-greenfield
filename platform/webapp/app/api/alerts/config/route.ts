// Force Node.js runtime — this route uses node:crypto / node:fs (not Edge-compatible).
// If this file is ever moved to Edge Middleware, migrate to the Web Crypto API.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { requireProtectedOperation } from '@/lib/auth-context';
import { maskNotificationConfig, parseNotificationConfigPatch, readNotificationConfig, updateNotificationConfig } from '@/lib/notification-config';

export async function GET(request: Request) {
  const correlationId = getCorrelationIdFromRequest(request);
  const authz = await requireProtectedOperation(request, 'GET /api/alerts/config');
  if (!authz.ok) {
    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: 'unknown' },
      tenantId: 'system',
      action: 'alerts.config.read.denied',
      resource: 'alerts-config',
      outcome: 'denied',
      source: { service: 'webapp', operation: 'GET /api/alerts/config' }
    }));
    return authz.response;
  }

  const config = await readNotificationConfig();
  return NextResponse.json({ config: maskNotificationConfig(config), correlationId });
}

export async function POST(request: Request) {
  const correlationId = getCorrelationIdFromRequest(request);
  const authz = await requireProtectedOperation(request, 'POST /api/alerts/config');
  if (!authz.ok) {
    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: 'unknown' },
      tenantId: 'system',
      action: 'alerts.config.update.denied',
      resource: 'alerts-config',
      outcome: 'denied',
      source: { service: 'webapp', operation: 'POST /api/alerts/config' }
    }));
    return authz.response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const patch = parseNotificationConfigPatch(body);
    const next = await updateNotificationConfig(patch);

    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: 'system',
      action: 'alerts.config.update.success',
      resource: 'alerts-config',
      outcome: 'success',
      source: { service: 'webapp', operation: 'POST /api/alerts/config' }
    }));

    return NextResponse.json({ config: maskNotificationConfig(next), correlationId });
  } catch (error) {
    await appendAuditEvent(buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: 'system',
      action: 'alerts.config.update.failure',
      resource: 'alerts-config',
      outcome: 'failure',
      source: { service: 'webapp', operation: 'POST /api/alerts/config' },
      details: { reason: error instanceof Error ? error.message : 'unknown_error' }
    }));

    return NextResponse.json({ error: 'Failed to update alert config.', correlationId }, { status: 500 });
  }
}
