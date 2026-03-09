/**
 * Tests for audit event shapes emitted by provisioning and deploy endpoints.
 *
 * These tests validate that the audit event envelopes produced at key lifecycle
 * points conform to the AuditEvent schema (validateAuditEnvelope).  They use
 * only pure functions from lib/audit.ts – no HTTP layer, no DB, no FS.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditEvent, validateAuditEnvelope } from '../lib/audit.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_ACTOR = { type: 'user' as const, id: 'alice', role: 'admin' };
const BASE_SOURCE_PROVISION = { service: 'webapp', operation: 'POST /api/provision/tenant' };
const BASE_SOURCE_PREFLIGHT = { service: 'webapp', operation: 'GET /api/provision/preflight' };
const BASE_SOURCE_DEPLOY = { service: 'webapp', operation: 'POST /api/deployments' };
const CORRELATION_ID = 'corr-test-aaaaaaaa';

function buildAndValidate(input: Parameters<typeof buildAuditEvent>[0]): ReturnType<typeof buildAuditEvent> {
  const event = buildAuditEvent(input);
  const result = validateAuditEnvelope(event);
  assert.ok(result.ok, `validateAuditEnvelope failed: ${result.error ?? 'unknown'}`);
  return event;
}

// ---------------------------------------------------------------------------
// Preflight audit events
// ---------------------------------------------------------------------------

test('provision.preflight.checked emits a valid audit event', () => {
  const event = buildAndValidate({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'system',
    action: 'provision.preflight.checked',
    resource: 'provisioning',
    outcome: 'success',
    source: BASE_SOURCE_PREFLIGHT,
    details: {
      ready: false,
      executionEnabled: false,
      missingForExecution: ['PROVISION_PROXMOX_ENDPOINT', 'PROVISION_PROXMOX_API_TOKEN']
    }
  });

  assert.equal(event.action, 'provision.preflight.checked');
  assert.equal(event.outcome, 'success');
  assert.equal(event.tenantId, 'system');
  assert.equal(event.source.operation, 'GET /api/provision/preflight');
});

// ---------------------------------------------------------------------------
// Provision job lifecycle audit events
// ---------------------------------------------------------------------------

test('tenant.provision.requested emits a valid audit event', () => {
  const event = buildAndValidate({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'tn-001',
    action: 'tenant.provision.requested',
    resource: 'provisioning',
    outcome: 'success',
    source: BASE_SOURCE_PROVISION,
    details: { dryRun: true }
  });

  assert.equal(event.action, 'tenant.provision.requested');
  assert.equal(event.outcome, 'success');
  assert.deepEqual(event.details, { dryRun: true });
});

test('tenant.provision.execution_started (provision job start) emits a valid audit event', () => {
  const event = buildAndValidate({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'tn-001',
    action: 'tenant.provision.execution_started',
    resource: 'provisioning',
    outcome: 'success',
    source: BASE_SOURCE_PROVISION,
    details: { jobId: 'job-abc12345' }
  });

  assert.equal(event.action, 'tenant.provision.execution_started');
  assert.equal(event.outcome, 'success');
  assert.equal((event.details as Record<string, unknown>)?.jobId, 'job-abc12345');
});

test('tenant.provision.success (provision job success) emits a valid audit event', () => {
  const event = buildAndValidate({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'tn-001',
    action: 'tenant.provision.success',
    resource: 'provisioning',
    outcome: 'success',
    source: BASE_SOURCE_PROVISION,
    details: { jobId: 'job-abc12345', failedStep: undefined }
  });

  assert.equal(event.action, 'tenant.provision.success');
  assert.equal(event.outcome, 'success');
});

test('tenant.provision.failure (provision job failure) emits a valid audit event', () => {
  const event = buildAndValidate({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'tn-001',
    action: 'tenant.provision.failure',
    resource: 'provisioning',
    outcome: 'failure',
    source: BASE_SOURCE_PROVISION,
    details: { jobId: 'job-abc12345', failedStep: 'tofu-apply' }
  });

  assert.equal(event.action, 'tenant.provision.failure');
  assert.equal(event.outcome, 'failure');
  assert.equal((event.details as Record<string, unknown>)?.failedStep, 'tofu-apply');
});

test('tenant.provision.rollback.result (rollback triggered) emits a valid audit event', () => {
  const event = buildAndValidate({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'tn-001',
    action: 'tenant.provision.rollback.result',
    resource: 'provisioning',
    outcome: 'success',
    source: BASE_SOURCE_PROVISION,
    details: { attempted: true, ok: true, snippet: 'Rollback completed.' }
  });

  assert.equal(event.action, 'tenant.provision.rollback.result');
  assert.equal(event.outcome, 'success');
  assert.equal((event.details as Record<string, unknown>)?.attempted, true);
});

test('tenant.provision.rollback.attempted (rollback skipped) emits a valid audit event', () => {
  const event = buildAndValidate({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'tn-001',
    action: 'tenant.provision.rollback.attempted',
    resource: 'provisioning',
    outcome: 'success',
    source: BASE_SOURCE_PROVISION,
    details: { attempted: false, reason: 'No rollback hook configured (PROVISION_ROLLBACK_HOOK_CMD not set).' }
  });

  assert.equal(event.action, 'tenant.provision.rollback.attempted');
  assert.equal((event.details as Record<string, unknown>)?.attempted, false);
});

// ---------------------------------------------------------------------------
// Deploy job lifecycle audit events
// ---------------------------------------------------------------------------

test('deploy.start emits a valid audit event', () => {
  const event = buildAndValidate({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'Atlas Retail EU',
    action: 'deploy.start',
    resource: 'deployment',
    outcome: 'success',
    source: BASE_SOURCE_DEPLOY,
    details: { deploymentId: 'dep-abc12345', jobId: 'job-xyz98765', version: 'v1.7.0', env: 'Staging' }
  });

  assert.equal(event.action, 'deploy.start');
  assert.equal(event.outcome, 'success');
  assert.equal(event.resource, 'deployment');
  assert.equal((event.details as Record<string, unknown>)?.version, 'v1.7.0');
  assert.equal((event.details as Record<string, unknown>)?.env, 'Staging');
});

test('deploy.success emits a valid audit event', () => {
  const event = buildAndValidate({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'Atlas Retail EU',
    action: 'deploy.success',
    resource: 'deployment',
    outcome: 'success',
    source: BASE_SOURCE_DEPLOY,
    details: { deploymentId: 'dep-abc12345', jobId: 'job-xyz98765', version: 'v1.7.0', env: 'Staging' }
  });

  assert.equal(event.action, 'deploy.success');
  assert.equal(event.outcome, 'success');
});

test('deploy.failure emits a valid audit event', () => {
  const event = buildAndValidate({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'Atlas Retail EU',
    action: 'deploy.failure',
    resource: 'deployment',
    outcome: 'failure',
    source: BASE_SOURCE_DEPLOY,
    details: {
      deploymentId: 'dep-abc12345',
      jobId: 'job-xyz98765',
      version: 'v1.7.0',
      env: 'Production',
      error: 'ansible-playbook exited with code 2'
    }
  });

  assert.equal(event.action, 'deploy.failure');
  assert.equal(event.outcome, 'failure');
  assert.ok((event.details as Record<string, unknown>)?.error, 'error detail should be present');
});

test('deploy.dryrun_planned emits a valid audit event', () => {
  const event = buildAndValidate({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'Kite Logistics',
    action: 'deploy.dryrun_planned',
    resource: 'deployment',
    outcome: 'success',
    source: BASE_SOURCE_DEPLOY,
    details: { tenant: 'Kite Logistics', version: 'v1.7.0-rc1', env: 'Staging', dryRun: true }
  });

  assert.equal(event.action, 'deploy.dryrun_planned');
  assert.equal(event.outcome, 'success');
  assert.equal((event.details as Record<string, unknown>)?.dryRun, true);
});

// ---------------------------------------------------------------------------
// Event ID and timestamp are always auto-generated
// ---------------------------------------------------------------------------

test('buildAuditEvent always generates unique eventId and ISO timestamp', () => {
  const a = buildAuditEvent({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'tn-001',
    action: 'deploy.start',
    resource: 'deployment',
    outcome: 'success',
    source: BASE_SOURCE_DEPLOY
  });

  const b = buildAuditEvent({
    correlationId: CORRELATION_ID,
    actor: BASE_ACTOR,
    tenantId: 'tn-001',
    action: 'deploy.start',
    resource: 'deployment',
    outcome: 'success',
    source: BASE_SOURCE_DEPLOY
  });

  assert.ok(a.eventId.length >= 8, 'eventId must be at least 8 chars');
  assert.notEqual(a.eventId, b.eventId, 'consecutive events must have unique eventIds');
  assert.ok(!Number.isNaN(Date.parse(a.timestamp)), 'timestamp must be a valid ISO date');
});
