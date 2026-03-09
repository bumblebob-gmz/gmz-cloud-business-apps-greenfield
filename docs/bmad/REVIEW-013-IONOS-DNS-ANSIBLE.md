# REVIEW-013: IONOS DNS ACME + Ansible Provisioning Integration

**Date:** 2026-03-09  
**Status:** Implemented  
**Sprint:** Infrastructure Slices A/B/C

---

## Summary

This review covers the implementation of three infrastructure slices:

- **Slice A:** Traefik static + dynamic config with IONOS DNS ACME challenge
- **Slice B:** Ansible `provision-tenant.yml` playbook (referenced by webapp)
- **Slice C:** `GET /api/tenants/:id/ansible-inventory` API endpoint + RBAC

---

## Changes Delivered

### Slice A — Traefik Infrastructure

| File | Purpose |
|------|---------|
| `infra/traefik/traefik.yml` | Static Traefik config for management VM. Entrypoints web/websecure, IONOS DNS ACME resolver, file provider watching `/etc/traefik/dynamic/` |
| `infra/traefik/dynamic/default.yml` | Starter dynamic config: HTTPS redirect middleware, dashboard router (IP-allowlist protected) |
| `infra/traefik/README.md` | Deploy guide, required env vars, per-tenant config instructions |
| `automation/ansible/roles/traefik/` | Full Ansible role: install Docker, create dirs, template configs, start Compose |
| `automation/ansible/deploy-traefik.yml` | Playbook targeting `management` host |

**IONOS DNS challenge:** Traefik uses the `ionos` LEGO provider. `IONOS_API_KEY` is injected via environment (never hardcoded). Format: `<public-prefix>.<secret>` from [developer.hosting.ionos.de](https://developer.hosting.ionos.de/).

### Slice B — Ansible provision-tenant Playbook

| File | Purpose |
|------|---------|
| `automation/ansible/provision-tenant.yml` | Full provisioning orchestration playbook |
| `automation/ansible/templates/traefik-tenant.yml.j2` | Jinja2 template for per-tenant Traefik dynamic config |

The playbook:
1. Validates required vars (`tenant_slug`, `vlan_id`, `vm_ip`, `ssh_public_key`, `apps`)
2. Runs `common-hardening` → `docker-runtime` → `authentik-bootstrap` on tenant VM
3. Runs `catalog-deployer` for app stack
4. Renders and deploys per-tenant Traefik config to management VM (no Traefik restart needed — file watcher handles it)

### Slice C — WebApp Integration

| File | Purpose |
|------|---------|
| `platform/webapp/app/api/tenants/[id]/ansible-inventory/route.ts` | New admin-only endpoint returning Ansible INI inventory |
| `platform/webapp/lib/rbac-policy.js` | Added `GET /api/tenants/:id/ansible-inventory` → `admin` |
| `platform/webapp/lib/rbac-policy.d.ts` | TypeScript declaration updated |
| `platform/webapp/tests/rbac-policy.test.mjs` | New test: ansible-inventory requires admin |

**Inventory format returned:**
```ini
[tenant]
kunde-a ansible_host=10.120.10.100 ansible_user=debian

[tenant:vars]
ansible_python_interpreter=/usr/bin/python3
tenant_slug=kunde-a
vlan_id=120
vm_ip=10.120.10.100
```

---

## Test Results

- `npm run test:rbac`: **33/33 pass** ✓
- `npm run build`: **✓ clean compile**

---

## Security Notes

- `IONOS_API_KEY` is never hardcoded; passed via env/Ansible vars/vault
- Traefik dashboard access restricted to RFC1918 ranges via `mgmt-ipallowlist`
- `/api/tenants/:id/ansible-inventory` is admin-only (RBAC enforced, audit-logged)
- `acme.json` permissions enforced at `0600` by Ansible role

---

## Open Items / Follow-up

- Add `management` host group to production Ansible inventory
- Set `IONOS_API_KEY` and `ACME_EMAIL` via Ansible Vault before first `deploy-traefik.yml` run
- Adjust `traefik_mgmt_hostname` and `traefik_dashboard_allowed_cidrs` defaults for actual network topology
- Consider wildcard cert strategy: `*.kunde-a.irongeeks.eu` vs per-service certs
