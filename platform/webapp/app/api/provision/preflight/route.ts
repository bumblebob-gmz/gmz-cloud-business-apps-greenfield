// Force Node.js runtime — this route uses node:crypto / node:fs (not Edge-compatible).
// If this file is ever moved to Edge Middleware, migrate to the Web Crypto API.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getProvisionPreflight } from '@/lib/provisioning';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { requireProtectedOperation } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/provision/preflight');
  if (!authz.ok) return authz.response;

  const correlationId = getCorrelationIdFromRequest(request);
  const preflight = getProvisionPreflight();

  await appendAuditEvent(
    buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: 'system',
      action: 'provision.preflight.checked',
      resource: 'provisioning',
      outcome: 'success',
      source: { service: 'webapp', operation: 'GET /api/provision/preflight' },
      details: {
        ready: preflight.ready,
        executionEnabled: preflight.executionEnabled,
        missingForExecution: preflight.missingForExecution
      }
    })
  );

  return NextResponse.json(preflight);
}
