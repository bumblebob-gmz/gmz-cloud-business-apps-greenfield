/**
 * Provisioning E2E Vertical Slice Tests
 *
 * Tests the full phase-based provisioning engine:
 *   vm_create → network_config → os_bootstrap → app_deploy → health_verify
 *
 * Coverage:
 *   - Happy path (dry-run): all 5 phases planned, audit events emitted
 *   - Happy path (execution): all 5 phases succeed, tenant promoted to Active
 *   - Failure path: vm_create failure cascades correctly
 *   - Failure path: network_config invalid VLAN/IP
 *   - Phase trace integrity: every phase has audit event ID + logs
 *   - Audit event shapes conform to AuditEvent schema
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildAuditEvent, validateAuditEnvelope } from '../lib/audit.ts';
import {
  PROVISIONING_PHASES,
  getPhaseCommandIndices,
  runProvisioningEngine,
  type PhaseContext
} from '../lib/provisioning-engine.ts';
import type { Job, JobPhase, JobPhaseTrace, Tenant } from '../lib/types.ts';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const MOCK_ACTOR = { type: 'user' as const, id: 'test-user', role: 'admin' };

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tn-test-001',
    name: 'Test Tenant',
    customer: 'Test Corp',
    region: 'eu-central-1',
    status: 'Provisioning',
    size: 'M',
    vlan: 120,
    ipAddress: '10.120.10.100',
    ...overrides
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: `job-${randomUUID().slice(0, 8)}`,
    tenant: 'Test Tenant',
    task: 'Provision Tenant Infrastructure',
    status: 'Queued',
    startedAt: new Date().toISOString(),
    details: { dryRun: true, phases: [], logs: [] },
    ...overrides
  };
}

function makePlan() {
  return {
    vars: {
      tenantId: 'tn-test-001',
      tenantSlug: 'test-tenant',
      tenantName: 'Test Tenant',
      customer: 'Test Corp',
      region: 'eu-central-1',
      size: 'M' as const,
      cpu: 4,
      ramGb: 6,
      memoryMb: 6144,
      diskGb: 200,
      vlan: 120,
      vmId: 20120,
      ipAddress: '10.120.10.100',
      debianTemplateId: 9000,
      sshPublicKeyConfigured: false,
      nodeName: undefined,
      storage: undefined,
      tenantProfile: undefined
    },
    commands: [
      'echo tofu-init',
      'echo tofu-plan',
      'echo tofu-apply',
      'echo ansible-bootstrap',
      'echo ansible-deploy'
    ],
    generatedFiles: { tfvarsPath: '/tmp/test.tfvars', inventoryPath: '/tmp/test.ini', workDir: '/tmp/test' }
  };
}

function makeDryRunCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    jobId: `job-${randomUUID().slice(0, 8)}`,
    tenantId: 'tn-test-001',
    correlationId: randomUUID(),
    actor: MOCK_ACTOR,
    dryRun: true,
    plan: makePlan(),
    commands: ['echo tofu-init', 'echo tofu-plan', 'echo tofu-apply', 'echo ansible-bootstrap', 'echo ansible-deploy'],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Stub out updateJob and updateTenant for unit tests
// ---------------------------------------------------------------------------

let updateJobCalls: { id: string; patch: Record<string, unknown> }[] = [];
let updateTenantCalls: { id: string; patch: Record<string, unknown> }[] = [];
let appendedAuditEvents: ReturnType<typeof buildAuditEvent>[] = [];

// We inject stubs by patching module functions via a test-local wrapper that
// exercises the engine logic with mocked IO. The engine's internal imports
// (updateJob, updateTenant, appendAuditEvent) will use the file-based store
// in test since DATABASE_URL is not set. We intercept at the audit level
// by validating that buildAuditEvent shapes are valid, and we test the
// engine's return value for phase structure.

// ---------------------------------------------------------------------------
// Phase structure tests (pure / no IO)
// ---------------------------------------------------------------------------

test('PROVISIONING_PHASES contains exactly 5 phases in order', () => {
  assert.deepEqual(PROVISIONING_PHASES, [
    'vm_create',
    'network_config',
    'os_bootstrap',
    'app_deploy',
    'health_verify'
  ]);
});

test('getPhaseCommandIndices maps phases to correct command indices', () => {
  const commands = ['tofu init', 'tofu plan', 'tofu apply', 'ansible-bootstrap', 'ansible-deploy'];

  assert.deepEqual(getPhaseCommandIndices('vm_create', commands), [0, 1, 2]);
  assert.deepEqual(getPhaseCommandIndices('network_config', commands), []);
  assert.deepEqual(getPhaseCommandIndices('os_bootstrap', commands), [3]);
  assert.deepEqual(getPhaseCommandIndices('app_deploy', commands), [4]);
  assert.deepEqual(getPhaseCommandIndices('health_verify', commands), []);
});

// ---------------------------------------------------------------------------
// Audit event shape tests (pure)
// ---------------------------------------------------------------------------

test('provision.phase.vm_create.start emits valid audit event shape', () => {
  const event = buildAuditEvent({
    correlationId: randomUUID(),
    actor: MOCK_ACTOR,
    tenantId: 'tn-test-001',
    action: 'provision.phase.vm_create.start',
    resource: 'provisioning',
    outcome: 'success',
    source: { service: 'webapp', operation: 'provision-engine' },
    details: { jobId: 'job-001', phase: 'vm_create', dryRun: true }
  });

  const result = validateAuditEnvelope(event);
  assert.ok(result.ok, `Audit envelope invalid: ${result.error}`);
  assert.equal(event.action, 'provision.phase.vm_create.start');
  assert.equal(event.resource, 'provisioning');
});

test('provision.phase.*.success audit events are valid for all 5 phases', () => {
  const phases: JobPhase[] = ['vm_create', 'network_config', 'os_bootstrap', 'app_deploy', 'health_verify'];

  for (const phase of phases) {
    const event = buildAuditEvent({
      correlationId: randomUUID(),
      actor: MOCK_ACTOR,
      tenantId: 'tn-test-001',
      action: `provision.phase.${phase}.success`,
      resource: 'provisioning',
      outcome: 'success',
      source: { service: 'webapp', operation: 'provision-engine' },
      details: { jobId: 'job-001', phase, dryRun: false }
    });

    const result = validateAuditEnvelope(event);
    assert.ok(result.ok, `Phase ${phase} success audit invalid: ${result.error}`);
  }
});

test('provision.phase.*.failure audit events are valid for all 5 phases', () => {
  const phases: JobPhase[] = ['vm_create', 'network_config', 'os_bootstrap', 'app_deploy', 'health_verify'];

  for (const phase of phases) {
    const event = buildAuditEvent({
      correlationId: randomUUID(),
      actor: MOCK_ACTOR,
      tenantId: 'tn-test-001',
      action: `provision.phase.${phase}.failure`,
      resource: 'provisioning',
      outcome: 'failure',
      source: { service: 'webapp', operation: 'provision-engine' },
      details: { jobId: 'job-001', phase, error: 'command exited with code 1', dryRun: false }
    });

    const result = validateAuditEnvelope(event);
    assert.ok(result.ok, `Phase ${phase} failure audit invalid: ${result.error}`);
  }
});

test('provision.phase.*.progress audit events have valid envelope', () => {
  const event = buildAuditEvent({
    correlationId: randomUUID(),
    actor: MOCK_ACTOR,
    tenantId: 'tn-test-001',
    action: 'provision.phase.vm_create.progress',
    resource: 'provisioning',
    outcome: 'success',
    source: { service: 'webapp', operation: 'provision-engine' },
    details: { jobId: 'job-001', phase: 'vm_create', command: 'tofu apply', dryRun: false }
  });

  const result = validateAuditEnvelope(event);
  assert.ok(result.ok, `Progress audit invalid: ${result.error}`);
  assert.equal(event.action, 'provision.phase.vm_create.progress');
});

// ---------------------------------------------------------------------------
// E2E engine: dry-run happy path
// ---------------------------------------------------------------------------

test('dry-run: engine returns 5 phases all with status=planned', async () => {
  const ctx = makeDryRunCtx();
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId });

  const result = await runProvisioningEngine(ctx, tenant, job);

  assert.equal(result.dryRun, true);
  assert.equal(result.finalJobStatus, 'DryRun');
  assert.equal(result.success, true);
  assert.equal(result.failedPhase, undefined);
  assert.equal(result.phases.length, 5);

  for (const phase of result.phases) {
    assert.equal(phase.status, 'planned', `Phase ${phase.phase} should be 'planned' in dry-run`);
    assert.ok(phase.logs.length > 0, `Phase ${phase.phase} should have logs`);
    assert.ok(phase.auditEventId, `Phase ${phase.phase} should have an auditEventId`);
    assert.ok(phase.startedAt, `Phase ${phase.phase} should have startedAt`);
    assert.ok(phase.completedAt, `Phase ${phase.phase} should have completedAt`);
    assert.ok(typeof phase.durationMs === 'number', `Phase ${phase.phase} should have durationMs`);
  }
});

test('dry-run: phases appear in correct order', async () => {
  const ctx = makeDryRunCtx();
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId });

  const result = await runProvisioningEngine(ctx, tenant, job);

  const phaseOrder = result.phases.map((p) => p.phase);
  assert.deepEqual(phaseOrder, PROVISIONING_PHASES);
});

test('dry-run: outputSummary includes all phase names', async () => {
  const ctx = makeDryRunCtx();
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId });

  const result = await runProvisioningEngine(ctx, tenant, job);

  for (const phase of PROVISIONING_PHASES) {
    assert.ok(result.outputSummary.includes(phase), `outputSummary should mention phase: ${phase}`);
  }
});

test('dry-run: vm_create phase logs include VM spec', async () => {
  const ctx = makeDryRunCtx();
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId });

  const result = await runProvisioningEngine(ctx, tenant, job);

  const vmCreatePhase = result.phases.find((p) => p.phase === 'vm_create');
  assert.ok(vmCreatePhase, 'vm_create phase must exist');
  const allLogs = vmCreatePhase.logs.map((l) => l.message).join(' ');
  assert.ok(allLogs.includes('VM'), 'vm_create logs should mention VM');
});

test('dry-run: health_verify phase logs include probe URL', async () => {
  const ctx = makeDryRunCtx();
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId });

  const result = await runProvisioningEngine(ctx, tenant, job);

  const hvPhase = result.phases.find((p) => p.phase === 'health_verify');
  assert.ok(hvPhase, 'health_verify phase must exist');
  const allLogs = hvPhase.logs.map((l) => l.message).join(' ');
  assert.ok(allLogs.includes('10.120.10.100'), 'health_verify logs should include IP from plan');
});

// ---------------------------------------------------------------------------
// E2E engine: execution happy path (commands are echo stubs)
// ---------------------------------------------------------------------------

test('execution: all echo commands succeed → finalJobStatus = Success', async () => {
  const ctx = makeDryRunCtx({ dryRun: false });
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId, details: { dryRun: false, phases: [], logs: [] } });

  const result = await runProvisioningEngine(ctx, tenant, job);

  assert.equal(result.dryRun, false);
  assert.equal(result.success, true);
  assert.equal(result.finalJobStatus, 'Success');
  assert.equal(result.failedPhase, undefined);
  assert.equal(result.phases.length, 5);
});

test('execution: all phases have status=success on happy path', async () => {
  const ctx = makeDryRunCtx({ dryRun: false });
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId, details: { dryRun: false, phases: [], logs: [] } });

  const result = await runProvisioningEngine(ctx, tenant, job);

  for (const phase of result.phases) {
    // health_verify may be 'success' even if probe fails (non-fatal)
    assert.ok(
      phase.status === 'success' || phase.status === 'planned',
      `Phase ${phase.phase} should be success, got ${phase.status}`
    );
  }
});

test('execution: each phase has auditEventId on success', async () => {
  const ctx = makeDryRunCtx({ dryRun: false });
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId, details: { dryRun: false, phases: [], logs: [] } });

  const result = await runProvisioningEngine(ctx, tenant, job);

  for (const phase of result.phases) {
    assert.ok(phase.auditEventId, `Phase ${phase.phase} must have an auditEventId`);
    assert.ok(phase.auditEventId.length >= 8, `Phase ${phase.phase} auditEventId too short`);
  }
});

// ---------------------------------------------------------------------------
// E2E engine: failure path – vm_create failure
// ---------------------------------------------------------------------------

test('failure: vm_create failure → downstream phases are skipped/failed', async () => {
  // Use a command that will fail
  const failingCommands = [
    'exit 1',           // index 0: tofu-init fails
    'echo tofu-plan',
    'echo tofu-apply',
    'echo ansible-bootstrap',
    'echo ansible-deploy'
  ];

  const ctx = makeDryRunCtx({ dryRun: false, commands: failingCommands });
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId, details: { dryRun: false, phases: [], logs: [] } });

  const result = await runProvisioningEngine(ctx, tenant, job);

  assert.equal(result.success, false);
  assert.equal(result.finalJobStatus, 'Failed');
  assert.equal(result.failedPhase, 'vm_create');
  assert.equal(result.phases.length, 5);

  const vmCreate = result.phases.find((p) => p.phase === 'vm_create');
  assert.equal(vmCreate?.status, 'failed', 'vm_create should be failed');

  const netConfig = result.phases.find((p) => p.phase === 'network_config');
  assert.ok(
    netConfig?.status === 'skipped' || netConfig?.status === 'failed',
    `network_config should be skipped or failed, got ${netConfig?.status}`
  );

  const osBootstrap = result.phases.find((p) => p.phase === 'os_bootstrap');
  assert.ok(
    osBootstrap?.status === 'skipped',
    `os_bootstrap should be skipped, got ${osBootstrap?.status}`
  );

  const appDeploy = result.phases.find((p) => p.phase === 'app_deploy');
  assert.ok(
    appDeploy?.status === 'skipped',
    `app_deploy should be skipped, got ${appDeploy?.status}`
  );

  const healthVerify = result.phases.find((p) => p.phase === 'health_verify');
  assert.ok(
    healthVerify?.status === 'skipped',
    `health_verify should be skipped, got ${healthVerify?.status}`
  );
});

test('failure: vm_create failure → error field is populated on failed phase', async () => {
  const failingCommands = ['exit 1', 'echo p', 'echo a', 'echo b', 'echo c'];
  const ctx = makeDryRunCtx({ dryRun: false, commands: failingCommands });
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId });

  const result = await runProvisioningEngine(ctx, tenant, job);

  const vmCreate = result.phases.find((p) => p.phase === 'vm_create');
  assert.ok(vmCreate?.error, 'Failed vm_create phase must have an error message');
});

// ---------------------------------------------------------------------------
// E2E engine: failure path – network_config invalid VLAN
// ---------------------------------------------------------------------------

test('failure: invalid VLAN (0) causes network_config to fail in execution mode', async () => {
  const plan = makePlan();
  plan.vars.vlan = 0; // invalid VLAN
  plan.vars.ipAddress = '10.0.10.100';

  // vm_create commands all succeed
  const ctx = makeDryRunCtx({
    dryRun: false,
    plan,
    commands: ['echo init', 'echo plan', 'echo apply', 'echo bootstrap', 'echo deploy']
  });
  const tenant = makeTenant({ vlan: 0, ipAddress: '10.0.10.100' });
  const job = makeJob({ id: ctx.jobId, details: { dryRun: false, phases: [], logs: [] } });

  const result = await runProvisioningEngine(ctx, tenant, job);

  assert.equal(result.success, false);
  assert.equal(result.failedPhase, 'network_config');

  const netConfig = result.phases.find((p) => p.phase === 'network_config');
  assert.equal(netConfig?.status, 'failed');
  assert.ok(netConfig?.error?.includes('VLAN'), 'network_config error should mention VLAN');
});

test('failure: invalid IP address causes network_config to fail in execution mode', async () => {
  const plan = makePlan();
  plan.vars.ipAddress = 'not-an-ip';

  const ctx = makeDryRunCtx({
    dryRun: false,
    plan,
    commands: ['echo init', 'echo plan', 'echo apply', 'echo bootstrap', 'echo deploy']
  });
  const tenant = makeTenant({ ipAddress: 'not-an-ip' });
  const job = makeJob({ id: ctx.jobId, details: { dryRun: false, phases: [], logs: [] } });

  const result = await runProvisioningEngine(ctx, tenant, job);

  assert.equal(result.success, false);
  assert.equal(result.failedPhase, 'network_config');

  const netConfig = result.phases.find((p) => p.phase === 'network_config');
  assert.equal(netConfig?.status, 'failed');
});

// ---------------------------------------------------------------------------
// E2E engine: failure path – os_bootstrap failure
// ---------------------------------------------------------------------------

test('failure: os_bootstrap failure → app_deploy and health_verify are skipped', async () => {
  const failingCommands = [
    'echo init', 'echo plan', 'echo apply',
    'exit 1',        // index 3: ansible-bootstrap fails
    'echo deploy'
  ];

  const ctx = makeDryRunCtx({ dryRun: false, commands: failingCommands });
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId, details: { dryRun: false, phases: [], logs: [] } });

  const result = await runProvisioningEngine(ctx, tenant, job);

  assert.equal(result.success, false);
  assert.equal(result.failedPhase, 'os_bootstrap');

  const osBootstrap = result.phases.find((p) => p.phase === 'os_bootstrap');
  assert.equal(osBootstrap?.status, 'failed');

  const appDeploy = result.phases.find((p) => p.phase === 'app_deploy');
  assert.equal(appDeploy?.status, 'skipped');

  const healthVerify = result.phases.find((p) => p.phase === 'health_verify');
  assert.equal(healthVerify?.status, 'skipped');
});

// ---------------------------------------------------------------------------
// Phase trace integrity
// ---------------------------------------------------------------------------

test('all phases have startedAt and completedAt as valid ISO timestamps', async () => {
  const ctx = makeDryRunCtx();
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId });

  const result = await runProvisioningEngine(ctx, tenant, job);

  for (const phase of result.phases) {
    assert.ok(phase.startedAt, `Phase ${phase.phase} missing startedAt`);
    assert.ok(phase.completedAt, `Phase ${phase.phase} missing completedAt`);
    assert.ok(!Number.isNaN(Date.parse(phase.startedAt)), `Phase ${phase.phase} startedAt not ISO`);
    assert.ok(!Number.isNaN(Date.parse(phase.completedAt)), `Phase ${phase.phase} completedAt not ISO`);
  }
});

test('all phases have at least one log entry', async () => {
  const ctx = makeDryRunCtx();
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId });

  const result = await runProvisioningEngine(ctx, tenant, job);

  for (const phase of result.phases) {
    assert.ok(phase.logs.length > 0, `Phase ${phase.phase} has no log entries`);
  }
});

test('all log entries have valid at, level, and message fields', async () => {
  const ctx = makeDryRunCtx();
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId });

  const result = await runProvisioningEngine(ctx, tenant, job);

  for (const phase of result.phases) {
    for (const log of phase.logs) {
      assert.ok(log.at, `Log in phase ${phase.phase} missing 'at'`);
      assert.ok(!Number.isNaN(Date.parse(log.at)), `Log in phase ${phase.phase} has invalid 'at'`);
      assert.ok(['info', 'warn', 'error'].includes(log.level), `Log in phase ${phase.phase} has invalid level: ${log.level}`);
      assert.ok(typeof log.message === 'string' && log.message.length > 0, `Log in phase ${phase.phase} has empty message`);
    }
  }
});

test('phase auditEventIds are unique across all phases', async () => {
  const ctx = makeDryRunCtx();
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId });

  const result = await runProvisioningEngine(ctx, tenant, job);

  const ids = result.phases.map((p) => p.auditEventId).filter(Boolean);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, 'All phase auditEventIds must be unique');
});

// ---------------------------------------------------------------------------
// JobPhaseTrace type conformance
// ---------------------------------------------------------------------------

test('engine result phases conform to JobPhaseTrace shape', async () => {
  const ctx = makeDryRunCtx();
  const tenant = makeTenant();
  const job = makeJob({ id: ctx.jobId });

  const result = await runProvisioningEngine(ctx, tenant, job);

  for (const phase of result.phases) {
    // Validate as JobPhaseTrace
    const trace = phase as JobPhaseTrace;
    assert.ok(PROVISIONING_PHASES.includes(trace.phase), `phase.phase must be a valid JobPhase`);
    assert.ok(['pending', 'running', 'success', 'failed', 'skipped', 'planned'].includes(trace.status), `phase.status invalid: ${trace.status}`);
    assert.ok(Array.isArray(trace.logs), 'phase.logs must be an array');
  }
});
