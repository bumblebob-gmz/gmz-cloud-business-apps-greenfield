# Product Requirements Document (PRD)
## GMZ Cloud Business Apps

- **Version:** 1.0
- **Date:** 2026-03-08
- **Status:** Draft for implementation
- **Product Owner:** GMZ / Robert
- **Scope Baseline:** v1 Single-Host GA + v1.5 HA Readiness

---

## 1. Vision
Deliver a deterministic internal control plane that enables GMZ technicians to onboard and operate customer business-app environments on Proxmox with high consistency, security-by-default, and low operational risk.

The platform must replace manual, technician-dependent setup with guided workflows and automated guardrails across provisioning, deployment, SSO, operations, and reporting.

---

## 2. Business Goals
1. **Reduce onboarding effort/time**
   - Tenant provisioning from wizard submission to reachable services in <= 15 minutes (after management VM is ready).
2. **Increase operational reliability**
   - Nightly updates execute within tenant maintenance windows with mandatory pre-snapshot and health-gated auto-rollback.
3. **Standardize service delivery quality**
   - Eliminate manual drift through OpenTofu + Ansible + catalog-driven Compose deployments.
4. **Strengthen governance and trust**
   - Enforce RBAC + immutable audit trail for provisioning/deploy/update/secret-change operations.
5. **Enable scalable internal growth**
   - Stabilize single-host production first, then provide HA readiness without architecture drift.

---

## 3. Explicit Constraints (Robert / GMZ)
These are non-negotiable and must be enforced in implementation:

1. Proxmox 9 is the virtualization base.
2. Exactly **one Debian 13 tenant VM per customer**.
3. Fixed network convention per tenant:
   - VLAN ID is mandatory.
   - Tenant IP is strictly `10.<VLAN-ID>.10.100`.
4. Central ingress/TLS via management-plane Traefik.
5. Domain schema: `<service>.<customer>.irongeeks.eu` under `*.irongeeks.eu`.
6. IONOS DNS is required for DNS/ACME automation.
7. **Authentik is mandatory per tenant**; SSO integrations depend on healthy Authentik baseline.
8. Initial app portfolio (13 apps) must be deployable via catalog.
9. Nightly updates require snapshot + health checks + auto-rollback.
10. Backups are out of scope for v1 (snapshot usage for update rollback only, not backup productization).
11. Delivery sequencing constraint: **Single-host GA before HA rollout**.

---

## 4. Personas

### 4.1 Primary Persona: IT Technician / Admin (internal)
- Onboards new tenants, configures SSO mode (Entra/LDAP/Local), selects apps, runs updates, handles incidents.
- Needs guided workflows, deterministic behavior, fast diagnostics, low cognitive load.

### 4.2 Secondary Persona: Platform Engineer
- Maintains IaC modules, catalog schema, deployment worker, and release process.
- Needs strict contracts, idempotency, testability, and clear failure surfaces.

### 4.3 Secondary Persona: Operations / Service Manager
- Monitors health/SLA-adjacent metrics, reviews reports, audits changes.
- Needs tenant-filterable observability, reliable reports, and auditable change history.

---

## 5. Scope

## 5.1 In Scope (v1)
- Management VM setup wizard (preflight, integrations, core service bootstrap, validation).
- Tenant wizard and one-click provisioning pipeline (OpenTofu -> Ansible bootstrap).
- Catalog-based app deployment runtime (render, deploy/update/remove, job traceability).
- Mandatory Authentik deployment + connector automation (Entra/LDAP/Local).
- RBAC roles (Admin, Techniker, ReadOnly).
- Secret encryption baseline (envelope encryption), redaction controls.
- Audit event ledger and searchable audit view.
- Monitoring/logging baseline and alerting.
- Nightly update flow with mandatory VM snapshot and health-gated auto-rollback.
- Asynchronous PDF/CSV reporting.

## 5.2 Out of Scope (v1)
- Backup/restore productization.
- Kubernetes runtime migration.
- Full production HA operation (only readiness path and runbooks in v1.5).

---

## 6. Functional Requirements

## 6.1 Setup Wizard (Management Plane)
**FR-SETUP-01** System preflight must validate Debian version, resources, DNS/outbound, and NTP.
- Test: structured JSON result with pass/warn/fail per check; hard failures block install.

**FR-SETUP-02** Wizard must install/configure Docker/Compose and firewall baseline idempotently.
- Test: rerun produces no unintended changes.

**FR-SETUP-03** Wizard must validate Proxmox API credentials/permissions and output remediation hints.
- Test: missing VM create/list/network rights fail with actionable reason.

