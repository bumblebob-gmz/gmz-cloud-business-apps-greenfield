import { NextResponse } from 'next/server';
import { createJob, getTenantById, updateJob } from '@/lib/data-store';
import {
  buildProvisionPlan,
  createCorrelationId,
  getProvisionPreflight,
  materializeProvisionFiles,
  runProvisionCommands,
  runRollbackHook
} from '@/lib/provisioning';

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
  const preflight = getProvisionPreflight();
  const plan = buildProvisionPlan(tenant);

  const job = await createJob({
    tenant: tenant.name,
    task: 'Provision Tenant Infrastructure',
    status: dryRun ? 'DryRun' : 'Queued',
    correlationId,
    details: {
      dryRun,
      preflight,
      plan,
      logs: [{ at: new Date().toISOString(), level: 'info', message: 'Provisioning request accepted.' }]
    }
  });

  const files = await materializeProvisionFiles(job.id, plan);
  const commands = plan.commands.map((command) =>
    command.replaceAll('<TFVARS_PATH>', files.tfvarsPath).replaceAll('<INVENTORY_PATH>', files.inventoryPath)
  );

  const enrichedPlan = {
    ...plan,
    commands,
    generatedFiles: files
  };

  await updateJob(job.id, {
    details: {
      ...job.details,
      plan: enrichedPlan,
      generatedFiles: files,
      logs: [
        ...(job.details?.logs ?? []),
        { at: new Date().toISOString(), level: 'info', message: `Generated tfvars and inventory in ${files.workDir}` }
      ]
    }
  });

  if (dryRun) {
    return NextResponse.json({
      mode: 'dry-run',
      message: 'Dry-run only. No commands executed.',
      correlationId,
      preflight,
      job: { ...job, details: { ...job.details, plan: enrichedPlan, generatedFiles: files } },
      plan: enrichedPlan
    });
  }

  if (!preflight.executionEnabled) {
    const reason = 'Execution disabled. Set PROVISION_EXECUTION_ENABLED=true to allow non-dry-run provisioning.';
    await updateJob(job.id, {
      status: 'Failed',
      details: {
        ...job.details,
        preflight,
        plan: enrichedPlan,
        generatedFiles: files,
        error: reason
      }
    });

    return NextResponse.json({ error: reason, correlationId, jobId: job.id, preflight, plan: enrichedPlan }, { status: 403 });
  }

  if (preflight.missingForExecution.length > 0) {
    const reason = `Missing required execution environment variables: ${preflight.missingForExecution.join(', ')}.`;
    await updateJob(job.id, {
      status: 'Failed',
      details: {
        ...job.details,
        preflight,
        plan: enrichedPlan,
        generatedFiles: files,
        error: `${reason} Provide them and retry, or run with dryRun=true.`
      }
    });

    return NextResponse.json(
      {
        error: `${reason} Provide them and retry, or run with dryRun=true.`,
        correlationId,
        jobId: job.id,
        preflight,
        plan: enrichedPlan
      },
      { status: 400 }
    );
  }

  await updateJob(job.id, { status: 'Running' });
  const result = await runProvisionCommands(commands);

  const rollbackHook = process.env.PROVISION_ROLLBACK_HOOK_CMD?.trim();
  const rollbackNeeded = Boolean(result.failedCommand && result.applySucceeded);

  const rollback = rollbackNeeded
    ? rollbackHook
      ? { attempted: true, ...(await runRollbackHook(rollbackHook)) }
      : {
          attempted: false,
          reason: 'No rollback hook configured (PROVISION_ROLLBACK_HOOK_CMD not set).'
        }
    : {
        attempted: false,
        reason: result.failedCommand ? 'Failure happened before apply completed; rollback skipped.' : 'Not needed.'
      };

  const mergedLogs = [...result.logs];
  if (rollbackNeeded) {
    if (rollback.attempted && 'at' in rollback) {
      mergedLogs.push({
        at: rollback.at,
        level: rollback.ok ? 'warn' : 'error',
        message: `Rollback hook ${rollback.ok ? 'completed' : 'failed'}: ${rollback.snippet}`
      });
    } else {
      mergedLogs.push({
        at: new Date().toISOString(),
        level: 'warn',
        message: 'Rollback skipped: PROVISION_ROLLBACK_HOOK_CMD is not set.'
      });
    }
  }

  const success = !result.failedCommand;
  const updatedJob = await updateJob(job.id, {
    status: success ? 'Success' : 'Failed',
    details: {
      ...job.details,
      preflight,
      plan: enrichedPlan,
      generatedFiles: files,
      commandResults: result.commandResults,
      commandAttempts: result.commandAttempts,
      retriesConfigured: result.retriesConfigured,
      rollback,
      logs: mergedLogs,
      outputSummary: result.outputSummary,
      error: result.failedCommand ? `Failed command: ${result.failedCommand}` : undefined
    }
  });

  return NextResponse.json({
    mode: 'execute',
    correlationId,
    preflight,
    plan: enrichedPlan,
    job: updatedJob ?? job,
    success
  });
}
