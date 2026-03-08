# SPRINT BACKLOG – NEXT 2 SPRINTS (Execution Baseline)

- **Version:** 1.0
- **Date:** 2026-03-08
- **Sprint length:** 2 weeks each
- **Goal:** Close REVIEW-001 blockers and reach G1/G2-ready technical baseline

---

## Sprint N+1 (Immediate) – “Secure foundation + deployability MVP”

### Sprint Goal
Resolve **B1, B2 (MVP), B4 (baseline)** and produce evidence package for secure setup + initial deploy path.

### Backlog Items

| ID | Story/Task | Owner Role | Est. | Priority | Dependencies | DoD / Acceptance |
|---|---|---|---:|---|---|---|
| N1-1 | Refactor OpenTofu Proxmox auth to API token inputs (remove user/pass path from default flow) | Platform Eng | 5 SP | P0 | E1-S3 | Token auth works in integration tests; sensitive vars marked; docs updated |
| N1-2 | Set secure TLS default (`proxmox_insecure=false`) + lab-only explicit override flag | Platform Eng | 2 SP | P0 | N1-1 | CI guard prevents insecure default regression |
| N1-3 | Secret ingestion contract v1 (env/secret-ref only) + log redaction middleware baseline | Backend Eng | 5 SP | P0 | N1-1 | No plaintext secret in logs; unit + integration tests pass |
| N1-4 | Audit event envelope v1 implementation (actor, tenant, action, outcome, correlationId) for provision/deploy paths | Backend Eng | 5 SP | P0 | N1-3 | Events persisted + queryable; contract tests pass |
| N1-5 | RBAC boundary enforcement baseline (Admin/Techniker/ReadOnly on critical mutating endpoints) | Backend Eng + Fullstack Eng | 5 SP | P0 | N1-4 | Unauthorized actions denied and audit-logged |
| N1-6 | Catalog CI validator MVP (`app.yaml`, vars schema completeness, host pattern policy, healthcheck presence) | Automation Eng | 5 SP | P0 | none | Failing app manifests block merge with field-level error output |
| N1-7 | Reference app certification #1: Authentik (real compose template + vars schema + smoke test) | Automation Eng + Backend Eng | 3 SP | P1 | N1-6 | Deploy/redeploy/remove pass on reference tenant |
| N1-8 | Reference app certification #2: Nextcloud (real compose template + vars schema + smoke test) | Automation Eng + Backend Eng | 3 SP | P1 | N1-6 | Deploy/redeploy/remove pass on reference tenant |
| N1-9 | Gate evidence template automation for G1/G2 (test report + logs + audit sample artifact bundle) | QA + Automation Eng | 3 SP | P1 | N1-4, N1-6 | CI publishes artifact bundle on main branch |

### Sprint N+1 Quality Gates
- **Must-pass before sprint close:** N1-1..N1-6
- **Stretch but expected:** N1-7, N1-8, N1-9
- **Exit Criteria:**
  1. REVIEW-001 B1 resolved.
  2. REVIEW-001 B4 baseline resolved.
  3. REVIEW-001 B2 has working MVP validator + 2 certified apps.

### Sprint N+1 Test Focus
- Proxmox auth integration tests (rights matrix + TLS verify enabled).
- Secret redaction regression tests.
- RBAC negative tests (403 + audit event assertion).
- Catalog validator CI tests with broken fixture manifests.

---

## Sprint N+2 – “Provisioning vertical slice + safe update/rollback”

### Sprint Goal
Resolve **B3 fully**, complete E2 vertical slice, and make G2 evidence generation repeatable.

### Backlog Items

| ID | Story/Task | Owner Role | Est. | Priority | Dependencies | DoD / Acceptance |
|---|---|---|---:|---|---|---|
| N2-1 | Tenant provisioning vertical slice: wizard/API -> OpenTofu -> Ansible -> auditable job phases | Backend Eng + Fullstack Eng + Platform Eng | 8 SP | P0 | N1-1, N1-4 | End-to-end run reaches `active` with full job trace |
| N2-2 | Enforce tenant policy constraints (VLAN/IP rule `10.<VLAN>.10.100`, shirt-size bounds) with API contract tests | Backend Eng | 3 SP | P0 | N2-1 | Invalid payloads rejected; override path restricted to Admin |
| N2-3 | Nightly update pipeline wiring: maintenance window check + mandatory pre-update snapshot | Backend Eng | 5 SP | P0 | N2-1 | Update job blocked without snapshot; snapshot id stored in job evidence |
| N2-4 | Health-gated auto-rollback implementation (failed post-check => rollback + status recovery) | Backend Eng + DevOps/SRE | 5 SP | P0 | N2-3 | Rollback drill passes; tenant returns to last known healthy state |
| N2-5 | Observability minimum for update/provision jobs (metrics, structured logs, rollback alert) | DevOps/SRE | 3 SP | P1 | N2-3 | Grafana/Loki panels available; alert fires on rollback failure |
| N2-6 | Security CI pack: secret scan + IaC security lint + authz/audit regression suite | QA + Automation Eng | 3 SP | P1 | N1-3, N1-5 | CI fails on security regressions; report artifact published |
| N2-7 | Gate artifact publisher v2 for G2 (provision e2e + deploy trace + rollback drill evidence) | QA + Automation Eng | 2 SP | P1 | N2-1, N2-4 | One-command/one-pipeline gate bundle generation |

### Sprint N+2 Quality Gates
- **Must-pass before sprint close:** N2-1..N2-4
- **Exit Criteria:**
  1. REVIEW-001 B3 resolved with tested rollback automation.
  2. G2 readiness evidence available from CI artifacts.
  3. No open Sev-1/Sev-2 issues introduced by N+1/N+2 scope.

### Sprint N+2 Test Focus
- Full provisioning e2e (happy + fail paths).
- Update pipeline chaos tests (failed health endpoint, snapshot failure, rollback failure handling).
- Correlation ID continuity across API/worker/audit logs.
- Performance checks: provisioning median target trend toward <=15 min.

---

## Cross-Sprint Dependency Notes

1. N2-1 depends on stable N1 auth/security contracts; do not start broad E2 rollout before N1-1..N1-5 merge.
2. N2-3/N2-4 depend on reliable healthcheck definitions from N1-7/N1-8 pattern; extend same profile template.
3. Gate evidence automation (N1-9, N2-7) is mandatory for objective gate decisions and must not be deferred.

---

## Capacity / Ownership Split (recommended)

- Platform Eng: 35%
- Backend Eng: 35%
- Automation + QA: 20%
- Fullstack + DevOps/SRE: 10%

If capacity drops, protect **P0 items first**; defer only P1 observability enhancements, never rollback/security baselines.