/**
 * Tenant Policy Constraints
 *
 * Single source of truth for all tenant provisioning constraints:
 *   - VLAN/IP addressing rule: 10.<VLAN-ID>.10.100
 *   - Shirt-size resource bounds (SIZE_MAP)
 *   - Constraint violation types and admin override semantics
 *
 * All constraint enforcement passes through validateTenantPolicyConstraints().
 * Admin overrides are explicit opt-in and must be audit-logged by the caller.
 */

import type { TenantSize } from './types.ts';

// ---------------------------------------------------------------------------
// SIZE_MAP — canonical resource limits per shirt size
// ---------------------------------------------------------------------------

export const SIZE_MAP: Record<TenantSize, { cpu: number; ramGb: number; diskGb: number }> = {
  S:  { cpu: 2, ramGb: 4,  diskGb: 120 },
  M:  { cpu: 4, ramGb: 6,  diskGb: 200 },
  L:  { cpu: 6, ramGb: 12, diskGb: 400 },
  XL: { cpu: 8, ramGb: 16, diskGb: 800 },
};

export const VALID_TENANT_SIZES: TenantSize[] = ['S', 'M', 'L', 'XL'];

// ---------------------------------------------------------------------------
// VLAN/IP addressing
// ---------------------------------------------------------------------------

/** Canonical IP address formula for a given VLAN ID. */
export function computeTenantIp(vlan: number): string {
  return `10.${vlan}.10.100`;
}

/** Returns true when ipAddress matches the VLAN policy. */
export function isTenantIpValid(vlan: number, ipAddress: string): boolean {
  return ipAddress === computeTenantIp(vlan);
}

// ---------------------------------------------------------------------------
// Constraint violation types
// ---------------------------------------------------------------------------

export type ConstraintViolation =
  | { code: 'INVALID_SIZE';      message: string; field: 'size' }
  | { code: 'INVALID_VLAN';      message: string; field: 'vlan' }
  | { code: 'INVALID_IP';        message: string; field: 'ipAddress'; expected: string; received: string }
  | { code: 'MISSING_VLAN';      message: string; field: 'vlan' };

export type PolicyValidationResult =
  | { ok: true }
  | { ok: false; violations: ConstraintViolation[] };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface TenantPolicyInput {
  /** Validated size label (S/M/L/XL). */
  size: string;
  /** VLAN ID as number (may be undefined/null when missing). */
  vlan: number | undefined | null;
  /**
   * Optional explicit IP address submitted by the caller.
   * When present it MUST match 10.<VLAN>.10.100 unless the caller holds the
   * Admin role and has set policyOverride = true.
   */
  ipAddress?: string;
}

/**
 * Validate tenant policy constraints.
 *
 * @param input           - Fields relevant for policy checks.
 * @param policyOverride  - When true the caller claims an Admin override.
 *                          Violations are still collected and returned so the
 *                          caller can audit-log them — but ok is still true.
 * @returns PolicyValidationResult
 */
export function validateTenantPolicyConstraints(
  input: TenantPolicyInput,
  policyOverride = false
): PolicyValidationResult & { overriddenViolations?: ConstraintViolation[] } {
  const violations: ConstraintViolation[] = [];

  // 1. Shirt-size must be a key in SIZE_MAP
  if (!VALID_TENANT_SIZES.includes(input.size as TenantSize)) {
    violations.push({
      code: 'INVALID_SIZE',
      field: 'size',
      message: `Tenant size '${input.size}' is not valid. Allowed values: ${VALID_TENANT_SIZES.join(', ')}. Each size maps to defined CPU/RAM/disk limits (S=2vCPU/4GB/120GB, M=4vCPU/6GB/200GB, L=6vCPU/12GB/400GB, XL=8vCPU/16GB/800GB).`,
    });
  }

  // 2. VLAN must be present
  if (input.vlan == null) {
    violations.push({
      code: 'MISSING_VLAN',
      field: 'vlan',
      message: 'VLAN ID is required. It determines the tenant network segment and IP address (10.<VLAN>.10.100).',
    });
  }

  // 3. VLAN/IP addressing rule (only when VLAN is provided and an explicit IP is given)
  if (input.vlan != null && input.ipAddress !== undefined) {
    const expected = computeTenantIp(input.vlan);
    if (!isTenantIpValid(input.vlan, input.ipAddress)) {
      violations.push({
        code: 'INVALID_IP',
        field: 'ipAddress',
        message: `IP address '${input.ipAddress}' does not satisfy the VLAN addressing policy. For VLAN ${input.vlan} the required address is ${expected}.`,
        expected,
        received: input.ipAddress,
      });
    }
  }

  if (violations.length === 0) {
    return { ok: true };
  }

  if (policyOverride) {
    // Admin override: pass but surface what was overridden for audit logging
    return { ok: true, overriddenViolations: violations };
  }

  return { ok: false, violations };
}

/**
 * Build a human-readable error payload for constraint violations.
 * Suitable for inclusion in a 422 API response.
 */
export function buildConstraintViolationResponse(violations: ConstraintViolation[]) {
  return {
    error: 'Tenant policy constraint violations detected.',
    violations: violations.map((v) => ({ code: v.code, field: v.field, message: v.message })),
  };
}
