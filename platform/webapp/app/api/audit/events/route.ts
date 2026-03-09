import { NextResponse } from 'next/server';
import { listAuditEvents } from '@/lib/audit';
import { requireOperationRole } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = requireOperationRole(request, 'GET /api/audit/events');
  if (!authz.ok) return authz.response;

  const url = new URL(request.url);
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
  const limit = Number.isFinite(requested) ? requested : 50;

  const items = await listAuditEvents(limit);
  return NextResponse.json({ items, limit: Math.max(1, Math.min(200, limit)) });
}
