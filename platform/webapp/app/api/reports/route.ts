import { NextResponse } from 'next/server';
import { listReports } from '@/lib/data-store';
import { requireOperationRole } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = requireOperationRole(request, 'GET /api/reports');
  if (!authz.ok) return authz.response;

  const items = await listReports();
  return NextResponse.json({ items });
}
