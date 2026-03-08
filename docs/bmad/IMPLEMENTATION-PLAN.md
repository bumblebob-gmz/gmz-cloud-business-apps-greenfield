# IMPLEMENTATION PLAN (BMAD – Implementation Stage)

- **Version:** 1.0
- **Date:** 2026-03-08
- **Scope:** Track A (Single-Host GA) execution baseline, with immediate focus on next 2 sprints
- **Inputs:** `docs/PRD.md`, `docs/ARCHITECTURE-V2.md`, `docs/bmad/DELIVERY-PLAN.md`, `docs/bmad/EPICS-AND-STORIES.md`, `docs/bmad/REVIEW-001.md`

---

## 1) Objectives for this implementation stage

1. Convert BMAD planning artifacts into sprint-executable work packages.
2. Resolve **REVIEW-001 blocking findings (B1–B4)** before claiming credible GA path.
3. Deliver a secure vertical slice: setup -> provisioning -> deploy baseline with auditable evidence.
4. Establish quality gates and test evidence as mandatory release inputs.

---

## 2) Critical path and sequencing

1. **Security and contracts first (B1, B4)**
   - Proxmox token auth + secure defaults + secret ingestion/redaction + audit envelope.
2. **Deployability baseline (B2)**
   - Catalog CI validator + 2 reference apps (Authentik, Nextcloud) with real templates/schemas.
3. **Day-2 safety baseline (B3)**
   - Snapshot-first nightly update + health gate + auto-rollback evidence pipeline.
4. **Scale from reference slice to portfolio and GA hardening**
   - Extend validated patterns to all 13 apps and complete Track A gates.

---

## 3) REVIEW-001 blocking findings – implementation handling

| ID | Required Outcome | Implementation Action | Owner Role | Target |
|---|---|---|---|---|
| B1 | Proxmox auth model aligned and secure by default | Switch OpenTofu provider to token auth, set TLS verify default (`insecure=false`), route secrets via encrypted refs/env only, add redaction tests | Platform Eng + Backend Eng | Sprint N+1 |
| B2 | Catalog runtime deployable and testable | Implement CI validator (`app.yaml`, vars schema, host pattern, healthchecks), certify 2 reference apps E2E | Automation Eng + Backend Eng | Sprint N+1 |
| B3 | Safe nightly updates with rollback | Implement mandatory pre-update snapshot, post-update health gate, rollback automation, audit/job evidence | Backend Eng + DevOps/SRE | Sprint N+2 |
| B4 | Security/RBAC/Audit integrated early | Deliver RBAC enforcement boundaries, audit event envelope v1, security acceptance tests in CI | Backend Eng + Fullstack Eng + QA | Sprint N+1/N+2 |

**Rule:** No Gate G2+ sign-off if any B1–B4 deliverable is incomplete.

---

## 4) Workstreams and ownership model

- **Platform Engineer:** OpenTofu modules, Proxmox integration/security defaults.
- **Automation Engineer:** CI validators, IaC/security scans, pipeline evidence publishing.
- **Backend Engineer:** API/worker orchestration, audit/events, update/rollback logic, secret service.
- **Fullstack Engineer:** Wizard/API contract wiring, RBAC UX boundaries, job/audit visibility.
- **DevOps/SRE:** observability baseline, alerting, rollback SLO instrumentation.
- **QA Engineer:** integration/e2e/negative-path automation, gate evidence verification.

---

## 5) Definition of Done (DoD)

A story is Done only if all conditions are met:
1. Functional ACs from `EPICS-AND-STORIES.md` pass.
2. Security controls for the story are implemented (authz, redaction, secret-safe logging).
3. Automated tests exist at required levels (unit + integration; e2e for workflow stories).
4. Audit events with correlation IDs are emitted for mutating operations.
5. Operational evidence is attached (logs, metrics, job traces, test report).
6. Runbook/update notes exist for new operational behavior.

---

## 6) Quality gates and release evidence

| Gate | Minimum Criteria | Mandatory Evidence |
|---|---|---|
| G1 (Mgmt baseline) | Setup preflight + bootstrap + integration validation working | Setup test report, health-summary output, Proxmox/IONOS validation logs |
| G2 (Provision+Deploy baseline) | Tenant provisioning vertical slice + deterministic deploy for 2 apps | E2E job traces, catalog CI report, deploy logs, audit samples |
| G3 (SSO baseline) | Authentik mandatory path + connector validation + mapping reliability | Auth flow test evidence, connector validation logs, mapping audit trail |
| G4 (Track A GA) | All P0 accepted, no Sev-1/2, nightly rollback drill passed | Full regression report, rollback drill artifact, security scan report, dashboard pack |

**Gate policy:** Failed security or rollback tests block promotion.

---

## 7) Test strategy (implementation-level)

1. **Unit tests**
   - Validation rules (VLAN/IP policy), schema validation, event envelope builders, RBAC policy checks.
2. **Integration tests**
   - Proxmox token auth connectivity/permission matrix; IONOS DNS challenge dry-run; secret envelope encryption + redaction.
3. **Workflow/E2E tests**
   - Tenant wizard -> OpenTofu -> Ansible -> Authentik mandatory gate.
   - Deploy/redeploy/remove on reference apps.
   - Nightly update: snapshot -> update -> fail health gate -> rollback.
4. **Security tests**
   - Secret scan in CI, TLS insecure-default regression guard, unauthorized action audit logging.
5. **Reliability tests**
   - Idempotent rerun tests for setup/provision/deploy; queue retry/dead-letter behavior.

---

## 8) Risks and active controls

- **External API instability (Proxmox/IONOS):** contract tests + retry/backoff + preflight fail-fast.
- **Secret leakage:** encrypted storage, redaction middleware, CI secret scanning.
- **App variance:** certification checklist + strict schema + reference app golden patterns.
- **Rollback failure risk:** snapshot required, rollback drills each sprint, rollback SLO alerts.

---

## 9) Immediate execution order (next 10 working days)

1. Finalize and merge Proxmox token auth + secure defaults (B1).
2. Merge audit envelope v1 + RBAC boundary enforcement baseline (B4).
3. Ship catalog CI validator + 2 certified reference apps (B2).
4. Start snapshot/health-gate/rollback orchestration implementation and test harness (B3 prep).
5. Publish first gate evidence bundle template (for G1/G2).

This document is the normative implementation baseline for sprint execution and QA sign-off.