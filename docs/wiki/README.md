# GMZ Cloud Business Apps – Wiki

> **Sprache:** Deutsch | **Stand:** März 2026 | **Version:** 1.0.0
>
> 📚 Dies ist die **einzige offizielle Dokumentationsquelle** (Single Source of Truth) für Installation, Administration und Benutzung der GMZ Cloud Business Apps Plattform.

---

## Inhaltsverzeichnis

| Nr. | Seite | Beschreibung |
|-----|-------|--------------|
| 01 | [Überblick](01-overview.md) | Was ist GMZ Cloud Business Apps? Architektur, Tech-Stack |
| 02 | [Voraussetzungen](02-prerequisites.md) | Hardware, Netzwerk, API-Keys |
| 03 | [Debian 13 Installation](03-debian13-installation.md) | Betriebssystem installieren (ISO + Proxmox-Template) |
| 04 | [Management-VM Setup](04-management-vm-setup.md) | Docker, OpenTofu, Ansible, Repository, Konfiguration |
| 05 | [Traefik Deployment](05-traefik-deployment.md) | Reverse Proxy, TLS via IONOS DNS ACME |
| 06 | [Monitoring Deployment](06-monitoring-deployment.md) | Prometheus, Grafana, Loki, Alertmanager |
| 07 | [WebApp Deployment](07-webapp-deployment.md) | Next.js WebApp bauen, systemd-Service, Traefik-Route |
| 08 | [Ersten Tenant einrichten](08-first-tenant.md) | Tenant-Wizard, Provisionierungs-Job, Verifikation |
| 09 | [App Deployment](09-app-deployment.md) | App-Katalog (14 Apps), App deployen, Traefik-Routen |
| 10 | [Authentik SSO](10-authentik-sso.md) | SSO deployen, OIDC-Provider, RBAC-Gruppen |
| 11 | [Betrieb & Operations](11-operations.md) | Nightly Updates, Snapshots, Rollback, Maintenance |
| 12 | [Admin-Handbuch](12-admin-guide.md) | RBAC, Audit-Logs, Alert-Kanäle, Token-Management |
| 13 | [Benutzer-Handbuch](13-user-guide.md) | Login, Tenants, Deployments, Reports, Job-Status |
| 14 | [Troubleshooting](14-troubleshooting.md) | Häufige Fehler und Lösungen |
| 15 | [Umgebungsvariablen-Referenz](15-env-reference.md) | Vollständige Tabelle aller Umgebungsvariablen |

---

## Schnellnavigation

### 🚀 Erstinstallation (in dieser Reihenfolge)

1. [02 – Voraussetzungen prüfen](02-prerequisites.md)
2. [03 – Debian 13 installieren](03-debian13-installation.md)
3. [04 – Management-VM einrichten](04-management-vm-setup.md)
4. [05 – Traefik deployen](05-traefik-deployment.md)
5. [06 – Monitoring deployen](06-monitoring-deployment.md)
6. [07 – WebApp deployen](07-webapp-deployment.md)
7. [08 – Ersten Tenant anlegen](08-first-tenant.md)

### 🔧 Täglicher Betrieb

- [Tenant-Apps deployen →](09-app-deployment.md)
- [SSO mit Authentik →](10-authentik-sso.md)
- [Nightly Updates & Rollback →](11-operations.md)
- [Admin-Einstellungen →](12-admin-guide.md)

### 🆘 Hilfe

- [Troubleshooting →](14-troubleshooting.md)
- [Alle Umgebungsvariablen →](15-env-reference.md)

---

> ℹ️ **Hinweis:** Ältere Einzeldokumente unter `docs/` bleiben als Referenz erhalten, werden aber nicht mehr aktiv gepflegt.
> Diese Wiki ist die maßgebliche Quelle für alle Installations- und Betriebsinformationen.
