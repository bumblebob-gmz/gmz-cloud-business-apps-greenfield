terraform {
  required_version = ">= 1.6.0"

  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = ">= 0.70.0"
    }
  }
}

provider "proxmox" {
  endpoint  = var.proxmox_endpoint
  api_token = var.proxmox_api_token
  insecure  = var.proxmox_insecure
}

locals {
  selected_profile = var.tenant_profile != null ? var.node_storage_profiles[var.tenant_profile] : null
  effective_node   = local.selected_profile != null ? local.selected_profile.node_name : var.node_name
  effective_storage = local.selected_profile != null ? local.selected_profile.storage : var.storage
}

module "tenant_vm" {
  source = "../../modules/tenant-vm"

  tenant_name        = var.tenant_name
  node_name          = local.effective_node
  vm_id              = var.vm_id
  vlan_id            = var.vlan_id
  cores              = var.cores
  memory_mb          = var.memory_mb
  disk_gb            = var.disk_gb
  storage            = local.effective_storage
  debian_template_id = var.debian_template_id
  bridge             = var.bridge
  ci_user            = var.ci_user
  ssh_public_key     = var.ssh_public_key
}
