import { getTenantById } from '@/lib/data-store';
import { requireProtectedOperation } from '@/lib/auth-context';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authz = await requireProtectedOperation(request, 'GET /api/tenants/:id/ansible-inventory');
  if (!authz.ok) return authz.response;

  const tenant = await getTenantById(params.id);
  if (!tenant) {
    return Response.json({ error: 'Tenant not found.' }, { status: 404 });
  }

  const tenantSlug = tenant.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  const vmIp = tenant.ipAddress ?? `10.${tenant.vlan}.10.100`;

  const inventory = [
    '[tenant]',
    `${tenantSlug} ansible_host=${vmIp} ansible_user=debian`,
    '',
    '[tenant:vars]',
    'ansible_python_interpreter=/usr/bin/python3',
    `tenant_slug=${tenantSlug}`,
    `vlan_id=${tenant.vlan}`,
    `vm_ip=${vmIp}`,
    ''
  ].join('\n');

  return new Response(inventory, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `inline; filename="${tenantSlug}-inventory.ini"`
    }
  });
}
