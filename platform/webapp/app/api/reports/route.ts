import { NextResponse } from 'next/server';
import { listReports } from '@/lib/data-store';
import { requireProtectedOperation } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/reports');
  if (!authz.ok) return authz.response;

  const items = await listReports();
  return NextResponse.json({ items });
}
