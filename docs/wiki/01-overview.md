# 01 – Überblick

> **[← Wiki-Index](README.md)** | Weiter: [02 – Voraussetzungen →](02-prerequisites.md)

---

## Was ist GMZ Cloud Business Apps?

GMZ Cloud Business Apps ist eine **selbst gehostete Multi-Tenant-Plattform**, die es Managed-Service-Providern (MSPs) und IT-Dienstleistern ermöglicht, cloudbasierte Business-Applikationen vollautomatisch für Kunden bereitzustellen.

Die Plattform kombiniert Infrastructure-as-Code (OpenTofu), Konfigurations-Management (Ansible) und eine moderne Web-Verwaltungsoberfläche zu einem durchgängigen Lifecycle-Management-System.

### Kernfunktionen

- **Automatisiertes Provisionieren** von Tenant-VMs auf Proxmox VE
- **Katalogbasiertes Deployment** von Business-Apps (Nextcloud, Gitea, Vaultwarden, Odoo, Zammad u. v. m.)
- **Zentrales Reverse-Proxy- und TLS-Management** über Traefik v3
- **Single Sign-On** via Authentik für alle Tenants
- **Vollständiges Monitoring** mit Prometheus, Loki und Grafana
- **Nightly-Updates** mit automatischem Snapshot und Rollback
- **RBAC** – Rollenmodell `admin` / `technician` / `readonly` auf allen API-Routen
- **Audit-Log** – Vollständiges Ereignisprotokoll aller Aktionen
- **Alerts** – Teams + E-Mail Benachrichtigungen mit Severity-Routing
- **Reporting** – PDF/CSV-Export (Tenants, Audit-Events, Provisioning)

---

## Architektur-Diagramm

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  IONOS DNS (Wildcard *.apps.example.com → öffentliche IP)       │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Firewall / NAT (Port 80, 443 → Management-VM)                  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────── Proxmox Node ────────────────────────────┐
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Management-VM (Debian 13, 8 GB RAM, 100 GB SSD)          │  │
│  │                                                            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐  │  │
│  │  │ Traefik  │ │ WebApp   │ │ Authentik │ │ Monitoring │  │  │
│  │  │  :443    │ │  :3000   │ │  :9000    │ │ Grafana    │  │  │
│  │  │  :80     │ │          │ │           │ │ :3001      │  │  │
│  │  └────┬─────┘ └──────────┘ └───────────┘ └────────────┘  │  │
│  │       │  Docker-Netzwerk: mgmt-net                         │  │
│  └───────┼───────────────────────────────────────────────────┘  │
│          │                                                        │
│          │  VLAN-Trunk (802.1Q)                                  │
│          ▼                                                        │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ Tenant-VM 101        │  │ Tenant-VM 102        │  ...        │
│  │ VLAN 101             │  │ VLAN 102             │             │
│  │ 4–16 GB RAM          │  │ 4–16 GB RAM          │             │
│  │ Docker Apps          │  │ Docker Apps          │             │
│  │ Node-Exporter        │  │ Node-Exporter        │             │
│  │ Traefik-Agent        │  │ Traefik-Agent        │             │
│  └──────────────────────┘  └──────────────────────┘             │
│                                                                  │
│  Shared Storage: NFS / Ceph (optional)                           │
└──────────────────────────────────────────────────────────────────┘
```

### Datenfluss

```
Benutzer → Browser → Traefik (TLS) → WebApp (:3000)
                                        │
                              ┌─────────┴─────────┐
                              ▼                   ▼
                         OpenTofu            Ansible
                      (VM-Erstellung)    (OS + App Setup)
                              │                   │
                              └─────────┬─────────┘
                                        ▼
                                Proxmox API → Tenant-VM
```

---

## Tech-Stack

| Schicht | Technologie | Version | Zweck |
|---------|-------------|---------|-------|
| Hypervisor | Proxmox VE | 8.x | VM-Lifecycle, Snapshots, Storage |
| IaC | OpenTofu | 1.6+ | Proxmox-VM-Provisionierung |
| Konfig-Mgmt | Ansible | 2.15+ | OS-Härtung, App-Deployment |
| Container | Docker + Compose | 24+ | App-Isolation per Tenant |
| Reverse Proxy | Traefik | 3.x | TLS, Routing, Middleware |
| Auth | Authentik | 2024.x | SSO, OIDC, User-Management |
| Monitoring | Prometheus + Grafana | latest | Metriken, Dashboards |
| Log-Aggregation | Loki + Promtail | latest | Zentrales Logging |
| Alerting | Alertmanager | latest | Teams/Slack/E-Mail Alerts |
| DNS | IONOS API | v1 | Automatische DNS-Einträge |
| CI/CD | GitHub Actions | – | Nightly Updates, Tests |
| WebApp | Next.js (Node.js) | 20+ | Management-UI und API |
| Datenbank | SQLite / PostgreSQL | – | WebApp-State |

---

## Projektstatus

| Bereich | Status |
|---------|--------|
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

---

## Repository-Struktur

```
gmz-cloud-business-apps/
├── platform/
│   └── webapp/              # Next.js Control-Plane (API + UI)
│       ├── app/api/         # REST API Routes
│       ├── lib/             # Auth, RBAC, Audit, Provisioning Engine
│       ├── tests/           # Test Suite
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
├── ops/
│   └── scripts/             # Hilfsskripte
├── docs/
│   └── wiki/                # 📚 Diese Wiki (Single Source of Truth)
└── .github/
    └── workflows/           # CI/CD Pipelines
```

---

> **[← Wiki-Index](README.md)** | Weiter: [02 – Voraussetzungen →](02-prerequisites.md)
