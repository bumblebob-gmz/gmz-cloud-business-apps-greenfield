variable "proxmox_endpoint" { type = string }
variable "proxmox_api_token" {
  type      = string
  sensitive = true
}

# ── LAB-ONLY override flag ───────────────────────────────────────────────────
# Named distinctly from the prod variable (proxmox_insecure) to make the
# lab-only nature explicit.  Set to true only for Proxmox nodes that use
# self-signed / internal-CA certificates in a lab or dev environment.
# NEVER replicate this variable or its value (true) in prod configs.
variable "proxmox_tls_insecure" {
  type        = bool
  default     = false
  description = "LAB ONLY: skip TLS certificate verification. Only set true for lab/self-signed cert environments."
}

variable "tenant_name" { type = string }
variable "tenant_profile" {
  type        = string
  default     = null
  nullable    = true
  description = "Optional profile key from node_storage_profiles."

  validation {
    condition     = var.tenant_profile == null || contains(keys(var.node_storage_profiles), var.tenant_profile)
    error_message = "tenant_profile must reference an existing key in node_storage_profiles."
  }
}

variable "node_storage_profiles" {
  type = map(object({
    node_name       = string
    storage         = string
    storage_backend = string
  }))
  default     = {}
  description = "Profile matrix for tenant placement/storage choices."

  validation {
    condition = alltrue([
      for profile in values(var.node_storage_profiles) : contains(["lvm-thin", "ceph"], lower(profile.storage_backend))
    ])
    error_message = "Each node_storage_profiles[*].storage_backend must be either 'lvm-thin' or 'ceph'."
  }
}

variable "node_name" {
  type     = string
  default  = null
  nullable = true
}
variable "vm_id" { type = number }
variable "vlan_id" { type = number }
variable "cores" { type = number }
variable "memory_mb" { type = number }
variable "disk_gb" { type = number }
variable "storage" {
  type     = string
  default  = null
  nullable = true

  validation {
    condition = (
      var.tenant_profile != null ||
      (var.node_name != null && var.storage != null)
    )
    error_message = "Either set tenant_profile (preferred) or provide both node_name and storage explicitly."
  }
}
variable "debian_template_id" { type = number }
variable "bridge" {
  type    = string
  default = "vmbr0"
}
variable "ci_user" {
  type    = string
  default = "debian"
}
variable "ssh_public_key" { type = string }
