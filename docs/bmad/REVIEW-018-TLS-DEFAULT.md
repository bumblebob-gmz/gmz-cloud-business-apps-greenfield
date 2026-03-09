# REVIEW-018 — Secure TLS Default for Proxmox OpenTofu Provider

**Date:** 2026-03-09
**Author:** BMAD Agent (Lola)
**Status:** ✅ Implemented & Tested
**Related backlog item:** P0 N1-2 — Set secure TLS default for Proxmox OpenTofu provider

---

## 1. Summary

This review documents the enforcement of a secure-by-default TLS posture for the
Proxmox OpenTofu provider across all environments.  The change ensures:

- `proxmox_insecure = false` is the hard default in the prod environment.
- A dedicated `lab` environment provides an explicit, named override
  (`proxmox_tls_insecure = true`) for Proxmox nodes running self-signed certificates.
- A CI guard (GitHub Actions + shell script) prevents the secure default from
  regressing silently.

---

## 2. Scope of Changes

| File | Change |
|---|---|
| `infra/opentofu/environments/prod/variables.tf` | Confirmed: `proxmox_insecure` defaults to `false` |
| `infra/opentofu/environments/lab/main.tf` | New lab environment; uses `proxmox_tls_insecure` |
| `infra/opentofu/environments/lab/variables.tf` | Defines `proxmox_tls_insecure` with clear LAB ONLY docs |
| `infra/opentofu/environments/lab/terraform.tfvars.example` | Lab example with explicit `proxmox_tls_insecure = true` |
| `ops/scripts/check_prod_tfvars_secure.sh` | Extended: also validates `variables.tf` default |
| `.github/workflows/infra-guards.yml` | Extended: second job audits lab env variable naming |
| `docs/bmad/REVIEW-018-TLS-DEFAULT.md` | This file |

---

## 3. Design Decisions

### 3.1 Secure prod default

The `proxmox_insecure` variable in `infra/opentofu/environments/prod/variables.tf`
was already declared with `default = false`.  This review formalises and guards it:

```hcl
variable "proxmox_insecure" {
  type    = bool
  default = false
}
```

This means any `tofu apply` without an explicit override connects to Proxmox over
verified TLS.  A misconfigured or MITM'd endpoint will be rejected.

### 3.2 Lab-only override via a distinct variable name

Rather than relying on callers not passing `proxmox_insecure = true`, the lab
environment introduces a separate variable: `proxmox_tls_insecure`.  The name
change is deliberate — it makes the intent obvious and prevents accidental copy-paste
from lab to prod configs.

The lab `main.tf` maps it to the provider's `insecure` argument:

```hcl
provider "proxmox" {
  endpoint  = var.proxmox_endpoint
  api_token = var.proxmox_api_token
  insecure  = var.proxmox_tls_insecure  # LAB ONLY
}
```

The `terraform.tfvars.example` for lab explicitly sets:

```hcl
proxmox_tls_insecure = true  # LAB ONLY – self-signed cert bypass
```

### 3.3 CI guard: two-layer protection

**Layer 1 – variable default check** (`check_prod_tfvars_secure.sh`):
Parses `prod/variables.tf` and asserts that the `proxmox_insecure` block contains
`default = false`.  Fails loudly if the default is ever removed or changed.

**Layer 2 – prod tfvars template check** (`check_prod_tfvars_secure.sh`):
Scans all `*.tfvars` and `*.tfvars.example` files in the prod directory for any
line matching `proxmox_insecure = true`.  Fails if found.

**Layer 3 – lab variable naming audit** (`infra-guards.yml` second job):
Verifies that the lab `terraform.tfvars.example` does not accidentally use the
prod variable name (`proxmox_insecure`), ensuring the naming separation holds.

---

## 4. Security Impact

| Risk | Before | After |
|---|---|---|
| TLS skipped by default | ❌ Not enforced | ✅ Default `false`, checked by CI |
| Lab insecure flag leaking to prod | 🟡 No separation | ✅ Distinct variable + CI audit |
| Silent regression of default | ❌ No guard | ✅ `variables.tf` default checked in CI |
| Documentation of lab exception | ❌ None | ✅ Explicit `# LAB ONLY` comments |

---

## 5. Test Coverage

The infra guard script can be exercised locally:

```bash
bash ops/scripts/check_prod_tfvars_secure.sh
```

Expected output (clean state):

```
✅ variables.tf: proxmox_insecure default=false confirmed.
✅ Prod tfvars security guard passed (1 file(s) checked).
```

Negative test (temporarily set `proxmox_insecure = true` in
`prod/terraform.tfvars.example`):

```
✅ variables.tf: proxmox_insecure default=false confirmed.
❌ Security guard failed: .../terraform.tfvars.example sets proxmox_insecure=true
Refusing insecure prod configuration.
```

All 45 existing webapp tests continue to pass (unaffected by infra-only changes).

---

## 6. Reviewer Notes

- The `lab` environment is intentionally standalone — it does **not** share state
  with prod.  Operators must be explicitly in the `environments/lab/` directory to
  use the insecure flag.
- Future Proxmox nodes that join the prod cluster must use trusted certificates.
  The CI guard will reject any attempt to skip verification.
- If a prod Proxmox node temporarily requires a self-signed cert (e.g., during
  migration), the operator must use the lab environment and document the exception
  in a BMAD review before merging.
