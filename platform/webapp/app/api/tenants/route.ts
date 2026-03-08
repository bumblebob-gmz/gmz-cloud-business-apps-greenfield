import { NextResponse } from 'next/server';
import { createTenant, listTenants } from '@/lib/data-store';
import type { CreateTenantInput, TenantSize } from '@/lib/types';

export async function GET() {
  const items = await listTenants();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<CreateTenantInput>;

  if (!body.name || !body.customer || !body.region || !body.size || body.vlan == null) {
    return NextResponse.json({ error: 'Missing required tenant fields.' }, { status: 400 });
  }

  const tenantSizeSet: TenantSize[] = ['S', 'M', 'L', 'XL'];
  if (!tenantSizeSet.includes(body.size)) {
    return NextResponse.json({ error: 'Invalid tenant size.' }, { status: 400 });
  }

  const vlan = Number(body.vlan);
  if (!Number.isInteger(vlan) || vlan < 2 || vlan > 4094) {
    return NextResponse.json({ error: 'VLAN must be an integer between 2 and 4094.' }, { status: 400 });
  }

  const { tenant, job } = await createTenant({
    name: body.name,
    customer: body.customer,
    region: body.region,
    size: body.size,
    vlan
  });

  return NextResponse.json({ item: tenant, job }, { status: 201 });
}
