# DELIVERY PLAN – Implementation-Ready

## 1. Cadence and Governance
- Sprint length: 2 weeks
- Planning horizon: 8 sprints (Track A), +2 sprints (Track B)
- Ceremonies:
  - Sprint planning with dependency check
  - Mid-sprint risk review
  - End-sprint demo + acceptance gate

## 2. Workstreams
- WS1 Platform Foundation (wizard, core services)
- WS2 Provisioning & IaC (OpenTofu, Ansible)
- WS3 Catalog & Runtime (schemas, renderer, deploy worker)
- WS4 Security/SSO (Authentik, RBAC, secrets, audit)
- WS5 Operations (monitoring, updates, rollback, reporting)
- WS6 HA Readiness (mode toggles, failover runbooks)

## 3. Sprint Plan – Track A (Single-Host GA)

### Sprint 1 (Weeks 1–2)
Scope:
- E1-S1, E1-S2, E1-S3
- E6-S1 (RBAC skeleton)
Deliverables:
- runnable setup wizard preflight + core bootstrap
- Proxmox integration validation with remediation output
Gate:
- clean setup on fresh management VM passes mandatory checks

### Sprint 2 (Weeks 3–4)
Scope:
- E1-S4, E1-S5
- E2-S1 (OpenTofu baseline)
- E6-S3 (secret encryption baseline)
Deliverables:
- DNS challenge validation + full control-plane bring-up
- VM provisioning module v1 with outputs
Gate:
- management stack healthy, one test VM provisioned reproducibly

### Sprint 3 (Weeks 5–6)
Scope:
- E2-S2, E2-S3, E2-S4
- E6-S2 (audit ledger baseline)
Deliverables:
- tenant wizard provisioning flow with shirt-size and VLAN/IP rules
- automatic Ansible bootstrap handoff
Gate:
- one-click tenant create pipeline stable on single-host

### Sprint 4 (Weeks 7–8)
Scope:
- E3-S1, E3-S2, E3-S3
Deliverables:
- catalog CI schema validation
- renderer and async deploy worker with trace logs
Gate:
- deploy job can install/update/remove one app deterministically

### Sprint 5 (Weeks 9–10)
Scope:
- E3-S4
- E4-S1
Deliverables:
- all initial apps represented in catalog
- Authentik mandatory deployment policy active
Gate:
- reference tenant can deploy app portfolio with Authentik baseline

### Sprint 6 (Weeks 11–12)
Scope:
- E4-S2, E4-S3
Deliverables:
- connector wizard (Entra/LDAP/Local)
- supported app SSO auto-mapping
Gate:
- end-to-end login flow works for prioritized apps

### Sprint 7 (Weeks 13–14)
Scope:
- E5-S1, E5-S2
Deliverables:
- monitoring/logging dashboards + alerts
- nightly update job with maintenance windows and mandatory snapshot
Gate:
- update job succeeds on pilot tenants without manual intervention

### Sprint 8 (Weeks 15–16)
Scope:
- E5-S3, E5-S4
- hardening/stabilization from defect backlog
Deliverables:
- auto-rollback and PDF/CSV reporting
- GA readiness checklist completed
Gate (Track A GA):
- all P0 stories for Track A accepted
- no open Sev-1/Sev-2 defects

## 4. Sprint Plan – Track B (HA Readiness)

### Sprint 9 (Weeks 17–18)
Scope:
- E7-S1, E7-S2
Deliverables:
- explicit deployment mode toggles and scale-out procedure
Gate:
- staging environment can switch mode without config drift

### Sprint 10 (Weeks 19–20)
Scope:
- E7-S3, E7-S4
Deliverables:
- DB/Redis HA strategy + tested failover runbook
- tenant anti-affinity placement policy
Gate (HA readiness):
- failover tests documented and signed off

## 5. Dependency Matrix (execution-critical)
- E1-S3 depends on Proxmox credentials and role setup
- E1-S4 depends on IONOS credentials and DNS zone ownership
- E2-S3 depends on E2-S1 + Ansible role availability
- E3-S2 depends on E6-S3 secret storage baseline
- E4-S3 depends on E3-S4 and E4-S1
- E5-S3 depends on E5-S2 and stable healthcheck definitions
- E7 stories depend on Track A GA stability

## 6. Resourcing (minimum)
- 1 Platform Engineer (OpenTofu/Proxmox)
- 1 Automation Engineer (Ansible/CI)
- 1 Backend Engineer (API/Worker/Jobs)
- 1 Fullstack Engineer (Wizard/UI)
- 0.5 DevOps/SRE (monitoring/reliability)
- 0.5 QA (test automation + acceptance)

## 7. Risk Register and Controls
1) External API fragility (Proxmox/IONOS)
- Control: contract tests + retry/backoff + preflight checks

2) Secret leakage risk
- Control: encrypted secret store, redaction middleware, CI secret scan

3) App deployment variance
- Control: app certification checklist before catalog `deployable` state

4) Timeline slip from SSO integrations
- Control: prioritize high-value apps first; mark unsupported flows explicitly

5) HA overcommitment
- Control: enforce Track A GA gate before any production HA promises

## 8. Acceptance & Release Gates
- Gate G1 (after Sprint 2): Management VM operational baseline
- Gate G2 (after Sprint 4): Provision + deploy technical baseline
- Gate G3 (after Sprint 6): SSO baseline complete
- Gate G4 (after Sprint 8): Single-host GA
- Gate G5 (after Sprint 10): HA readiness signed off

## 9. Immediate Next Actions (Week 1)
1. Create implementation tickets from all P0 stories (estimate + owner + sprint assignment).
2. Build integration test harness for Proxmox API and IONOS DNS challenge.
3. Finalize secrets baseline decision as envelope encryption for v1, with Vault-compatible abstraction.
4. Implement CI pipeline for catalog schema and basic security scans.
