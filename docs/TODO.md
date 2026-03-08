# TODO – nächste Umsetzungsschritte

## Sofort (Sprint 1)
- [x] OpenTofu auf API-Token-Auth + secure TLS default (`proxmox_insecure=false`) umgestellt
- [ ] OpenTofu Node/Storage Matrix erweitern
- [ ] Debian 13 Golden-Template Pipeline dokumentieren
- [ ] Ansible Rollen produktiv machen (hardening, docker, authentik, apps)
- [x] App-Katalog Validator MVP (Pflichtdateien + app.yaml Pflichtfelder) inkl. GitHub Actions Check
- [ ] Setup Wizard Backend-Flows (Preflight + Integrationschecks)
- [x] Audit Event Contract v1 Baseline (Schema + Correlation-ID/Redaction-Regeln)

## Nächste konkrete Follow-ups (direkt nach diesen P0s)
- [ ] OpenTofu: CI Guard ergänzen, der `proxmox_insecure=true` in prod blockiert
- [ ] Catalog Validator erweitern um HostPattern-Policy + Healthcheck-Pflicht
- [ ] Audit: Event-Emission in Provision/Deploy Jobs implementieren + Contract-Tests
- [ ] Secrets: verbindlichen Ingestion-Flow (ENV/Secret-Ref only) dokumentieren und im Code erzwingen

## Sprint 2
- [ ] Tenant Wizard UI + Shirt-Size + VLAN/IP-Regeln
- [ ] Job Engine (provision/deploy/update/report)
- [ ] Traefik Dynamic Config Renderer + ACME DNS challenge
- [ ] Authentik Connector Automation (Entra/LDAP/Local)

## Sprint 3
- [ ] Monitoring Dashboards + Alerting
- [ ] Reporting PDF/CSV
- [ ] Nightly Updates + Snapshot + Rollback
- [ ] RBAC + Audit vollständig
