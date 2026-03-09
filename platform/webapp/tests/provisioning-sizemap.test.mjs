import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProvisionPlan } from '../lib/provisioning.ts';

/**
 * Tests that SIZE_MAP values match the spec:
 *  S:  2 vCPU / 4 GB RAM  / 120 GB disk
 *  M:  4 vCPU / 6 GB RAM  / 200 GB disk
 *  L:  6 vCPU / 12 GB RAM / 400 GB disk
 *  XL: 8 vCPU / 16 GB RAM / 800 GB disk
 */

function makeTenant(size, vlan = 100) {
  return {
    id: `tn-test-${size}`,
    name: `Test Tenant ${size}`,
    customer: 'Test Co',
    region: 'eu-central-1',
    status: 'Active',
    size,
    vlan,
    ipAddress: `10.${vlan}.10.100`
  };
}

test('SIZE_MAP S: 2 vCPU / 4 GB RAM / 120 GB disk', () => {
  const plan = buildProvisionPlan(makeTenant('S', 100));
  assert.equal(plan.vars.cpu, 2);
  assert.equal(plan.vars.ramGb, 4);
  assert.equal(plan.vars.diskGb, 120);
  assert.equal(plan.vars.memoryMb, 4 * 1024);
});

test('SIZE_MAP M: 4 vCPU / 6 GB RAM / 200 GB disk', () => {
  const plan = buildProvisionPlan(makeTenant('M', 101));
  assert.equal(plan.vars.cpu, 4);
  assert.equal(plan.vars.ramGb, 6);
  assert.equal(plan.vars.diskGb, 200);
  assert.equal(plan.vars.memoryMb, 6 * 1024);
});

test('SIZE_MAP L: 6 vCPU / 12 GB RAM / 400 GB disk', () => {
  const plan = buildProvisionPlan(makeTenant('L', 102));
  assert.equal(plan.vars.cpu, 6);
  assert.equal(plan.vars.ramGb, 12);
  assert.equal(plan.vars.diskGb, 400);
  assert.equal(plan.vars.memoryMb, 12 * 1024);
});

test('SIZE_MAP XL: 8 vCPU / 16 GB RAM / 800 GB disk', () => {
  const plan = buildProvisionPlan(makeTenant('XL', 103));
  assert.equal(plan.vars.cpu, 8);
  assert.equal(plan.vars.ramGb, 16);
  assert.equal(plan.vars.diskGb, 800);
  assert.equal(plan.vars.memoryMb, 16 * 1024);
});
