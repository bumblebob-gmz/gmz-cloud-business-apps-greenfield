# 02 – Voraussetzungen

> **[← 01 Überblick](01-overview.md)** | **[Wiki-Index](README.md)** | Weiter: [03 – Debian 13 Installation →](03-debian13-installation.md)

---

## 2.1 Hardware-Anforderungen

### Proxmox-Node (Pflicht)

| Ressource | Minimum | Empfohlen |
|-----------|---------|-----------|
| CPU | 8 Kerne (Intel VT-x / AMD-V) | 16+ Kerne |
| RAM | 32 GB ECC | 64 GB ECC |
| System-Disk | 120 GB SSD (RAID 1) | 240 GB NVMe RAID |
| VM-Storage | 500 GB SSD | 2 TB NVMe oder Ceph-Cluster |
| Netzwerk | 1 GbE (2 Ports) | 10 GbE |
| IPMI / BMC | empfohlen (iDRAC, iLO) | – |

> **Hinweis:** Für Produktivbetrieb mit >10 Tenants wird ein zweiter Proxmox-Node für HA dringend empfohlen.

### Management-VM

| Ressource | Minimum | Empfohlen |
|-----------|---------|-----------|
| vCPU | 4 | 8 |
| RAM | 8 GB | 16 GB |
| Disk | 60 GB | 100 GB |
| Netzwerk | VLAN-Tag Management | – |

### Tenant-VMs (je nach Größe)

| Größe | vCPU | RAM | Disk |
|-------|------|-----|------|
| S | 2 | 4 GB | 120 GB |
| M | 4 | 6 GB | 200 GB |
| L | 6 | 12 GB | 400 GB |
| XL | 8 | 16 GB | 800 GB |

---

## 2.2 Software-Anforderungen

### Management-VM – Softwareversionen

| Software | Version | Zweck |
|----------|---------|-------|
| Debian | 13 (Trixie) | Basis-OS |
| Docker Engine | 24+ | Container-Runtime |
| Docker Compose | v2.24+ | als Docker-Plugin |
| OpenTofu | 1.6+ | VM-Provisionierung |
| Ansible | 2.15+ | Konfigurations-Management |
| Python | 3.11+ | Ansible-Dependency |
| Node.js | 20 LTS | WebApp-Runtime |
| npm | 10+ | JavaScript-Paketverwaltung |
| Git | 2.43+ | Versionskontrolle |
| jq | 1.7+ | JSON-Verarbeitung in Skripten |

---

## 2.3 Netzwerk-Anforderungen

### VLAN-Setup (UniFi oder managed Switch)

- **Management-VLAN:** VLAN 10 – Management-VM, Proxmox-API
- **Tenant-VLANs:** VLAN 101–200 – je ein VLAN pro Tenant (isoliert)
- **Trunk-Port:** Proxmox-Node erhält alle VLANs als Tagged

```
UniFi Switch (Beispiel):
Port 1 (Uplink)   → All VLANs Tagged
Port 2 (Proxmox)  → VLAN 10 Untagged, VLANs 101-200 Tagged
Port 3 (Firewall) → VLAN 10 Untagged
```

> ⚠️ VLANs werden **manuell** im Switch konfiguriert – keine automatische VLAN-Erstellung via API.

### Tenant-IP-Schema

Jede Tenant-VM erhält eine statische IP nach diesem Schema:

```
IP:      10.<VLAN-ID>.10.100/24
Gateway: 10.<VLAN-ID>.10.1
Beispiel VLAN 101: 10.101.10.100/24 (GW: 10.101.10.1)
```

### DNS-Konfiguration (IONOS)

```
# Wildcard für alle Tenant-Apps
*.irongeeks.eu.   300  IN  A  <öffentliche-IP>
```

### Firewall / Port-Freigaben

| Port | Protokoll | Zweck |
|------|-----------|-------|
| 80 | TCP | HTTP → Redirect zu HTTPS |
| 443 | TCP | HTTPS (Traefik) |
| 22 | TCP | SSH (nur VPN / eigene IP) |
| 8006 | TCP | Proxmox Web-UI (nur intern) |

---

## 2.4 API-Keys und Zugangsdaten

Folgende Zugangsdaten vor dem Setup beschaffen:

### Proxmox API-Token

```
Proxmox Web-UI: Datacenter → Permissions → API Tokens → Add
  User:                root@pam
  Token ID:            terraform
  Privilege Separation: deaktivieren

Ergebnis:
  PROXMOX_TOKEN_ID=root@pam!terraform
  PROXMOX_TOKEN_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### IONOS DNS API-Key

```
IONOS Developer Console: https://developer.hosting.ionos.de/keys
→ Public Prefix + Secret Key notieren

Format: IONOS_API_KEY=publicprefix.secretkey
```

### SMTP-Zugangsdaten (optional, für Alerts)

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASSWORD=sicheres-passwort
```

---

> **[← 01 Überblick](01-overview.md)** | **[Wiki-Index](README.md)** | Weiter: [03 – Debian 13 →](03-debian13-installation.md)
