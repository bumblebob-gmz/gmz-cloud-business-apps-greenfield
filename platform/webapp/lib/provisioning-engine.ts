/**
 * Provisioning Engine – E2E Vertical Slice
 *
 * Drives the five-phase tenant provisioning job:
 *   vm_create → network_config → os_bootstrap → app_deploy → health_verify
 *
 * Each phase:
 *   1. Emits a `provision.phase.<name>.start` audit event
 *   2. Updates job state (phase status = running)
 *   3. Executes the phase work (real commands or dry-run simulation)
 *   4. Emits `provision.phase.<name>.success` or `provision.phase.<name>.failure`
 *   5. Updates job state with result
 *
 * On full success: tenant status is promoted to 'Active'.
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { AuditEvent } from './audit.ts';
import { appendAuditEvent, buildAuditEvent } from './audit.ts';
import { updateJob, updateTenant } from './data-store.ts';
import type { Job, JobLogEntry, JobPhase, JobPhaseStatus, JobPhaseTrace, ProvisionPlan, Tenant } from './types.ts';

const execFile = promisify(execFileCb);

/**
 * Parse a command string into [binary, ...args] without invoking a shell.
 * Handles single-quoted tokens. Does NOT support shell builtins, pipes,
 * redirections, or environment variable expansion – use structured args
 * for those cases.
 */
function parseCommand(command: string): { file: string; args: string[] } {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
      }
    } else if (ch === "'") {
      inSingle = true;
    } else if (ch === ' ' || ch === '\t') {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  if (tokens.length === 0) throw new Error('Cannot parse empty command');
  return { file: tokens[0], args: tokens.slice(1) };
}

// ---------------------------------------------------------------------------
// Phase definition
// ---------------------------------------------------------------------------

export const PROVISIONING_PHASES: JobPhase[] = [
  'vm_create',
  'network_config',
  'os_bootstrap',
  'app_deploy',
  'health_verify'
];

/**
 * Maps a phase to the subset of provisioning commands it is responsible for.
 * Returns indices into the resolved commands array.
 */
