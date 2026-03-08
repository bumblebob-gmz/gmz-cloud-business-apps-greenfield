output "vm_name" {
  value = proxmox_virtual_environment_vm.tenant.name
}

output "vm_id" {
  value = proxmox_virtual_environment_vm.tenant.vm_id
}

output "ipv4" {
  value = "10.${var.vlan_id}.10.100"
}
