# EPICS AND STORIES – GMZ Cloud Business Apps

Legend:
- Priority: P0 (must), P1 (should), P2 (could)
- Track tags: [SH] Single-Host, [HA] HA Readiness, [BOTH]

---

## Epic E1 – Management VM Setup Wizard [BOTH] (P0)
Goal: deterministic first-time setup of control plane with hard validation.

### Story E1-S1: Preflight checks
As an operator, I want automated host preflight checks so that setup fails early with clear reasons.
- Acceptance criteria:
  - validates Debian version, CPU/RAM/disk thresholds, DNS/outbound reachability, NTP/time sync
  - returns structured result JSON with pass/warn/fail per check
  - blocking failures stop setup before any stateful install step

### Story E1-S2: Core runtime bootstrap
As an operator, I want Docker/Compose and baseline firewall installed automatically.
- Acceptance criteria:
  - idempotent install of Docker and Compose
  - required runtime directories created with documented ownership/permissions
  - firewall baseline rules applied and persisted

### Story E1-S3: Proxmox integration setup + test
As an operator, I want Proxmox credentials validated before provisioning use.
- Acceptance criteria:
  - captures URL, API user, token ID/secret, target nodes, storage profile
  - tests API connectivity and required rights (VM create/list, network read)
  - returns remediation hints for missing permissions

### Story E1-S4: DNS/TLS setup (IONOS)
As an operator, I want DNS challenge validated to ensure ACME automation works.
- Acceptance criteria:
  - captures and securely stores IONOS credentials
  - validates `irongeeks.eu` zone visibility
  - completes a dry-run DNS challenge test

### Story E1-S5: Data/platform service bring-up
As an operator, I want core services running so the control plane is usable.
- Acceptance criteria:
  - PostgreSQL, Redis, API, Worker, Traefik, Monitoring stack start successfully
  - DB migrations run and are repeatable
  - health endpoint summary available for all core components

Dependencies: none (program start).
Risks: package/repo drift on Debian hosts.

---

## Epic E2 – Provisioning Engine [BOTH] (P0)
Goal: one-click tenant VM provisioning from validated templates.

### Story E2-S1: OpenTofu module baseline
As a platform engineer, I want reusable OpenTofu modules for VM lifecycle.
- Acceptance criteria:
  - supports VM create/update/delete with node/storage/VLAN/IP inputs
  - consumes Debian 13 template and cloud-init parameters
  - creates deterministic output state (VMID, IP, node, storage)

### Story E2-S2: Shirt-size mapping enforcement
As an operator, I want standardized sizing so tenant resources are predictable.
- Acceptance criteria:
  - S/M/L/XL profiles implemented as validated presets
  - wizard/API rejects custom values outside allowed policy (unless admin override)
  - selected profile is persisted in tenant metadata

### Story E2-S3: Ansible bootstrap handoff
As a platform engineer, I want automatic post-provision bootstrap.
- Acceptance criteria:
  - successful OpenTofu run triggers bootstrap playbook automatically
  - hardening + docker install roles execute idempotently
  - provisioning job result includes infra and config phases

### Story E2-S4: Tenant wizard provisioning flow
As a technician, I want a guided tenant creation flow.
- Acceptance criteria:
  - captures customer slug, VLAN ID, shirt size, app list, maintenance window
  - enforces IP rule `10.<VLAN-ID>.10.100`
  - creates auditable job with status transitions (queued/running/success/fail)

Dependencies: E1 complete.
Risks: cloud-init template quality; VLAN misconfiguration.

---

## Epic E3 – App Catalog & Deploy Runtime [BOTH] (P0)
Goal: versioned, schema-validated app deployments for all initial apps.

### Story E3-S1: Catalog schema validator in CI
As a maintainer, I want catalog changes validated before merge.
- Acceptance criteria:
  - validates `app.yaml`, vars schema, healthcheck definitions
  - rejects missing required fields and invalid host patterns
  - CI output points to offending app and field path

### Story E3-S2: Template renderer + secrets injection contract
As a deploy worker, I want deterministic compose rendering.
- Acceptance criteria:
  - renders compose from app template + tenant vars
  - required vars must exist or deployment is blocked
  - secrets pulled from secret store only (no plaintext files committed)

### Story E3-S3: Deploy worker orchestration
As an operator, I want deployments executed asynchronously and traceably.
- Acceptance criteria:
  - job queue supports deploy/redeploy/remove operations
  - per-app logs and status persisted
  - failed app deploy does not corrupt previously healthy apps

### Story E3-S4: Initial app portfolio rollout
As product owner, I want all v1 apps deployable.
- Acceptance criteria:
  - all 13 initial apps represented in catalog with valid schemas
  - each app has healthcheck and minimum version pinning
  - deployment smoke tests pass on reference tenant

Dependencies: E2 complete.
Risks: app-specific integration edge cases.

---