**FR-SETUP-04** Wizard must validate IONOS credentials and complete ACME DNS challenge dry-run.
- Test: zone visibility + challenge pass required before progressing.

**FR-SETUP-05** Wizard must bootstrap core control-plane services (PostgreSQL, Redis, API, Worker, Traefik, Monitoring) and run migrations.
- Test: health summary endpoint reports all components.

**FR-SETUP-06** Wizard must initialize security baseline (initial admin, RBAC roles, encryption key, audit logging).

## 6.2 Tenant Provisioning Wizard
**FR-TENANT-01** Tenant wizard must capture customer slug, VLAN ID, shirt size, app list, maintenance window, and auth mode.

**FR-TENANT-02** System must enforce IP rule `10.<VLAN-ID>.10.100` with no deviation unless explicit admin override policy exists.

**FR-TENANT-03** Shirt size presets S/M/L/XL must map to approved CPU/RAM/storage profiles.

**FR-TENANT-04** Provisioning must execute as auditable async job with states: queued/running/success/fail.

**FR-TENANT-05** OpenTofu module must provide deterministic outputs (VMID, IP, node, storage) and trigger Ansible bootstrap automatically.

## 6.3 App Deployment Runtime
**FR-DEPLOY-01** App catalog entries must pass schema validation in CI before deployable state.

**FR-DEPLOY-02** Template renderer must fail-fast when required variables are missing.

**FR-DEPLOY-03** Secrets must only be injected from secret store; never from repo plaintext.

**FR-DEPLOY-04** Deploy worker must support deploy/redeploy/remove with per-job and per-app logs.

**FR-DEPLOY-05** Failure in one app deployment must not corrupt healthy deployed apps.

**FR-DEPLOY-06** All initial 13 apps must be deployable with healthcheck definitions and pinned minimum versions.

## 6.4 Authentik & SSO
**FR-AUTH-01** Authentik deployment is mandatory; tenant provisioning fails if Authentik step is unhealthy/skipped.

**FR-AUTH-02** Wizard/API must support connector modes: Entra, LDAP, Local with mode-specific validation.

**FR-AUTH-03** For `supportsSSO=true` apps, provider/application mapping must be automated with callback URL validation.

**FR-AUTH-04** Connector and mapping updates must generate audit events.

## 6.5 Operations, Monitoring, Reporting
**FR-OPS-01** Grafana dashboards must provide infra, tenant, app, and Authentik views.

**FR-OPS-02** Logs must be centrally aggregated and filterable by tenant/app.

**FR-OPS-03** Nightly update pipeline must enforce tenant maintenance windows.

**FR-OPS-04** Pre-update VM snapshot must be mandatory.

**FR-OPS-05** Post-update health-check failure must trigger automatic rollback and audit/job evidence.

**FR-OPS-06** Report generation (PDF/CSV) must run asynchronously and include customer, users, storage, active services, and health status.

## 6.6 RBAC, Audit, Secrets
**FR-SEC-01** Roles: Admin, Techniker, ReadOnly must be enforced across API/UI actions.

**FR-SEC-02** Sensitive actions (secret access, deploy/remove, tenant delete, connector changes) must be role-restricted.

**FR-SEC-03** Unauthorized attempts must be logged.

**FR-SEC-04** Audit ledger entries must include actor, tenant, action, timestamp, outcome, correlation ID.

**FR-SEC-05** Secrets must be encrypted at rest using envelope encryption; rotation path documented and testable.

---

## 7. Non-Functional Requirements

## 7.1 Security
- TLS verification enabled by default for external integrations.
- No plaintext secrets in repo, logs, or exported reports.
- Secret redaction middleware mandatory for logs/job traces.
- Principle of least privilege for Proxmox/IONOS/API permissions.

## 7.2 Availability & Reliability
- Control-plane services must expose health endpoints and restart policies.
- Provisioning/deploy/update operations must be idempotent.
- Rollback must return tenant to last known healthy state after failed update.

## 7.3 Performance
- Tenant provisioning SLA target: <= 15 min in reference environment.
- New management VM first-time setup target: <= 45 min.
- Reporting request should enqueue within 5s and complete asynchronously.

## 7.4 Auditability & Compliance
- Every provisioning/deploy/update/rollback/secret-change action must be attributable.
- Audit records must be searchable/filterable by tenant, actor, action, date range.
- Gate evidence (tests/logs/artifacts) must be stored for release sign-off.

---

## 8. Key Workflows (Implementation + Test Expectations)

