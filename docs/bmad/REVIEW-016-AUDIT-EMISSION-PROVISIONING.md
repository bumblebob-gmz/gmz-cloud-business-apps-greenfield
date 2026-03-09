# REVIEW-016 — Audit-Event Emission: Provisioning & Deploy Jobs

**Date:** 2026-03-09
**Author:** BMAD Agent (Lola)
**Status:** ✅ Implemented & Tested
**Related backlog item:** Implement Audit-Event Emission in Provisioning and Deploy Jobs

---

## 1. Summary

This review documents the implementation of audit-event emission at all key lifecycle points in the provisioning pipeline and the new deploy-job endpoint.  The existing `appendAuditEvent` / `buildAuditEvent` infrastructure in `lib/audit.ts` was used throughout; no new audit primitives were introduced.

---

## 2. Scope of Changes

| File | Change |
|---|---|
| `app/api/provision/preflight/route.ts` | Add `provision.preflight.checked` audit event on every successful GET |
| `app/api/deployments/route.ts` | Add POST endpoint with full deploy-job lifecycle + audit emission |
| `lib/types.ts` | Add `CreateDeploymentInput` and `UpdateDeploymentPatch` types |
| `lib/data-store.ts` | Add `createDeployment` / `updateDeployment` (file-based adapter) |
| `lib/db/data-store-db.ts` | Add `dbCreateDeployment` / `dbUpdateDeployment` (PostgreSQL adapter) |
| `tests/audit-emit-provision-deploy.test.ts` | 12 new tests covering all emitted event shapes |
| `package.json` | Register new test file in `test:rbac` script |

---

## 3. Audit Events Emitted

### 3.1 Preflight (`GET /api/provision/preflight`)

| Event action | Outcome | When |
|---|---|---|
| `provision.preflight.checked` | `success` | Every authenticated call; details include `ready`, `executionEnabled`, `missingForExecution` |

### 3.2 Provision Job (`POST /api/provision/tenant`)

These events already existed and were confirmed correct.  Listed here for completeness.

| Event action | Outcome | When |
|---|---|---|
| `tenant.provision.failure` | `denied` | Forbidden secret keys detected in request body |
| `tenant.provision.requested` | `success` | Request accepted (after secrets check) |
| `tenant.provision.failure` | `failure` | Tenant not found |
| `tenant.provision.dryrun_planned` | `success` | Dry-run mode: plan generated, no execution |
| `tenant.provision.failure` | `denied` | Execution disabled (`PROVISION_EXECUTION_ENABLED` not set) |
| `tenant.provision.failure` | `failure` | Missing required env vars for execution |
| `tenant.provision.execution_started` | `success` | **Provision job start** — job status set to `Running` |
| `tenant.provision.rollback.result` | `success`/`failure` | **Rollback triggered** — rollback hook ran (result captured) |
| `tenant.provision.rollback.attempted` | `success` | **Rollback skipped** — hook not configured or not needed |
| `tenant.provision.success` | `success` | **Provision job success** — all commands completed |
| `tenant.provision.failure` | `failure` | **Provision job failure** — at least one command failed |

### 3.3 Deploy Job (`POST /api/deployments`)

| Event action | Outcome | When |
|---|---|---|
| `deploy.failure` | `failure` | Validation error (missing tenant ref, version, or invalid env) |
| `deploy.dryrun_planned` | `success` | Dry-run requested; no job or deployment record created |
| `deploy.start` | `success` | **Deploy start** — Job and Deployment records created, execution beginning |
| `deploy.success` | `success` | **Deploy success** — ansible-playbook (or no-op if tooling absent) succeeded |
| `deploy.failure` | `failure` | **Deploy failure** — ansible-playbook exited non-zero |

---

## 4. Deploy Job Lifecycle

The new `POST /api/deployments` endpoint follows the same pattern as the provisioning endpoint:

```
POST /api/deployments
  body: { tenantName | tenantId, version, env, dryRun? }

  1. Auth check (requireProtectedOperation)
  2. Input validation → audit failure on bad input
  3. dryRun=true → emit deploy.dryrun_planned, return 200
  4. createDeployment (status: Healthy) + createJob (status: Running)
  5. emit deploy.start
  6. Run ansible-playbook (if DEPLOY_PLAYBOOK_PATH + DEPLOY_INVENTORY_PATH set)
     or no-op success (tooling not configured)
  7. updateJob (Success|Failed) + updateDeployment (Healthy|Failed)
  8. emit deploy.success | deploy.failure
  9. Return { mode, correlationId, deployment, job, success }
```

When `DEPLOY_PLAYBOOK_PATH` and `DEPLOY_INVENTORY_PATH` are **not** set, the deploy is treated as a successful no-op.  This mirrors the provisioning dry-run pattern and keeps the endpoint functional in dev/test environments without Ansible installed.

---

## 5. Actor & Source Pattern

All events follow the established pattern:

```typescript
buildAuditEvent({
  correlationId,
  actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
  tenantId: ...,          // tenant id or 'system' for system-level events
  action: 'deploy.start', // dot-separated namespace
  resource: 'deployment', // top-level resource noun
  outcome: 'success',     // success | failure | denied
  source: { service: 'webapp', operation: 'POST /api/deployments' },
  details: { ... }        // structured, no secrets
})
```

The `tenantId` is `'system'` for preflight events (no specific tenant context).

---

## 6. Test Coverage

12 new tests in `tests/audit-emit-provision-deploy.test.ts`:

- `provision.preflight.checked` shape
- `tenant.provision.requested` shape
- `tenant.provision.execution_started` (provision job start)
- `tenant.provision.success` (provision job success)
- `tenant.provision.failure` (provision job failure)
- `tenant.provision.rollback.result` (rollback triggered)
- `tenant.provision.rollback.attempted` (rollback skipped)
- `deploy.start`
- `deploy.success`
- `deploy.failure`
- `deploy.dryrun_planned`
- `buildAuditEvent` always generates unique eventId + valid ISO timestamp

All 45 tests pass (33 pre-existing + 12 new).

---

## 7. Risks & Notes

- **No schema migration required:** The Prisma `Deployment` model already has all fields needed by `createDeployment`. The `correlationId` is tracked via the associated `Job` record, not the `Deployment` record itself (consistent with the existing data model).
- **Tooling-absent deploy:** When `DEPLOY_PLAYBOOK_PATH`/`DEPLOY_INVENTORY_PATH` are unset the POST returns success without running any commands. This is intentional for dev environments and mirrors the provisioning no-op pattern. Operators should set these env vars in production.
- **Preflight tenantId `'system'`:** Since preflight is not scoped to a tenant, `tenantId: 'system'` is used. This satisfies the `minLength: 1` schema requirement and is consistent with how other system-level audit events are modelled.
