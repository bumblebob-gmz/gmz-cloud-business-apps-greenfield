import { NextResponse } from 'next/server';
import { listAuditEvents, parseAuditEventFilters } from '@/lib/audit';
import { requireProtectedOperation } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/audit/events');
  if (!authz.ok) return authz.response;

  const url = new URL(request.url);
  const filters = parseAuditEventFilters(url.searchParams);
  const items = await listAuditEvents(filters);

  return NextResponse.json({ items, filters });
}
