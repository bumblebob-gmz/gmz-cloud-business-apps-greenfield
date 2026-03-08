# OpenTofu – Proxmox Provisioning

## Zweck
Provisionierung von Tenant-VMs auf Proxmox 9 inkl. VLAN-Tagging, Cloud-Init und statischer IP.

## Struktur
- `modules/tenant-vm` – Wiederverwendbares VM-Modul
- `environments/prod` – Produktive Belegung/Variablen

## Wichtige Regeln
- Jede Tenant-VM bekommt statische IP: `10.<vlan_id>.10.100`
- Debian 13 Cloud-Init Template als Quelle
- Storage kann je Tenant auf `lvmthin` oder `ceph` gemappt werden
