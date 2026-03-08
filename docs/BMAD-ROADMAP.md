# BMAD-Roadmap – GMZ Cloud Business Apps

> Ziel: schnell zu einem produktionsfähigen v1 mit allen gewünschten Apps, ohne technische Schulden blind aufzubauen.

## Phase 0 – Foundation (Woche 1)
- Repo-Struktur anlegen (infra/automation/catalog/platform/ops/docs)
- CI-Grundlagen (lint, tests, schema validation)
- Architektur + Datenmodell finalisieren
- Security baseline policies festziehen

**Exit-Kriterien**
- Architektur freigegeben
- Grundrepo läuft im CI

## Phase 1 – Management-VM Setup-Wizard (Woche 1–2)
- Installer/Wizard für Erstinbetriebnahme
- Proxmox API User/Token Setup-Assistent
- IONOS DNS Credential Setup
- PostgreSQL/Redis/Traefik/Monitoring Bootstrap
- Healthchecks der Integrationen

**Exit-Kriterien**
- Leere Control Plane läuft stabil
- Alle externen Integrationen sind grün

## Phase 2 – Provisioning Engine (Woche 2–3)
- OpenTofu Module (VM, VLAN tag, storage profile, cloud-init)
- Debian 13 Golden Template Workflow
- Ansible Bootstrap Rolle (hardening + docker)
- Tenant Wizard inkl. Shirt-Size Mapping

**Exit-Kriterien**
- Tenant kann per Klick erzeugt werden
- Ziel-IP und VLAN stimmen

## Phase 3 – App Catalog + Deploy Runtime (Woche 3–4)
- Git-basierter Katalog + Schema
- Deploy Worker für Compose-Apps
- Variablenmodell pro Tenant
- Initiale Liste aller gewünschten Apps integrieren

**Exit-Kriterien**
- Alle gewünschten Apps sind deploybar
- Katalog ist erweiterbar

## Phase 4 – Authentik & SSO (Woche 4–5)
- Authentik Pflichtkomponente pro Tenant
- Connector-Wizard: Entra/LDAP/Local
- App-spezifische SSO-Integrationen (wo möglich)
- Secret Encryption + Rotation Reminder

**Exit-Kriterien**
- SSO-Flow funktioniert für priorisierte Apps
- Connectoren automatisiert provisioniert

## Phase 5 – Operations Layer (Woche 5–6)
- Nightly Updates je Tenant-Wartungsfenster
- Snapshot vor Update + Auto-Rollback
- Monitoring/Alerting/Loki Dashboards
- Reporting (PDF/CSV)

**Exit-Kriterien**
- Update-Job reproduzierbar und sicher
- Monitoring & Reports live

## Phase 6 – HA Readiness (Woche 6+)
- Cluster-spezifische Betriebsmodi
- Control Plane horizontal skalierbar
- DB/Redis HA-Optionen produktionsnah

**Exit-Kriterien**
- Dokumentierter HA-Runbook-Status
- Failover-Tests bestanden

---

## App-Lieferumfang (v1 vollständig)
1. authentik
2. nextcloud (+talk, collabora CODE)
3. IT Tools
4. paperless-ngx (+ optional nextcloud integration)
5. vaultwarden
6. bookstack
7. joplin
8. libretranslate
9. ollama
10. openwebui
11. searxng
12. snipe-it
13. wiki.js

## Shirt-Size Mapping (initial)
- S: 2 vCPU / 4 GB RAM / 120 GB
- M: 4 vCPU / 6 GB RAM / 200 GB
- L: 6 vCPU / 12 GB RAM / 400 GB
- XL: 8 vCPU / 16 GB RAM / 800 GB

## Delivery-Prinzipien
- Kein manueller Drift: alles via IaC + Ansible + Katalog
- Jede Aktion auditierbar
- Defaults sicher, aber über Wizard steuerbar
