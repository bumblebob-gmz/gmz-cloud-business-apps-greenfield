# ARCHITECTURE REVIEW CHECKLIST (BMAD)

- **Purpose:** Validate architecture implementation readiness against PRD requirements.
- **Applies to:** Track A (Single-Host GA) and Track B (HA Readiness).
- **Primary Inputs:** `docs/PRD.md`, `docs/ARCHITECTURE-V2.md`, `docs/bmad/*`.
- **Review Cadence:** End of each sprint + gate reviews (G1..G5).

Use status values: `PASS | PARTIAL | FAIL | N/A`.

---

## 1) Control Plane Setup & Integrations (FR-SETUP)

| Req ID | Validation Checklist | Evidence Required | Gate | Status |
|---|---|---|---|---|
| FR-SETUP-01 | Preflight validates Debian, resources, DNS/outbound, NTP; blocks hard fails | JSON preflight report with pass/warn/fail; blocked-run test | G1 | |
| FR-SETUP-02 | Docker/Compose + firewall baseline idempotent | Two consecutive run logs showing no unintended drift | G1 | |
| FR-SETUP-03 | Proxmox credentials + permission checks with remediation hints | Permission matrix report + negative test outputs | G1 | |
| FR-SETUP-04 | IONOS credentials validated + ACME DNS dry-run passes | DNS zone visibility output + challenge dry-run logs | G1 | |
| FR-SETUP-05 | Core services bootstrapped; migrations repeatable; health summary available | Compose/service status + migration rerun log + `/setup/health-summary` response | G1 | |
| FR-SETUP-06 | Initial admin, RBAC roles, encryption baseline, audit enabled | Seed script output + role list + first audit event | G1 | |

---

## 2) Tenant Provisioning Engine (FR-TENANT)

| Req ID | Validation Checklist | Evidence Required | Gate | Status |
|---|---|---|---|---|
| FR-TENANT-01 | Wizard/API captures full tenant input model | API contract tests + UI payload snapshots | G2 | |
| FR-TENANT-02 | Enforces strict IP rule `10.<VLAN>.10.100` | Unit tests for valid/invalid VLAN/IP combinations | G2 | |
| FR-TENANT-03 | S/M/L/XL presets mapped and policy-bounded | Config mapping file + boundary tests | G2 | |
| FR-TENANT-04 | Async job states queued/running/success/fail with audit linkage | Job lifecycle logs + DB records + audit entries | G2 | |
| FR-TENANT-05 | OpenTofu outputs deterministic and trigger Ansible bootstrap | Output artifact (`vmid/ip/node/storage`) + bootstrap execution log | G2 | |

---

## 3) Catalog & Deployment Runtime (FR-DEPLOY)

| Req ID | Validation Checklist | Evidence Required | Gate | Status |
|---|---|---|---|---|
| FR-DEPLOY-01 | Catalog schema validated in CI before deployable state | CI pipeline results with failing/positive fixtures | G2/G3 | |
| FR-DEPLOY-02 | Renderer fails fast on missing required variables | Unit/integration tests with missing var cases | G2/G3 | |
| FR-DEPLOY-03 | Secrets injected only via secret store references | Code scan + runtime env artifact checks (no plaintext refs) | G3 | |
| FR-DEPLOY-04 | Deploy worker supports deploy/redeploy/remove + per-job/per-app logs | API-to-worker E2E tests + log artifact links | G3 | |
| FR-DEPLOY-05 | App deployment failure isolation (no corruption of healthy apps) | Chaos/failure injection tests on one app with others healthy | G3 | |
| FR-DEPLOY-06 | All 13 apps deployable with health checks + min version pinning | App certification matrix + smoke test report | G4 | |

---

## 4) Authentik & SSO (FR-AUTH)

| Req ID | Validation Checklist | Evidence Required | Gate | Status |
|---|---|---|---|---|
| FR-AUTH-01 | Authentik mandatory; provisioning fails if skipped/unhealthy | Negative provisioning test + failure reason evidence | G3 | |
| FR-AUTH-02 | Entra/LDAP/Local modes supported with mode-specific validation | Connector validation tests for each mode | G3 | |
| FR-AUTH-03 | `supportsSSO=true` apps auto-mapped with callback URL validation | Mapping job logs + callback validation outputs | G3/G4 | |
| FR-AUTH-04 | Connector/mapping changes produce audit events | Audit query screenshots/log exports | G3 | |

---

## 5) Operations, Update Safety, Reporting (FR-OPS)

| Req ID | Validation Checklist | Evidence Required | Gate | Status |
|---|---|---|---|---|
| FR-OPS-01 | Grafana dashboards cover infra, tenant, app, Authentik | Dashboard export IDs/screenshots | G4 | |
| FR-OPS-02 | Logs centralized and filterable by tenant/app | Loki query examples + index config | G4 | |
| FR-OPS-03 | Nightly updates enforce maintenance windows | Scheduler tests across allowed/blocked windows | G4 | |
| FR-OPS-04 | Snapshot mandatory before any update action | Job trace proving update blocked on snapshot failure | G4 | |
| FR-OPS-05 | Health-gate failure triggers auto-rollback with evidence | Failure drill report + rollback success proof | G4 | |
| FR-OPS-06 | PDF/CSV reporting async and includes required fields | Report sample artifacts + async queue trace | G4 | |

