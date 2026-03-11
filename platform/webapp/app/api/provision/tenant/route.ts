// Force Node.js runtime — this route uses node:crypto / node:fs (not Edge-compatible).
// If this file is ever moved to Edge Middleware, migrate to the Web Crypto API.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createJob, getTenantById, updateJob } from '@/lib/data-store';
import {
  buildProvisionPlan,
  getProvisionPreflight,
  materializeProvisionFiles,
  runRollbackHook
} from '@/lib/provisioning';
import { runProvisioningEngine } from '@/lib/provisioning-engine';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { findForbiddenSecretKeys, getExecutionSecretPresence } from '@/lib/secrets-policy';
import { requireProtectedOperation } from '@/lib/auth-context';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

type ProvisionRequest = {
  tenantId?: string;
  dryRun?: boolean;
};

/**
 * Background worker: executes provisioning after the HTTP response has been sent.
 * Called via setImmediate so it does not block the request lifecycle.
 */
async function runProvisioningInBackground(
  jobId: string,
  tenantId: string,
  correlationId: string,
  actor: { type: 'user'; id: string; role: string },
  dryRun: boolean
): Promise<void> {
  try {
    const { getTenantById: getTenant } = await import('@/lib/data-store');
    const tenant = await getTenant(tenantId);
    if (!tenant) {
      await updateJob(jobId, {
        status: 'Failed',
        details: { error: `Tenant not found: ${tenantId}`, phases: [], logs: [] }
      });
      return;
    }

    const preflight = getProvisionPreflight();
    const plan = buildProvisionPlan(tenant);

    // ── Materialise files (tfvars + inventory) ──────────────────────────────
    const files = await materializeProvisionFiles(jobId, plan);
    const commands = plan.commands.map((command) =>
      command.replaceAll('<TFVARS_PATH>', files.tfvarsPath).replaceAll('<INVENTORY_PATH>', files.inventoryPath)
    );
    const enrichedPlan = { ...plan, commands, generatedFiles: files };

    await updateJob(jobId, {
      details: {
        dryRun,
        plan: enrichedPlan,
        generatedFiles: files,
        phases: [],
        logs: [
          { at: new Date().toISOString(), level: 'info', message: 'Provisioning request accepted.' },
          { at: new Date().toISOString(), level: 'info', message: `Generated tfvars and inventory in ${files.workDir}` }
        ]
      }
    });

    // ── Execution guard ─────────────────────────────────────────────────────
    if (!dryRun && !preflight.executionEnabled) {
      const reason = 'Execution disabled. Set PROVISION_EXECUTION_ENABLED=true to allow non-dry-run provisioning.';
      await updateJob(jobId, {
        status: 'Failed',
        details: { preflight, plan: enrichedPlan, generatedFiles: files, error: reason, phases: [], logs: [] }
      });
      await appendAuditEvent(
        buildAuditEvent({
          correlationId,
          actor,
          tenantId: tenant.id,
          action: 'tenant.provision.failure',
          resource: 'provisioning',
          outcome: 'denied',
          source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
          details: { reason: 'execution_disabled', jobId }
        })
      );
      return;
    }

    if (!dryRun && preflight.missingForExecution.length > 0) {
      const reason = `Missing required execution environment variables: ${preflight.missingForExecution.join(', ')}.`;
      await updateJob(jobId, {
        status: 'Failed',
        details: {
          preflight,
          plan: enrichedPlan,
          generatedFiles: files,
          error: `${reason} Provide them and retry, or run with dryRun=true.`,
          phases: [],
          logs: []
        }
      });
      await appendAuditEvent(
        buildAuditEvent({
          correlationId,
          actor,
          tenantId: tenant.id,
          action: 'tenant.provision.failure',
          resource: 'provisioning',
          outcome: 'failure',
          source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
          details: { reason: 'missing_execution_env', missing: preflight.missingForExecution, jobId }
        })
      );
      return;
    }

    // ── Audit: execution started ─────────────────────────────────────────────
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor,
        tenantId: tenant.id,
        action: 'tenant.provision.execution_started',
        resource: 'provisioning',
        outcome: 'success',
        source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
        details: { jobId, dryRun }
      })
    );

    // Mark job as Running (unless dry-run stays as DryRun)
    if (!dryRun) {
      await updateJob(jobId, { status: 'Running' });
    }

    // ── Run the E2E phase engine ─────────────────────────────────────────────
    const job = await import('@/lib/data-store').then((m) => m.getJobById(jobId));
    const engineResult = await runProvisioningEngine(
      {
        jobId,
        tenantId: tenant.id,
        correlationId,
        actor,
        dryRun,
        plan: enrichedPlan,
        commands
      },
      tenant,
      job!
    );

    // ── Rollback (execution mode only, if apply succeeded before failure) ───
    let rollback: Record<string, unknown> = { attempted: false, reason: 'Not needed.' };

    if (!dryRun && engineResult.failedPhase) {
      const applySucceeded = engineResult.phases.find(
        (p) => p.phase === 'vm_create' && p.status === 'success'
      );

      if (applySucceeded) {
        const rollbackHook = process.env.PROVISION_ROLLBACK_HOOK_CMD?.trim();
        if (rollbackHook) {
          const rb = await runRollbackHook(rollbackHook);
          rollback = { attempted: true, ...rb };
        } else {
          rollback = { attempted: false, reason: 'No rollback hook configured (PROVISION_ROLLBACK_HOOK_CMD not set).' };
        }

        await appendAuditEvent(
          buildAuditEvent({
            correlationId,
            actor,
            tenantId: tenant.id,
            action: rollback.attempted ? 'tenant.provision.rollback.result' : 'tenant.provision.rollback.attempted',
            resource: 'provisioning',
            outcome: rollback.attempted && 'ok' in rollback && rollback.ok === false ? 'failure' : 'success',
            source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
            details: rollback
          })
        );
      }
    }

    // ── Final job update ──────────────────────────────────────────────────────
    const allPhaseLogs = engineResult.phases.flatMap((p) => p.logs);

    await updateJob(jobId, {
      status: engineResult.finalJobStatus,
      details: {
        preflight,
        plan: enrichedPlan,
        generatedFiles: files,
        phases: engineResult.phases.map((r) => ({
          phase: r.phase,
          status: r.status,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          durationMs: r.durationMs,
          auditEventId: r.auditEventId,
          logs: r.logs,
          error: r.error
        })),
        rollback,
        logs: allPhaseLogs,
        outputSummary: engineResult.outputSummary,
        error: engineResult.failedPhase ? `Provisioning failed at phase: ${engineResult.failedPhase}` : undefined
      }
    });

    // ── Final audit event ─────────────────────────────────────────────────────
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor,
        tenantId: tenant.id,
        action: dryRun
          ? 'tenant.provision.dryrun_planned'
          : engineResult.success
            ? 'tenant.provision.success'
            : 'tenant.provision.failure',
        resource: 'provisioning',
        outcome: engineResult.success || dryRun ? 'success' : 'failure',
        source: { service: 'webapp', operation: 'POST /api/provision/tenant' },
        details: {
          jobId,
          failedPhase: engineResult.failedPhase,
          phases: engineResult.phases.map((p) => ({ phase: p.phase, status: p.status }))
        }
      })
    );
  } catch (err) {
    console.error('[provision-background] Unhandled error for job', jobId, err);
    try {
      await updateJob(jobId, {
        status: 'Failed',
        details: {
          error: err instanceof Error ? err.message : String(err),
          phases: [],
          logs: [{ at: new Date().toISOString(), level: 'error', message: `Background provisioning failed: ${err}` }]
        }
      });
    } catch (updateErr) {
      // The job-status update itself failed (e.g. DB unreachable after crash).
      // Log a warning so ops can correlate a stuck job with the root cause.
      console.warn('[provision-background] Could not persist Failed status for job', jobId, updateErr);
    }
  }
}