## Epic E4 – Authentik & SSO [BOTH] (P0)
Goal: mandatory tenant Authentik with connector automation.

### Story E4-S1: Authentik base deployment policy
As security owner, I want Authentik automatically present for every tenant.
- Acceptance criteria:
  - tenant provisioning fails if Authentik deployment step is skipped or unhealthy
  - Authentik URL follows routing convention
  - admin bootstrap credentials are generated and stored securely

### Story E4-S2: Connector automation (Entra/LDAP/Local)
As a technician, I want guided connector setup.
- Acceptance criteria:
  - wizard supports all three modes with mode-specific validation
  - test login or connectivity check available per mode
  - connector config updates are audited

### Story E4-S3: App-provider mapping automation
As an operator, I want supported apps auto-wired for SSO.
- Acceptance criteria:
  - for `supportsSSO=true` apps, provider/application objects are created automatically
  - redirect/callback URLs are validated against service domain
  - failure in one app mapping does not break global Authentik service

Dependencies: E3 complete.
Risks: per-app SSO protocol differences.

---

## Epic E5 – Operations Layer [BOTH] (P0)
Goal: safe day-2 operations with visibility, updates, and reporting.

### Story E5-S1: Monitoring/logging baseline
As operations, I want full observability per tenant.
- Acceptance criteria:
  - infra, tenant, and app dashboards available in Grafana
  - logs centrally available and filterable by tenant/app
  - alert routes defined for critical failures

### Story E5-S2: Nightly update pipeline
As operations, I want controlled automated updates.
- Acceptance criteria:
  - tenant-specific maintenance window enforced
  - pre-update VM snapshot is mandatory
  - update executes health checks before and after

### Story E5-S3: Auto-rollback on failed health checks
As operations, I want automatic recovery from bad updates.
- Acceptance criteria:
  - failed post-update health checks trigger rollback automatically
  - rollback result is recorded with root-cause context
  - tenant status returns to last known healthy state

### Story E5-S4: PDF/CSV reporting
As service manager, I want regular tenant reports.
- Acceptance criteria:
  - report includes customer, users, storage, active services, health state
  - export available as PDF and CSV
  - report generation runs asynchronously and auditable

Dependencies: E3/E4 complete.
Risks: noisy alerts; incomplete metrics for certain apps.

---

## Epic E6 – Security, RBAC, Audit [BOTH] (P0)
Goal: enforce least privilege and full change traceability.

### Story E6-S1: RBAC role model enforcement
As admin, I want role-based permissions on critical actions.
- Acceptance criteria:
  - roles Admin/Techniker/ReadOnly implemented for API/UI
  - sensitive actions (secret view, deploy, delete) are role-restricted
  - unauthorized access attempts are logged

### Story E6-S2: Audit event ledger
As compliance stakeholder, I want immutable action history.
- Acceptance criteria:
  - provisioning/deploy/update/secret-change actions create audit entries
  - entries include actor, tenant, timestamp, action, outcome
  - searchable/filterable audit view available

### Story E6-S3: Secret protection baseline
As security owner, I want encrypted secret storage.
- Acceptance criteria:
  - secrets encrypted at rest with envelope-key approach
  - key rotation path documented and testable
  - no secret values appear in logs by default

Dependencies: E1–E5 partial; can start early but must be complete before GA.
Risks: key management and rotation operational overhead.

---

## Epic E7 – HA Readiness [HA] (P1)
Goal: concrete HA option with validated failover procedures.

### Story E7-S1: HA deployment mode toggles
As platform engineer, I want explicit deployment modes.
- Acceptance criteria:
  - configuration supports `single-host` and `ha-cluster` modes
  - mode selection influences node placement/storage policies
  - drift detection flags mixed or invalid mode configs

### Story E7-S2: Control plane scale-out path
As operations, I want stateless API/worker scaling guidance implemented.
- Acceptance criteria:
  - API/worker services run with externalized state dependencies
  - documented horizontal scaling procedure exists and is tested
  - load-balancing behavior validated with smoke tests

### Story E7-S3: DB/Redis HA design + pilot
As platform engineer, I want tested HA options for state stores.
- Acceptance criteria:
  - chosen HA strategy documented (e.g., Patroni/Sentinel path)
  - failover runbook executed in staging and evidence captured
  - RTO/RPO assumptions explicitly documented

### Story E7-S4: Tenant placement policies
As operations, I want anti-affinity/HA groups for tenant VMs.
- Acceptance criteria:
  - tenant placement policy can enforce anti-affinity in cluster mode
  - policy violations are visible in operations dashboard
  - failover test demonstrates tenant availability continuity

Dependencies: Track A GA complete.
Risks: cluster complexity and storage performance tuning.

---

## Cross-Epic Dependency Summary
- E1 -> E2 -> E3 -> E4 -> E5
- E6 runs across all epics but is a hard GA gate
- E7 starts only after Track A GA stability gate
