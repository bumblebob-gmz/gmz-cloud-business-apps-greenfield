# REVIEW-020 – Tenant Provisioning E2E Vertical Slice

**Story:** N2-1  
**Phase:** 2 – Provisioning Engine  
**Status:** ✅ Delivered  
**Date:** 2026-03-09  
**Author:** BMAD Subagent (gmz-cloud-business-apps)

---

## Summary

Implements the full Tenant Provisioning E2E vertical slice, wiring together:

```
Tenant Wizard / POST /api/provision/tenant
    → Provisioning Engine (lib/provisioning-engine.ts)
        → Phase: vm_create      (OpenTofu init + plan + apply)
        → Phase: network_config (VLAN/IP validation)
        → Phase: os_bootstrap   (Ansible bootstrap-tenant.yml)
        → Phase: app_deploy     (Ansible deploy-apps.yml)
        → Phase: health_verify  (HTTP health probe)
    → Audit trail (one start + progress + success/failure event per phase)
    → Job state updated at each phase transition
    → Tenant status promoted to 'Active' on full success
```

Both **dry-run** and **execution** modes are supported. A completed job reaches
`status: 'Success'` with a full five-phase `JobPhaseTrace` array and the tenant
record transitions from `Provisioning` → `Active`.

---

## Files Changed

| File | Change |
|---|---|
| `lib/types.ts` | Added `JobPhase`, `JobPhaseStatus`, `JobPhaseTrace`; added `phases` to `Job.details` |
| `lib/data-store.ts` | Added `updateTenant` (file + DB routing) |
| `lib/db/data-store-db.ts` | Added `dbUpdateTenant` (Prisma implementation) |
| `lib/provisioning-engine.ts` | **New** – Phase-based E2E orchestration engine |
| `app/api/provision/tenant/route.ts` | Wired to engine; removed inline command runner |
| `tests/provisioning-e2e.test.ts` | **New** – 24 tests (happy path + failure paths) |

---

## Architecture Decisions

### Phase Mapping to Commands

```
vm_create      ← tofu init (idx 0) + tofu plan (idx 1) + tofu apply (idx 2)
network_config ← derived from plan vars (VLAN/IP validation, no shell cmd)
os_bootstrap   ← ansible-playbook bootstrap-tenant.yml (idx 3)
app_deploy     ← ansible-playbook deploy-apps.yml (idx 4)
health_verify  ← HTTP probe to tenant IP (non-fatal if unreachable)
```

**Rationale:** The OpenTofu init/plan/apply triple is a single logical operation
(create the VM with its network). Separating `network_config` as a validation
step (no shell command) makes it independently auditable without duplicating
infrastructure work. `health_verify` is intentionally non-fatal on probe failure
because newly provisioned tenants may still be starting services.

### Cascade Semantics on Failure

Each phase checks the prior phase's status:
- If prior = `failed` or `skipped` → current phase transitions to `skipped` (not `failed`)
- `failedPhase` on `EngineResult` always points to the *first* failing phase

This keeps the job trace clean: one `failed` + N `skipped`, not N `failed`.

### Dry-Run Mode

In dry-run, all phases are executed through the engine with `dryRun: true`.
Each phase logs what *would* happen and emits audit events with `mode: 'dry-run'`.
The `JobPhaseStatus` is `'planned'` (not `'success'`) to clearly distinguish
simulation from real execution. `finalJobStatus` = `'DryRun'`.

### Audit Events per Phase

Each phase emits a minimum of **2 audit events** (start + success/failure).
Phases with shell commands also emit a **progress** event per command.

Example for `vm_create` (execution mode, 3 commands):
```
provision.phase.vm_create.start
provision.phase.vm_create.progress   (tofu init)
provision.phase.vm_create.progress   (tofu plan)
provision.phase.vm_create.progress   (tofu apply)
provision.phase.vm_create.success
```

All events conform to the existing `AuditEvent` schema (`validateAuditEnvelope`).

### Tenant Status Promotion

`updateTenant(tenant.id, { status: 'Active' })` is called only when:
- `dryRun === false`
- `engineResult.success === true` (all 5 phases completed without failure)

This is the authoritative signal that a tenant is operational.

---

## Test Coverage

### `tests/provisioning-e2e.test.ts` – 24 tests

| Category | Tests |
|---|---|
| Phase structure (pure) | PROVISIONING_PHASES order, getPhaseCommandIndices mapping |
| Audit event shapes | start/progress/success/failure for all 5 phases |
| Dry-run happy path | 5 phases planned, outputSummary complete, logs present, VM spec in logs |
| Execution happy path | All echo commands succeed → Success, all phases=success |
| Failure: vm_create | Cascades to skipped on downstream phases, error field populated |
| Failure: network_config | Invalid VLAN (0) → failed, invalid IP → failed |
| Failure: os_bootstrap | Cascades to skipped on app_deploy + health_verify |
| Phase trace integrity | startedAt/completedAt ISO, logs non-empty, auditEventIds unique |
| JobPhaseTrace conformance | All phases match type shape |

