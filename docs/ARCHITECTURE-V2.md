# ARCHITECTURE V2 – GMZ Cloud Business Apps

- **Version:** 2.0 (BMAD Architecture Stage)
- **Date:** 2026-03-08
- **Status:** Implementation architecture (engineering baseline)
- **Scope:** v1 Single-Host GA + v1.5 HA Readiness path
- **Normative Inputs:** `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN-MODEL.md`, `docs/bmad/*`

---

## 1. Architecture Goals and Constraints

This architecture is optimized for deterministic tenant onboarding and low-risk day-2 operations under the hard constraints from PRD §3:

1. Proxmox 9 base.
2. Exactly one Debian 13 tenant VM per customer.
3. Tenant IP policy: `10.<VLAN-ID>.10.100`.
4. Central ingress/TLS on management-plane Traefik.
5. Domain pattern `<service>.<customer>.irongeeks.eu`.
6. IONOS DNS for DNS/ACME automation.
7. Mandatory Authentik per tenant.
8. 13-app initial catalog deployability.
9. Nightly updates with mandatory snapshot + health-gated auto-rollback.
10. Backups out of v1 scope.
11. Single-host GA before HA rollout.

---

## 2. Component Diagram (Narrative)

```mermaid
flowchart LR
  subgraph U[Internal Users]
    Tech[Techniker/Admin]
    RO[ReadOnly]
  end

  subgraph CP[Control Plane - Management VM]
    UI[GMZ Web UI]
    API[Control Plane API]
    W[Worker/Orchestrator]
    Q[(Redis Queue)]
    DB[(PostgreSQL)]
    SEC[Secret Service\nEnvelope Encryption]
    AUD[Audit Ledger]
    REG[Service Registry]
    TRAEFIK[Traefik + ACME DNS]
    OBS[Prometheus/Loki/Grafana/Alertmanager]
    REP[Report Generator]
  end

  subgraph EXT[External Systems]
    PMX[Proxmox 9 API]
    IONOS[IONOS DNS API]
    GIT[Catalog Git Repository]
  end

  subgraph TP[Tenant Plane - one VM per Tenant]
    TVM[Tenant Debian 13 VM\n10.<VLAN>.10.100]
    AK[Authentik (mandatory)]
    APPS[Business Apps via Docker Compose]
    AGENT[Bootstrap/Runtime Agent]
  end

  Tech --> UI
  RO --> UI
  UI --> API
  API --> DB
  API --> SEC
  API --> AUD
  API --> REG
  API --> Q
  W --> Q
  W --> DB
  W --> AUD
  W --> PMX
  W --> IONOS
  W --> GIT
  W --> TVM
  API --> TRAEFIK
  TRAEFIK --> IONOS
  TRAEFIK --> APPS
  APPS --> AK
  API --> OBS
  W --> OBS
  REP --> DB
  REP --> AUD
```

### Responsibilities per component

- **UI**: guided workflows (setup, tenant provisioning, deploy/update/report, audit view).
- **API**: policy enforcement, RBAC, request validation, command creation, state model.
- **Worker**: async execution engine for provisioning/deploy/update/report jobs.
- **PostgreSQL**: source of truth for tenants/jobs/catalog metadata/audit/report manifests.
- **Redis Queue**: durable async task queue + retries + dead-letter handling.
- **Secret Service**: envelope encryption/decryption, versioned secret refs, redaction policies.
- **Audit Ledger**: immutable append-only event stream (logical immutability + write-only API).
- **Service Registry**: per-tenant routes and app endpoints for Traefik dynamic config generation.
- **Traefik**: central ingress/TLS termination and routing to tenant app backends.
- **Observability stack**: metrics/logs/traces/alerts across control and tenant planes.

---

## 3. Data Flow and Control Flow

## 3.1 Setup Wizard (FR-SETUP-01..06)
1. UI starts setup session; API runs preflight checks and returns structured pass/warn/fail JSON.
2. API writes integration credentials as encrypted secret references.
3. Worker bootstraps runtime stack (DB/Redis/API/Worker/Traefik/Monitoring), runs migrations.
4. API initializes security baseline (initial admin, role model, encryption root key metadata, audit bootstrap event).
5. API publishes health summary endpoint for all core components.

**Failure behavior:** hard preflight failures block setup transitions; all attempts audit-logged.

