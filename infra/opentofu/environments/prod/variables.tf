variable "proxmox_endpoint" { type = string }
variable "proxmox_api_token" {
  type      = string
  sensitive = true
}
variable "proxmox_insecure" {
  type    = bool
  default = false
}

variable "tenant_name" { type = string }
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
