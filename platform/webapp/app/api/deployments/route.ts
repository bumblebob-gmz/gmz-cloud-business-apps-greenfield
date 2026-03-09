import { NextResponse } from 'next/server';
import { listDeployments } from '@/lib/data-store';
import { requireProtectedOperation } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/deployments');
  if (!authz.ok) return authz.response;

  const items = await listDeployments();
  return NextResponse.json({ items });
}