## 8.1 Setup Wizard Workflow
1. Run preflight checks.
2. Install runtime dependencies.
3. Validate Proxmox integration.
4. Validate IONOS DNS challenge.
5. Bootstrap data/platform services.
6. Apply security baseline.
7. Run end-to-end smoke validation.

**Acceptance checks:** all blocking checks pass; setup report (JSON+PDF) generated.

## 8.2 Tenant Wizard Workflow
1. Enter tenant metadata + VLAN + shirt size + auth mode + app selection + maintenance window.
2. Validate policy constraints (IP/VLAN, profile bounds).
3. Create auditable job.
4. Execute OpenTofu provisioning.
5. Trigger Ansible bootstrap.
6. Register tenant and routing metadata.

**Acceptance checks:** tenant VM reachable at policy IP; job trace complete; no manual infra step required.

## 8.3 Deploy / Update / Reporting Workflow
1. Select operation (deploy/redeploy/remove/update/report).
2. Enqueue async job with correlation ID.
3. Render templates with validated variables and secret refs.
4. Execute action; capture logs/health.
5. For nightly update: snapshot -> update -> health gate -> rollback on failure.
6. Persist outcome to job + audit ledger; expose in dashboard.

**Acceptance checks:** deterministic results, traceable logs, rollback evidence for negative tests, report export availability.

---

## 9. Acceptance Criteria (Program-Level)
Track A (Single-Host GA) is accepted when all conditions are true:
1. All P0 stories for E1–E6 accepted.
2. No open Sev-1/Sev-2 defects.
3. All 13 initial apps deployable on reference tenant.
4. Tenant onboarding requires no manual infra steps.
5. Nightly update + rollback flow passes staged failure drill.
6. RBAC, audit, and secret encryption controls validated.
7. Gate artifacts for G1–G4 published and reviewed.

Track B (HA Readiness) is accepted when:
1. Track A GA is complete and stable.
2. Mode toggles (`single-host`/`ha-cluster`) validated without config drift.
3. DB/Redis HA strategy and failover runbook tested in staging.
4. Tenant placement/anti-affinity policy tested and documented.

---

## 10. KPIs / Success Metrics
- Provisioning success rate >= 95% (reference profile) without manual intervention.
- Median tenant provisioning time <= 15 min.
- Nightly update success rate >= 95% across pilot tenants.
- Mean time to rollback (failed update) <= 10 min after failure detection.
- 100% of critical actions captured in audit ledger.
- 0 plaintext secrets detected in repository and CI artifact scans.
- First-line technician-reported onboarding effort reduced by >= 40% (internal survey/time logs).

---

## 11. Release Strategy

### 11.1 Phased Delivery
- **Phase 0–5:** v1 Single-Host GA (8 sprints).
- **Phase 6:** v1.5 HA Readiness (2 sprints).

### 11.2 Gates
- G1: management baseline operational.
- G2: provision + deploy baseline operational.
- G3: SSO baseline operational.
- G4: single-host GA.
- G5: HA readiness sign-off.

### 11.3 Rollout Model
- Pilot tenants first (staged rollout).
- Canary updates for high-risk app changes.
- Mandatory evidence package per gate (test report, logs, dashboards, rollback drill).

---

## 12. Dependencies
- Proxmox API credentials/permissions and template readiness (Debian 13 cloud-init).
- IONOS DNS API credentials and zone ownership.
- App catalog schema + CI validator + renderer contract.
- Secret-store baseline and key management path.
- Monitoring/logging stack before broad nightly update enablement.

---

## 13. Risks and Mitigations
1. **Proxmox permission mismatch** -> enforce setup preflight checks + remediation guidance.
2. **Secret handling delays** -> deliver envelope encryption baseline now, keep Vault adapter interface.
3. **App heterogeneity** -> certification checklist + strict schema + per-app health profiles.
4. **Update-induced downtime** -> mandatory snapshot + maintenance windows + auto-rollback.
5. **HA scope creep** -> hard freeze until Track A GA + stability window.
6. **Observability gaps** -> monitoring/logging as mandatory precondition for update automation.

---

## 14. Traceability to Existing BMAD Artifacts
- Architecture baseline: `docs/ARCHITECTURE.md`
- Program mission/gates: `docs/bmad/MASTER-PLAN.md`
- Sprint sequencing: `docs/bmad/DELIVERY-PLAN.md`
- Story-level ACs: `docs/bmad/EPICS-AND-STORIES.md`
- Risk/constraint rationale: `docs/bmad/BRAINSTORMING.md`
- Readiness gaps: `docs/bmad/REVIEW-001.md`

This PRD is normative for implementation planning and test design. In case of conflict, Robert’s explicit constraints in Section 3 take precedence.