## 3.2 Tenant Provisioning (FR-TENANT-01..05)
1. UI submits tenant spec: slug, VLAN, shirt size, apps, auth mode, maintenance window.
2. API validates policy (including `10.<VLAN>.10.100`), persists tenant draft and creates `JobRun`.
3. Worker executes `provision` pipeline:
   - OpenTofu apply against Proxmox provider.
   - Parse deterministic outputs (`vmid`, `ip`, `node`, `storage`).
   - Trigger Ansible bootstrap (hardening + Docker + baseline runtime).
   - Deploy Authentik first; fail provisioning if unhealthy.
   - Register route/service metadata and enable Traefik + ACME.
4. Worker persists per-phase evidence and emits domain events.
5. API marks tenant active only after readiness gates pass.

## 3.3 Deploy/Update/Remove Runtime (FR-DEPLOY-01..06, FR-OPS-03..05)
1. Operation request enters queue as async job with correlation ID.
2. Worker loads catalog manifest at pinned version and validates schema/required vars.
3. Secret references resolved just-in-time to runtime env files (ephemeral, not persisted in repo).
4. Compose render + deploy is executed app-by-app with health checks.
5. For nightly updates:
   - enforce maintenance window,
   - create Proxmox snapshot,
   - run update,
   - run post-update health gate,
   - rollback to snapshot if gate fails.
6. Audit + job evidence finalized and exposed in UI.

---

## 4. Control Plane ↔ Tenant Plane Interaction Model

### 4.1 Interaction principles
- Control plane is authoritative for desired state.
- Tenant plane executes desired state but does not own policy.
- All cross-plane actions are asynchronous and auditable.
- Network access from control plane to tenant plane is least-privileged (SSH/API ports only as needed).

### 4.2 Required cross-plane capabilities
- **Provisioning channel:** OpenTofu/Proxmox API + Ansible bootstrap to tenant VM.
- **Deployment channel:** secure SSH/agent execution for Compose lifecycle.
- **Identity channel:** Authentik provisioning + connector and app mapping operations.
- **Observability channel:** metrics/log shipping from tenant VM to control-plane stack.

### 4.3 Tenant state model
`draft -> provisioning -> bootstrap -> authentik_ready -> apps_deployed -> active -> updating -> degraded|rollback -> active|failed`

---

## 5. Module Boundaries (Code/Service Ownership)

1. **setup-service**
   - Preflight checks, runtime bootstrap orchestration, integration validation.
2. **tenant-service**
   - Tenant CRUD, policy validation, sizing profiles, maintenance window management.
3. **provisioning-service**
   - OpenTofu execution wrapper, output parsing, Ansible handoff.
4. **catalog-service**
   - Catalog sync, schema validation, app certification status.
5. **deploy-service**
   - Render/deploy/redeploy/remove orchestration and health evaluation.
6. **authentik-service**
   - Mandatory base deployment, connector lifecycle, SSO mappings.
7. **update-service**
   - Nightly scheduler, snapshot orchestration, rollback controller.
8. **security-service**
   - RBAC authorizer, secret envelope encryption, redaction middleware.
9. **audit-service**
   - Event envelope creation, immutable append, query/filter API.
10. **reporting-service**
    - Async report jobs and PDF/CSV artifact generation.
11. **observability-service**
    - Metrics/log schema, correlation ID propagation, alert routing.

Each module owns its schema contracts and publishes only stable DTO/event contracts.

---

## 6. API and Service Contracts (Key Endpoints + Events)

## 6.1 REST API (v1)

### Setup
- `POST /api/v1/setup/preflight/run`
- `POST /api/v1/setup/integrations/proxmox/validate`
- `POST /api/v1/setup/integrations/ionos/validate`
- `POST /api/v1/setup/bootstrap`
- `GET /api/v1/setup/health-summary`

### Tenants
- `POST /api/v1/tenants`
- `GET /api/v1/tenants/:tenantId`
- `POST /api/v1/tenants/:tenantId/provision`
- `PATCH /api/v1/tenants/:tenantId/maintenance-window`
- `POST /api/v1/tenants/:tenantId/apps:deploy`
- `POST /api/v1/tenants/:tenantId/apps:update`
- `POST /api/v1/tenants/:tenantId/apps:remove`

### Authentik/SSO
- `POST /api/v1/tenants/:tenantId/authentik/connectors`
- `PATCH /api/v1/tenants/:tenantId/authentik/connectors/:connectorId`
- `POST /api/v1/tenants/:tenantId/authentik/mappings:reconcile`

### Jobs/Audit/Reports
- `GET /api/v1/jobs/:jobId`
- `GET /api/v1/jobs?tenantId=&type=&status=`
- `GET /api/v1/audit?tenantId=&actor=&action=&from=&to=`
- `POST /api/v1/reports`
- `GET /api/v1/reports/:reportId`

