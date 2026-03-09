# REVIEW-017-OPENTOFU-AUTH

**Sprint:** N1-1  
**Date:** 2026-03-09  
**Author:** Lola (BMAD Agent)  
**Status:** ✅ Complete

---

## Goal

Refactor the OpenTofu Proxmox provisioning configuration to enforce API token
authentication as the only supported auth method. Remove any user/password path,
ensure all sensitive variables are marked `sensitive = true`, document the required
Proxmox ACL rights matrix, add integration tests, and update documentation.

---

## Changes Made

### `infra/opentofu/environments/prod/variables.tf`

- Added `sensitive = true` to `proxmox_api_token` (was already present — confirmed and preserved).
- Added `validation` block on `proxmox_api_token` enforcing the
  `user@realm!token-id=secret` format.
- Added `validation` block on `proxmox_endpoint` enforcing `https?://` scheme.
- Added `description` fields to all variables (previously mostly undocumented).
- Added explicit header comment: _"Only API-token auth is supported. Username/password auth must not be added."_
- No `proxmox_username` / `proxmox_password` variables exist; confirmed and enforced via tests.

### `infra/opentofu/environments/prod/main.tf`

- Added inline ACL rights matrix documentation in the provider block comment.
- Added explicit comment: _"username and password are intentionally NOT configured."_
- Provider block uses only `api_token` — no `username`, `password`, or `ticket` fields.

### `infra/opentofu/tests/auth_token_test.tftest.hcl` _(new)_

OpenTofu native integration tests using `mock_provider` (no real Proxmox required):

| Test | Verifies |
|------|----------|
| `valid_api_token_accepted` | Provider initialises with correctly formatted token |
| `invalid_api_token_rejected` | Malformed token fails variable validation |
| `invalid_endpoint_scheme_rejected` | `ftp://` endpoint fails validation |
| `missing_explicit_placement_rejected` | Missing `node_name`+`storage` without profile fails |
| `profile_resolves_node_and_storage` | Profile-based placement resolves correctly |

### `infra/opentofu/tests/rights_matrix_test.tftest.hcl` _(new)_

Rights matrix integration tests:

| Test | Verifies |
|------|----------|
| `vm_carries_required_tags` | VM ID and name follow naming convention for ACL path correctness |
| `ipv4_derived_from_vlan` | IP `10.<vlan_id>.10.100` derived correctly |
| `invalid_storage_backend_rejected` | Non-`lvm-thin`/`ceph` backend rejected |

### `platform/webapp/tests/opentofu-auth.test.mjs` _(new)_

Static-analysis tests that run in CI without `tofu` installed. They read the `.tf`
files directly and assert:

- `proxmox_api_token` has `sensitive = true`
- `proxmox_username` / `proxmox_password` variables do NOT exist
- Provider block uses `api_token`, not `username`/`password`
- `main.tf` documents the rights matrix (`VM.Allocate`, `Datastore.AllocateSpace`)
- `main.tf` explicitly notes username/password are not configured
- `terraform.tfvars.example` uses a `CHANGE_ME` placeholder, not a real secret
- `infra/opentofu/tests/` contains at least 2 `.tftest.hcl` files (auth + rights)

### `platform/webapp/package.json`

- Added `tests/opentofu-auth.test.mjs` to the `test:rbac` script.

### `infra/opentofu/README.md`

- Full rewrite with directory tree, auth guide, `pveum` commands for token creation,
  ACL rights matrix table, sensitive variables table, and test instructions.

---

## Architecture Decisions

### Why API Token Only?

Proxmox offers two provider auth methods: API token and username+password (session
ticket). Username/password auth requires storing a long-lived password, is harder
to rotate, cannot be scoped to a role without privilege separation, and leaks more
broadly in logs. API tokens support:
- Per-token privilege separation
- Expiry dates
- Instant revocation without password change
- Narrow ACL scope

The `bpg/proxmox` provider's `api_token` field accepts `user@realm!token-id=secret`
directly. No workarounds are needed.

### Sensitive Variable Strategy

Only `proxmox_api_token` contains a secret value and is marked `sensitive = true`.
Other auth-adjacent vars (`proxmox_endpoint`, `proxmox_insecure`) are configuration,
not secrets. `ssh_public_key` is a public key by definition and is intentionally
not marked sensitive. This avoids over-labelling which would suppress useful plan
output without security benefit.

### Test Strategy

Two layers:
1. **Static analysis (Node.js)** — runs in CI on every push, zero external deps,
   verifies structural invariants of the `.tf` files.
2. **OpenTofu native tests (`.tftest.hcl`)** — run locally or in CD with `tofu test`,
   use `mock_provider` so no real Proxmox is needed. Cover positive and negative
   variable validation paths, profile resolution, and rights matrix requirements.

---

## Rights Matrix Summary

```
Path                    Privilege
/                       Sys.Audit
/nodes/{node}           Sys.Audit
/vms/{vmid}             VM.Allocate, VM.Config.CDROM, VM.Config.CPU,
                        VM.Config.Disk, VM.Config.Memory, VM.Config.Network,
                        VM.Config.Options, VM.Monitor, VM.PowerMgmt
/storage/{storage}      Datastore.AllocateSpace, Datastore.Audit
```

Token name: `gmz-automation@pve!tofu`  
Privilege separation: disabled (token inherits user role directly)

---

## Test Results

```
# tests 80
# suites 5
# pass  80
# fail  0
# duration_ms ~1858
```

All 80 tests passing (45 pre-existing + 13 new opentofu-auth + 22 other suites).
The 13 new static-analysis tests cover all auth hardening invariants.

---

## Security Posture After This Change

| Item | Before | After |
|------|--------|-------|
| Auth method | API token (undocumented) | API token (enforced, validated, documented) |
| `proxmox_api_token` sensitive | ✅ Yes | ✅ Yes |
| Token format validation | ❌ None | ✅ Regex validation |
| Endpoint scheme validation | ❌ None | ✅ `https?://` enforced |
| Rights matrix documented | ❌ No | ✅ In `main.tf` + `README.md` |
| Integration tests for auth | ❌ None | ✅ 5 × `.tftest.hcl` + 13 static |
| `username`/`password` path | ❌ Undocumented absence | ✅ Explicitly prohibited |

---

## Next Steps

- Add `tofu test` to the CI/CD pipeline (GitHub Actions step after `tofu validate`).
- Consider SOPS or Vault integration for `TF_VAR_proxmox_api_token` in prod deploys.
- Set token expiry in Proxmox UI and add a rotation runbook to `docs/infra/`.
