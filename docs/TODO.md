# TODO – nächste Umsetzungsschritte

## Sofort (Sprint 1)
- [x] OpenTofu auf API-Token-Auth + secure TLS default (`proxmox_insecure=false`) umgestellt
- [x] OpenTofu Node/Storage Matrix (tenant_profile + LVM-Thin/Ceph Profile) ergänzt
- [x] Debian 13 Golden-Template Pipeline dokumentiert (`docs/infra/DEBIAN13-TEMPLATE-RUNBOOK.md`)
- [ ] Ansible Rollen produktiv machen (hardening, docker, authentik, apps)
- [x] App-Katalog Validator MVP inkl. GitHub Actions Check
- [x] Setup Wizard Backend-Flow als Dry-Run Plan API (`POST /api/setup/plan`) umgesetzt
- [x] Audit Event Contract v1 Baseline (Schema + Correlation-ID/Redaction-Regeln)

## Nächste konkrete Follow-ups (direkt nach diesen P0s)
- [x] OpenTofu: CI Guard ergänzt, der `proxmox_insecure=true` in prod blockiert
- [x] Catalog Validator erweitert um HostPattern-Policy + Healthcheck-Pflicht (für certified reference apps)
- [ ] Audit: Event-Emission in Provision/Deploy Jobs implementieren + Contract-Tests
- [ ] Secrets: verbindlichen Ingestion-Flow (ENV/Secret-Ref only) dokumentieren und im Code erzwingen

## Sprint 2
- [x] Tenant Wizard UI + Shirt-Size + VLAN/IP-Regeln (MVP)
- [x] Job Engine Grundstruktur (lokaler JSON-Store + Jobs API + Job Detail + Provisioning Dry-Run)
- [ ] Traefik Dynamic Config Renderer + ACME DNS challenge
- [ ] Authentik Connector Automation (Entra/LDAP/Local) gegen echte Provider APIs

## Sprint 3
- [ ] Monitoring Dashboards + Alerting
- [ ] Reporting PDF/CSV
- [ ] Nightly Updates + Snapshot + Rollback
- [ ] RBAC + Audit vollständig
