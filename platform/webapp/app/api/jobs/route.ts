import { NextResponse } from 'next/server';
import { createJob, listJobs } from '@/lib/data-store';
import type { CreateJobInput, JobStatus } from '@/lib/types';
import { requireMinimumRole } from '@/lib/auth-context';

export async function GET() {
  const items = await listJobs();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const authz = requireMinimumRole(request, 'technician', 'POST /api/jobs');
  if (!authz.ok) return authz.response;

  const body = (await request.json()) as Partial<CreateJobInput>;

  if (!body.tenant || !body.task) {
    return NextResponse.json({ error: 'Missing required job fields.' }, { status: 400 });
  }

  const allowedStatuses: JobStatus[] = ['Queued', 'Running', 'Success', 'Failed', 'DryRun'];
  if (body.status && !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid job status.' }, { status: 400 });
  }

  const item = await createJob({
    tenant: body.tenant,
    task: body.task,
    status: body.status
  });

  return NextResponse.json({ item }, { status: 201 });
}
