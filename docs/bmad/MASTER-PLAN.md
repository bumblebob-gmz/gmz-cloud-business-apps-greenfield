# MASTER PLAN – GMZ Cloud Business Apps (BMAD)

## 1. Mission & Scope
Build a production-ready internal control plane for multi-tenant business app hosting on Proxmox 9 with:
- deterministic provisioning (OpenTofu)
- deterministic configuration/deploy (Ansible + app catalog)
- secure tenant isolation (VLAN)
- central ingress/TLS (Traefik + IONOS DNS challenge)
- mandatory Authentik per tenant
- operations automation (monitoring, updates, rollback, reporting)

Out of scope for v1: backup/restore productization.

## 2. Planning Baselines (from existing docs)
- Architecture baseline: `docs/ARCHITECTURE.md`
- Phase sequence baseline: `docs/BMAD-ROADMAP.md`
- Wizard baseline: `docs/MANAGEMENT-VM-SETUP-WIZARD.md`
- App model baseline: `docs/APP-CATALOG-SPEC.md`
- Known implementation backlog: `docs/TODO.md`

## 3. Delivery Tracks

### Track A – Single-Host Production (v1 GA)
Target environment:
- 1 Proxmox node
- LVM-Thin primary storage
- 1 Management VM + n tenant VMs

Success target:
- first tenant deployed end-to-end in <= 45 min from clean management VM
- repeatable tenant provisioning <= 15 min per tenant
- nightly updates + rollback validated

### Track B – HA Readiness (v1.5)
Target environment:
- 3+ Proxmox nodes
- Ceph-backed storage (recommended)
- control plane HA foundations (stateless API scaling path, DB/Redis HA design + runbook)

Success target:
- documented and testable failover process
- no manual drift between single-host and HA deployment modes

## 4. Execution Phases and Outcomes

1) Foundation & Setup Wizard
- Management VM preflight + bootstrap + integration checks implemented
- Minimal secure platform baseline online

2) Provisioning Engine
- OpenTofu modules + Ansible bootstrap connected via job flow
- tenant VM lifecycle automated

3) Catalog + Runtime Deploy
- app definitions, schema validation, template rendering, deploy worker
- all listed initial apps deployable

4) Authentik & SSO
- mandatory Authentik automation and connectors (Entra/LDAP/Local)

5) Operations Layer
- monitoring/logging/reporting and update/rollback jobs

6) HA Readiness
- HA-specific architecture decisions finalized and validated

## 5. Quality Gates (must-pass)
- Security: no plaintext secrets in repo, RBAC + audit enabled
- Reliability: provisioning idempotency and rollback test cases pass
- Operability: dashboards, logs, and job traces available per tenant
- Compliance/Auditability: every provisioning/deploy/update action attributable

## 6. Constraints & Assumptions
- Debian 13 for management and tenant VMs
- Domain base `*.irongeeks.eu`
- Tenant IP convention `10.<VLAN-ID>.10.100`
- App deploy model = Docker Compose from catalog templates
- Single-host is required before HA rollout

## 7. Dependency Backbone
- Proxmox API auth and permissions are prerequisite for provisioning
- IONOS DNS API is prerequisite for automated TLS and routing validation
- App catalog schema + renderer are prerequisite for deploy worker
- Authentik base deployment is prerequisite for SSO app integrations
- Monitoring/logging is prerequisite for safe nightly auto-updates

## 8. Principal Risks & Mitigations
1. Proxmox permission mismatches block automation
- Mitigation: wizard preflight with explicit permission checks + actionable remediation output

2. Secret handling complexity (Vault vs envelope encryption) delays implementation
- Mitigation: implement envelope encryption baseline now, keep Vault adapter interface

3. App heterogeneity causes unreliable deployments
- Mitigation: strict catalog schema contract + per-app healthcheck profile + staged rollout

4. Update failures impact tenant availability
- Mitigation: mandatory pre-update snapshot + health-gated rollback + maintenance windows

5. HA scope creep before single-host stabilization
- Mitigation: freeze HA to readiness deliverables until single-host GA gate is passed

## 9. Definition of Done (program-level)
Program is complete when:
- all v1 apps are deployable through the control plane
- onboarding a new tenant requires no manual infra steps
- update pipeline with rollback works across pilot tenants
- Track A acceptance is signed off
- Track B readiness docs/tests are delivered and reviewed
