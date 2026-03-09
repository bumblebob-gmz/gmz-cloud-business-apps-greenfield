import { NextResponse } from 'next/server';
import { createJob, getTenantById, updateJob } from '@/lib/data-store';
import { buildProvisionPlan, createCorrelationId, runProvisionCommands } from '@/lib/provisioning';

type ProvisionRequest = {
  tenantId?: string;
  dryRun?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ProvisionRequest;

  if (!body.tenantId) {
    return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 });
  }

  const tenant = await getTenantById(body.tenantId);
  if (!tenant) {
    return NextResponse.json({ error: `Tenant not found: ${body.tenantId}` }, { status: 404 });
  }

  const dryRun = body.dryRun ?? true;
  const correlationId = createCorrelationId();
  const plan = buildProvisionPlan(tenant);

  const job = await createJob({
    tenant: tenant.name,
    task: 'Provision Tenant Infrastructure',
    status: dryRun ? 'DryRun' : 'Queued',
    correlationId,
    details: {
      dryRun,
      plan,
      logs: [{ at: new Date().toISOString(), level: 'info', message: 'Provisioning request accepted.' }]
    }
  });

  if (dryRun) {
    return NextResponse.json({
      mode: 'dry-run',
      message: 'Dry-run only. No commands executed.',
      correlationId,
      job,
      plan
    });
  }

  const executionEnabled = process.env.PROVISION_EXECUTION_ENABLED === 'true';
  if (!executionEnabled) {
    await updateJob(job.id, {
      status: 'Failed',
      details: {
        ...job.details,
        error: 'Execution denied: set PROVISION_EXECUTION_ENABLED=true to allow non-dry-run provisioning.'
      }
    });

    return NextResponse.json(
      {
        error: 'Execution disabled. Set PROVISION_EXECUTION_ENABLED=true to run provisioning commands.',
        correlationId,
        jobId: job.id,
        plan
      },
      { status: 403 }
    );
  }

  await updateJob(job.id, { status: 'Running' });
  const result = await runProvisionCommands(plan.commands);

  const success = !result.failedCommand;
  const updatedJob = await updateJob(job.id, {
    status: success ? 'Success' : 'Failed',
    details: {
      ...job.details,
      logs: result.logs,
      outputSummary: result.outputSummary,
      error: result.failedCommand ? `Failed command: ${result.failedCommand}` : undefined
    }
  });

  return NextResponse.json({
    mode: 'execute',
    correlationId,
    plan,
    job: updatedJob ?? job,
    success
  });
}
