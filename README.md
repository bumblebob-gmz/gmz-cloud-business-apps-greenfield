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
# empfohlen: proxmox_api_token via ENV (TF_VAR_proxmox_api_token) statt Klartext
```

Security-Default:
- `proxmox_api_token` statt Username/Passwort
- `proxmox_insecure = false` (TLS-Verifikation aktiv)
- Lab-only Override (`true`) nur bewusst und dokumentiert nutzen

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

## 7) Platform WebApp Provisioning API (Dry-Run + Execution)

Die Control-Plane (`platform/webapp`) bietet:

- `POST /api/provision/tenant` mit `{ tenantId, dryRun }`
  - `dryRun: true` (Default): erzeugt Job-Arbeitsverzeichnis + Artefakte, führt nichts aus
  - `dryRun: false`: führt OpenTofu + Ansible aus (nur wenn Execution-Preflight grün)
- `GET /api/provision/preflight`
  - liefert nur sichere Readiness-Flags (present/missing), keine Secrets

Execution-Mode benötigt folgende ENV-Variablen:

- `PROVISION_EXECUTION_ENABLED=true`
- `PROVISION_PROXMOX_ENDPOINT`
- `PROVISION_PROXMOX_API_TOKEN`
- `PROVISION_DEFAULT_SSH_PUBLIC_KEY`

Optionale Defaults (empfohlen):

- `PROVISION_DEFAULT_TENANT_PROFILE`
- `PROVISION_DEFAULT_NODE`
- `PROVISION_DEFAULT_STORAGE`
- `PROVISION_DEBIAN_TEMPLATE_ID`

Pro Job werden Artefakte unter `platform/webapp/.data/provisioning/<jobId>/` erzeugt:

- `tenant.auto.tfvars`
- `tenant.ini`

## 8) Auth + RBAC (WebApp API)

Die WebApp unterstützt zwei Auth-Modi:

- `WEBAPP_AUTH_MODE=dev-header` (Default, lokal bequem)
  - Nutzt optionale Header `x-user-id` (Default `dev-user`) und `x-user-role` (Default `technician`).
- `WEBAPP_AUTH_MODE=trusted-bearer` (für sicherere Deployments)
  - Erwartet `Authorization: Bearer <token>`
  - Prüft gegen statische Token-Mapping-Env:
    - `WEBAPP_TRUSTED_TOKENS_JSON=[{"token":"...","userId":"...","role":"admin","tokenId":"ops-admin-2026","expiresAt":"2026-12-31T23:59:59.000Z"}]`
  - Unterstützte Felder je Token: `token`, `userId`, `role` (required), `tokenId`, `expiresAt` (optional, ISO-Zeitstempel)
  - Abgelaufene Tokens (`expiresAt` in der Vergangenheit) werden abgewiesen.
  - Rückwärtskompatibel: Einträge ohne `expiresAt` bleiben gültig.
  - Ignoriert `x-user-id` / `x-user-role` in diesem Modus.
  - Fehlender/ungültiger/abgelaufener Token auf geschützten Endpoints => `401 Unauthorized`.
  - Optionale Warning-Window-Konfiguration für Token-Rotation in `GET /api/auth/health`:
    - `WEBAPP_TRUSTED_TOKEN_EXPIRY_WARNING_DAYS` (Default: `14`)

RBAC-Rollen:

- `readonly`: Lesezugriffe auf geschützte GET-Endpunkte:
  - `GET /api/tenants`
  - `GET /api/jobs`
  - `GET /api/deployments`
  - `GET /api/reports`
  - `GET /api/reports.csv`
  - `GET /api/provision/preflight`
- `technician`: umfasst `readonly` + Mutationen auf:
  - `POST /api/tenants`
  - `POST /api/jobs`
  - `POST /api/provision/tenant`
  - `POST /api/setup/plan`
- `admin`: umfasst aktuell `technician` + Zugriff auf `GET /api/audit/events`, `GET /api/audit/events.csv`, `GET /api/auth/health`, `GET /api/auth/alerts`, `POST /api/auth/rotation/plan`, `POST /api/auth/rotation/simulate`
  - `/api/audit/events` unterstützt serverseitige Filter: `limit`, `outcome`, `actionContains`, `operationContains`, `since`
  - `/api/audit/events.csv` exportiert dieselben gefilterten Events als CSV (nur admin)
  - `/api/auth/health` liefert nur sichere Aggregationen (keine Tokenwerte): `total`, `active`, `expired`, `expiringSoon`, `warningDays`
  - `/api/auth/alerts` liefert handlungsorientierte Token-Risiko-Hinweise (`critical|warning|info`) mit Empfehlungen, ohne Secrets
  - `/api/auth/rotation/plan` liefert eine sichere Rotation-Checkliste inkl. Overlap-/Cutover-Hinweisen und aktueller Auth-Health-Zusammenfassung
  - `/api/auth/rotation/simulate` akzeptiert nur Metadaten (`tokenId`, `userId`, `role`, `expiresAt`) und liefert Impact-Counts + Prioritätsaktionen; Payloads mit `token`/`password`/`secret` werden mit `400` abgewiesen

Bei fehlender Rolle liefern Endpoints `403` mit Rolle + benötigter Rolle im Response-Body.
Auth-Guards schreiben bei `401`/`403` zusätzlich ein `auth.guard.denied`-Audit-Event (inkl. Operation, required/effective role, auth mode).

Developer UX (absichtlich env-gated):

- **Dev role**-Switcher + clientseitige Header-Injektion sind nur aktiv bei
  - `NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH=true`
- Default ist `false` (production-safe).

## 9) Setup-Wizard / Architektur lesen

- PRD: `docs/PRD.md`
- Architektur (v1): `docs/ARCHITECTURE.md`
- Architektur (implementierungsnah): `docs/ARCHITECTURE-V2.md`
- BMAD Roadmap: `docs/BMAD-ROADMAP.md`
- Management-VM Wizard: `docs/MANAGEMENT-VM-SETUP-WIZARD.md`
- App-Katalog-Spec: `docs/APP-CATALOG-SPEC.md`
- Branding-Seed: `docs/BRANDING-SEED.md`
- BMAD-Artefakte (Brainstorming → Plan → Review): `docs/bmad/`

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