---

## 6) Security, RBAC, Audit, Secrets (FR-SEC)

| Req ID | Validation Checklist | Evidence Required | Gate | Status |
|---|---|---|---|---|
| FR-SEC-01 | Admin/Techniker/ReadOnly enforced consistently API/UI | Permission matrix + endpoint auth tests | G1-G4 | |
| FR-SEC-02 | Sensitive actions restricted to intended roles/scopes | Negative authorization tests | G2-G4 | |
| FR-SEC-03 | Unauthorized attempts logged | Security event logs + audit entries | G2-G4 | |
| FR-SEC-04 | Audit entries include actor/tenant/action/time/outcome/correlation ID | Audit schema + sample events for key workflows | G1-G4 | |
| FR-SEC-05 | Envelope encryption at rest + documented/tested rotation | Crypto design doc + rotation test run output | G3/G4 | |

---

## 7) NFR Validation Checklist

| NFR Area | Validation Checklist | Evidence Required | Gate | Status |
|---|---|---|---|---|
| Security | TLS verification default-on for integrations | Config defaults + integration test | G1 | |
| Security | No plaintext secrets in repo/logs/reports | Secret scan CI + redaction tests | G2-G4 | |
| Availability | Health endpoints for all control-plane services | Health endpoint inventory + probes | G1 | |
| Reliability | Provision/deploy/update idempotency for retry scenarios | Re-run integration tests | G2-G4 | |
| Reliability | Rollback restores last known healthy state | Fault-injection rollback drill | G4 | |
| Performance | Tenant provisioning median <= 15 min | Timed benchmark report | G4 | |
| Performance | Management first setup <= 45 min | Setup benchmark report | G1/G4 | |
| Performance | Report enqueue <= 5s | API latency test output | G4 | |
| Auditability | Critical actions fully attributable/searchable | Traceability report from audit queries | G4 | |

---

## 8) Deployment View Validation

## 8.1 Single-Host (Track A)

| Check | Validation Checklist | Evidence | Status |
|---|---|---|---|
| SH-01 | One Proxmox node with mgmt VM + tenant VMs layout documented and reproducible | Infra diagram + IaC apply logs | |
| SH-02 | Control-plane services recover via restart policies | Service restart drill logs | |
| SH-03 | End-to-end tenant onboarding requires no manual infra steps | Scripted E2E runbook output | |

## 8.2 HA Readiness (Track B)

| Check | Validation Checklist | Evidence | Status |
|---|---|---|---|
| HA-01 | `single-host` vs `ha-cluster` mode toggles implemented and drift-checked | Config tests + drift detection output | |
| HA-02 | DB/Redis HA strategy selected and failover runbook tested in staging | Runbook + failover test report | |
| HA-03 | Tenant placement anti-affinity policy validated | Placement test logs | |
| HA-04 | No architecture drift between Track A and Track B contracts | Contract diff report | |

---

## 9) ADR Compliance Checklist

| ADR | Decision | Validation Checklist | Evidence | Status |
|---|---|---|---|---|
| ADR-001 | One VM per tenant | No multi-tenant VM allocation possible in API/IaC | Provisioning tests | |
| ADR-002 | Central Traefik ingress | All public routes terminate at control-plane Traefik | Route inventory | |
| ADR-003 | Mandatory Authentik | Tenant cannot reach active without Authentik healthy | State transition tests | |
| ADR-004 | Async queued orchestration | Long-running operations are job-based only | API behavior tests | |
| ADR-005 | Envelope encryption baseline | Secret store uses DEK/KEK design + rotation path | Crypto/rotation tests | |
| ADR-006 | Snapshot-first updates | Updates blocked when snapshot fails/missing | Update negative tests | |
| ADR-007 | Single-host before HA | HA implementation tasks gated after G4 sign-off | Release/gate records | |
| ADR-008 | Contract-first catalog | App not deployable without schema + health contract | CI policy checks | |

---

## 10) Gate Exit Criteria Summary

| Gate | Minimum checklist condition to pass |
|---|---|
| G1 Management baseline | All FR-SETUP rows PASS + initial FR-SEC baseline rows PASS |
| G2 Provision + deploy baseline | FR-TENANT PASS + FR-DEPLOY-01..04 PASS + unauthorized logging PASS |
| G3 SSO baseline | FR-AUTH PASS + FR-DEPLOY-03/05 PASS + FR-SEC-05 PARTIAL or better |
| G4 Single-host GA | All FR-DEPLOY/FR-OPS/FR-SEC PASS + NFR core PASS + rollback drill PASS |
| G5 HA readiness sign-off | HA checklist PASS + Track A stable + drift checks PASS |

---

## 11) Review Sign-off Block

- **Architecture Lead:** __________________  Date: __________
- **Security Reviewer:** __________________  Date: __________
- **Platform Engineering Reviewer:** ______  Date: __________
- **Operations Reviewer:** ________________  Date: __________
- **Product Owner (GMZ/Robert):** _________  Date: __________

Notes / exceptions:

- 
- 
- 
