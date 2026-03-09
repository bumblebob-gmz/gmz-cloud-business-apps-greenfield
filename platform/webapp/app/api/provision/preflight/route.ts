import { NextResponse } from 'next/server';
import { getProvisionPreflight } from '@/lib/provisioning';
import { requireOperationRole } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = requireOperationRole(request, 'GET /api/provision/preflight');
  if (!authz.ok) return authz.response;

  return NextResponse.json(getProvisionPreflight());
}
