import { NextResponse } from 'next/server';
import { listDeployments } from '@/lib/data-store';
import { requireOperationRole } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = requireOperationRole(request, 'GET /api/deployments');
  if (!authz.ok) return authz.response;

  const items = await listDeployments();
  return NextResponse.json({ items });
}
