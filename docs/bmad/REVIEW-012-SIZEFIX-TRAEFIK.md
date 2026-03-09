# REVIEW-012: SIZE_MAP Fix + Traefik Config Renderer

**Date:** 2026-03-09  
**Sprint:** Post-Sprint-11  
**Status:** ✅ Implemented

---

## Summary

Two incremental improvements to `platform/webapp`:

1. **SIZE_MAP correction** — the VM size map in `lib/provisioning.ts` had wrong values. Updated to match the spec.
2. **Traefik config renderer** — new `lib/traefik-config.ts` module + admin API endpoint to generate Traefik dynamic config YAML per tenant.

---

## 1. SIZE_MAP Fix

**File:** `platform/webapp/lib/provisioning.ts`

| Size | Old (wrong) | New (spec) |
|------|-------------|------------|
| S    | 2 vCPU / 4 GB / 60 GB  | 2 vCPU / 4 GB / **120 GB** |
| M    | 4 vCPU / 8 GB / 120 GB | 4 vCPU / **6 GB** / **200 GB** |
| L    | 8 vCPU / 16 GB / 240 GB | **6 vCPU** / **12 GB** / **400 GB** |
| XL   | 12 vCPU / 32 GB / 480 GB | **8 vCPU** / **16 GB** / **800 GB** |

Tests in `tests/provisioning-sizemap.test.mjs` verify all four sizes.

---

## 2. Traefik Config Renderer

**New file:** `platform/webapp/lib/traefik-config.ts`

Exports:
- `renderTraefikConfig(options)` → generates Traefik dynamic config YAML string
- `writeTraefikConfig(filePath, yaml)` → writes YAML to disk (creates parent dirs)
- `APP_PORT_MAP` → default port per catalog app (all 13 apps covered)

Config shape per app:
- HTTP router: `Host(<app>.<tenantSlug>.irongeeks.eu)`, entrypoint `websecure`
- TLS: `certResolver: letsencrypt`
- Service: `loadBalancer.servers[0].url = http://10.<vlanId>.10.100:<port>`

Optional `customDomain` overrides the default subdomain for all apps.

---

## 3. API Endpoint

`GET /api/tenants/:id/traefik-config` (admin-only)

- Returns rendered YAML with `Content-Type: text/yaml`
- `404` if tenant not found
- `400` if tenant has no `vlan` set
- Falls back to `['authentik']` if tenant has no `apps` array

**File:** `platform/webapp/app/api/tenants/[id]/traefik-config/route.ts`

---

## 4. RBAC

- Policy entry: `'GET /api/tenants/:id/traefik-config': 'admin'`
- Added to `lib/rbac-policy.js` + `lib/rbac-policy.d.ts`
- RBAC test (`tests/rbac-policy.test.mjs`) extended with two new cases:
  - policy lookup assertion
  - role-enforcement: readonly/technician denied, admin allowed

---

## 5. Tests

- `tests/provisioning-sizemap.test.mjs` — 4 tests, one per SIZE_MAP entry
- `tests/traefik-config.test.mjs` — 8 tests covering port map, YAML structure, host rules, TLS, backend IP, custom domain, websecure entrypoint
- All 32 tests pass (`npm run test:rbac`)

---

## 6. Build

`npm run build` passes without errors or type warnings.

---

## Risk / Notes

- `SIZE_MAP` change affects provisioning plans. Existing tenants re-provisioned after this change will get the corrected VM sizes. No migration needed for the data store (size label is stored, not resolved values).
- The Traefik config endpoint is read-only (GET) and admin-only — no write risk.
- `writeTraefikConfig` is exported for future automation/push workflows; not called from the API route (that returns YAML inline).
