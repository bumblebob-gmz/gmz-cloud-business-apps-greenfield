import { NextResponse } from 'next/server';
import { getJobById } from '@/lib/data-store';
import { requireProtectedOperation } from '@/lib/auth-context';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const authz = await requireProtectedOperation(request, 'GET /api/jobs/:id');
  if (!authz.ok) return authz.response;

  const job = await getJobById(params.id);
  if (!job) {
    return NextResponse.json({ error: `Job not found: ${params.id}` }, { status: 404 });
  }

  return NextResponse.json({ job });
}
