#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROD_DIR="$ROOT_DIR/infra/opentofu/environments/prod"

if [[ ! -d "$PROD_DIR" ]]; then
  echo "ERROR: prod OpenTofu environment directory not found: $PROD_DIR" >&2
  exit 1
fi

mapfile -t candidates < <(find "$PROD_DIR" -maxdepth 1 -type f \( -name "*.tfvars" -o -name "*.tfvars.example" -o -name "*tfvars*.example" -o -name "*prod*tfvars*" \) | sort)

if [[ ${#candidates[@]} -eq 0 ]]; then
  echo "No prod tfvars templates found in $PROD_DIR (nothing to validate)."
  exit 0
fi

fail=0
for file in "${candidates[@]}"; do
  if grep -Eq '^[[:space:]]*proxmox_insecure[[:space:]]*=[[:space:]]*true([[:space:]]*#.*)?$' "$file"; then
    echo "❌ Security guard failed: $file sets proxmox_insecure=true"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "Refusing insecure prod tfvars template(s). Set proxmox_insecure=false."
  exit 1
fi

echo "✅ Prod tfvars security guard passed (${#candidates[@]} file(s) checked)."
