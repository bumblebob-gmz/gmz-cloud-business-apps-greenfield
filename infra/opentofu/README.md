# OpenTofu – Proxmox Provisioning

## Zweck
Provisionierung von Tenant-VMs auf Proxmox 9 inkl. VLAN-Tagging, Cloud-Init und statischer IP.

## Struktur

```
infra/opentofu/
├── environments/
│   └── prod/
│       ├── main.tf                    # Provider + module call
│       ├── variables.tf               # All input variables (incl. sensitive markers)
│       └── terraform.tfvars.example   # Example values (no real secrets)
├── modules/
│   └── tenant-vm/                     # Reusable VM module
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── tests/
    ├── auth_token_test.tftest.hcl     # API-token auth integration tests
    └── rights_matrix_test.tftest.hcl  # Rights matrix / ACL validation tests
```

## Authentication

**Only API token auth is supported.** Username/password auth is explicitly removed
from the provider configuration and must not be added.

### Creating the API Token in Proxmox

```bash
# 1. Create a role with the minimum required privileges
pveum role add GMZ-Tofu \
  -privs "VM.Allocate,VM.Config.CDROM,VM.Config.CPU,VM.Config.Disk,\
VM.Config.Memory,VM.Config.Network,VM.Config.Options,VM.Monitor,\
VM.PowerMgmt,Datastore.AllocateSpace,Datastore.Audit,Sys.Audit"

# 2. Create the user (PVE realm)
pveum user add gmz-automation@pve --comment "OpenTofu service account"

# 3. Assign the role
pveum aclmod /vms -user gmz-automation@pve -role GMZ-Tofu -propagate 1
pveum aclmod /storage -user gmz-automation@pve -role GMZ-Tofu -propagate 1
pveum aclmod / -user gmz-automation@pve -role GMZ-Tofu

# 4. Create the API token (disable privilege separation for simplicity)
pveum user token add gmz-automation@pve tofu --privsep 0
```

The output gives you the token secret — save it immediately, it's shown only once.

### Required Proxmox ACL Rights Matrix

| Path                    | Privilege                  |
|-------------------------|----------------------------|
| `/`                     | `Sys.Audit`                |
| `/nodes/{node}`         | `Sys.Audit`                |
| `/vms/{vmid}`           | `VM.Allocate`              |
|                         | `VM.Config.CDROM`          |
|                         | `VM.Config.CPU`            |
|                         | `VM.Config.Disk`           |
|                         | `VM.Config.Memory`         |
|                         | `VM.Config.Network`        |
|                         | `VM.Config.Options`        |
|                         | `VM.Monitor`               |
|                         | `VM.PowerMgmt`             |
| `/storage/{storage}`    | `Datastore.AllocateSpace`  |
|                         | `Datastore.Audit`          |

### Providing the Token to OpenTofu

**Never** put real credentials in `.tfvars` files committed to git.
Use environment variables instead:

```bash
export TF_VAR_proxmox_endpoint="https://proxmox.local:8006/api2/json"
export TF_VAR_proxmox_api_token="gmz-automation@pve!tofu=<secret>"
```

Or use a secret manager integration (Vault, SOPS, etc.).

## Sensitive Variables

The following variables are marked `sensitive = true` to prevent leakage
in plan/apply output and state diffs:

| Variable             | Reason                                  |
|----------------------|-----------------------------------------|
| `proxmox_api_token`  | Contains secret portion of API token    |

## Wichtige Regeln

- Jede Tenant-VM bekommt statische IP: `10.<vlan_id>.10.100`
- Debian 13 Cloud-Init Template als Quelle
- Storage kann je Tenant auf `lvmthin` oder `ceph` gemappt werden
- `proxmox_insecure=false` in Production — niemals ohne expliziten Grund ändern

## Running Tests

### Static analysis tests (no Proxmox needed)

```bash
cd platform/webapp
npm run test:rbac   # runs all tests including opentofu-auth.test.mjs
```

The `tests/opentofu-auth.test.mjs` file reads the `.tf` files and verifies:
- No username/password auth variables exist
- `proxmox_api_token` is marked `sensitive = true`
- Provider block uses `api_token` only
- Rights matrix is documented in `main.tf`
- Required `.tftest.hcl` files are present

### OpenTofu native tests (requires `tofu` CLI)

```bash
cd infra/opentofu/environments/prod
tofu init
tofu test
```

The `.tftest.hcl` tests use `mock_provider` so no real Proxmox endpoint is needed.
They cover: valid/invalid token format, URL validation, profile resolution,
invalid storage backend rejection, and IP derivation from VLAN ID.
