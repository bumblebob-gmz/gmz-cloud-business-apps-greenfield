/**
 * Tenant Policy Constraint Tests — N2-2
 *
 * Verifies:
 *   1. VLAN/IP addressing rule: 10.<VLAN-ID>.10.100
 *   2. SIZE_MAP bounds: only S/M/L/XL are valid sizes
 *   3. Missing VLAN is rejected
 *   4. Admin policyOverride bypasses violations (but surfaces them for audit)
 *   5. computeTenantIp produces correct addresses
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateTenantPolicyConstraints,
  buildConstraintViolationResponse,
  computeTenantIp,
  isTenantIpValid,
  SIZE_MAP,
  VALID_TENANT_SIZES,
} from '../lib/tenant-policy.ts';

// ---------------------------------------------------------------------------
// computeTenantIp
// ---------------------------------------------------------------------------

test('computeTenantIp: produces 10.<VLAN>.10.100 for various VLANs', () => {
  assert.equal(computeTenantIp(100), '10.100.10.100');
  assert.equal(computeTenantIp(120), '10.120.10.100');
  assert.equal(computeTenantIp(2),   '10.2.10.100');
  assert.equal(computeTenantIp(4094),'10.4094.10.100');
});

test('isTenantIpValid: returns true for matching IP', () => {
  assert.equal(isTenantIpValid(100, '10.100.10.100'), true);
  assert.equal(isTenantIpValid(130, '10.130.10.100'), true);
});

test('isTenantIpValid: returns false for wrong IP', () => {
  assert.equal(isTenantIpValid(100, '10.101.10.100'), false);
  assert.equal(isTenantIpValid(100, '192.168.1.1'),   false);
  assert.equal(isTenantIpValid(100, '10.100.10.101'), false);
});

// ---------------------------------------------------------------------------
// SIZE_MAP integrity
// ---------------------------------------------------------------------------

test('SIZE_MAP: S has 2 vCPU / 4 GB RAM / 120 GB disk', () => {
  assert.deepEqual(SIZE_MAP['S'], { cpu: 2, ramGb: 4,  diskGb: 120 });
});

test('SIZE_MAP: M has 4 vCPU / 6 GB RAM / 200 GB disk', () => {
  assert.deepEqual(SIZE_MAP['M'], { cpu: 4, ramGb: 6,  diskGb: 200 });
});

test('SIZE_MAP: L has 6 vCPU / 12 GB RAM / 400 GB disk', () => {
  assert.deepEqual(SIZE_MAP['L'], { cpu: 6, ramGb: 12, diskGb: 400 });
});

test('SIZE_MAP: XL has 8 vCPU / 16 GB RAM / 800 GB disk', () => {
  assert.deepEqual(SIZE_MAP['XL'], { cpu: 8, ramGb: 16, diskGb: 800 });
});

test('VALID_TENANT_SIZES contains exactly S, M, L, XL', () => {
  assert.deepEqual([...VALID_TENANT_SIZES].sort(), ['L', 'M', 'S', 'XL']);
});

// ---------------------------------------------------------------------------
// validateTenantPolicyConstraints — valid payloads
// ---------------------------------------------------------------------------

test('policy: valid size + VLAN, no ipAddress → ok', () => {
  const result = validateTenantPolicyConstraints({ size: 'M', vlan: 120 });
  assert.equal(result.ok, true);
});

test('policy: valid size + VLAN + matching ipAddress → ok', () => {
  const result = validateTenantPolicyConstraints({ size: 'L', vlan: 200, ipAddress: '10.200.10.100' });
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// validateTenantPolicyConstraints — invalid payloads (contract tests)
// ---------------------------------------------------------------------------

test('policy: out-of-bounds size "XXL" is rejected', () => {
  const result = validateTenantPolicyConstraints({ size: 'XXL', vlan: 100 });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  const violation = result.violations.find((v) => v.code === 'INVALID_SIZE');
  assert.ok(violation, 'Expected INVALID_SIZE violation');
  assert.equal(violation!.field, 'size');
  assert.ok(violation!.message.includes('XXL'));
});

test('policy: out-of-bounds size "nano" is rejected', () => {
  const result = validateTenantPolicyConstraints({ size: 'nano', vlan: 100 });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  const violation = result.violations.find((v) => v.code === 'INVALID_SIZE');
  assert.ok(violation);
});

test('policy: empty size "" is rejected', () => {
  const result = validateTenantPolicyConstraints({ size: '', vlan: 100 });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
});

test('policy: missing VLAN (null) is rejected', () => {
  const result = validateTenantPolicyConstraints({ size: 'S', vlan: null });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  const violation = result.violations.find((v) => v.code === 'MISSING_VLAN');
  assert.ok(violation, 'Expected MISSING_VLAN violation');
  assert.equal(violation!.field, 'vlan');
});

test('policy: missing VLAN (undefined) is rejected', () => {
  const result = validateTenantPolicyConstraints({ size: 'M', vlan: undefined });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  const violation = result.violations.find((v) => v.code === 'MISSING_VLAN');
  assert.ok(violation);
});

test('policy: wrong IP for VLAN 100 is rejected', () => {
  const result = validateTenantPolicyConstraints({
    size: 'M',
    vlan: 100,
    ipAddress: '10.101.10.100',
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  const violation = result.violations.find((v) => v.code === 'INVALID_IP');
  assert.ok(violation, 'Expected INVALID_IP violation');
  assert.equal(violation!.field, 'ipAddress');
  if (violation!.code === 'INVALID_IP') {
    assert.equal(violation!.expected, '10.100.10.100');
    assert.equal(violation!.received, '10.101.10.100');
  }
});

test('policy: wrong IP class is rejected', () => {
  const result = validateTenantPolicyConstraints({
    size: 'L',
    vlan: 200,
    ipAddress: '192.168.200.100',
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  const ipViolation = result.violations.find((v) => v.code === 'INVALID_IP');
  assert.ok(ipViolation);
});

test('policy: multiple violations accumulate (bad size + wrong IP)', () => {
  const result = validateTenantPolicyConstraints({
    size: 'XXXL',
    vlan: 100,
    ipAddress: '192.168.1.1',
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.ok(result.violations.length >= 2, `Expected ≥2 violations, got ${result.violations.length}`);
});

// ---------------------------------------------------------------------------
// Admin override path
// ---------------------------------------------------------------------------

test('policy override: admin can bypass invalid IP, violation surfaces as overriddenViolations', () => {
  const result = validateTenantPolicyConstraints(
    { size: 'M', vlan: 100, ipAddress: '10.99.10.100' },
    true // policyOverride = true (Admin)
  );
  assert.equal(result.ok, true, 'Admin override should make ok=true');
  assert.ok(result.overriddenViolations && result.overriddenViolations.length > 0,
    'Overridden violations should be populated for audit logging');
  const ipViolation = result.overriddenViolations?.find((v) => v.code === 'INVALID_IP');
  assert.ok(ipViolation, 'INVALID_IP should be present in overriddenViolations');
});

test('policy override: admin can bypass invalid size, violation captured for audit', () => {
  const result = validateTenantPolicyConstraints(
    { size: 'MEGA', vlan: 100 },
    true
  );
  assert.equal(result.ok, true);
  const sizeViolation = result.overriddenViolations?.find((v) => v.code === 'INVALID_SIZE');
  assert.ok(sizeViolation, 'INVALID_SIZE should appear in overriddenViolations for audit');
});

test('policy override with no violations: overriddenViolations is absent or empty', () => {
  const result = validateTenantPolicyConstraints(
    { size: 'XL', vlan: 300, ipAddress: '10.300.10.100' },
    true
  );
  assert.equal(result.ok, true);
  const hasOverrides = Array.isArray(result.overriddenViolations) && result.overriddenViolations.length > 0;
  assert.equal(hasOverrides, false, 'No overrides expected when input is clean');
});

// ---------------------------------------------------------------------------
// buildConstraintViolationResponse
// ---------------------------------------------------------------------------

test('buildConstraintViolationResponse: formats violations correctly', () => {
  const result = validateTenantPolicyConstraints({ size: 'HUGE', vlan: null });
  assert.equal(result.ok, false);
  if (!result.ok) {
    const payload = buildConstraintViolationResponse(result.violations);
    assert.ok(payload.error.includes('policy constraint'));
    assert.ok(Array.isArray(payload.violations));
    assert.ok(payload.violations.length >= 2); // INVALID_SIZE + MISSING_VLAN
    for (const v of payload.violations) {
      assert.ok(v.code);
      assert.ok(v.field);
      assert.ok(v.message);
    }
  }
});
