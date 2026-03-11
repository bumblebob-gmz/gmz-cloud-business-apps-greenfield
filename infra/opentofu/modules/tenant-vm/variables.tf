variable "tenant_name" {
  type = string
}

variable "node_name" {
  type = string
}

variable "vm_id" {
  type = number
}

variable "vlan_id" {
  type = number
}

variable "cores" {
  type = number
}

variable "memory_mb" {
  type = number
}

variable "disk_gb" {
  type = number
}

variable "storage" {
  type = string
}

variable "debian_template_id" {
  type = number
}

variable "bridge" {
  type    = string
  default = "vmbr0"
}

variable "ci_user" {
  type    = string
  default = "debian"
}

variable "ssh_public_key" {
  type = string
}

variable "ip_host_suffix" {
  type        = number
  default     = 100
  description = "Host part of the tenant VM IP address (last octet). Default: 100 → 10.<vlan>.10.100. Increase when deploying multiple VMs per VLAN."

  validation {
    condition     = var.ip_host_suffix >= 2 && var.ip_host_suffix <= 254
    error_message = "ip_host_suffix must be between 2 and 254."
  }
}
