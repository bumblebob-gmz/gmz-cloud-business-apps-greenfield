// Force Node.js runtime — this route uses node:crypto / node:fs (not Edge-compatible).
// If this file is ever moved to Edge Middleware, migrate to the Web Crypto API.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { listAuditEvents, parseAuditEventFilters, toAuditEventsCsv } from '@/lib/audit';
import { requireProtectedOperation } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/audit/events.csv');
  if (!authz.ok) return authz.response;

  const url = new URL(request.url);
  const filters = parseAuditEventFilters(url.searchParams);
  const items = await listAuditEvents(filters);
  const csv = toAuditEventsCsv(items);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="audit-events.csv"',
      'Cache-Control': 'no-store'
    }
  });
}
