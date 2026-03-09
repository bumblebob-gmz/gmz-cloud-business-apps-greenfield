# ---------------------------------------------------------------------------
# Proxmox Provider Authentication
# Only API-token auth is supported. Username/password auth is NOT used and
# must not be added to provider blocks.
# ---------------------------------------------------------------------------

variable "proxmox_endpoint" {
  type        = string
  description = "Base URL of the Proxmox VE API, e.g. https://proxmox.local:8006/api2/json"

  validation {
    condition     = can(regex("^https?://", var.proxmox_endpoint))
    error_message = "proxmox_endpoint must start with https:// (or http:// for lab-only)."
  }
}

variable "proxmox_api_token" {
  type        = string
  sensitive   = true
  description = "Proxmox API token in the form <user>@<realm>!<token-id>=<secret>. Required. Never pass via plain tfvars."

  validation {
    condition     = can(regex("^[^@]+@[^!]+![^=]+=.+$", var.proxmox_api_token))
    error_message = "proxmox_api_token must be in the format user@realm!token-id=secret."
  }
}

variable "proxmox_insecure" {
  type        = bool
  default     = false
  description = "Skip TLS certificate verification. Must be false in production."
}

# ---------------------------------------------------------------------------
# Tenant / VM configuration
# ---------------------------------------------------------------------------

variable "tenant_name" {
  type        = string
  description = "Short identifier for the tenant, e.g. 'kunde-a'. Used in VM name and tags."
}

variable "tenant_profile" {
  type        = string
  default     = null
  nullable    = true
  description = "Optional profile key from node_storage_profiles (recommended for wizard-driven deployments)."

  validation {
    condition     = var.tenant_profile == null || contains(keys(var.node_storage_profiles), var.tenant_profile)
    error_message = "tenant_profile must reference an existing key in node_storage_profiles."
  }
}

variable "node_storage_profiles" {
  type = map(object({
    node_name       = string
    storage         = string
    storage_backend = string # allowed: lvm-thin | ceph
  }))
  default     = {}
  description = "Profile matrix for tenant placement/storage choices used by the wizard."

  validation {
    condition = alltrue([
      for profile in values(var.node_storage_profiles) : contains(["lvm-thin", "ceph"], lower(profile.storage_backend))
    ])
    error_message = "Each node_storage_profiles[*].storage_backend must be either 'lvm-thin' or 'ceph'."
  }
}

variable "node_name" {
  type        = string
  default     = null
  nullable    = true
  description = "Proxmox node name. Required when tenant_profile is not set."
}

variable "vm_id" {
  type        = number
  description = "Unique VM ID on Proxmox. Must not conflict with existing VMs."
}

variable "vlan_id" {
  type        = number
  description = "VLAN tag. Also determines the static IP subnet: 10.<vlan_id>.10.0/24."
}

variable "cores" {
  type        = number
  description = "Number of vCPU cores."
}

variable "memory_mb" {
  type        = number
  description = "RAM in MiB."
}

variable "disk_gb" {
  type        = number
  description = "Root disk size in GiB."
}

variable "storage" {
  type        = string
  default     = null
  nullable    = true
  description = "Proxmox storage pool name. Required when tenant_profile is not set."

  validation {
    condition = (
      var.tenant_profile != null ||
      (var.node_name != null && var.storage != null)
    )
    error_message = "Either set tenant_profile (preferred) or provide both node_name and storage explicitly."
  }
}

variable "debian_template_id" {
  type        = number
  description = "VM ID of the Debian 13 Cloud-Init template to clone from."
}

variable "bridge" {
  type        = string
  default     = "vmbr0"
  description = "Linux bridge for the VM network interface."
}

variable "ci_user" {
  type        = string
  default     = "debian"
  description = "Cloud-Init username created on first boot."
}

variable "ssh_public_key" {
  type        = string
  description = "SSH public key injected via Cloud-Init. Example: 'ssh-ed25519 AAAA...'."
}