## 6.2 Event contracts (queue topics)
- `setup.preflight.completed`
- `tenant.provision.requested`
- `tenant.provision.phase.changed`
- `tenant.authentik.required.failed`
- `app.deploy.requested`
- `app.deploy.completed`
- `update.nightly.started`
- `update.snapshot.created`
- `update.healthgate.failed`
- `update.rollback.completed`
- `audit.event.appended`
- `report.generation.completed`

### Event envelope (mandatory)
```json
{
  "eventId": "uuid",
  "eventType": "tenant.provision.phase.changed",
  "timestamp": "2026-03-08T20:00:00Z",
  "correlationId": "uuid",
  "actor": {"type": "user|system", "id": "..."},
  "tenantId": "...",
  "payload": {},
  "outcome": "success|failure",
  "severity": "info|warn|error"
}
```

---

## 7. Security Architecture

## 7.1 Identity and access
- RBAC roles: `Admin`, `Techniker`, `ReadOnly` (FR-SEC-01).
- Sensitive operations additionally require explicit permission scopes:
  - secrets read/write,
  - deploy/remove,
  - connector modify,
  - tenant delete,
  - rollback override.
- Unauthorized attempts are logged as audit/security events (FR-SEC-03).

## 7.2 Network segmentation
- VLAN isolation per tenant VM.
- Control-plane components on management VLAN/network segment.
- Only required ingress paths exposed:
  - Traefik 80/443 public,
  - control-plane API internal/admin network,
  - no direct public exposure of tenant Docker daemons.

## 7.3 Application security controls
- Input validation for all wizard/API payloads.
- Secret redaction middleware for logs and job traces.
- Correlation ID on every mutating request.
- TLS verification on external integrations by default.

## 7.4 Audit immutability model
- Append-only audit table + hash chaining per batch for tamper-evidence.
- No update/delete API for audit entries.
- Query-only index views for filtering.

---

## 8. Secrets Model (Envelope Encryption Baseline)

## 8.1 Data model
- `secret_ref` (id, tenant_id nullable, scope, version, key_id, ciphertext, created_by, created_at, rotated_at)
- `key_metadata` (key_id, status, created_at, retired_at)

## 8.2 Encryption flow
1. Generate per-secret DEK.
2. Encrypt secret value with DEK (AES-GCM).
3. Encrypt DEK with KEK (control-plane master key).
4. Store ciphertext + encrypted DEK + key metadata.
5. Decrypt only in worker runtime memory; never persist plaintext.

## 8.3 Rotation model
- KEK rotation supported via rewrap job (`security.keys.rewrap`).
- Secret versioning enables staged rollout/rollback.
- Rotation and secret accesses create audit events.

## 8.4 Future adapter
- Keep provider interface for external KMS/Vault without contract changes.

---

## 9. Update and Rollback Flow (Mandatory)

1. Scheduler selects tenants currently in maintenance window.
2. Worker creates update job and records correlation ID.
3. Preflight checks (tenant reachable, disk headroom, queue lock).
4. Create Proxmox VM snapshot (`pre-update-<timestamp>`).
5. Run app updates (pinned strategy, canary per app optional).
6. Execute post-update health gate:
   - infra reachability,
   - Authentik health,
   - app-specific health endpoints.
7. If health gate fails -> automatic rollback to snapshot.
8. Re-run health checks after rollback.
9. Persist evidence (logs, snapshot id, health results) in JobRun + Audit.

**SLO targets:** rollback start < 2 minutes after failed health gate; mean rollback completion <= 10 minutes.

---

## 10. Observability Model

## 10.1 Metrics
- Control plane: API latency/error rate, queue depth, job durations, worker failures.
- Provisioning: OpenTofu phase timings, Ansible success ratio.
- Tenant plane: VM health, container health, app endpoint uptime.
- Update flow: snapshot duration, health-gate pass rate, rollback rate/time.

## 10.2 Logs
- Structured JSON logs with `tenantId`, `jobId`, `correlationId`, `component`.
- Centralized in Loki, retention policy by severity and legal requirements.
- Secret redaction at source + sink guards.

## 10.3 Traces
- Distributed tracing across UI/API/worker for long-running jobs.
- Trace links embedded in job detail view.

## 10.4 Alerts
- P1: provisioning failure spikes, failed rollbacks, Authentik mandatory check failure.
- P2: queue backlog threshold, repeated app deployment failures.
- Alert routing to operations channel with tenant/job context.

---

## 11. Deployment Views

## 11.1 Single-Host Deployment View (v1 GA)

