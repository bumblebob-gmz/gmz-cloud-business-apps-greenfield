import { NextResponse } from 'next/server';
import { createTenant, listTenants } from '@/lib/data-store';
import type { AuthMode, CreateTenantInput, TenantSize } from '@/lib/types';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { requireProtectedOperation } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/tenants');
  if (!authz.ok) return authz.response;

  const items = await listTenants();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const authz = await requireProtectedOperation(request, 'POST /api/tenants');
  if (!authz.ok) return authz.response;

  const correlationId = getCorrelationIdFromRequest(request);
  const body = (await request.json()) as Partial<CreateTenantInput>;

  await appendAuditEvent(
    buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: body.name?.trim() || 'unknown',
      action: 'tenant.create.requested',
      resource: 'tenant',
      outcome: 'success',
      source: { service: 'webapp', operation: 'POST /api/tenants' },
      details: { dryRun: false }
    })
  );

  if (!body.name || !body.customer || !body.region || !body.size || body.vlan == null || !body.authMode || !body.contactEmail || !body.maintenanceWindow) {
    return NextResponse.json({ error: 'Missing required tenant fields.' }, { status: 400 });
  }

  const tenantSizeSet: TenantSize[] = ['S', 'M', 'L', 'XL'];
  if (!tenantSizeSet.includes(body.size)) {
    return NextResponse.json({ error: 'Invalid tenant size.' }, { status: 400 });
  }

  const authModes: AuthMode[] = ['EntraID', 'LDAP', 'Local User'];
  if (!authModes.includes(body.authMode)) {
    return NextResponse.json({ error: 'Invalid auth mode.' }, { status: 400 });
  }

  const vlan = Number(body.vlan);
  if (!Number.isInteger(vlan) || vlan < 2 || vlan > 4094) {
    return NextResponse.json({ error: 'VLAN must be an integer between 2 and 4094.' }, { status: 400 });
  }

  const apps = Array.isArray(body.apps) ? body.apps.filter((app): app is string => typeof app === 'string' && app.trim().length > 0) : [];
  if (!apps.includes('authentik')) {
    return NextResponse.json({ error: 'authentik is required.' }, { status: 400 });
  }

  const authConfig = body.authConfig ?? {};
  if (body.authMode === 'EntraID' && !authConfig.entraTenantId) {
    return NextResponse.json({ error: 'EntraID Tenant ID is required.' }, { status: 400 });
  }
  if (body.authMode === 'LDAP' && !authConfig.ldapUrl) {
    return NextResponse.json({ error: 'LDAP URL is required.' }, { status: 400 });
  }
  if (body.authMode === 'Local User' && !authConfig.localAdminEmail) {
    return NextResponse.json({ error: 'Local admin email is required.' }, { status: 400 });
  }

  try {
    const { tenant, job } = await createTenant({
      name: body.name,
      customer: body.customer,
      region: body.region,
      size: body.size,
      vlan,
      authMode: body.authMode,
      authConfig: {
        entraTenantId: authConfig.entraTenantId,
        ldapUrl: authConfig.ldapUrl,
        localAdminEmail: authConfig.localAdminEmail
      },
      apps,
      maintenanceWindow: body.maintenanceWindow,
      contactEmail: body.contactEmail
    });

    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: tenant.id,
        action: 'tenant.create.success',
        resource: 'tenant',
        outcome: 'success',
        source: { service: 'webapp', operation: 'POST /api/tenants' },
        details: { tenantName: tenant.name, jobId: job.id }
      })
    );

    return NextResponse.json({ item: tenant, job, correlationId }, { status: 201 });
  } catch {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: body.name?.trim() || 'unknown',
        action: 'tenant.create.failure',
        resource: 'tenant',
        outcome: 'failure',
        source: { service: 'webapp', operation: 'POST /api/tenants' },
        details: { reason: 'create_tenant_failed' }
      })
    );

    return NextResponse.json({ error: 'Failed to create tenant.', correlationId }, { status: 500 });
  }
}
