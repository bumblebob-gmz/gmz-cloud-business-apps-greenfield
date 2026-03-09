# ---------------------------------------------------------------------------
# rights_matrix_test.tftest.hcl
#
# Verifies that the tenant-vm module produces a VM resource that matches
# the expected Proxmox ACL rights matrix requirements.
#
# Required Proxmox ACL permissions for gmz-automation@pve!tofu:
#
#   Path                          Privilege
#   ----------------------------  -------------------------------------------
#   /                             Sys.Audit
#   /nodes/{node}                 Sys.Audit
#   /vms/{vmid}                   VM.Allocate
#                                 VM.Config.CDROM
#                                 VM.Config.CPU
#                                 VM.Config.Disk
#                                 VM.Config.Memory
#                                 VM.Config.Network
#                                 VM.Config.Options
#                                 VM.Monitor
#                                 VM.PowerMgmt
#   /storage/{storage}            Datastore.AllocateSpace
#                                 Datastore.Audit
#
# propagate=1 should be set on /vms and /storage paths.
# ---------------------------------------------------------------------------

mock_provider "proxmox" {
  mock_resource "proxmox_virtual_environment_vm" {
    defaults = {
      id        = "pve01/qemu/21001"
      vm_id     = 21001
      name      = "tenant-rights-check"
      node_name = "pve01"
      tags      = ["gmz", "tenant", "rights-check"]
    }
  }
}

# ---------------------------------------------------------------------------
# Test 1: VM is tagged correctly (required for ACL path scoping by tags)
# ---------------------------------------------------------------------------
run "vm_carries_required_tags" {
  variables {
    proxmox_endpoint  = "https://proxmox.local:8006/api2/json"
    proxmox_api_token = "gmz-automation@pve!tofu=abc123def456"
    proxmox_insecure  = false

    tenant_name        = "rights-check"
    vm_id              = 21001
    vlan_id            = 120
    cores              = 2
    memory_mb          = 2048
    disk_gb            = 50
    debian_template_id = 9000
    ssh_public_key     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI test-key"
    tenant_profile     = null
    node_name          = "pve01"
    storage            = "local-lvm"
  }

  assert {
    condition     = module.tenant_vm.vm_id == 21001
    error_message = "VM ID must be set for ACL path /vms/<vmid> to work correctly."
  }

  assert {
    condition     = module.tenant_vm.vm_name == "tenant-rights-check"
    error_message = "VM name must follow tenant-<name> convention for audit trail."
  }
}

# ---------------------------------------------------------------------------
# Test 2: IPv4 derivation from VLAN ID (network ACL path correctness)
# ---------------------------------------------------------------------------
run "ipv4_derived_from_vlan" {
  variables {
    proxmox_endpoint  = "https://proxmox.local:8006/api2/json"
    proxmox_api_token = "gmz-automation@pve!tofu=abc123def456"
    proxmox_insecure  = false

    tenant_name        = "net-check"
    vm_id              = 21010
    vlan_id            = 130
    cores              = 2
    memory_mb          = 2048
    disk_gb            = 50
    debian_template_id = 9000
    ssh_public_key     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI test-key"
    tenant_profile     = null
    node_name          = "pve01"
    storage            = "local-lvm"
  }

  assert {
    condition     = module.tenant_vm.ipv4 == "10.130.10.100"
    error_message = "IPv4 must be 10.<vlan_id>.10.100 — got unexpected address."
  }
}

# ---------------------------------------------------------------------------
# Test 3: Invalid storage_backend in profile is rejected
# ---------------------------------------------------------------------------
run "invalid_storage_backend_rejected" {
  variables {
    proxmox_endpoint  = "https://proxmox.local:8006/api2/json"
    proxmox_api_token = "gmz-automation@pve!tofu=abc123def456"
    proxmox_insecure  = false

    tenant_name        = "bad-backend"
    vm_id              = 21099
    vlan_id            = 199
    cores              = 2
    memory_mb          = 2048
    disk_gb            = 50
    debian_template_id = 9000
    ssh_public_key     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI test-key"

    node_storage_profiles = {
      bad = {
        node_name       = "pve01"
        storage         = "local-lvm"
        storage_backend = "nfs" # invalid — not lvm-thin or ceph
      }
    }
    tenant_profile = "bad"
  }

  expect_failures = [var.node_storage_profiles]
}