- **Proxmox Node 1**
  - Management VM (control-plane stack containers)
  - Tenant VM A..N (one per customer)
- Storage: LVM-Thin (default)
- Control plane services run as Docker Compose projects with restart policies.
- Single PostgreSQL + single Redis (with backup/restore out of scope, but snapshots for update rollback in-scope).

**Operational caveat:** this is availability-limited by one node; designed for deterministic operations, not host-level fault tolerance.

## 11.2 HA Deployment View (v1.5 readiness)

- **Proxmox Cluster (3+ nodes)**
  - Control-plane app/API/worker instances distributed.
  - Shared or replicated state services:
    - PostgreSQL HA strategy (e.g., Patroni) validated in staging.
    - Redis Sentinel/cluster path validated in staging.
  - Tenant placement policy with anti-affinity groups.
- Storage: Ceph recommended.
- Ingress: Traefik active/standby or HA pair with shared config source.

**Mode control:** explicit `deployment_mode = single-host | ha-cluster` toggle; drift detection blocks mixed/inconsistent configs.

---

## 12. ADR-Style Key Decisions

## ADR-001: One VM per tenant (hard isolation)
- **Status:** Accepted
- **Decision:** Exactly one Debian 13 VM per customer.
- **Rationale:** Simpler blast-radius control, predictable operations, satisfies explicit constraint.
- **Consequence:** Higher VM count at scale; mitigated via provisioning automation.

## ADR-002: Central Traefik ingress on management plane
- **Status:** Accepted
- **Decision:** All public ingress/TLS terminated centrally.
- **Rationale:** Uniform cert/routing policy, easier governance and observability.
- **Consequence:** Ingress is control-plane critical path; must monitor and harden.

## ADR-003: Mandatory Authentik baseline per tenant
- **Status:** Accepted
- **Decision:** Authentik deploy is provisioning gate.
- **Rationale:** SSO consistency and security posture.
- **Consequence:** Provisioning fails fast when identity baseline unhealthy.

## ADR-004: Async job orchestration via queue + worker
- **Status:** Accepted
- **Decision:** All long operations are queued and stateful.
- **Rationale:** Reliability, retries, auditability, UI responsiveness.
- **Consequence:** Must maintain queue observability and idempotent handlers.

## ADR-005: Envelope encryption baseline now, Vault adapter later
- **Status:** Accepted
- **Decision:** Implement in-platform envelope encryption with pluggable KMS interface.
- **Rationale:** Delivers security baseline without blocking on external vault rollout.
- **Consequence:** Key lifecycle runbooks required early.

## ADR-006: Snapshot-first update policy with auto-rollback
- **Status:** Accepted
- **Decision:** No update without pre-snapshot; rollback on failed health gate.
- **Rationale:** Minimizes tenant downtime risk from bad updates.
- **Consequence:** Update jobs need snapshot capacity/cleanup governance.

## ADR-007: Single-host first, HA readiness second
- **Status:** Accepted
- **Decision:** Freeze HA implementation until single-host GA gate.
- **Rationale:** Prevents scope creep and unstable parallel tracks.
- **Consequence:** HA work in v1 is design/runbook/testing only.

## ADR-008: Contract-first catalog deployment
- **Status:** Accepted
- **Decision:** Catalog entries require schema validation and healthcheck contract before deployable status.
- **Rationale:** Push failures left into CI, improve runtime determinism.
- **Consequence:** App onboarding requires certification checklist discipline.

---

## 13. Implementation Sequencing (Engineering-Actionable)

1. **Sprint 1:** setup-service + security-service baseline + audit envelope + integration validators.
2. **Sprint 2:** tenant-service + provisioning-service vertical slice to active tenant.
3. **Sprint 3:** catalog-service + deploy-service for 2 reference apps (Authentik + Nextcloud).
4. **Sprint 4:** complete 13-app portfolio certification and runtime hardening.
5. **Sprint 5:** update-service snapshot/rollback automation + evidence pipeline.
6. **Sprint 6:** observability/reporting completeness + GA hardening.
7. **Post-GA:** HA readiness validation (mode toggle + runbooks + failover staging tests).

---

## 14. Open Items (Must Close Before GA Sign-Off)

1. Finalize Proxmox API permission matrix and test fixture accounts.
2. Decide concrete key custody location for KEK in single-host mode.
3. Define minimum per-app health probes for all 13 apps.
4. Lock audit retention and export policy.
5. Finalize rollback conflict policy when snapshot creation fails (fail-closed required).

This document is the implementation architecture baseline for engineering and QA sign-off.