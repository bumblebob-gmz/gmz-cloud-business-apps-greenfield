locals {
  ip_cidr = "10.${var.vlan_id}.10.100/24"
  gw_ip   = "10.${var.vlan_id}.10.1"
}

# Hinweis: Provider-Resource kann je nach gewähltem Proxmox Provider leicht abweichen.
# Dieses Modul bildet den gewünschten Zustand als Startpunkt ab.
resource "proxmox_virtual_environment_vm" "tenant" {
  vm_id     = var.vm_id
  name      = "tenant-${var.tenant_name}"
  node_name = var.node_name

  clone {
    vm_id = var.debian_template_id
  }

  cpu {
    cores = var.cores
    type  = "x86-64-v2-AES"
  }

  memory {
    dedicated = var.memory_mb
  }

  disk {
    datastore_id = var.storage
    interface    = "virtio0"
    size         = var.disk_gb
    iothread     = true
    discard      = "on"
  }

  initialization {
    user_account {
      username = var.ci_user
      keys     = [var.ssh_public_key]
    }

    ip_config {
      ipv4 {
        address = local.ip_cidr
        gateway = local.gw_ip
      }
    }
  }

  network_device {
    bridge = var.bridge
    vlan_id = var.vlan_id
    model  = "virtio"
  }

  tags = ["gmz", "tenant", var.tenant_name]
}
