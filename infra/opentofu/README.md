# OpenTofu – Proxmox Provisioning

## Zweck
Provisionierung von Tenant-VMs auf Proxmox 9 inkl. VLAN-Tagging, Cloud-Init und statischer IP.

## Struktur
- `modules/tenant-vm` – Wiederverwendbares VM-Modul
- `environments/prod` – Produktive Belegung/Variablen

## Auth/Security Baseline (Sprint N+1)
- Provider-Auth läuft **token-basiert** über `proxmox_api_token`.
- `proxmox_api_token` ist als `sensitive` markiert und sollte bevorzugt über ENV/Secret-Store kommen.
- TLS-Validierung ist standardmäßig aktiv: `proxmox_insecure=false`.
- Lab-only Ausnahme: `proxmox_insecure=true` nur explizit im lokalen Testkontext.

Beispiel (ENV statt Klartext in tfvars):

```bash
export TF_VAR_proxmox_endpoint="https://proxmox.local:8006/api2/json"
export TF_VAR_proxmox_api_token="gmz-automation@pve!tofu=..."
```

## Wichtige Regeln
- Jede Tenant-VM bekommt statische IP: `10.<vlan_id>.10.100`
- Debian 13 Cloud-Init Template als Quelle
- Storage kann je Tenant auf `lvmthin` oder `ceph` gemappt werden
