#!/usr/bin/env bash
# check_prod_tfvars_secure.sh
# CI guard: ensures the Proxmox TLS default stays secure.
#
# Checks performed:
#   1. variables.tf default for proxmox_insecure must be false.
#   2. No prod tfvars template may set proxmox_insecure=true.
#
# The lab environment is exempt (it uses the separate proxmox_tls_insecure
# variable and is never included in this check).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROD_DIR="$ROOT_DIR/infra/opentofu/environments/prod"
VARS_TF="$PROD_DIR/variables.tf"

fail=0

# ── Check 1: variables.tf must declare proxmox_insecure with default = false ──
if [[ ! -f "$VARS_TF" ]]; then
  echo "ERROR: variables.tf not found at $VARS_TF" >&2
  exit 1
fi

# Extract the proxmox_insecure block and verify its default
if ! grep -A 5 'variable "proxmox_insecure"' "$VARS_TF" | grep -q 'default[[:space:]]*=[[:space:]]*false'; then
  echo "❌ Security guard failed: proxmox_insecure variable in $VARS_TF does not default to false"
  fail=1
else
  echo "✅ variables.tf: proxmox_insecure default=false confirmed."
fi

# ── Check 2: no prod tfvars template may set proxmox_insecure=true ──
if [[ ! -d "$PROD_DIR" ]]; then
  echo "ERROR: prod OpenTofu environment directory not found: $PROD_DIR" >&2
  exit 1
fi

mapfile -t candidates < <(find "$PROD_DIR" -maxdepth 1 -type f \( -name "*.tfvars" -o -name "*.tfvars.example" -o -name "*tfvars*.example" -o -name "*prod*tfvars*" \) | sort)

if [[ ${#candidates[@]} -eq 0 ]]; then
  echo "No prod tfvars templates found in $PROD_DIR (nothing to validate for check 2)."
else
  for file in "${candidates[@]}"; do
    if grep -Eq '^[[:space:]]*proxmox_insecure[[:space:]]*=[[:space:]]*true([[:space:]]*#.*)?$' "$file"; then
      echo "❌ Security guard failed: $file sets proxmox_insecure=true"
      fail=1
    fi
  done
  if [[ $fail -eq 0 ]]; then
    echo "✅ Prod tfvars security guard passed (${#candidates[@]} file(s) checked)."
  fi
fi

if [[ $fail -ne 0 ]]; then
  echo ""
  echo "Refusing insecure prod configuration."
  echo "  • proxmox_insecure must default to false in variables.tf"
  echo "  • proxmox_insecure must not be set to true in any prod tfvars template"
  echo "  • For lab/self-signed-cert use, use the lab environment with proxmox_tls_insecure=true"
  exit 1
fi
