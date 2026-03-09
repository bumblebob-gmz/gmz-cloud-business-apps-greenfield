# REVIEW-021: Tenant Policy Constraints (N2-2)

**Date:** 2026-03-09  
**Sprint:** Next-2  
**Story:** N2-2 – Enforce Tenant Policy Constraints  
**Status:** ✅ Implemented & Tested  
**Reviewer:** BMAD Auto-Review (subagent)  

---

## Summary

Implements and enforces the tenant policy constraint layer for the gmz-cloud-business-apps platform. All constraint violations are rejected at the API boundary with clear error responses. An explicit, audit-logged Admin override path is provided for exceptional cases.

---

## Changes Delivered

### New Files

| File | Purpose |
|------|---------|
| `platform/webapp/lib/tenant-policy.ts` | Central policy module: SIZE_MAP, VLAN/IP rule, constraint validation, violation types |
| `platform/webapp/tests/tenant-policy-constraints.test.ts` | API contract tests (22 tests) |
| `docs/bmad/REVIEW-021-TENANT-POLICY-CONSTRAINTS.md` | This review artifact |

### Modified Files

| File | Change |
|------|--------|
| `platform/webapp/app/api/tenants/route.ts` | Constraint enforcement + admin override audit path |
| `platform/webapp/lib/provisioning.ts` | Import SIZE_MAP from tenant-policy (single source of truth) |
| `platform/webapp/lib/types.ts` | Added `policyOverride?` and `ipAddress?` to `CreateTenantInput` |
| `platform/webapp/lib/data-store.ts` | Honour caller-supplied `ipAddress` (policy-validated upstream) |
| `platform/webapp/package.json` | Added `tenant-policy-constraints.test.ts` to `test:rbac` script |

---

## Constraint Rules Enforced

### 1. VLAN/IP Addressing Rule
**Rule:** `tenant.ipAddress === 10.<VLAN-ID>.10.100`

- Computed via `computeTenantIp(vlan)` in `lib/tenant-policy.ts`
- If a caller supplies an explicit `ipAddress` in the request body it MUST match the computed value
- Violation code: `INVALID_IP`
- Rejection: HTTP 422 with violation detail (expected vs received)

### 2. Shirt-Size Bounds Validation
**Rule:** `size ∈ { S, M, L, XL }` — each maps to fixed resource limits in SIZE_MAP

| Size | vCPU | RAM  | Disk  |
|------|------|------|-------|
| S    | 2    | 4 GB | 120 GB |
| M    | 4    | 6 GB | 200 GB |
| L    | 6    | 12 GB | 400 GB |
| XL   | 8    | 16 GB | 800 GB |

- `SIZE_MAP` is now the **single authoritative definition** — previously duplicated between `provisioning.ts` and implicit in the route validator
- `provisioning.ts` now imports from `tenant-policy.ts` (removed local copy)
- Violation code: `INVALID_SIZE`
- Rejection: HTTP 422 with valid sizes and resource limits in error message

### 3. Missing VLAN
- A tenant without a VLAN cannot be IP-addressed correctly
- Violation code: `MISSING_VLAN`
- Rejection: HTTP 422

---

## API Error Response Format

All policy violations return **HTTP 422 Unprocessable Entity**:

```json
{
  "error": "Tenant policy constraint violations detected.",
  "violations": [
    {
      "code": "INVALID_IP",
      "field": "ipAddress",
      "message": "IP address '10.101.10.100' does not satisfy the VLAN addressing policy. For VLAN 100 the required address is 10.100.10.100."
    }
  ]
}
```

Multiple violations accumulate — a request with a bad size AND wrong IP returns both violations in one response.

---

## Admin Override Path

When an Admin user sets `policyOverride: true` in the request body:

1. `validateTenantPolicyConstraints(input, true)` returns `{ ok: true, overriddenViolations: [...] }`
2. The route handler **immediately emits** a `tenant.create.policy_override` audit event containing:
   - `overriddenViolations` — full list of constraints that were bypassed
   - `adminUserId` — identity of the overriding admin
   - `reason: 'admin_explicit_override'`
3. The resolved IP is the admin-supplied `ipAddress` (if provided) rather than the computed one
4. The final `tenant.create.success` audit event includes `policyOverride: true`

**Non-admin roles:** `policyOverride` field is silently ignored — the constraint still applies.

### Audit Event Actions

| Action | Trigger |
|--------|---------|
| `tenant.create.policy_rejected` | Constraint violation, no override → 422 |
| `tenant.create.policy_override` | Admin override with violations → logged before create |
| `tenant.create.success` | Includes `policyOverride: true/false` field |

---

## Test Coverage

`tests/tenant-policy-constraints.test.ts` — 22 tests, all passing:

**computeTenantIp / isTenantIpValid (4 tests)**
- Correct formula for multiple VLANs
- True/false for matching/non-matching IPs

**SIZE_MAP integrity (5 tests)**
- Each size has correct CPU/RAM/disk values
- VALID_TENANT_SIZES contains exactly S, M, L, XL

**Valid payloads (2 tests)**
- Valid size + VLAN with and without ipAddress

**Invalid payloads / contract tests (8 tests)**
- `XXL` size → INVALID_SIZE
- `nano` size → INVALID_SIZE  
- Empty string size → INVALID_SIZE
- `null` VLAN → MISSING_VLAN
- `undefined` VLAN → MISSING_VLAN
- Wrong IP for VLAN → INVALID_IP with expected/received fields
- Wrong IP class → INVALID_IP
- Multiple violations accumulate

**Admin override path (3 tests)**
- Admin with wrong IP: `ok: true`, `overriddenViolations` populated with INVALID_IP
- Admin with invalid size: violation captured for audit
- Admin with clean input: `overriddenViolations` absent/empty

**buildConstraintViolationResponse (1 test)**
- Formats violation payload correctly for API response

---

## Test Run Result

```
# tests 80
# pass  80
# fail  0
```

All pre-existing tests continue to pass.

---

## Design Decisions

1. **Separate policy module** (`lib/tenant-policy.ts`) rather than inline in route: allows unit testing without HTTP infrastructure, enables reuse from provisioning/plan endpoints in future.

2. **SIZE_MAP as single source of truth**: Removed the duplicate definition from `provisioning.ts`. Breaking divergence between what the route validates and what gets provisioned is a class of bug eliminated.

3. **Violations accumulate**: Multiple constraints checked in one pass so callers get a complete error picture per request (not sequential 422 bounces).

4. **`ipAddress` not required in CreateTenantInput**: The field is optional. When absent, the IP is auto-computed from the VLAN policy. When present, it must match (unless admin override). This allows future extension without breaking existing API consumers.

5. **HTTP 422 vs 400**: Policy violations use 422 (Unprocessable Entity) to distinguish semantic business-rule failures from structural missing-field failures (400). This aligns with REST best practices and makes client error handling cleaner.

6. **policyOverride is Admin-gated at the route layer**: Even if a non-admin submits `policyOverride: true`, the route only honours it when `authz.auth.role === 'admin'`. The policy module itself is agnostic and accepts a boolean — callers control trust.

---

## Risks & Follow-ups

| Item | Priority | Notes |
|------|----------|-------|
| DB layer (`data-store-db.ts`) does not yet thread `ipAddress` from input | Medium | File fallback is correct; Prisma path should be updated when DB mode is active |
| VLAN range 2–4094: valid but wide — consider subnet collision detection | Low | Future story |
| `policyOverride` not surfaced in UI | Low | Admin UI could show a checkbox with warning; out of scope N2-2 |

---

*Generated as part of BMAD Sprint Next-2, story N2-2.*
