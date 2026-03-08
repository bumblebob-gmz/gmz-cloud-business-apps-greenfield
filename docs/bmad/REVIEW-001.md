# REVIEW-001 – BMAD Review (Planning + Scaffold)

Date: 2026-03-08  
Scope: `docs/bmad/*`, architecture/planning docs, current infra/automation/catalog scaffold

## 1) Summary Scorecard

| Dimension | Score (0-5) | Notes |
|---|---:|---|
| Planning completeness | 4.0 | Mission, phases, epics, dependencies and gates are well documented. |
| Technical risk control | 2.5 | Key risks identified, but some controls are not yet translated into enforceable implementation artifacts. |
| Sequencing quality | 3.0 | High-level sequence is solid; several cross-cutting dependencies are still under-specified for Sprint 1–2 execution. |
| Acceptance criteria quality | 3.5 | Mostly testable story ACs; some still lack measurable thresholds and explicit evidence requirements. |
| Operational readiness | 2.0 | Ops goals are clear, but scaffold lacks snapshot/rollback orchestration and observability implementation detail. |
| Security readiness | 2.0 | Security intent is strong, but current scaffold has major auth/secrets/insecure-default gaps. |
| **Overall delivery readiness** | **2.8** | Strong planning baseline, but **not yet execution-safe for production path** without immediate hardening and alignment work. |

---

## 2) Blocking Findings (must resolve before Track A GA path is credible)

### B1. Proxmox auth/security model mismatch + insecure defaults
**Evidence**
- Wizard/spec expects API token flow (`docs/MANAGEMENT-VM-SETUP-WIZARD.md`, E1-S3).
- OpenTofu provider currently uses `username + password` (`infra/opentofu/environments/prod/main.tf`).
- `proxmox_insecure` defaults to `true` and example tfvars uses plaintext password placeholder.

**Why blocking**
- Contradicts planned auth model and weakens security baseline.
- Increases chance of secret sprawl and TLS trust bypass in early implementation.

**Required fix**
- Switch provider inputs to token-based auth and mark all secret inputs sensitive.
- Default TLS verification to secure (`insecure=false`), with explicit documented override only for lab.
- Define secret ingestion path (env vars/secret store) before Sprint 2 gate.

---

### B2. Catalog runtime is not deployable despite Sprint 4 gate expectations
**Evidence**
- All `compose.template.yml` files are placeholders (`# TODO...`).
- `vars.schema.json` is currently minimal/empty for apps (no required vars modeled).
- No catalog validation CI pipeline artifacts yet.

**Why blocking**
- E3 gate (“deterministic install/update/remove”) cannot be met with current scaffold.
- Missing schema strictness will push failures to runtime.

**Required fix**
- Define minimum certification baseline per app: required vars, healthcheck profile, version pin policy.
- Implement schema validation CI and fail-fast checks before any rollout claims.

---

### B3. Day-2 safety controls (snapshot + rollback) are not wired
**Evidence**
- `nightly-updates.yml` currently pulls/recreates containers and contains TODO for healthcheck/rollback hook.
- No implemented snapshot orchestration linkage to Proxmox before updates.

**Why blocking**
- Violates E5-S2/E5-S3 acceptance intent and exposes tenant uptime to update failures.

**Required fix**
- Add mandatory pre-update snapshot step + post-update health gate.
- Add automated rollback path and evidence logging in job/audit records.

---

### B4. Security/RBAC/Audit are planned but not integrated into early execution gates
**Evidence**
- E6 is marked hard GA gate, but implementation artifacts for API authz/audit schema/events are not present.
- Setup wizard Step 7 expects RBAC + audit activation, but no backing implementation contract is documented.

**Why blocking**
- Creates high risk of late security rework and gate failure near GA.

**Required fix**
- Pull a minimum viable security slice into Sprint 1–2 (authn/authz boundaries, audit event schema, redaction policy).

---

## 3) Non-Blocking Improvements

1. **Acceptance criteria precision**
   - Add measurable thresholds (e.g., max provisioning time, retry limits, healthcheck timeout budget, alert latency).

2. **Evidence-driven gate definitions**
   - For each gate (G1..G5), define required artifacts: test report, logs, dashboard screenshots, rollback drill output.

3. **Dependency explicitness for cross-cutting concerns**
   - Make secret store contract and audit schema explicit upstream dependencies for E1/E2/E3 work.

4. **Operational readiness detail**
   - Add runbooks for incident triage, degraded mode, and manual break-glass procedures.

5. **NFR baseline**
   - Define initial SLO/SLI targets for API availability, deployment success rate, and mean rollback time.

6. **HA readiness hygiene**
   - Add explicit “not before Track A GA + stability soak period” criterion to prevent premature HA scope pull-in.

---

## 4) Prioritized Action List – Next 2 Sprints

## Sprint N+1 (immediate)
1. **P0 – Align Proxmox auth + secret handling contract**
   - Token auth in OpenTofu, secure defaults, secret source policy, redaction rules.
2. **P0 – Implement catalog CI validator MVP**
   - Validate `app.yaml`, vars schema completeness, hostPattern policy, healthcheck presence.
3. **P0 – Define and implement audit event envelope v1**
   - Actor/tenant/action/outcome/timestamp/correlation-id; write path from provisioning + deploy jobs.
4. **P1 – Establish app certification checklist for v1 apps**
   - Required vars, pinned image policy, smoke test contract.
5. **P1 – Convert 2 reference apps end-to-end (Authentik + Nextcloud)**
   - Real compose templates and schemas as exemplars for remaining apps.

## Sprint N+2
1. **P0 – Snapshot + health-gated update + rollback flow**
   - Wire Proxmox snapshot calls and rollback trigger into nightly pipeline.
2. **P0 – Tenant provisioning E2 vertical slice**
   - Wizard/API -> OpenTofu -> Ansible bootstrap -> auditable job trace.
3. **P0 – Gate evidence automation**
   - CI/CD publishes gate artifacts automatically for G1/G2 readiness.
4. **P1 – Observability baseline implementation**
   - Tenant/app-level logs + dashboards + critical alerts (minimum operational set).
5. **P1 – Security test pass in CI**
   - Secret scan, IaC lint/security checks, and regression checks for authz/audit logging.

---

## 5) Minor Doc Fixes Applied

- Updated `docs/APP-CATALOG-SPEC.md` folder structure to match repository scaffold:
  - `compose.yaml` -> `compose.template.yml`
  - marked `branding.schema.json` and `healthchecks.yaml` as optional/later-sprint artifacts.

This avoids implementation confusion during Sprint 1–2 execution.
