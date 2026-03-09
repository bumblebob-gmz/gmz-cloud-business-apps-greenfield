import { NextResponse } from 'next/server';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { getTrustedTokenHealthSummary, requireProtectedOperation } from '@/lib/auth-context';
import { buildRotationChecklist } from '@/lib/token-rotation';

export async function POST(request: Request) {
  const correlationId = getCorrelationIdFromRequest(request);
  const authz = await requireProtectedOperation(request, 'POST /api/auth/rotation/plan');

  if (!authz.ok) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: 'unknown' },
        tenantId: 'system',
        action: 'auth.rotation.plan.denied',
        resource: 'auth-rotation',
        outcome: 'denied',
        source: { service: 'webapp', operation: 'POST /api/auth/rotation/plan' }
      })
    );
    return authz.response;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const authHealth = getTrustedTokenHealthSummary(process.env.WEBAPP_TRUSTED_TOKENS_JSON, { env: process.env });

    const plan = buildRotationChecklist(body.reason, authHealth);

    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: 'system',
        action: 'auth.rotation.plan.success',
        resource: 'auth-rotation',
        outcome: 'success',
        source: { service: 'webapp', operation: 'POST /api/auth/rotation/plan' },
        details: { reason: plan.reason }
      })
    );

    return NextResponse.json({ ...plan, correlationId });
  } catch (error) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: 'system',
        action: 'auth.rotation.plan.failure',
        resource: 'auth-rotation',
        outcome: 'failure',
        source: { service: 'webapp', operation: 'POST /api/auth/rotation/plan' },
        details: { reason: error instanceof Error ? error.message : 'unknown_error' }
      })
    );

    return NextResponse.json({ error: 'Failed to build rotation plan.', correlationId }, { status: 500 });
  }
}
