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
variable "node_name" { type = string }
variable "vm_id" { type = number }
variable "vlan_id" { type = number }
variable "cores" { type = number }
variable "memory_mb" { type = number }
variable "disk_gb" { type = number }
variable "storage" { type = string }
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