**All 24 tests pass. Full suite (80 tests) still green.**

---

## Provisioning Job Lifecycle Diagram

```
POST /api/provision/tenant
    │
    ├─ [auth guard]
    ├─ [secret guard]
    ├─ audit: tenant.provision.requested
    ├─ createJob (status=Queued|DryRun)
    ├─ materializeProvisionFiles (tfvars + inventory)
    ├─ [execution guard: PROVISION_EXECUTION_ENABLED check]
    ├─ audit: tenant.provision.execution_started
    │
    └─ runProvisioningEngine(ctx, tenant, job)
           │
           ├─ Phase 1: vm_create
           │     audit: provision.phase.vm_create.start
           │     [tofu init|plan|apply or dry-run simulation]
           │     audit: provision.phase.vm_create.success|failure
           │     updateJob(details.phases)
           │
           ├─ Phase 2: network_config
           │     audit: provision.phase.network_config.start
           │     [validate VLAN+IP from plan vars]
           │     audit: provision.phase.network_config.success|failure
           │     updateJob(details.phases)
           │
           ├─ Phase 3: os_bootstrap
           │     audit: provision.phase.os_bootstrap.start
           │     [ansible-playbook bootstrap-tenant.yml or skip]
           │     audit: provision.phase.os_bootstrap.success|failure
           │     updateJob(details.phases)
           │
           ├─ Phase 4: app_deploy
           │     audit: provision.phase.app_deploy.start
           │     [ansible-playbook deploy-apps.yml or skip]
           │     audit: provision.phase.app_deploy.success|failure
           │     updateJob(details.phases)
           │
           └─ Phase 5: health_verify
                 audit: provision.phase.health_verify.start
                 [HTTP probe to tenant IP or skip]
                 audit: provision.phase.health_verify.success|failure
                 updateJob(details.phases)
                 
                 if all success: updateTenant(status='Active')
    │
    ├─ [rollback hook if vm_create succeeded but later phase failed]
    ├─ updateJob(status=Success|Failed|DryRun, phases=full trace)
    └─ audit: tenant.provision.success|failure|dryrun_planned
```

---

## Job Data Shape (Success)

```json
{
  "id": "job-abc12345",
  "status": "Success",
  "details": {
    "dryRun": false,
    "phases": [
      { "phase": "vm_create",      "status": "success", "durationMs": 4200, "auditEventId": "..." },
      { "phase": "network_config", "status": "success", "durationMs": 12,   "auditEventId": "..." },
      { "phase": "os_bootstrap",   "status": "success", "durationMs": 38000,"auditEventId": "..." },
      { "phase": "app_deploy",     "status": "success", "durationMs": 22000,"auditEventId": "..." },
      { "phase": "health_verify",  "status": "success", "durationMs": 890,  "auditEventId": "..." }
    ],
    "outputSummary": "[vm_create:success] ... | [network_config:success] ... | ..."
  }
}
```

Tenant after success: `{ "status": "Active" }`

---

## Open Items / Future Work

| Item | Priority |
|---|---|
| `health_verify`: configurable retry count (e.g., 3 × 10 s) for slower stacks | M |
| `network_config`: real VLAN probe (ping or API check via Proxmox) instead of regex validation | M |
| `vm_create`: retry logic per command (inherits from `runProvisionCommands`, consider integrating) | L |
| `app_deploy`: per-app health check after deploy (not just tenant-level HTTP probe) | L |
| Phase timeout configuration via env vars | L |
| Streaming job logs via SSE for live UI feedback | XL |

---

## Exit Criteria Checklist

- [x] Five ordered phases: `vm_create → network_config → os_bootstrap → app_deploy → health_verify`
- [x] Each phase emits `provision.phase.<name>.start` + `success/failure` audit events
- [x] Each phase updates job state in data store (progressive persistence)
- [x] Dry-run mode: all phases planned, no commands executed, audit events emitted
- [x] Execution mode: real commands run, phases tracked, success promotes tenant to `Active`
- [x] Failed phase cascades: downstream phases marked `skipped`, not re-failed
- [x] Completed job reaches `status: 'Success'` with full `JobPhaseTrace` in `details.phases`
- [x] Tenant reaches `status: 'Active'` after successful full provisioning
- [x] All audit events conform to `validateAuditEnvelope` schema
- [x] 24 new tests (happy path + failure paths) – all passing
- [x] Full existing test suite (80 tests) remains green
- [x] BMAD review artifact written
