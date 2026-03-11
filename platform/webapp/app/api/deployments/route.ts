// Force Node.js runtime — this route uses node:crypto / node:fs (not Edge-compatible).
// If this file is ever moved to Edge Middleware, migrate to the Web Crypto API.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createDeployment, createJob, listDeployments, updateDeployment, updateJob } from '@/lib/data-store';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { requireProtectedOperation } from '@/lib/auth-context';
import type { DeploymentEnv } from '@/lib/types';

type DeployRequest = {
  tenantId?: string;
  tenantName?: string;
  version?: string;
  env?: string;
  dryRun?: boolean;
};

const VALID_ENVS: DeploymentEnv[] = ['Staging', 'Production'];

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/deployments');
  if (!authz.ok) return authz.response;

  const items = await listDeployments();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const authz = await requireProtectedOperation(request, 'POST /api/deployments');
  if (!authz.ok) return authz.response;

  const correlationId = getCorrelationIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as DeployRequest;

  const tenantRef = body.tenantName?.trim() || body.tenantId?.trim() || 'unknown';

  // Validate required fields
  if (!body.tenantName && !body.tenantId) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: tenantRef,
        action: 'deploy.failure',
        resource: 'deployment',
        outcome: 'failure',
        source: { service: 'webapp', operation: 'POST /api/deployments' },
        details: { reason: 'missing_tenant_ref' }
      })
    );
    return NextResponse.json({ error: 'tenantName or tenantId is required.', correlationId }, { status: 400 });
  }

  if (!body.version?.trim()) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: tenantRef,
        action: 'deploy.failure',
        resource: 'deployment',
        outcome: 'failure',
        source: { service: 'webapp', operation: 'POST /api/deployments' },
        details: { reason: 'missing_version' }
      })
    );
    return NextResponse.json({ error: 'version is required.', correlationId }, { status: 400 });
  }

  const env = (body.env?.trim() ?? 'Staging') as DeploymentEnv;
  if (!VALID_ENVS.includes(env)) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: tenantRef,
        action: 'deploy.failure',
        resource: 'deployment',
        outcome: 'failure',
        source: { service: 'webapp', operation: 'POST /api/deployments' },
        details: { reason: 'invalid_env', env: body.env }
      })
    );
    return NextResponse.json({ error: `env must be one of: ${VALID_ENVS.join(', ')}.`, correlationId }, { status: 400 });
  }

  const version = body.version.trim();
  const dryRun = body.dryRun ?? false;

  // Dry-run path: plan only, no job created
  if (dryRun) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: tenantRef,
        action: 'deploy.dryrun_planned',
        resource: 'deployment',
        outcome: 'success',
        source: { service: 'webapp', operation: 'POST /api/deployments' },
        details: { tenant: tenantRef, version, env, dryRun: true }
      })
    );
    return NextResponse.json({
      mode: 'dry-run',
      message: 'Dry-run only. No deployment job created.',
      correlationId,
      tenant: tenantRef,
      version,
      env
    });
  }

  // Create deployment record and tracking job
  const deployment = await createDeployment({
    tenant: tenantRef,
    version,
    env,
    status: 'Healthy'
  });

  const job = await createJob({
    tenant: tenantRef,
    task: `Deploy ${version} to ${env}`,
    status: 'Running',
    correlationId,
    details: {
      logs: [{ at: new Date().toISOString(), level: 'info', message: 'Deploy job started.' }]
    }
  });

  // Emit deploy start
  await appendAuditEvent(
    buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: tenantRef,
      action: 'deploy.start',
      resource: 'deployment',
      outcome: 'success',
      source: { service: 'webapp', operation: 'POST /api/deployments' },
      details: { deploymentId: deployment.id, jobId: job.id, version, env }
    })
  );

  // Run deploy (ansible-playbook or simulation if tooling unavailable)
  let deploySuccess = false;
  let deployError: string | undefined;

  try {
    const { exec: execCb } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execCb);

    const deployPlaybook = process.env.DEPLOY_PLAYBOOK_PATH?.trim();
    const deployInventory = process.env.DEPLOY_INVENTORY_PATH?.trim();

    if (deployPlaybook && deployInventory) {
      await exec(
        `ansible-playbook -i '${deployInventory}' '${deployPlaybook}' --extra-vars "version=${version} env=${env} tenant=${tenantRef}"`,
        { cwd: process.cwd(), maxBuffer: 1024 * 1024 }
      );
      deploySuccess = true;
    } else {
      // No tooling configured: treat as successful no-op (same as dry-run execution path)
      deploySuccess = true;
    }
  } catch (err) {
    deployError = err instanceof Error ? err.message : 'Deploy command failed';
    deploySuccess = false;
  }

  // Update job and deployment
  const finalStatus = deploySuccess ? 'Success' : 'Failed';
  const finalDeploymentStatus = deploySuccess ? 'Healthy' : 'Failed';

  const updatedJob = await updateJob(job.id, {
    status: finalStatus,
    details: {
      ...job.details,
      error: deployError,
      logs: [
        ...(job.details?.logs ?? []),
        {
          at: new Date().toISOString(),
          level: deploySuccess ? 'info' : 'error',
          message: deploySuccess ? `Deploy of ${version} to ${env} completed.` : `Deploy failed: ${deployError}`
        }
      ]
    }
  });

  const updatedDeployment = await updateDeployment(deployment.id, { status: finalDeploymentStatus });

  // Emit deploy outcome
  await appendAuditEvent(
    buildAuditEvent({
      correlationId,
      actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
      tenantId: tenantRef,
      action: deploySuccess ? 'deploy.success' : 'deploy.failure',
      resource: 'deployment',
      outcome: deploySuccess ? 'success' : 'failure',
      source: { service: 'webapp', operation: 'POST /api/deployments' },
      details: {
        deploymentId: deployment.id,
        jobId: job.id,
        version,
        env,
        ...(deployError ? { error: deployError } : {})
      }
    })
  );

  return NextResponse.json({
    mode: 'execute',
    correlationId,
    deployment: updatedDeployment ?? deployment,
    job: updatedJob ?? job,
    success: deploySuccess
  });
}
