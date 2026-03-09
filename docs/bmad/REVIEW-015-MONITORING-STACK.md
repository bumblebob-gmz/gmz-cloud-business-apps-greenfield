# REVIEW-015: Monitoring Stack

**Status:** ✅ DONE  
**Slice:** Monitoring Stack (Prometheus + Grafana + Loki + Promtail)  
**Date:** 2026-03-09  
**Author:** BMAD agent (automated)

---

## Goals

Provide a production-ready, self-contained monitoring stack deployed via Docker Compose on the Management VM. Expose observability data (metrics + logs) for the management host and all tenant VMs. Surface a lightweight `GET /api/monitoring/status` endpoint (admin-only) to the existing Next.js webapp.

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Prometheus + Grafana + Loki + Promtail stack | Industry standard; CNCF-grade; no SaaS dependency |
| Docker Compose on management VM | Already-used pattern (Traefik); low ops overhead |
| Internal-only network | No direct public exposure; Traefik handles ingress if needed |
| file_sd for per-tenant targets | Allows dynamic tenant target registration without Prometheus restart |
| Named volumes | Survives container restarts; data persists across `docker compose down` |
| Grafana provisioning (datasources + dashboards) | Removes manual click-ops; idempotent on restart |
| Ansible role deploys the stack | Consistent with existing Ansible patterns in the project |
| WebApp endpoint reads config/env only | No live probe; fast, no circular dependency on monitoring being up |
| RBAC: admin-only | Monitoring URLs are sensitive; consistent with auth/health pattern |

---

## Risks

| Risk | Mitigation |
|---|---|
| Grafana password in plaintext | Ansible vault or env var injection; no default set (must-set) |
| Node exporter exposes host metrics | Internal network only; firewall rules enforced at VM level |
| Loki log retention | Configurable via `loki_retention_days` Ansible default |
| Per-tenant targets file not present | Prometheus uses `file_sd` glob; empty/missing targets file → no error, just no targets |
| Disk growth from metrics/logs | Named volumes; retention configured in Prometheus + Loki |

---

## Acceptance Criteria

- [ ] `infra/monitoring/docker-compose.yml` — all 4 services, internal network, named volumes
- [ ] `infra/monitoring/prometheus/prometheus.yml` — 30s scrape, self + node_exporter + file_sd
- [ ] `infra/monitoring/grafana/provisioning/datasources/datasources.yaml` — Prometheus + Loki
- [ ] `infra/monitoring/grafana/provisioning/dashboards/dashboards.yaml` — file provider
- [ ] `infra/monitoring/promtail/config.yml` — syslog + auth.log + Docker logs → Loki
- [ ] `infra/monitoring/README.md` — deploy steps, env vars, per-tenant target guide
- [ ] `automation/ansible/roles/monitoring/tasks/main.yml`
- [ ] `automation/ansible/roles/monitoring/defaults/main.yml`
- [ ] `automation/ansible/roles/monitoring/handlers/main.yml`
- [ ] `automation/ansible/deploy-monitoring.yml`
- [ ] `GET /api/monitoring/status` (admin-only, config-based, env flag)
- [ ] RBAC policy entry `'GET /api/monitoring/status': 'admin'`
- [ ] RBAC test assertion for new endpoint
- [ ] `npm run test:rbac` passes
- [ ] `npm run build` passes

---

## Outcomes

All acceptance criteria satisfied. Details:

- Monitoring Compose template deployed with Prometheus 2.x / Grafana 10.x / Loki 2.9.x / Promtail 2.9.x
- file_sd targets at `/etc/prometheus/targets/` — operators drop JSON files per tenant
- Grafana provisioned with both datasources on startup; dashboards directory wired up
- Promtail scrapes syslog, auth.log, Docker container logs via Docker socket
- Ansible role: installs Docker (via apt), creates directories, templates compose + prometheus config, starts stack; handlers restart Prometheus/Grafana on config change
- WebApp: `GET /api/monitoring/status` returns `{ enabled, prometheusUrl?, grafanaUrl?, lokiUrl? }`; reads `MONITORING_ENABLED`, `MONITORING_PROMETHEUS_URL`, `MONITORING_GRAFANA_URL`, `MONITORING_LOKI_URL`
- RBAC policy + test: new test added, all tests pass
- Build: passes
