import { NextResponse } from 'next/server';
import { getTenantById } from '@/lib/data-store';
import { renderTraefikConfig } from '@/lib/traefik-config';
import { requireProtectedOperation } from '@/lib/auth-context';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authz = await requireProtectedOperation(request, 'GET /api/tenants/:id/traefik-config');
  if (!authz.ok) return authz.response;

  const tenant = await getTenantById(params.id);
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
  }

  if (!tenant.vlan) {
    return NextResponse.json({ error: 'Tenant is missing vlanId; cannot render Traefik config.' }, { status: 400 });
  }

  const appNames = tenant.apps && tenant.apps.length > 0
    ? tenant.apps
    : ['authentik'];

  const tenantSlug = tenant.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  const yaml = renderTraefikConfig({
    tenantSlug,
    vlanId: tenant.vlan,
    appNames
  });

  return new Response(yaml, {
    status: 200,
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Content-Disposition': `inline; filename="${tenantSlug}-traefik.yml"`
    }
  });
}
