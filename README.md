# GMZ Cloud Business Apps

> Interne Control-Plane für Multi-Tenant Hosting auf Proxmox — provisioniert, deployt und verwaltet Kunden-VMs vollautomatisch.

[![CI](https://github.com/bumblebob-gmz/gmz-cloud-business-apps-greenfield/actions/workflows/ci.yml/badge.svg)](https://github.com/bumblebob-gmz/gmz-cloud-business-apps-greenfield/actions)
[![Security](https://github.com/bumblebob-gmz/gmz-cloud-business-apps-greenfield/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/bumblebob-gmz/gmz-cloud-business-apps-greenfield/actions)

---

## Überblick

GMZ Cloud Business Apps ist eine vollständige **Self-Hosted Cloud-Management-Plattform** für Managed-Service-Provider. Sie automatisiert den gesamten Lifecycle von Kunden-Umgebungen — von der VM-Provisionierung über App-Deployment bis hin zu automatischen Nightly-Updates mit gesundheitsgeprüftem Rollback.

**Stack:** Next.js · OpenTofu · Ansible · Docker Compose · Traefik · PostgreSQL · Prometheus · Grafana · Loki

---

## Architektur

```
Internet
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│  Traefik (Management-VM)                                      │
│  *.kunde.irongeeks.eu  →  IONOS DNS ACME  →  Let's Encrypt   │
└────────────────┬──────────────────────────────────────────────┘
                 │
     ┌───────────┴───────────┐
     ▼                       ▼
┌──────────────┐    ┌──────────────────────────────────────────┐
│ Control-Plane│    │  Tenant-VMs (Debian 13, VLAN-isoliert)   │
│ WebApp       │    │                                          │
│ :3000        │    │  VLAN 120 → 10.120.10.100 (Kunde A)      │
│              │    │  VLAN 130 → 10.130.10.100 (Kunde B)      │
│ PostgreSQL   │    │  VLAN 140 → 10.140.10.100 (Kunde C)      │
│ Monitoring   │    │                                          │
└──────────────┘    │  Je VM: Authentik + Apps via Compose     │
                    └──────────────────────────────────────────┘
```

---

## Features

### Control-Plane WebApp
- 🏢 **Tenant-Management** — Anlegen, Verwalten, Status-Übersicht aller Kunden-VMs
- 🚀 **Provisionierung** — Vollautomatisch Wizard → OpenTofu → Ansible → `active`
- 📦 **App-Katalog** — 14 vorkonfigurierte Apps (Authentik, Nextcloud, Documenso, u.v.m.)
- 🔐 **RBAC** — Rollenmodell `admin` / `technician` / `readonly` auf allen API-Routen
- 📋 **Audit-Log** — Vollständiges Ereignisprotokoll aller Aktionen
- 🔔 **Alerts** — Teams + E-Mail Benachrichtigungen mit Severity-Routing
- 📊 **Reporting** — PDF/CSV-Export (Tenants, Audit-Events, Provisioning)
- 🔑 **Auth-Modi** — `trusted-bearer`, `jwt` (OIDC/Vault), `dev-header` (nur Dev)

### Infrastruktur
- 🌐 **Traefik** — Automatisches TLS via IONOS DNS ACME Challenge
- 📡 **Monitoring** — Prometheus + Grafana + Loki + Promtail + Alertmanager
- 🔄 **Nightly Updates** — Snapshot → Update → Healthcheck → Auto-Rollback
- 🛡️ **Security CI** — gitleaks (Secret-Scan) + checkov (IaC-Lint) auf jedem PR
- 🗄️ **State Backend** — OpenTofu Remote State via S3/MinIO (per-Tenant isoliert)

---

## Projektstatus

| Bereich | Status |
|---|---|
| Control-Plane WebApp (Next.js) | ✅ Produktionsbereit |
| RBAC + Auth (trusted-bearer, JWT/OIDC) | ✅ Vollständig |
| Audit-Logging | ✅ Vollständig |
| Tenant-Provisionierung (OpenTofu + Ansible) | ✅ Vollständig |
| App-Katalog (14 Apps) | ✅ Vollständig |
| Traefik + IONOS DNS ACME | ✅ Vollständig |
| Monitoring Stack | ✅ Vollständig |
| Nightly Updates + Rollback | ✅ Vollständig |
| PostgreSQL Integration | ✅ Vollständig |
| PDF/CSV Reporting | ✅ Vollständig |
| Security CI Pack | ✅ Vollständig |
| Documenso Integration | ✅ Vollständig |
| Security Hardening (Code Review) | ✅ Abgeschlossen |

---

## Schnellstart

→ **[Vollständige Setup-Anleitung lesen](docs/SETUP-GUIDE.md)**

### Kurzübersicht

```bash
# 1. Repository klonen
git clone https://github.com/bumblebob-gmz/gmz-cloud-business-apps-greenfield.git
cd gmz-cloud-business-apps-greenfield

# 2. Umgebungsvariablen konfigurieren
cp platform/webapp/.env.example platform/webapp/.env
# → .env mit eigenen Werten befüllen

# 3. WebApp starten (Development)
cd platform/webapp
npm install
npm run dev

# 4. Traefik deployen (Production)
cd automation/ansible
ansible-playbook deploy-traefik.yml -i inventory/production.yml

# 5. Ersten Tenant provisionieren
# → WebApp öffnen → Tenants → New Tenant
```

---

## Repo-Struktur

```
gmz-cloud-business-apps/
├── platform/
│   └── webapp/              # Next.js Control-Plane (API + UI)
│       ├── app/api/         # REST API Routes
│       ├── lib/             # Auth, RBAC, Audit, Provisioning Engine
│       ├── tests/           # Test Suite (Node.js built-in test runner)
│       └── prisma/          # Datenbankschema + Migrationen
├── infra/
│   ├── opentofu/            # Proxmox VM-Provisioning (IaC)
│   ├── traefik/             # Traefik Static + Dynamic Config
│   └── monitoring/          # Prometheus + Grafana + Loki + Alertmanager
├── automation/
│   └── ansible/             # Ansible Roles + Playbooks
│       ├── roles/           # Hardening, Docker, Traefik, Apps, ...
│       ├── deploy-traefik.yml
│       └── provision-tenant.yml
├── catalog/
│   └── apps/                # App-Katalog (14 Apps)
│       ├── authentik/
│       ├── nextcloud/
│       ├── documenso/
│       └── ...
├── ops/
│   └── scripts/             # Hilfsskripte (Catalog Validator, Gate Bundle, ...)
├── docs/
│   ├── SETUP-GUIDE.md       # Vollständige Installations-Anleitung
│   ├── DOCUMENSO-GUIDE.md   # Documenso-Anleitung
│   ├── ARCHITECTURE-V2.md   # Architektur-Dokumentation
│   ├── PRD.md               # Product Requirements
│   └── bmad/                # BMAD Review Artefakte (REVIEW-001 bis REVIEW-025+)
└── .github/
    └── workflows/           # CI/CD Pipelines
        ├── ci.yml
        ├── secret-scan.yml  # gitleaks
        ├── iac-security-lint.yml  # checkov
        ├── gate-evidence.yml
        └── nightly-updates.yml
```

---

## App-Katalog

| App | Kategorie | Status |
|---|---|---|
| Authentik | Identity & Access | ✅ Certified Reference |
| Nextcloud | Collaboration | ✅ Certified Reference |
| Paperless-NGX | Dokumentenmanagement | ✅ Certified Reference |
| Bookstack | Wiki / Dokumentation | ✅ Certified Reference |
| Vaultwarden | Passwort-Manager | ✅ Certified Reference |
| Documenso | Dokumentensignatur | 📋 Draft |
| Joplin | Notizen | 📋 Draft |
| IT-Tools | Dev-Toolbox | 📋 Draft |
| Wiki.js | Wiki | 📋 Draft |
| Snipe-IT | Asset-Management | 📋 Draft |
| Searxng | Metasuchmaschine | 📋 Draft |
| LibreTranslate | Übersetzung | 📋 Draft |
| OpenWebUI | KI-Frontend | 📋 Draft |
| Ollama | LLM-Runtime | 📋 Draft |

---

## Dokumentation

| Dokument | Beschreibung |
|---|---|
| [Setup-Anleitung](docs/SETUP-GUIDE.md) | Vollständige Installations- und Deployment-Anleitung |
| [Documenso Guide](docs/DOCUMENSO-GUIDE.md) | Documenso Setup, API, Webhooks |
| [Architektur](docs/ARCHITECTURE-V2.md) | Technische Architektur-Dokumentation |
| [PRD](docs/PRD.md) | Product Requirements Document |
| [BMAD Reviews](docs/bmad/) | Code Review Artefakte |

---

## Tests ausführen

```bash
cd platform/webapp

# Alle Tests
npm test

# RBAC-Tests
npm run test:rbac

# Datenbank-Schema validieren
npm run db:validate

# App-Katalog validieren
python3 ops/scripts/validate_catalog.py
```

---

## Sicherheitshinweise

- **Auth-Mode in Production:** `WEBAPP_AUTH_MODE=trusted-bearer` (niemals `dev-header` in Prod)
- **Secrets:** Alle Secrets über Ansible Vault oder Umgebungsvariablen — nie im Repository
- **TLS:** `proxmox_insecure=false` ist erzwungen — CI-Guard verhindert Regression
- **Bekannte Schwachstellen:** Vollständiger Code-Review unter [docs/bmad/REVIEW-025-FULL-CODE-REVIEW.md](docs/bmad/REVIEW-025-FULL-CODE-REVIEW.md)

---

## Lizenz

Intern — GMZ Platform Team