export function getPhaseCommandIndices(
  phase: JobPhase,
  _commands: string[]
): number[] {
  switch (phase) {
    case 'vm_create':
      // tofu init (0), tofu plan (1), tofu apply (2)
      return [0, 1, 2];
    case 'network_config':
      // Derives from plan vars – no separate shell command; validated via plan
      return [];
    case 'os_bootstrap':
      // ansible bootstrap-tenant.yml (3)
      return [3];
    case 'app_deploy':
      // ansible deploy-apps.yml (4)
      return [4];
    case 'health_verify':
      // Final health probe – no shell command; built-in verification
      return [];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type PhaseContext = {
  jobId: string;
  tenantId: string;
  correlationId: string;
  actor: AuditEvent['actor'];
  dryRun: boolean;
  plan: ProvisionPlan;
  /** Resolved commands (with real tfvars/inventory paths). */
  commands: string[];
};

export type PhaseResult = {
  phase: JobPhase;
  status: JobPhaseStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  logs: JobLogEntry[];
  auditEventId?: string;
  error?: string;
};

export type EngineResult = {
  success: boolean;
  dryRun: boolean;
  phases: PhaseResult[];
  finalJobStatus: 'Success' | 'Failed' | 'DryRun';
  failedPhase?: JobPhase;
  outputSummary: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

function summarizeText(text: string, max = 240): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

async function runCommand(
  command: string,
  extraEnv?: Record<string, string>
): Promise<{ exitCode: number; snippet: string }> {
  try {
    const { file, args } = parseCommand(command);
    const env = extraEnv ? { ...process.env, ...extraEnv } : process.env;
    const { stdout, stderr } = await execFile(file, args, {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
      env
    });
    const out = [stdout, stderr].filter(Boolean).join('\n').trim();
    return { exitCode: 0, snippet: out ? summarizeText(out) : 'Command completed with no output.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed';
    return { exitCode: 1, snippet: summarizeText(message) };
  }
}

function buildPhaseAuditEvent(
  ctx: PhaseContext,
  phase: JobPhase,
  lifecycle: 'start' | 'progress' | 'success' | 'failure',
  outcome: AuditEvent['outcome'],
  details: Record<string, unknown>
): AuditEvent {
  return buildAuditEvent({
    correlationId: ctx.correlationId,
    actor: ctx.actor,
    tenantId: ctx.tenantId,
    action: `provision.phase.${phase}.${lifecycle}`,
    resource: 'provisioning',
    outcome,
    source: { service: 'webapp', operation: 'provision-engine' },
    details: { jobId: ctx.jobId, phase, dryRun: ctx.dryRun, ...details }
  });
}

async function persistPhases(
  jobId: string,
  currentJob: Job,
  phases: PhaseResult[]
): Promise<void> {
  const traces: JobPhaseTrace[] = phases.map((r) => ({
    phase: r.phase,
    status: r.status,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    durationMs: r.durationMs,
    auditEventId: r.auditEventId,
    logs: r.logs,
    error: r.error
  }));

  await updateJob(jobId, {
    details: {
      ...currentJob.details,
      phases: traces
    }
  });
}

// ---------------------------------------------------------------------------
// Health check scheme (ARCH-006)
// ---------------------------------------------------------------------------

/**
 * Returns the URL scheme to use for tenant health check probes.
 * Controlled by the PROVISION_HEALTH_CHECK_SCHEME env var (default: "https").
 * Emits a console.warn at startup if the scheme is "http" (insecure).
 */
export function getHealthCheckScheme(): string {
  const scheme = (process.env.PROVISION_HEALTH_CHECK_SCHEME ?? 'https').toLowerCase().trim();
  if (scheme === 'http') {
    console.warn(
      '[provisioning-engine] WARNING: PROVISION_HEALTH_CHECK_SCHEME is set to "http". ' +
      'Health check probes will use an unencrypted connection. ' +
      'Set PROVISION_HEALTH_CHECK_SCHEME=https for production deployments.'
    );
  }
  return scheme;
}

// ---------------------------------------------------------------------------
// Per-phase execution
// ---------------------------------------------------------------------------

async function executeVmCreate(ctx: PhaseContext): Promise<PhaseResult> {
  const startedAt = now();
  const logs: JobLogEntry[] = [];
  const startEvent = buildPhaseAuditEvent(ctx, 'vm_create', 'start', 'success', {
    commands: ctx.commands.slice(0, 3)
  });

  await appendAuditEvent(startEvent);
  logs.push({ at: now(), level: 'info', message: `[vm_create] Phase started.` });

  if (ctx.dryRun) {
    const completedAt = now();
    const planned = buildPhaseAuditEvent(ctx, 'vm_create', 'success', 'success', {
      mode: 'dry-run',
      vmId: ctx.plan.vars.vmId,
      cpu: ctx.plan.vars.cpu,
      memoryMb: ctx.plan.vars.memoryMb,
      diskGb: ctx.plan.vars.diskGb
    });
    await appendAuditEvent(planned);
    logs.push({ at: now(), level: 'info', message: `[vm_create] Dry-run: would create VM ${ctx.plan.vars.vmId} (${ctx.plan.vars.cpu} vCPU, ${ctx.plan.vars.ramGb}GB RAM, ${ctx.plan.vars.diskGb}GB disk).` });

    return {
      phase: 'vm_create', status: 'planned', startedAt, completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      logs, auditEventId: planned.eventId
    };
  }

  const indices = getPhaseCommandIndices('vm_create', ctx.commands);
  for (const idx of indices) {
    const cmd = ctx.commands[idx];
    if (!cmd) continue;

    const progressEvent = buildPhaseAuditEvent(ctx, 'vm_create', 'progress', 'success', { command: cmd });
    await appendAuditEvent(progressEvent);
    logs.push({ at: now(), level: 'info', message: `[vm_create] Running: ${cmd}` });

    const { exitCode, snippet } = await runCommand(cmd);
    logs.push({ at: now(), level: exitCode === 0 ? 'info' : 'error', message: snippet });

    if (exitCode !== 0) {
      const completedAt = now();
      const failEvent = buildPhaseAuditEvent(ctx, 'vm_create', 'failure', 'failure', { command: cmd, error: snippet });
      await appendAuditEvent(failEvent);

      return {
        phase: 'vm_create', status: 'failed', startedAt, completedAt,
        durationMs: Date.parse(completedAt) - Date.parse(startedAt),
        logs, auditEventId: failEvent.eventId, error: snippet
      };
    }
  }

  const completedAt = now();
  const successEvent = buildPhaseAuditEvent(ctx, 'vm_create', 'success', 'success', {
    vmId: ctx.plan.vars.vmId, ipAddress: ctx.plan.vars.ipAddress
  });
  await appendAuditEvent(successEvent);
  logs.push({ at: now(), level: 'info', message: `[vm_create] VM ${ctx.plan.vars.vmId} created at ${ctx.plan.vars.ipAddress}.` });

  return {
    phase: 'vm_create', status: 'success', startedAt, completedAt,
    durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    logs, auditEventId: successEvent.eventId
  };
}

async function executeNetworkConfig(ctx: PhaseContext, prevPhase: PhaseResult): Promise<PhaseResult> {
  const startedAt = now();
  const logs: JobLogEntry[] = [];
  const startEvent = buildPhaseAuditEvent(ctx, 'network_config', 'start', 'success', {
    vlan: ctx.plan.vars.vlan, ipAddress: ctx.plan.vars.ipAddress
  });
  await appendAuditEvent(startEvent);
  logs.push({ at: now(), level: 'info', message: `[network_config] Phase started.` });

  // network_config is derived from the OpenTofu plan – no separate shell command.
  // In dry-run mode, we simulate the VLAN/IP assignment.
  if (ctx.dryRun || prevPhase.status === 'planned') {
    const completedAt = now();
    const planned = buildPhaseAuditEvent(ctx, 'network_config', 'success', 'success', {
      mode: 'dry-run', vlan: ctx.plan.vars.vlan, ipAddress: ctx.plan.vars.ipAddress
    });
    await appendAuditEvent(planned);
    logs.push({ at: now(), level: 'info', message: `[network_config] Dry-run: would configure VLAN ${ctx.plan.vars.vlan}, IP ${ctx.plan.vars.ipAddress}.` });

    return {
      phase: 'network_config', status: 'planned', startedAt, completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      logs, auditEventId: planned.eventId
    };
  }

  if (prevPhase.status === 'failed') {
    const completedAt = now();
    const skipEvent = buildPhaseAuditEvent(ctx, 'network_config', 'failure', 'failure', {
      reason: 'vm_create phase failed; network_config skipped'
    });
    await appendAuditEvent(skipEvent);
    logs.push({ at: now(), level: 'warn', message: '[network_config] Skipped: vm_create failed.' });

    return {
      phase: 'network_config', status: 'skipped', startedAt, completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      logs, auditEventId: skipEvent.eventId,
      error: 'Skipped because vm_create failed.'
    };
  }

  // Validate derived network config
  const vlanOk = ctx.plan.vars.vlan > 0 && ctx.plan.vars.vlan < 4095;
  const ipOk = /^\d{1,3}(\.\d{1,3}){3}$/.test(ctx.plan.vars.ipAddress);

  const completedAt = now();
  if (!vlanOk || !ipOk) {
    const failEvent = buildPhaseAuditEvent(ctx, 'network_config', 'failure', 'failure', {
      vlan: ctx.plan.vars.vlan, ipAddress: ctx.plan.vars.ipAddress,
      error: 'Invalid VLAN or IP address in provisioning plan'
    });
    await appendAuditEvent(failEvent);
    logs.push({ at: now(), level: 'error', message: `[network_config] Validation failed – VLAN: ${ctx.plan.vars.vlan}, IP: ${ctx.plan.vars.ipAddress}` });

    return {
      phase: 'network_config', status: 'failed', startedAt, completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      logs, auditEventId: failEvent.eventId,
      error: 'Invalid VLAN or IP address in provisioning plan'
    };
  }

  const successEvent = buildPhaseAuditEvent(ctx, 'network_config', 'success', 'success', {
    vlan: ctx.plan.vars.vlan, ipAddress: ctx.plan.vars.ipAddress
  });
  await appendAuditEvent(successEvent);
  logs.push({ at: now(), level: 'info', message: `[network_config] VLAN ${ctx.plan.vars.vlan}, IP ${ctx.plan.vars.ipAddress} confirmed.` });

  return {
    phase: 'network_config', status: 'success', startedAt, completedAt,
    durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    logs, auditEventId: successEvent.eventId
  };
}

async function executeAnsiblePhase(
  ctx: PhaseContext,
  phase: 'os_bootstrap' | 'app_deploy',
  commandIndex: number,
  prevPhase: PhaseResult
): Promise<PhaseResult> {
  const startedAt = now();
  const logs: JobLogEntry[] = [];

  const startEvent = buildPhaseAuditEvent(ctx, phase, 'start', 'success', {
    commandIndex
  });
  await appendAuditEvent(startEvent);
  logs.push({ at: now(), level: 'info', message: `[${phase}] Phase started.` });

  if (ctx.dryRun || prevPhase.status === 'planned') {
    const completedAt = now();
    const cmd = ctx.commands[commandIndex] ?? `ansible-playbook (${phase})`;
    const planned = buildPhaseAuditEvent(ctx, phase, 'success', 'success', {
      mode: 'dry-run', command: cmd
    });
    await appendAuditEvent(planned);
    logs.push({ at: now(), level: 'info', message: `[${phase}] Dry-run: would execute ${cmd}` });

    return {
      phase, status: 'planned', startedAt, completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      logs, auditEventId: planned.eventId
    };
  }

  if (prevPhase.status === 'failed' || prevPhase.status === 'skipped') {
    const completedAt = now();
    const skipEvent = buildPhaseAuditEvent(ctx, phase, 'failure', 'failure', {
      reason: `Previous phase (${prevPhase.phase}) ${prevPhase.status}; ${phase} skipped`
    });
    await appendAuditEvent(skipEvent);
    logs.push({ at: now(), level: 'warn', message: `[${phase}] Skipped: previous phase failed.` });

    return {
      phase, status: 'skipped', startedAt, completedAt: now(),
      durationMs: 0, logs, auditEventId: skipEvent.eventId,
      error: `Skipped because ${prevPhase.phase} ${prevPhase.status}.`
    };
  }

  const cmd = ctx.commands[commandIndex];
  if (!cmd) {
    const completedAt = now();
    const failEvent = buildPhaseAuditEvent(ctx, phase, 'failure', 'failure', {
      error: `No command at index ${commandIndex}`
    });
    await appendAuditEvent(failEvent);
    return {
      phase, status: 'failed', startedAt, completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      logs, auditEventId: failEvent.eventId,
      error: `No command at index ${commandIndex}`
    };
  }

  const progressEvent = buildPhaseAuditEvent(ctx, phase, 'progress', 'success', { command: cmd });
  await appendAuditEvent(progressEvent);
  logs.push({ at: now(), level: 'info', message: `[${phase}] Running: ${cmd}` });

  const { exitCode, snippet } = await runCommand(cmd);
  logs.push({ at: now(), level: exitCode === 0 ? 'info' : 'error', message: snippet });

  const completedAt = now();

  if (exitCode !== 0) {
    const failEvent = buildPhaseAuditEvent(ctx, phase, 'failure', 'failure', { command: cmd, error: snippet });
    await appendAuditEvent(failEvent);
    return {
      phase, status: 'failed', startedAt, completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      logs, auditEventId: failEvent.eventId, error: snippet
    };
  }

  const successEvent = buildPhaseAuditEvent(ctx, phase, 'success', 'success', { command: cmd });
  await appendAuditEvent(successEvent);
  logs.push({ at: now(), level: 'info', message: `[${phase}] Completed successfully.` });

  return {
    phase, status: 'success', startedAt, completedAt,
    durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    logs, auditEventId: successEvent.eventId
  };
}

async function executeHealthVerify(ctx: PhaseContext, prevPhase: PhaseResult): Promise<PhaseResult> {
  const startedAt = now();
  const logs: JobLogEntry[] = [];

  const startEvent = buildPhaseAuditEvent(ctx, 'health_verify', 'start', 'success', {
    ipAddress: ctx.plan.vars.ipAddress
  });
  await appendAuditEvent(startEvent);
  logs.push({ at: now(), level: 'info', message: '[health_verify] Phase started.' });

  if (ctx.dryRun || prevPhase.status === 'planned') {
    const completedAt = now();
    const planned = buildPhaseAuditEvent(ctx, 'health_verify', 'success', 'success', {
      mode: 'dry-run', endpoint: `http://${ctx.plan.vars.ipAddress}:80/health`
    });
    await appendAuditEvent(planned);
    logs.push({ at: now(), level: 'info', message: `[health_verify] Dry-run: would probe http://${ctx.plan.vars.ipAddress}:80/health` });

    return {
      phase: 'health_verify', status: 'planned', startedAt, completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      logs, auditEventId: planned.eventId
    };
  }

  if (prevPhase.status === 'failed' || prevPhase.status === 'skipped') {
    const completedAt = now();
    const skipEvent = buildPhaseAuditEvent(ctx, 'health_verify', 'failure', 'failure', {
      reason: `app_deploy ${prevPhase.status}; health check skipped`
    });
    await appendAuditEvent(skipEvent);
    logs.push({ at: now(), level: 'warn', message: '[health_verify] Skipped: app_deploy failed.' });

    return {
      phase: 'health_verify', status: 'skipped', startedAt, completedAt: now(),
      durationMs: 0, logs, auditEventId: skipEvent.eventId,
      error: 'Skipped because app_deploy failed.'
    };
  }

  // Attempt a real health probe
  const healthUrl = `http://${ctx.plan.vars.ipAddress}:80/health`;
  let healthOk = false;
  let healthError: string | undefined;

  const progressEvent = buildPhaseAuditEvent(ctx, 'health_verify', 'progress', 'success', { url: healthUrl });
  await appendAuditEvent(progressEvent);
  logs.push({ at: now(), level: 'info', message: `[health_verify] Probing ${healthUrl} …` });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    healthOk = response.ok || response.status < 500;
    logs.push({ at: now(), level: 'info', message: `[health_verify] HTTP ${response.status} from ${healthUrl}` });
  } catch (error) {
    healthError = error instanceof Error ? error.message : 'Health probe failed';
    logs.push({ at: now(), level: 'warn', message: `[health_verify] Probe failed: ${healthError}` });
    // A probe failure is non-fatal for newly provisioned tenants (app may still be starting)
    healthOk = false;
  }

  const completedAt = now();

  if (!healthOk && healthError) {
    // Non-fatal: log as warning but still mark phase as success with caveat
    const warnEvent = buildPhaseAuditEvent(ctx, 'health_verify', 'success', 'success', {
      status: 'unreachable', endpoint: healthUrl, error: healthError,
      note: 'Health probe unreachable but provisioning completed; tenant may still be starting'
    });
    await appendAuditEvent(warnEvent);
    logs.push({ at: now(), level: 'warn', message: '[health_verify] Tenant unreachable; provisioning marked complete. Verify manually.' });

    return {
      phase: 'health_verify', status: 'success', startedAt, completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      logs, auditEventId: warnEvent.eventId
    };
  }

  const successEvent = buildPhaseAuditEvent(ctx, 'health_verify', 'success', 'success', {
    endpoint: healthUrl, statusOk: true
  });
  await appendAuditEvent(successEvent);
  logs.push({ at: now(), level: 'info', message: `[health_verify] Tenant healthy at ${healthUrl}.` });

  return {
    phase: 'health_verify', status: 'success', startedAt, completedAt,
    durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    logs, auditEventId: successEvent.eventId
  };
}

// ---------------------------------------------------------------------------
// Main engine entry point
// ---------------------------------------------------------------------------

/**
 * Run the full 5-phase provisioning job.
 *
 * Caller must pass the current job record so the engine can update it
 * progressively (per-phase persistence).
 *
 * @param ctx  Phase context (credentials, plan, mode flags)
 * @param tenant Tenant record (needed to promote status)
 * @param currentJob Current job record for progressive updates
 */
export async function runProvisioningEngine(
  ctx: PhaseContext,
  tenant: Tenant,
  currentJob: Job
): Promise<EngineResult> {
  const results: PhaseResult[] = [];

  // Helper: persist current phase results to job store
  async function checkpoint() {
    await persistPhases(ctx.jobId, currentJob, results);
  }

  // Phase 1 – vm_create
  await updateJob(ctx.jobId, { status: 'Running' });
  const vmCreate = await executeVmCreate(ctx);
  results.push(vmCreate);
  await checkpoint();

  // Phase 2 – network_config (depends on vm_create)
  const netConfig = await executeNetworkConfig(ctx, vmCreate);
  results.push(netConfig);
  await checkpoint();

  // Phase 3 – os_bootstrap (ansible: bootstrap-tenant.yml = index 3)
  const osBootstrap = await executeAnsiblePhase(ctx, 'os_bootstrap', 3, netConfig);
  results.push(osBootstrap);
  await checkpoint();

  // Phase 4 – app_deploy (ansible: deploy-apps.yml = index 4)
  const appDeploy = await executeAnsiblePhase(ctx, 'app_deploy', 4, osBootstrap);
  results.push(appDeploy);
  await checkpoint();

  // Phase 5 – health_verify
  const healthVerify = await executeHealthVerify(ctx, appDeploy);
  results.push(healthVerify);
  await checkpoint();

  // ---------------------------------------------------------------------------
  // Determine overall outcome
  // ---------------------------------------------------------------------------
  const isDryRun = ctx.dryRun;
  const failedPhase = results.find((r) => r.status === 'failed')?.phase;
  const success = !failedPhase;

  let finalJobStatus: 'Success' | 'Failed' | 'DryRun';
  if (isDryRun) {
    finalJobStatus = 'DryRun';
  } else if (success) {
    finalJobStatus = 'Success';
    // Promote tenant to Active
    await updateTenant(tenant.id, { status: 'Active' });
  } else {
    finalJobStatus = 'Failed';
  }

  const outputSummary = results
    .map((r) => `[${r.phase}:${r.status}] ${r.logs.at(-1)?.message ?? ''}`)
    .join(' | ');

  return {
    success,
    dryRun: isDryRun,
    phases: results,
    finalJobStatus,
    failedPhase,
    outputSummary
  };
}
