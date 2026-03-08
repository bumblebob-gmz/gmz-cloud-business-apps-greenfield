# Ansible Automation

## Playbooks
- `bootstrap-tenant.yml` – Baseline Hardening + Docker Runtime
- `deploy-apps.yml` – App Deployment aus Katalogvariablen
- `nightly-updates.yml` – Update-Fenster, Healthchecks, optional Rollback trigger

## Rollen
- `common-hardening`
- `docker-runtime`
- `authentik-bootstrap`
- `catalog-deployer`

## Hinweis
Diese Struktur ist der initiale Skeleton. Konkrete Tasks je App folgen in den nächsten Schritten.