export async function POST(request: Request) {
  // Rate-limit: 5 requests per minute per token (SEC-004)
  const rateLimited = await applyRateLimit(request, 'POST /api/provision/tenant', { limit: 5 });
  if (rateLimited) return rateLimited;

  const authz = await requireProtectedOperation(request, 'POST /api/provision/tenant');
  if (!authz.ok) return authz.response;

  const correlationId = getCorrelationIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as ProvisionRequest;

  // ── Secret guard ─────────────────────────────────────────────────────────
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

  // ── Audit: request received ───────────────────────────────────────────────
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

  // ── Create job and return 202 immediately (ARCH-004) ──────────────────────
  const job = await createJob({
    tenant: tenant.name,
    task: 'Provision Tenant Infrastructure',
    status: dryRun ? 'DryRun' : 'Queued',
    correlationId,
    details: {
      dryRun,
      phases: [],
      logs: [{ at: new Date().toISOString(), level: 'info', message: 'Provisioning request accepted.' }]
    }
  });

  const actor = { type: 'user' as const, id: authz.auth.userId, role: authz.auth.role };

  // Fire-and-forget: schedule background execution without blocking the response.
  //
  // RUNTIME REQUIREMENT: This pattern relies on the Node.js process staying
  // alive after the HTTP response is sent (self-hosted `next start`).
  // It MUST NOT be used in serverless / edge environments (Vercel, Lambda, etc.)
  // where the execution context freezes or terminates after the response.
  // The `export const runtime = 'nodejs'` guard at the top of this file
  // prevents Next.js from routing this to the Edge Runtime.
  //
  // For serverless deployments: replace with a message queue
  // (BullMQ + Redis, AWS SQS, Inngest, etc.) and move runProvisioningInBackground
  // to a dedicated worker process.
  //
  // Stuck-job recovery (crash between accepted + completion) is handled by
  // lib/job-recovery.ts, which is called at application startup.
  if (typeof setImmediate === 'undefined') {
    // Defensive guard — should never happen with runtime = 'nodejs' but
    // prevents silent failure if the runtime constraint is ever removed.
    console.error('[provision-background] setImmediate is not available — provisioning job', job.id, 'will not run. Deploy with self-hosted Node.js runtime.');
  } else {
    setImmediate(() => {
      runProvisioningInBackground(job.id, tenant.id, correlationId, actor, dryRun).catch((err) => {
        console.error('[provision-background] setImmediate catch for job', job.id, err);
      });
    });
  }

  // Return 202 Accepted with jobId for polling
  return NextResponse.json({ jobId: job.id, correlationId }, { status: 202 });
}
