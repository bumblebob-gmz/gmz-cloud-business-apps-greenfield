import { NextResponse } from 'next/server';
import { createJob, getTenantById, updateJob } from '@/lib/data-store';
import {
  buildProvisionPlan,
  getProvisionPreflight,
  materializeProvisionFiles,
  runProvisionCommands,
  runRollbackHook
} from '@/lib/provisioning';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { findForbiddenSecretKeys, getExecutionSecretPresence } from '@/lib/secrets-policy';
import { requireOperationRole } from '@/lib/auth-context';

type ProvisionRequest = {
  tenantId?: string;
  dryRun?: boolean;
};

export async function POST(request: Request) {
  const authz = requireOperationRole(request, 'POST /api/provision/tenant');
  if (!authz.ok) return authz.response;

  const correlationId = getCorrelationIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as ProvisionRequest;

  const forbiddenKeys = findForbiddenSecretKeys(body);
  if (forbiddenKeys.length > 0) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: body.tenantId?.trim() || 'unknown',
        action: 'tenant.provision.failure',
        resource: 'provisioning',
        outcome: 'denied',
        source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
        details: { reason: 'forbidden_secret_keys_in_request', fields: forbiddenKeys }
      })
    );

    return NextResponse.json(
      {
        error: 'Secrets must not be provided in request payload. Use environment variables only.',
        forbiddenFields: forbiddenKeys,
        correlationId
      },
      { status: 400 }
    );
  }

  await appendAuditEvent(
    buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: body.tenantId?.trim() || 'unknown',
      action: 'tenant.provision.requested',
      resource: 'provisioning',
      outcome: 'success',
      source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
      details: { dryRun: body.dryRun ?? true }
    })
  );

  if (!body.tenantId) {
    return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 });
  }

  const tenant = await getTenantById(body.tenantId);
  if (!tenant) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: body.tenantId,
        action: 'tenant.provision.failure',
        resource: 'provisioning',
        outcome: 'failure',
        source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
        details: { reason: 'tenant_not_found' }
      })
    );

    return NextResponse.json({ error: `Tenant not found: ${body.tenantId}` }, { status: 404 });
  }

  const dryRun = body.dryRun ?? true;
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
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: tenant.id,
        action: 'tenant.provision.dryrun_planned',
        resource: 'provisioning',
        outcome: 'success',
        source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
        details: { jobId: job.id }
      })
    );

    return NextResponse.json({
      mode: 'dry-run',
      message: 'Dry-run only. No commands executed.',
      correlationId,
      preflight,
      executionSecrets: getExecutionSecretPresence(),
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

    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: tenant.id,
        action: 'tenant.provision.failure',
        resource: 'provisioning',
        outcome: 'denied',
        source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
        details: { reason: 'execution_disabled', jobId: job.id }
      })
    );

    return NextResponse.json(
      { error: reason, correlationId, jobId: job.id, preflight, executionSecrets: getExecutionSecretPresence(), plan: enrichedPlan },
      { status: 403 }
    );
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

    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: tenant.id,
        action: 'tenant.provision.failure',
        resource: 'provisioning',
        outcome: 'failure',
        source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
        details: { reason: 'missing_execution_env', missing: preflight.missingForExecution, jobId: job.id }
      })
    );

    return NextResponse.json(
      {
        error: `${reason} Provide them and retry, or run with dryRun=true.`,
        correlationId,
        jobId: job.id,
        preflight,
        executionSecrets: getExecutionSecretPresence(),
        plan: enrichedPlan
      },
      { status: 400 }
    );
  }

  await updateJob(job.id, { status: 'Running' });
  await appendAuditEvent(
    buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: tenant.id,
      action: 'tenant.provision.execution_started',
      resource: 'provisioning',
      outcome: 'success',
      source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
      details: { jobId: job.id }
    })
  );

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

  if (rollbackNeeded) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: tenant.id,
        action: rollback.attempted ? 'tenant.provision.rollback.result' : 'tenant.provision.rollback.attempted',
        resource: 'provisioning',
        outcome: rollback.attempted && 'ok' in rollback && rollback.ok === false ? 'failure' : 'success',
        source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
        details: rollback
      })
    );
  }

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

  await appendAuditEvent(
    buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: tenant.id,
      action: success ? 'tenant.provision.success' : 'tenant.provision.failure',
      resource: 'provisioning',
      outcome: success ? 'success' : 'failure',
      source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
      details: { jobId: job.id, failedStep: result.failedStep }
    })
  );

  return NextResponse.json({
    mode: 'execute',
    correlationId,
    preflight,
    executionSecrets: getExecutionSecretPresence(),
    plan: enrichedPlan,
    job: updatedJob ?? job,
    success
  });
}
