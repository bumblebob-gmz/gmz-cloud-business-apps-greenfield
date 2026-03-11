// Force Node.js runtime — this route uses node:crypto / node:fs (not Edge-compatible).
// If this file is ever moved to Edge Middleware, migrate to the Web Crypto API.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createTenant, listTenants } from '@/lib/data-store';
import type { AuthMode, CreateTenantInput, TenantSize } from '@/lib/types';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { requireProtectedOperation } from '@/lib/auth-context';
import {
  buildConstraintViolationResponse,
  computeTenantIp,
  validateTenantPolicyConstraints,
} from '@/lib/tenant-policy';

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/tenants');
  if (!authz.ok) return authz.response;

  const url = new URL(request.url);
  const page  = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));

  const all   = await listTenants();
  const total = all.length;
  const items = all.slice((page - 1) * limit, page * limit);

  await appendAuditEvent(
    buildAuditEvent({
      correlationId: getCorrelationIdFromRequest(request),
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: 'system',
      action: 'tenant.list',
      resource: 'tenant',
      outcome: 'success',
      source: { service: 'webapp', operation: 'GET /api/tenants' },
      details: { page, limit, total },
    })
  );

  return NextResponse.json({ items, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function POST(request: Request) {
  const authz = await requireProtectedOperation(request, 'POST /api/tenants');
  if (!authz.ok) return authz.response;

  const correlationId = getCorrelationIdFromRequest(request);
  let body: Partial<CreateTenantInput>;
  try {
    body = (await request.json()) as Partial<CreateTenantInput>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

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

  // -------------------------------------------------------------------------
  // Basic field presence checks
  // -------------------------------------------------------------------------
  if (
    !body.name ||
    !body.customer ||
    !body.region ||
    !body.size ||
    body.vlan == null ||
    !body.authMode ||
    !body.contactEmail ||
    !body.maintenanceWindow
  ) {
    return NextResponse.json({ error: 'Missing required tenant fields.' }, { status: 400 });
  }

  const tenantSizeSet: TenantSize[] = ['S', 'M', 'L', 'XL'];
  if (!tenantSizeSet.includes(body.size)) {
    return NextResponse.json(
      {
        error: 'Invalid tenant size.',
        detail: `Allowed values: ${tenantSizeSet.join(', ')}. Each maps to defined CPU/RAM/disk limits.`,
      },
      { status: 400 }
    );
  }

  const authModes: AuthMode[] = ['EntraID', 'LDAP', 'Local User'];
  if (!authModes.includes(body.authMode)) {
    return NextResponse.json({ error: 'Invalid auth mode.' }, { status: 400 });
  }

  const vlan = Number(body.vlan);
  if (!Number.isInteger(vlan) || vlan < 2 || vlan > 4094) {
    return NextResponse.json(
      { error: 'VLAN must be an integer between 2 and 4094.' },
      { status: 400 }
    );
  }

  const apps = Array.isArray(body.apps)
    ? body.apps.filter((app): app is string => typeof app === 'string' && app.trim().length > 0)
    : [];
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

  // -------------------------------------------------------------------------
  // Tenant policy constraint enforcement (VLAN/IP rule + SIZE_MAP bounds)
  // -------------------------------------------------------------------------
  const isAdmin = authz.auth.role === 'admin';
  // policyOverride is only honoured for Admin role — other roles cannot self-grant it
  const policyOverrideRequested = isAdmin && body.policyOverride === true;

  const policyResult = validateTenantPolicyConstraints(
    {
      size: body.size,
      vlan,
      ipAddress: body.ipAddress,
    },
    policyOverrideRequested
  );

  if (!policyResult.ok) {
    // Non-admin path: hard rejection
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: body.name?.trim() || 'unknown',
        action: 'tenant.create.policy_rejected',
        resource: 'tenant',
        outcome: 'failure',
        source: { service: 'webapp', operation: 'POST /api/tenants' },
        details: {
          violations: policyResult.violations,
        },
      })
    );

    return NextResponse.json(
      buildConstraintViolationResponse(policyResult.violations),
      { status: 422 }
    );
  }

  // Admin override path: violations overridden — must be explicitly audit-logged
  if (policyOverrideRequested && policyResult.overriddenViolations && policyResult.overriddenViolations.length > 0) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: body.name?.trim() || 'unknown',
        action: 'tenant.create.policy_override',
        resource: 'tenant',
        outcome: 'success',
        source: { service: 'webapp', operation: 'POST /api/tenants' },
        details: {
          overriddenViolations: policyResult.overriddenViolations,
          adminUserId: authz.auth.userId,
          reason: 'admin_explicit_override',
        },
      })
    );
  }

  // Resolve final IP: admin override may supply a custom IP; otherwise compute from VLAN policy
  const resolvedIp =
    policyOverrideRequested && body.ipAddress ? body.ipAddress : computeTenantIp(vlan);

  // -------------------------------------------------------------------------
  // Create tenant
  // -------------------------------------------------------------------------
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
        localAdminEmail: authConfig.localAdminEmail,
      },
      apps,
      maintenanceWindow: body.maintenanceWindow,
      contactEmail: body.contactEmail,
      ipAddress: resolvedIp,
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
        details: {
          tenantName: tenant.name,
          jobId: job.id,
          ipAddress: resolvedIp,
          policyOverride: policyOverrideRequested,
        },
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
        details: { reason: 'create_tenant_failed' },
      })
    );

    return NextResponse.json({ error: 'Failed to create tenant.', correlationId }, { status: 500 });
  }
}
