import { NextResponse } from 'next/server';
import { createJob, listJobs } from '@/lib/data-store';
import type { CreateJobInput, JobStatus } from '@/lib/types';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { requireProtectedOperation } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/jobs');
  if (!authz.ok) return authz.response;

  const url    = new URL(request.url);
  const page   = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1',  10) || 1);
  const limit  = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const tenant = url.searchParams.get('tenant') ?? undefined;

  const all     = await listJobs();
  const filtered = tenant ? all.filter((j) => j.tenant === tenant || j.tenantName === tenant) : all;
  const total   = filtered.length;
  const items   = filtered.slice((page - 1) * limit, page * limit);

  await appendAuditEvent(
    buildAuditEvent({
      correlationId: getCorrelationIdFromRequest(request),
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: tenant ?? 'system',
      action: 'job.list',
      resource: 'job',
      outcome: 'success',
      source: { service: 'webapp', operation: 'GET /api/jobs' },
      details: { page, limit, total, tenantFilter: tenant ?? null },
    })
  );

  return NextResponse.json({ items, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function POST(request: Request) {
  const authz = await requireProtectedOperation(request, 'POST /api/jobs');
  if (!authz.ok) return authz.response;

  let body: Partial<CreateJobInput>;
  try {
    body = (await request.json()) as Partial<CreateJobInput>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

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
