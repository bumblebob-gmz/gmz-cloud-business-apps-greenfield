import { NextResponse } from 'next/server';
import { requireProtectedOperation } from '@/lib/auth-context';
import { getTenantById } from '@/lib/data-store';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const correlationId = getCorrelationIdFromRequest(request);
  const authz = await requireProtectedOperation(request, 'GET /api/tenants/:id/documenso');
  if (!authz.ok) return authz.response;

  const tenant = await getTenantById(params.id);
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  // Derive the Documenso URL from the tenant's app list
  const hasDocumenso = Array.isArray(tenant.apps) && tenant.apps.includes('documenso');
  const domain = `sign.${tenant.name.toLowerCase().replace(/\s+/g, '-')}.irongeeks.eu`;
  const status = hasDocumenso ? 'provisioned' : 'not_installed';

  await appendAuditEvent(
    buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: tenant.id,
      action: 'documenso.accessed',
      resource: 'documenso',
      outcome: 'success',
      source: { service: 'webapp', operation: 'GET /api/tenants/:id/documenso' },
      details: { tenantId: tenant.id, status }
    })
  );

  return NextResponse.json({
    tenantId: tenant.id,
    tenantName: tenant.name,
    documenso: {
      status,
      url: status === 'provisioned' ? `https://${domain}` : null,
      domain: status === 'provisioned' ? domain : null,
      version: null
    }
  });
}
