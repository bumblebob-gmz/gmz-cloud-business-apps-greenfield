# GMZ Cloud Business Apps

Interne Control-Plane für ein Multi-Tenant Hosting auf Proxmox 9 (LVM-Thin/Ceph),
mit Provisioning via OpenTofu, Konfiguration via Ansible und App-Deployment via Docker Compose.

## Ziele
- Pro Tenant genau **1 Debian 13 VM**
- VLAN-separiert (UniFi-gesteuert), statische IP: `10.<VLAN-ID>.10.100`
- Zentrales Traefik mit Domain-Schema: `service.kunde.irongeeks.eu`
- Pro Tenant immer Authentik + SSO für nachgelagerte Services
- Interne moderne WebApp (Desktop/Tablet/Mobile)
- Reporting (PDF/CSV): Kunde, User, Storage, Services, Health
- Nightly Updates je Tenant mit Wartungsfenster, Healthchecks, Auto-Rollback

---

## Projektstatus

- [x] Requirements konsolidiert
- [x] Architekturentwurf v1
- [x] BMAD-Roadmap v1
- [x] Repo-Skeleton
- [ ] Produktive Umsetzung der Provisioning-/Deploy-Pipeline

---

## Struktur

```text
infra/
  opentofu/              # Proxmox VM-Provisioning
automation/
  ansible/               # Hardening, Docker, App-Deploy, Updates
catalog/
  apps/                  # Git-basierter App-Katalog
platform/
  webapp/                # Interne Control-Plane UI
ops/
  scripts/               # Hilfsskripte (z. B. Proxmox API Bootstrap)
docs/                    # Architektur, Roadmap, Spezifikationen
```

---

## Anleitung (Setup / Quickstart)

## 1) Voraussetzungen

Benötigt auf der Management-VM (Debian):
- `git`
- `opentofu` (>= 1.6)
- `ansible` (inkl. benötigter Collections)
- `docker` + `docker compose`
- Zugriff auf:
  - Proxmox API
  - IONOS DNS API
  - GitHub Repo

Optional lokal für Entwicklung:
- Node.js 20+
- pnpm oder npm

## 2) Repository klonen

```bash
git clone <REPO_URL>
cd gmz-cloud-business-apps
```

## 3) Proxmox API User/Token anlegen

Auf einem Proxmox Node (root) das Helper-Script ausführen:

```bash
bash ops/scripts/proxmox-api-bootstrap.sh
```

Danach Token sicher speichern (für Setup-Wizard / OpenTofu Secrets).

## 4) OpenTofu vorbereiten (Tenant-VM Provisioning)

```bash
cd infra/opentofu/environments/prod
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars mit realen Werten befüllen
```

Dann:

```bash
tofu init
tofu plan
tofu apply
```

Damit wird eine Debian-13 Tenant-VM mit VLAN + statischer IP (`10.<VLAN>.10.100`) erstellt.

## 5) Tenant per Ansible bootstrappen

Inventory anlegen/ergänzen:

```bash
cp automation/ansible/inventory/tenant.ini.example automation/ansible/inventory/tenant.ini
```

Bootstrap ausführen:

```bash
ansible-playbook -i automation/ansible/inventory/tenant.ini automation/ansible/playbooks/bootstrap-tenant.yml
```

App-Deployment:

```bash
ansible-playbook -i automation/ansible/inventory/tenant.ini automation/ansible/playbooks/deploy-apps.yml
```

Nightly Updates (manuell testweise):

```bash
ansible-playbook -i automation/ansible/inventory/tenant.ini automation/ansible/playbooks/nightly-updates.yml
```

## 6) App-Katalog erweitern

Neue App unter `catalog/apps/<app-id>/` anlegen mit:
- `app.yaml`
- `compose.template.yml`
- `vars.schema.json`

Danach in CI/Review freigeben, dann deploybar machen.

## 7) Setup-Wizard / Architektur lesen

- Architektur: `docs/ARCHITECTURE.md`
- BMAD Roadmap: `docs/BMAD-ROADMAP.md`
- Management-VM Wizard: `docs/MANAGEMENT-VM-SETUP-WIZARD.md`
- App-Katalog-Spec: `docs/APP-CATALOG-SPEC.md`
- Branding-Seed: `docs/BRANDING-SEED.md`

---

## Enthaltene Initial-Apps

- authentik
- nextcloud (+talk, collabora CODE)
- IT Tools
- paperless-ngx
- vaultwarden
- bookstack
- joplin
- libretranslate
- ollama
- openwebui
- searxng
- snipe-it
- wiki.js

---

## Wichtige Hinweise

- Backups sind aktuell **out of scope**.
- Dieses Repo ist für **interne Nutzung** im IT-Systemhaus.
- Secrets niemals im Klartext committen.
