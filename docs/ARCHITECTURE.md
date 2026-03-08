# Architektur v1 – GMZ Cloud Business Apps

## 1) Gesamtbild

### 1.1 Control Plane (Management-VM, Debian)
Läuft zentral auf einer dedizierten Management-VM:
- GMZ WebApp (intern)
- GMZ API (Provisioning, Orchestrierung, RBAC, Audit)
- Worker/Queue (asynchrone Jobs: Provisioning, Updates, Reports)
- PostgreSQL
- Redis
- Traefik (zentral)
- Monitoring Stack (Prometheus, Grafana, Loki, Alertmanager)

### 1.2 Tenant Plane (pro Kunde 1 VM)
Jeder Tenant erhält exakt eine Debian-13-VM:
- VLAN: feste VLAN-ID pro Kunde
- IP: `10.<VLAN-ID>.10.100`
- Security Baseline via Ansible
- Docker + Docker Compose
- Authentik (immer)
- Ausgewählte Business Apps aus Katalog

## 2) Proxmox Topologien

### 2.1 Single-Host
- 1x Proxmox 9 Node
- Storage: LVM-Thin (Default), optional Ceph-Storage falls vorhanden
- Control Plane auf dedizierter VM

### 2.2 HA-Cluster
- N x Proxmox Nodes
- Ceph empfohlen für HA-Storage
- Control Plane HA-ready:
  - App/API horizontal skalierbar
  - PostgreSQL als HA-Option (z. B. Patroni später) oder managed failover
  - Redis mit Sentinel später erweiterbar
- Tenant-VMs via Anti-Affinity/HA-Gruppen planbar

## 3) Provisioning-Flow (End-to-End)
1. Techniker legt Kundenmandant in WebApp an
2. Wizard erfasst:
   - Kunde, Domain-Slug, VLAN-ID
   - Shirt-Size (CPU/RAM/Storage)
   - Authentik-IdP Modus (Entra, LDAP, Local)
   - App-Auswahl + Variablen
   - Wartungsfenster
3. GMZ API triggert OpenTofu-Run
4. OpenTofu erstellt VM aus Debian-13 Template (Cloud-Init), VLAN Tag, IP
5. Ansible Bootstrap:
   - Hardening
   - Docker/Compose
   - Agent-/Runtime Vorbereitungen
6. App Deploy aus Git-Katalog
7. Zentrales Traefik aktualisiert Routing (`service.kunde.irongeeks.eu`)
8. TLS per IONOS DNS-Challenge
9. Monitoring + Logging + Reporting aktiviert

## 4) Zentrales Traefik
- Läuft auf Management-VM
- Dynamic Config wird aus GMZ Service Registry erzeugt
- Routing-Schema: `<service>.<kunde>.irongeeks.eu`
- Zertifikate via Let’s Encrypt + IONOS DNS API
- Optional Wildcard je Kunde: `*.kunde.irongeeks.eu`

## 5) Authentik-Modell
- Pro Tenant obligatorisch 1 Authentik Instanz
- Wizard konfiguriert Connectoren:
  - Entra ID (Client ID/Secret/Tenant)
  - LDAP (Host/BaseDN/Bind/UserFilter)
  - Local Users
- GMZ API legt Authentik Provider/Applications nach App-Deployment an
- Ziel: SSO für alle unterstützten Services

## 6) App-Katalog (GitOps)
- Quelle: Git-Repo mit versionsierten App-Definitionen
- Jede App enthält:
  - Metadaten (Name, Version, Supportstatus)
  - Compose-Template
  - Variablen-Schema (required/optional/default)
  - Branding-Fähigkeiten (Farben, Logo, Favicon)
  - Healthcheck-Regeln
- Erweiterbar durch neue App-Ordner + Schema-Validierung

## 7) Sicherheits- und Betriebsmodell
- RBAC in GMZ WebApp: Admin, Techniker, ReadOnly
- Vollständiges Audit Log (wer hat was wann geändert/deployt)
- Secret Storage verschlüsselt (KMS/Vault-fähig vorbereiten)
- Tenant-Netztrennung via VLAN
- Nightly Updates je Tenant-Wartungsfenster:
  - Pre-Update VM Snapshot
  - Rolling App-Update
  - Healthchecks
  - Auto-Rollback bei Fail

## 8) Monitoring, Logging, Reporting
- Monitoring: Node/Container/Service-Metriken
- Logging: zentral aggregiert (Loki), tenant-filterbar
- Dashboards: Infrastruktur, Tenant, App, Authentik, SLA-nahe Kennzahlen
- Reports (PDF/CSV):
  - Kunde
  - User-Anzahl
  - Genutzter Storage
  - Aktive Services
  - Health-Status

## 9) Nicht im Scope
- Backups (explizit out of scope)

## 10) Offene technische Entscheidungen für Implementation
- Secrets: HashiCorp Vault vs. DB-Encryption-at-rest + envelope keys
- HA-DB sofort vs. Phase 2
- Event-Bus/Queue Detail (BullMQ vs. Celery-ähnlicher Stack)
