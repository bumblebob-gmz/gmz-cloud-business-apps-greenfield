# GMZ Cloud Business Apps – Platform Setup Guide

> **Sprache:** Deutsch | **Version:** 1.0.0 | **Stand:** März 2026  
> Dieses Dokument beschreibt die vollständige Einrichtung der GMZ Cloud Business Apps Plattform von der Hardware-Vorbereitung bis zum ersten produktiven Tenant.

---

## Inhaltsverzeichnis

1. [Überblick](#1-überblick)
2. [Voraussetzungen](#2-voraussetzungen)
3. [Initiales Setup Management-VM](#3-initiales-setup-management-vm)
4. [Traefik deployen](#4-traefik-deployen)
5. [Monitoring Stack deployen](#5-monitoring-stack-deployen)
6. [WebApp deployen](#6-webapp-deployen)
7. [Ersten Tenant provisionieren](#7-ersten-tenant-provisionieren)
8. [App auf Tenant deployen](#8-app-auf-tenant-deployen)
9. [Authentik SSO](#9-authentik-sso)
10. [Nightly Updates](#10-nightly-updates)
11. [Sicherheits-Konfiguration](#11-sicherheits-konfiguration)
12. [Backup-Strategie](#12-backup-strategie)
13. [Troubleshooting](#13-troubleshooting)
14. [Umgebungsvariablen-Referenz](#14-umgebungsvariablen-referenz)

---

## 1. Überblick

### Was ist GMZ Cloud Business Apps?

GMZ Cloud Business Apps ist eine selbst gehostete Multi-Tenant-Plattform, die es Managed-Service-Providern (MSPs) und IT-Dienstleistern ermöglicht, cloudbasierte Business-Applikationen vollautomatisch für Kunden bereitzustellen. Die Plattform kombiniert Infrastructure-as-Code (OpenTofu), Konfigurations-Management (Ansible) und eine moderne Web-Verwaltungsoberfläche zu einem durchgängigen Lifecycle-Management-System.

**Kernfunktionen:**
- Automatisiertes Provisionieren von Tenant-VMs auf Proxmox VE
- Katalogbasiertes Deployment von Business-Apps (Nextcloud, Gitea, Vaultwarden, Odoo, Zammad u. v. m.)
- Zentrales Reverse-Proxy- und TLS-Management über Traefik v3
- Single Sign-On via Authentik für alle Tenants
- Vollständiges Monitoring mit Prometheus, Loki und Grafana
- Nightly-Updates mit automatischem Snapshot und Rollback

### Architektur-Diagram

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  IONOS DNS (Wildcard *.apps.example.com → öffentliche IP)       │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Firewall / NAT (Port 80, 443 → Management-VM)                  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────── Proxmox Node ────────────────────┐
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Management-VM (Debian 13, 8 GB RAM, 100 GB SSD)        │   │
│  │                                                          │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐  │   │
│  │  │ Traefik  │ │ WebApp   │ │ Authentik │ │Monitoring│  │   │
│  │  │  :443    │ │  :3000   │ │  :9000    │ │Grafana   │  │   │
│  │  │  :80     │ │          │ │           │ │:3001     │  │   │
│  │  └────┬─────┘ └──────────┘ └───────────┘ └──────────┘  │   │
│  │       │  Docker-Netzwerk: mgmt-net                       │   │
│  └───────┼─────────────────────────────────────────────────┘   │
│          │                                                       │
│          │  VLAN-Trunk (802.1Q)                                 │
│          ▼                                                       │
│  ┌────────────────────┐  ┌────────────────────┐                 │
│  │ Tenant-VM 101      │  │ Tenant-VM 102      │  ...            │
│  │ VLAN 101           │  │ VLAN 102           │                 │
│  │ 4–16 GB RAM        │  │ 4–16 GB RAM        │                 │
│  │ Docker Apps        │  │ Docker Apps        │                 │
│  │ Node-Exporter      │  │ Node-Exporter      │                 │
│  │ Traefik-Agent      │  │ Traefik-Agent      │                 │
│  └────────────────────┘  └────────────────────┘                 │
│                                                                  │
│  Shared Storage: NFS / Ceph (optional)                          │
└─────────────────────────────────────────────────────────────────┘
```

### Tech-Stack

| Schicht | Technologie | Version | Zweck |
|---------|-------------|---------|-------|
| Hypervisor | Proxmox VE | 8.x | VM-Lifecycle, Snapshots, Storage |
| IaC | OpenTofu | 1.6+ | Proxmox-VM-Provisionierung |
| Konfig-Mgmt | Ansible | 2.15+ | OS-Härtung, App-Deployment |
| Container | Docker + Compose | 24+ | App-Isolation per Tenant |
| Reverse Proxy | Traefik | 3.x | TLS, Routing, Middleware |
| Auth | Authentik | 2024.x | SSO, OIDC, User-Management |
| Monitoring | Prometheus + Grafana | latest | Metriken, Dashboards |
| Log-Aggregation | Loki + Promtail | latest | Zentrales Logging |
| Alerting | Alertmanager | latest | Teams/Slack/E-Mail Alerts |
| DNS | IONOS API | v1 | Automatische DNS-Einträge |
| CI/CD | GitHub Actions | – | Nightly Updates, Tests |
| WebApp | Node.js + Express | 20+ | Management-UI und API |
| Datenbank | SQLite / PostgreSQL | – | WebApp-State |

---

## 2. Voraussetzungen

### 2.1 Hardware-Anforderungen

#### Proxmox-Node (Pflicht)

| Ressource | Minimum | Empfohlen |
|-----------|---------|-----------|
| CPU | 8 Kerne (Intel VT-x / AMD-V) | 16+ Kerne |
| RAM | 32 GB ECC | 64 GB ECC |
| System-SSD | 120 GB SSD (RAID 1) | 240 GB NVMe RAID |
| VM-Storage | 500 GB SSD | 2 TB NVMe oder Ceph-Cluster |
| Netzwerk | 1 GbE (2 Ports) | 10 GbE |
| IPMI / BMC | empfohlen (iDRAC, iLO) | |

> **Hinweis:** Für Produktivbetrieb mit >10 Tenants wird ein zweiter Proxmox-Node für HA (High Availability) dringend empfohlen.

#### Management-VM

| Ressource | Minimum | Empfohlen |
|-----------|---------|-----------|
| vCPU | 4 | 8 |
| RAM | 8 GB | 16 GB |
| Disk | 60 GB | 100 GB |
| Netzwerk | VLAN-Tag Management | |

#### Tenant-VMs (je nach Größe)

| Größe | vCPU | RAM | Disk | Tenants |
|-------|------|-----|------|---------|
| XS | 1 | 4 GB | 40 GB | Dev/Test |
| S | 2 | 8 GB | 80 GB | <10 User |
| M | 4 | 12 GB | 160 GB | 10–50 User |
| L | 8 | 16 GB | 320 GB | 50–200 User |
| XL | 16 | 32 GB | 640 GB | 200+ User |

### 2.2 Software-Anforderungen

#### Proxmox-Node

```bash
# Proxmox VE 8.x (Debian Bookworm basiert)
# Download: https://www.proxmox.com/en/downloads

# Debian 13 Cloud-Init Template erstellen (auf Proxmox-Node ausführen)
wget https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2

qm create 9000 --name debian13-template --memory 2048 --cores 2 \
  --net0 virtio,bridge=vmbr0 --serial0 socket --vga serial0

qm importdisk 9000 debian-13-genericcloud-amd64.qcow2 local-lvm

qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0 \
  --ide2 local-lvm:cloudinit --boot c --bootdisk scsi0 \
  --ipconfig0 ip=dhcp --agent enabled=1

qm template 9000
```

#### Management-VM – Softwareversionen

| Software | Version | Installation |
|----------|---------|--------------|
| Debian | 13 (Trixie) | ISO/Template |
| Docker Engine | 24+ | apt (official repo) |
| Docker Compose | v2.24+ | als Docker-Plugin |
| OpenTofu | 1.6+ | apt / binary |
| Ansible | 2.15+ | pip3 |
| Python | 3.11+ | System |
| Node.js | 20 LTS | nodesource repo |
| npm | 10+ | mit Node.js |
| Git | 2.43+ | apt |
| jq | 1.7+ | apt |

### 2.3 Netzwerk-Anforderungen

#### VLAN-Setup (UniFi oder managed Switch)

- **Management-VLAN:** VLAN 10 – für Management-VM, Proxmox-API
- **Tenant-VLANs:** VLAN 101–200 – je ein VLAN pro Tenant (isoliert)
- **Monitoring-VLAN:** VLAN 20 – Node-Exporter-Traffic
- **Trunk-Port:** Proxmox-Node erhält alle VLANs als Tagged (Trunk)

```
UniFi Switch Konfiguration (Beispiel):
Port 1 (Uplink)     → All VLANs Tagged
Port 2 (Proxmox)    → VLAN 10 Untagged, VLANs 20, 101-200 Tagged
Port 3 (Firewall)   → VLAN 10 Untagged, VLAN 20 Tagged
```

#### DNS-Konfiguration (IONOS)

Folgende DNS-Einträge müssen manuell oder via API gesetzt werden:

```
# A-Record für die Management-VM
mgmt.example.com.          300  IN  A     203.0.113.10

# Wildcard für alle Tenant-Apps
*.apps.example.com.        300  IN  A     203.0.113.10

# Authentik SSO
auth.example.com.          300  IN  A     203.0.113.10

# Grafana Monitoring
monitoring.example.com.    300  IN  A     203.0.113.10
```

#### Firewall / Port-Freigaben

| Port | Protokoll | Zweck | Quelle |
|------|-----------|-------|--------|
| 80 | TCP | HTTP → Redirect zu HTTPS | Internet |
| 443 | TCP | HTTPS (Traefik) | Internet |
| 22 | TCP | SSH Management | VPN / eigene IP |
| 8006 | TCP | Proxmox Web-UI | VPN / eigene IP |
| 9090 | TCP | Prometheus (intern) | Management-VLAN |
| 3000 | TCP | WebApp (intern) | Management-VLAN |

### 2.4 API-Keys und Zugangsdaten

Folgende Zugangsdaten müssen vor dem Setup beschafft werden:

#### Proxmox API-Token

```bash
# In Proxmox Web-UI:
# Datacenter → Permissions → API Tokens → Add
# User: root@pam oder dedizierter User
# Token ID: terraform
# Privilege Separation: deaktivieren (für vollständige Rechte)

# Resultat:
PROXMOX_TOKEN_ID="root@pam!terraform"
PROXMOX_TOKEN_SECRET="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

#### IONOS DNS API-Key

```bash
# IONOS Developer Console: https://developer.hosting.ionos.de/keys
# API-Key erstellen → Public Prefix + Secret Key notieren

IONOS_API_KEY="public_prefix.secret_key"
```

#### SMTP-Zugangsdaten

```bash
# Für Alertmanager und Authentik E-Mail-Versand
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="noreply@example.com"
SMTP_PASSWORD="sicheres-passwort"
SMTP_FROM="GMZ Cloud <noreply@example.com>"
```

---

## 3. Initiales Setup Management-VM

### 3.1 Debian 13 installieren

Entweder via Proxmox-Template (empfohlen) oder manuell per ISO.

```bash
# Via Proxmox Web-UI oder CLI:
qm clone 9000 100 --name mgmt-vm --full true
qm set 100 --memory 8192 --cores 4 --net0 virtio,bridge=vmbr0,tag=10
qm resize 100 scsi0 +60G
qm set 100 --ipconfig0 ip=10.10.10.10/24,gw=10.10.10.1
qm set 100 --nameserver 1.1.1.1 --searchdomain example.com
qm set 100 --sshkeys ~/.ssh/id_ed25519.pub
qm start 100
```

### 3.2 System härten

#### SSH absichern

```bash
# Als root auf der Management-VM:
ssh root@10.10.10.10

# SSH-Konfiguration absichern
cat > /etc/ssh/sshd_config.d/10-hardening.conf << 'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
Protocol 2
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org
EOF

systemctl restart ssh

# Dedizierter Deploy-User anlegen
useradd -m -s /bin/bash -G sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

#### UFW Firewall konfigurieren

```bash
apt-get install -y ufw

# Standardregeln
ufw default deny incoming
ufw default allow outgoing

# Erlaubte Ports
ufw allow 22/tcp    comment 'SSH'
ufw allow 80/tcp    comment 'HTTP Traefik'
ufw allow 443/tcp   comment 'HTTPS Traefik'

# Monitoring aus Management-VLAN
ufw allow from 10.10.0.0/16 to any port 9090 comment 'Prometheus'
ufw allow from 10.10.0.0/16 to any port 3000 comment 'WebApp'
ufw allow from 10.10.0.0/16 to any port 3001 comment 'Grafana'

# Aktivieren
ufw --force enable
ufw status verbose
```

#### Unattended Upgrades

```bash
apt-get install -y unattended-upgrades apt-listchanges

cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Mail "admin@example.com";
EOF

systemctl enable unattended-upgrades
systemctl start unattended-upgrades
```

### 3.3 Docker installieren

```bash
# Offizielle Docker-Installation (Debian)
apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Deploy-User zur Docker-Gruppe hinzufügen
usermod -aG docker deploy

# Docker-Daemon-Konfiguration
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "default-address-pools": [
    {"base": "172.20.0.0/16", "size": 24}
  ],
  "live-restore": true,
  "userland-proxy": false
}
EOF

systemctl enable docker
systemctl restart docker

# Test
docker run --rm hello-world
docker compose version
```

### 3.4 OpenTofu installieren

```bash
# OpenTofu via apt-Repository (empfohlen)
curl -fsSL https://apt.releases.hashicorp.com/gpg \
  | gpg --dearmor -o /usr/share/keyrings/opentofu-archive-keyring.gpg

# Alternativ: direktes Binary (wenn kein offizielles Repo verfügbar)
TOFU_VERSION="1.6.2"
curl -fsSL "https://github.com/opentofu/opentofu/releases/download/v${TOFU_VERSION}/tofu_${TOFU_VERSION}_linux_amd64.zip" \
  -o /tmp/opentofu.zip

unzip /tmp/opentofu.zip -d /tmp/opentofu
mv /tmp/opentofu/tofu /usr/local/bin/tofu
chmod +x /usr/local/bin/tofu
rm -rf /tmp/opentofu*

# Verifizieren
tofu version
# → OpenTofu v1.6.2

# Autocomplete einrichten (optional)
tofu -install-autocomplete
```

### 3.5 Ansible installieren

```bash
# Python und pip aktualisieren
apt-get install -y python3 python3-pip python3-venv

# Ansible via pip (aktuelle Version)
python3 -m pip install --break-system-packages \
  ansible==9.* \
  ansible-lint \
  jmespath \
  netaddr \
  passlib

# Verifizieren
ansible --version
# → ansible [core 2.16.x]

# Ansible-Konfiguration
mkdir -p /etc/ansible
cat > /etc/ansible/ansible.cfg << 'EOF'
[defaults]
inventory = /opt/gmz/infrastructure/inventory
host_key_checking = False
retry_files_enabled = False
stdout_callback = yaml
callbacks_enabled = profile_tasks
interpreter_python = auto_silent
forks = 10

[ssh_connection]
ssh_args = -o ControlMaster=auto -o ControlPersist=60s -o StrictHostKeyChecking=no
pipelining = True
EOF
```

### 3.6 Repository klonen

```bash
# SSH-Key für GitHub generieren (falls noch nicht vorhanden)
sudo -u deploy ssh-keygen -t ed25519 -C "deploy@mgmt-vm" -f /home/deploy/.ssh/github_ed25519 -N ""
echo "GitHub Deploy Key (public):"
cat /home/deploy/.ssh/github_ed25519.pub
# → Diesen Key in GitHub unter Settings → Deploy Keys hinzufügen

# Repository klonen
sudo -u deploy bash << 'EOF'
git clone git@github.com:gmz-it/gmz-cloud-business-apps.git /opt/gmz
cd /opt/gmz
git checkout main
EOF

# Verzeichnisrechte
chown -R deploy:deploy /opt/gmz
ls -la /opt/gmz
```

### 3.7 Umgebungsvariablen konfigurieren

```bash
# .env aus Template erstellen
sudo -u deploy cp /opt/gmz/.env.example /opt/gmz/.env

# .env editieren – ALLE Werte befüllen
sudo -u deploy nano /opt/gmz/.env
```

Mindest-Konfiguration für `.env`:

```dotenv
# === Proxmox ===
PROXMOX_URL=https://10.10.10.1:8006/api2/json
PROXMOX_TOKEN_ID=root@pam!terraform
PROXMOX_TOKEN_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PROXMOX_NODE=pve01
PROXMOX_STORAGE=local-lvm
PROXMOX_TEMPLATE_ID=9000

# === Netzwerk ===
MANAGEMENT_VLAN=10
TENANT_VLAN_START=101
TENANT_VLAN_END=200
MANAGEMENT_NETWORK=10.10.10.0/24
TENANT_NETWORK_BASE=10.20

# === DNS (IONOS) ===
IONOS_API_KEY=public_prefix.secret_key
BASE_DOMAIN=apps.example.com
MGMT_DOMAIN=mgmt.example.com

# === SMTP ===
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASSWORD=sicheres-passwort
SMTP_FROM=GMZ Cloud <noreply@example.com>

# === WebApp ===
WEBAPP_PORT=3000
WEBAPP_SECRET=$(openssl rand -hex 32)
WEBAPP_TRUSTED_BEARER=$(openssl rand -hex 48)
WEBAPP_ADMIN_EMAIL=admin@example.com
WEBAPP_ADMIN_PASSWORD=$(openssl rand -base64 16)

# === Datenbank ===
WEBAPP_DB_TYPE=sqlite
WEBAPP_DB_PATH=/opt/gmz/data/webapp.db

# === Authentik ===
AUTHENTIK_SECRET_KEY=$(openssl rand -hex 32)
AUTHENTIK_DOMAIN=auth.example.com
AUTHENTIK_ADMIN_EMAIL=admin@example.com

# === Monitoring ===
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 16)
GRAFANA_DOMAIN=monitoring.example.com
ALERTMANAGER_TEAMS_WEBHOOK=https://outlook.office.com/webhook/...
```

---

## 4. Traefik deployen

### 4.1 IONOS API-Key vorbereiten

Der IONOS API-Key wird für die DNS-01-Challenge benötigt, damit Traefik automatisch Let's Encrypt Wildcard-Zertifikate ausstellen kann.

```bash
# IONOS-Credentials in separater Datei speichern (wird von Traefik gemountet)
sudo -u deploy mkdir -p /opt/gmz/infrastructure/traefik/secrets

cat > /opt/gmz/infrastructure/traefik/secrets/ionos.env << 'EOF'
IONOS_API_KEY=public_prefix.secret_key
EOF

chmod 600 /opt/gmz/infrastructure/traefik/secrets/ionos.env
```

### 4.2 Traefik via Ansible deployen

```bash
cd /opt/gmz/infrastructure

# Inventory prüfen
ansible-inventory --list | jq '.management'

# Dry-Run (--check)
ansible-playbook playbooks/deploy-traefik.yml --check -v

# Deployment ausführen
ansible-playbook playbooks/deploy-traefik.yml \
  --extra-vars "env=production" \
  -v

# Erwartete Ausgabe:
# PLAY RECAP *************
# mgmt-vm : ok=12  changed=8  unreachable=0  failed=0
```

Das Playbook führt folgende Schritte aus:
1. Docker-Netzwerk `traefik-proxy` anlegen
2. Traefik-Konfigurationsverzeichnis erstellen (`/opt/traefik/`)
3. `traefik.yml` mit IONOS DNS-Provider generieren
4. `docker-compose.yml` für Traefik deployen
5. Container starten und Health-Check durchführen

### 4.3 TLS verifizieren

```bash
# Zertifikats-Status prüfen (nach ~2 Minuten)
sudo -u deploy docker exec traefik \
  cat /acme/acme.json | jq '.letsencrypt.Certificates[].domain'

# Alternativ via curl:
curl -v https://mgmt.example.com 2>&1 | grep -E "subject:|issuer:|expire"

# Traefik-Logs auf Fehler prüfen
docker logs traefik --tail 50 | grep -i "error\|acme\|certificate"

# Erfolgreicher ACME-Log sieht so aus:
# time="..." level=info msg="... Certificate obtained successfully"
```

### 4.4 Traefik Dashboard

Das Traefik-Dashboard ist passwortgeschützt und nur über Traefik selbst erreichbar:

```
URL: https://traefik.mgmt.example.com/dashboard/
Benutzer: admin
Passwort: <TRAEFIK_DASHBOARD_PASSWORD aus .env>
```

Wichtige Dashboard-Bereiche:
- **Routers:** Alle konfigurierten Routes und TLS-Status
- **Services:** Backend-Health-Status aller Services
- **Middlewares:** Aktive Rate-Limiter, Auth-Middleware
- **Entrypoints:** HTTP/HTTPS-Eingehende Verbindungen

---

## 5. Monitoring Stack deployen

### 5.1 Stack starten

```bash
cd /opt/gmz/infrastructure/monitoring

# Konfigurationsdateien aus Templates generieren
./scripts/generate-config.sh

# Stack im Hintergrund starten
docker compose up -d

# Status prüfen
docker compose ps
# NAME              IMAGE                    STATUS
# prometheus        prom/prometheus:latest   Up (healthy)
# grafana           grafana/grafana:latest   Up (healthy)
# loki              grafana/loki:latest      Up
# alertmanager      prom/alertmanager:latest Up
# promtail          grafana/promtail:latest  Up

# Logs prüfen
docker compose logs --tail 20
```

### 5.2 Grafana-Passwort setzen

```bash
# Initiales Passwort aus .env verwenden oder manuell setzen
docker exec grafana grafana-cli admin reset-admin-password "neues-sicheres-passwort"

# Grafana-URL
echo "Grafana: https://monitoring.example.com"
echo "Login: admin / $(grep GRAFANA_ADMIN_PASSWORD /opt/gmz/.env | cut -d= -f2)"
```

**Erste Schritte in Grafana:**
1. Login unter `https://monitoring.example.com`
2. **Connections → Data Sources:**
   - Prometheus: `http://prometheus:9090`
   - Loki: `http://loki:3100`
3. **Dashboards → Import:** IDs aus `monitoring/dashboards/` laden

### 5.3 Alertmanager Teams-Webhook konfigurieren

```bash
# Webhook-URL in .env eintragen
# ALERTMANAGER_TEAMS_WEBHOOK=https://outlook.office.com/webhook/xxx/IncomingWebhook/yyy/zzz

# Alertmanager-Konfiguration prüfen
docker exec alertmanager amtool check-config /etc/alertmanager/alertmanager.yml

# Test-Alert senden
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {"alertname": "TestAlert", "severity": "warning"},
    "annotations": {"summary": "Dies ist ein Test-Alert"}
  }]'

# Im Teams-Kanal sollte innerhalb von 30 Sekunden eine Nachricht erscheinen
```

### 5.4 Vorkonfigurierte Dashboards

Nach dem Import sind folgende Dashboards verfügbar:

| Dashboard | Grafana-ID | Inhalt |
|-----------|-----------|--------|
| Node Exporter Full | 1860 | CPU, RAM, Disk, Netzwerk aller VMs |
| Docker Containers | 193 | Container-Ressourcen |
| Traefik | 17346 | Request-Rate, Latenz, Error-Rate |
| Authentik | custom | SSO-Logins, Fehler |
| GMZ Tenant Overview | custom | Tenant-Status, App-Health |

---

## 6. WebApp deployen

### 6.1 Abhängigkeiten installieren

```bash
cd /opt/gmz/webapp

# Node.js-Version prüfen
node --version
# → v20.x.x

# Abhängigkeiten installieren (Production)
npm ci --omit=dev

# Datenbank initialisieren
npm run db:migrate

# Initialer Admin-Account
npm run seed:admin
```

### 6.2 Umgebungsvariablen

Alle `WEBAPP_*`-Variablen müssen in `/opt/gmz/.env` gesetzt sein. Für die WebApp sind folgende kritisch:

```dotenv
# Server
WEBAPP_HOST=0.0.0.0
WEBAPP_PORT=3000
WEBAPP_BASE_URL=https://mgmt.example.com

# Sicherheit
WEBAPP_SECRET=<64-Zeichen-Hex-String>
WEBAPP_TRUSTED_BEARER=<96-Zeichen-Hex-String>
WEBAPP_SESSION_TIMEOUT=3600
WEBAPP_RATE_LIMIT_WINDOW=60000
WEBAPP_RATE_LIMIT_MAX=100

# Datenbank
WEBAPP_DB_TYPE=sqlite
WEBAPP_DB_PATH=/opt/gmz/data/webapp.db
# Für PostgreSQL:
# WEBAPP_DB_TYPE=postgres
# WEBAPP_DB_URL=postgresql://user:pass@localhost:5432/gmzdb

# Proxmox-Integration
WEBAPP_PROXMOX_URL=https://10.10.10.1:8006
WEBAPP_PROXMOX_TOKEN_ID=root@pam!terraform
WEBAPP_PROXMOX_TOKEN_SECRET=<token>
WEBAPP_PROXMOX_VERIFY_SSL=false

# Authentik-Integration
WEBAPP_AUTHENTIK_URL=https://auth.example.com
WEBAPP_AUTHENTIK_CLIENT_ID=<oidc-client-id>
WEBAPP_AUTHENTIK_CLIENT_SECRET=<oidc-client-secret>

# Feature-Flags
WEBAPP_FEATURE_AUTO_DNS=true
WEBAPP_FEATURE_AUTO_SNAPSHOT=true
WEBAPP_FEATURE_NIGHTLY_UPDATES=true
WEBAPP_MAX_TENANTS=50
```

### 6.3 Trusted-Bearer-Authentifizierung

Der `WEBAPP_TRUSTED_BEARER`-Token wird für interne Service-zu-Service-Kommunikation verwendet (z. B. Ansible-Jobs, die den WebApp-Status zurückmelden):

```bash
# Token generieren und in .env eintragen
BEARER=$(openssl rand -hex 48)
echo "WEBAPP_TRUSTED_BEARER=$BEARER" >> /opt/gmz/.env

# API mit Bearer-Token aufrufen (intern)
curl -H "Authorization: Bearer $BEARER" \
  http://localhost:3000/api/internal/health

# Ansible-Playbooks nutzen diesen Token automatisch via Umgebungsvariable
```

### 6.4 Production Build erstellen

```bash
cd /opt/gmz/webapp

# TypeScript kompilieren / Assets bundlen
npm run build

# Build-Artefakte prüfen
ls -la dist/
```

### 6.5 systemd-Service einrichten

```bash
cat > /etc/systemd/system/gmz-webapp.service << 'EOF'
[Unit]
Description=GMZ Cloud Business Apps WebApp
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/gmz/webapp
EnvironmentFile=/opt/gmz/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gmz-webapp

# Sicherheits-Härting
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/opt/gmz/data /tmp

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gmz-webapp
systemctl start gmz-webapp

# Status prüfen
systemctl status gmz-webapp
journalctl -u gmz-webapp -f
```

### 6.6 Traefik-Route für WebApp

```yaml
# /opt/traefik/dynamic/webapp.yml
http:
  routers:
    webapp:
      rule: "Host(`mgmt.example.com`)"
      entryPoints:
        - websecure
      service: webapp
      middlewares:
        - security-headers
        - rate-limit
      tls:
        certResolver: letsencrypt

  services:
    webapp:
      loadBalancer:
        servers:
          - url: "http://host-gateway:3000"
        healthCheck:
          path: /api/health
          interval: "30s"
          timeout: "5s"
```

```bash
# Route aktivieren (Traefik lädt dynamic configs automatisch)
docker exec traefik wget -qO- http://localhost:8080/api/http/routers/webapp@file
```

---

## 7. Ersten Tenant provisionieren

### 7.1 Tenant-Wizard in der WebApp

Navigiere zu `https://mgmt.example.com` und melde dich mit den Admin-Zugangsdaten an.

**Pfad:** Tenants → Neu erstellen

#### Pflichtfelder im Wizard

| Feld | Beschreibung | Beispiel |
|------|-------------|---------|
| **Name** | Eindeutiger technischer Bezeichner (lowercase, no spaces) | `acme-corp` |
| **Customer** | Anzeigename des Kunden | `ACME Corporation GmbH` |
| **VLAN** | VLAN-ID (101–200, automatisch vergeben oder manuell) | `101` |
| **Size** | VM-Größe (XS/S/M/L/XL) | `M` |
| **Region** | Proxmox-Node (bei Multi-Node) | `pve01` |
| **Apps** | Initiale Apps aus Katalog | `nextcloud`, `vaultwarden` |
| **Admin Email** | Erster Tenant-Admin | `admin@acme-corp.example.com` |
| **Subdomain** | Präfix für `*.apps.example.com` | `acme` |

### 7.2 Provisionierungs-Job verfolgen

Nach dem Klick auf „Tenant erstellen" startet ein Hintergrund-Job:

```
Job: PROV-20260301-001
Status: Running
Fortschritt: ████████░░ 80%

✅ VLAN 101 konfiguriert
✅ DNS-Einträge erstellt (*.acme.apps.example.com)
✅ OpenTofu: VM 101 erstellt (10.20.101.10)
✅ VM gestartet, Cloud-Init abgeschlossen
✅ Ansible: OS gehärtet
✅ Ansible: Docker installiert
✅ Ansible: Traefik-Agent konfiguriert
✅ Ansible: Node-Exporter konfiguriert
✅ Ansible: Prometheus-Target registriert
🔄 Ansible: Nextcloud deployen...
```

Logs können über die WebApp-UI oder direkt eingesehen werden:

```bash
# Job-Logs direkt
journalctl -u gmz-webapp | grep "PROV-20260301-001"

# Ansible-Output
tail -f /opt/gmz/logs/ansible/prov-20260301-001.log

# OpenTofu-State
cat /opt/gmz/infrastructure/tofu/tenants/acme-corp/terraform.tfstate | jq '.resources[].type'
```

### 7.3 Proxmox verifizieren

```bash
# Proxmox CLI (auf Proxmox-Node)
qm list | grep -i acme
# → 101  acme-corp    running   8192  20.00

# VM-Details
qm config 101

# Netzwerk prüfen
qm agent 101 network-get-interfaces

# Ping testen
ping -c3 10.20.101.10

# SSH-Test
ssh deploy@10.20.101.10 "docker ps && uptime"
```

---

## 8. App auf Tenant deployen

### 8.1 App-Katalog

Verfügbare Apps im Katalog (`/opt/gmz/apps/catalog/`):

| App | Kategorie | Standard-Port | Ressourcen |
|-----|-----------|--------------|------------|
| Nextcloud | Collaboration | 8080 | 2GB RAM, 20GB+ |
| Vaultwarden | Passwort-Manager | 8080 | 256MB RAM |
| Gitea | Git-Hosting | 3000 | 512MB RAM |
| Zammad | Helpdesk/Ticketing | 3000 | 4GB RAM |
| Odoo CE | ERP | 8069 | 4GB RAM |
| Mattermost | Chat | 8065 | 2GB RAM |
| Uptime Kuma | Monitoring | 3001 | 256MB RAM |
| Portainer CE | Docker-UI | 9000 | 256MB RAM |
| Paperless-ngx | Dokumentenmanagement | 8000 | 1GB RAM |
| Wordpress | CMS | 80 | 512MB RAM |

### 8.2 App-Variablen konfigurieren

```bash
# Via WebApp-UI: Tenant → Apps → App hinzufügen → Nextcloud
# Oder via API:

curl -X POST https://mgmt.example.com/api/tenants/acme-corp/apps \
  -H "Authorization: Bearer $WEBAPP_TRUSTED_BEARER" \
  -H "Content-Type: application/json" \
  -d '{
    "app": "nextcloud",
    "vars": {
      "NEXTCLOUD_ADMIN_USER": "admin",
      "NEXTCLOUD_ADMIN_PASSWORD": "sicheres-passwort",
      "NEXTCLOUD_DOMAIN": "nextcloud.acme.apps.example.com",
      "NEXTCLOUD_DB_TYPE": "postgres",
      "NEXTCLOUD_STORAGE_SIZE": "100G",
      "SMTP_HOST": "smtp.example.com",
      "SMTP_PORT": "587",
      "SMTP_USER": "noreply@acme.example.com"
    }
  }'
```

### 8.3 Deploy-Job ausführen

```bash
# Ansible-Playbook für App-Deployment
ansible-playbook playbooks/deploy-app.yml \
  --limit "tenant-acme-corp" \
  --extra-vars "app=nextcloud tenant=acme-corp" \
  -v

# Job-Status in WebApp: Tenants → acme-corp → Apps → nextcloud → Logs
```

### 8.4 Traefik-Route auf Tenant

Das App-Deployment erstellt automatisch eine Traefik-Konfiguration auf der Tenant-VM:

```yaml
# /opt/traefik/dynamic/nextcloud.yml (auf Tenant-VM)
http:
  routers:
    nextcloud:
      rule: "Host(`nextcloud.acme.apps.example.com`)"
      entryPoints:
        - websecure
      service: nextcloud
      middlewares:
        - nextcloud-redirectregex
        - security-headers
      tls:
        certResolver: letsencrypt

  services:
    nextcloud:
      loadBalancer:
        servers:
          - url: "http://nextcloud:8080"
```

---

## 9. Authentik SSO

### 9.1 Authentik deployen

```bash
cd /opt/gmz/infrastructure

# Authentik-Stack starten
ansible-playbook playbooks/deploy-authentik.yml -v

# Alternativ manuell:
cd /opt/gmz/infrastructure/authentik
docker compose up -d

# Logs prüfen
docker compose logs -f authentik-server
# Warten bis: "... Starting server on ..."
```

### 9.2 Admin-Account einrichten

```bash
# Initiales Setup-Passwort setzen
docker exec authentik-worker ak create_recovery_key 10 akadmin

# URL aufrufen
echo "Authentik Setup: https://auth.example.com/if/flow/initial-setup/"
```

**Im Browser:**
1. `https://auth.example.com/if/flow/initial-setup/` aufrufen
2. E-Mail: `admin@example.com`
3. Passwort setzen (aus `AUTHENTIK_ADMIN_PASSWORD` in `.env`)
4. Login unter `https://auth.example.com`

### 9.3 OIDC Provider einrichten

**Pfad:** Admin UI → Applications → Providers → Create → OAuth2/OIDC Provider

Konfiguration für die GMZ WebApp:

```
Name: GMZ WebApp
Client Type: Confidential
Client ID: gmz-webapp (wird automatisch generiert)
Client Secret: (wird automatisch generiert, in WEBAPP_AUTHENTIK_CLIENT_SECRET eintragen)

Redirect URIs:
  https://mgmt.example.com/auth/callback

Scopes:
  openid, email, profile, groups

Signing Key: authentik Self-signed Certificate
```

**Application erstellen:**
```
Name: GMZ Cloud Management
Slug: gmz-cloud
Provider: GMZ WebApp (oben erstellt)
Policy: default-provider-authorization-implicit-consent
```

### 9.4 User-Management

```bash
# User via Authentik API anlegen
AUTHENTIK_TOKEN=$(cat /opt/gmz/data/authentik-api-token)

curl -X POST https://auth.example.com/api/v3/core/users/ \
  -H "Authorization: Bearer $AUTHENTIK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "max.mustermann",
    "name": "Max Mustermann",
    "email": "max.mustermann@example.com",
    "groups": ["gmz-admins"],
    "is_active": true
  }'

# Passwort setzen (User erhält E-Mail mit Setup-Link)
curl -X POST https://auth.example.com/api/v3/core/users/{id}/set_password/ \
  -H "Authorization: Bearer $AUTHENTIK_TOKEN" \
  -d '{"password": "temporaeres-passwort"}'
```

**RBAC-Gruppen in Authentik:**

| Gruppe | Berechtigungen |
|--------|---------------|
| `gmz-admins` | Vollzugriff auf alle Tenants |
| `gmz-operators` | Tenants ansehen, Apps deployen |
| `gmz-viewers` | Nur lesender Zugriff |
| `tenant-{name}-admin` | Admin für spezifischen Tenant |

---

## 10. Nightly Updates

### 10.1 GitHub Actions Workflow

Der Nightly-Update-Workflow wird automatisch jeden Tag um 02:00 Uhr ausgeführt:

```yaml
# .github/workflows/nightly-update.yml
name: Nightly Update

on:
  schedule:
    - cron: '0 2 * * *'   # 02:00 UTC täglich
  workflow_dispatch:        # Manueller Trigger

jobs:
  update:
    runs-on: self-hosted    # Läuft auf Management-VM
    timeout-minutes: 120

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Pre-Update Snapshot
        run: |
          ansible-playbook playbooks/snapshot-all.yml \
            --extra-vars "snapshot_name=nightly-$(date +%Y%m%d)"

      - name: Update Management-VM
        run: |
          ansible-playbook playbooks/update-mgmt.yml

      - name: Update Tenant VMs
        run: |
          ansible-playbook playbooks/update-tenants.yml \
            --extra-vars "update_type=security_only"

      - name: Update Docker Images
        run: |
          ansible-playbook playbooks/update-docker.yml

      - name: Health Check
        run: |
          ./scripts/health-check-all.sh

      - name: Notify Teams
        if: always()
        uses: ./.github/actions/notify-teams
        with:
          webhook: ${{ secrets.TEAMS_WEBHOOK }}
          status: ${{ job.status }}
```

### 10.2 Maintenance Window konfigurieren

```bash
# Maintenance-Window in WebApp konfigurieren
# Settings → Maintenance Window

# Oder via .env:
WEBAPP_MAINTENANCE_WINDOW_START="02:00"
WEBAPP_MAINTENANCE_WINDOW_END="04:00"
WEBAPP_MAINTENANCE_TIMEZONE="Europe/Berlin"

# Während Maintenance Window:
# - Traefik zeigt Wartungsseite
# - Neue Deployments werden geblockt
# - Updates laufen durch
```

### 10.3 Automatische Snapshots

```bash
# Snapshot aller Tenant-VMs erstellen
ansible-playbook playbooks/snapshot-all.yml \
  --extra-vars "snapshot_name=before-update-$(date +%Y%m%d)"

# Proxmox CLI (manuell):
for vmid in $(pvesh get /nodes/pve01/qemu --output-format json | jq '.[].vmid'); do
  qm snapshot $vmid "nightly-$(date +%Y%m%d)" --vmstate false
  echo "Snapshot erstellt: VM $vmid"
done

# Alte Snapshots bereinigen (>7 Tage)
./scripts/cleanup-snapshots.sh --older-than 7d
```

### 10.4 Rollback-Prozedur

```bash
# Rollback für einzelne Tenant-VM
TENANT="acme-corp"
SNAPSHOT="nightly-20260301"

# Via WebApp: Tenants → acme-corp → Snapshots → Rollback
# Oder via CLI:
VM_ID=$(cat /opt/gmz/data/tenants/${TENANT}/vmid)
qm rollback $VM_ID $SNAPSHOT

# Rollback verifizieren
ssh deploy@$(cat /opt/gmz/data/tenants/${TENANT}/ip) "uptime && docker ps"

# DNS nach Rollback ggf. neu setzen
ansible-playbook playbooks/verify-dns.yml --limit "tenant-${TENANT}"
```

---

## 11. Sicherheits-Konfiguration

### 11.1 Trusted-Bearer-Token

```bash
# Token rotieren (ohne Downtime)
NEW_BEARER=$(openssl rand -hex 48)

# In .env aktualisieren
sed -i "s/^WEBAPP_TRUSTED_BEARER=.*/WEBAPP_TRUSTED_BEARER=$NEW_BEARER/" /opt/gmz/.env

# WebApp neu starten
systemctl restart gmz-webapp

# Ansible-Vault-Secret aktualisieren
ansible-vault encrypt_string "$NEW_BEARER" --name "webapp_trusted_bearer" \
  >> /opt/gmz/infrastructure/group_vars/all/vault.yml
```

### 11.2 API-Tokens sichern

```bash
# Alle Tokens in Ansible Vault speichern (nicht in .git!)
ansible-vault create /opt/gmz/infrastructure/group_vars/all/vault.yml

# Vault-Passwort in Datei (von git ausgeschlossen)
echo "vault-passwort-hier" > /opt/gmz/.vault-password
chmod 600 /opt/gmz/.vault-password
echo ".vault-password" >> /opt/gmz/.gitignore

# Playbooks mit Vault ausführen
ansible-playbook playbooks/deploy-traefik.yml \
  --vault-password-file /opt/gmz/.vault-password
```

### 11.3 RBAC-Rollen in der WebApp

```javascript
// roles/definitions.js
const ROLES = {
  SUPER_ADMIN: {
    permissions: ['*'],
    description: 'Vollzugriff auf alle Funktionen'
  },
  ADMIN: {
    permissions: [
      'tenants:create', 'tenants:read', 'tenants:update', 'tenants:delete',
      'apps:deploy', 'apps:manage',
      'users:manage',
      'settings:read'
    ]
  },
  OPERATOR: {
    permissions: [
      'tenants:read',
      'apps:deploy', 'apps:read',
      'monitoring:read'
    ]
  },
  VIEWER: {
    permissions: [
      'tenants:read',
      'apps:read',
      'monitoring:read'
    ]
  }
};
```

### 11.4 Secret-Scanning mit gitleaks

```bash
# gitleaks installieren
curl -sSfL https://raw.githubusercontent.com/gitleaks/gitleaks/main/scripts/install.sh \
  | sh -s -- -b /usr/local/bin v8.18.2

# Repository scannen
cd /opt/gmz
gitleaks detect --source . --verbose

# Pre-commit Hook installieren
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
gitleaks protect --staged --verbose
EOF
chmod +x .git/hooks/pre-commit
```

### 11.5 Checkov IaC-Scanning

```bash
# Checkov installieren
pip3 install --break-system-packages checkov

# OpenTofu/Terraform-Code scannen
checkov -d /opt/gmz/infrastructure/tofu \
  --framework terraform \
  --output cli \
  --compact

# Docker-Compose-Files scannen
checkov -d /opt/gmz/infrastructure \
  --framework dockerfile \
  --framework docker_compose

# GitHub Actions scannen
checkov -d /opt/gmz/.github \
  --framework github_actions
```

### 11.6 Security-Checkliste

Vor dem Go-Live folgende Punkte abhaken:

- [ ] SSH: Root-Login deaktiviert, nur Key-Auth
- [ ] UFW: Alle nicht benötigten Ports gesperrt
- [ ] Traefik: Security-Headers-Middleware aktiv
- [ ] Traefik: Rate-Limiting für alle Public-Endpoints
- [ ] Authentik: MFA für alle Admin-Accounts aktiviert
- [ ] Authentik: Brute-Force-Schutz (max 5 Versuche)
- [ ] API-Tokens: In Ansible Vault, nicht im Repo
- [ ] .env: Nicht ins Git-Repository committed
- [ ] Docker: Alle Container ohne `--privileged`
- [ ] Docker: Rootless-Container wo möglich
- [ ] Snapshots: Tägliche Snapshots verifiziert
- [ ] Monitoring: Alerts für fehlgeschlagene Logins aktiv
- [ ] gitleaks: Pre-commit Hook installiert
- [ ] Checkov: CI-Pipeline integriert
- [ ] Fail2ban: Für SSH und Traefik installiert
- [ ] Netzwerk: Tenant-VLANs isoliert (keine Tenant-zu-Tenant-Kommunikation)

---

## 12. Backup-Strategie

### 12.1 Automatisches Backup

```bash
# Proxmox Backup Server (PBS) konfigurieren (empfohlen)
# In Proxmox Web-UI: Datacenter → Backup → Add

# Backup-Job-Konfiguration in /etc/pve/jobs.cfg:
vzdump: nightly-backup
  vmid 100-200
  storage pbs
  schedule 03:00
  mode snapshot
  compress zstd
  mailnotification failure
  mailto admin@example.com
  retention-keep-daily 7
  retention-keep-weekly 4
  retention-keep-monthly 3
```

### 12.2 Manuelles Backup

```bash
# Einzelne VM sichern
vzdump 101 --storage pbs --mode snapshot --compress zstd

# Alle Tenant-VMs
for vmid in $(cat /opt/gmz/data/tenant-vmids.txt); do
  echo "Backup VM $vmid..."
  vzdump $vmid --storage pbs --mode snapshot --compress zstd
done

# WebApp-Datenbank backup
sqlite3 /opt/gmz/data/webapp.db ".backup '/opt/gmz/backups/webapp-$(date +%Y%m%d).db'"

# Konfigurationsdateien sichern
tar czf /opt/gmz/backups/config-$(date +%Y%m%d).tar.gz \
  /opt/gmz/.env \
  /opt/gmz/infrastructure/ \
  /opt/traefik/ \
  /etc/ansible/
```

### 12.3 S3/MinIO Offsite-Backup

```bash
# MinIO-Client installieren
curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc \
  -o /usr/local/bin/mc
chmod +x /usr/local/bin/mc

# S3-Endpoint konfigurieren (IONOS Object Storage oder eigenes MinIO)
mc alias set ionos-s3 https://s3-eu-central-1.ionoscloud.com \
  "$S3_ACCESS_KEY" "$S3_SECRET_KEY"

# Backup-Bucket anlegen
mc mb ionos-s3/gmz-backups-$(hostname)

# Tägliches Sync via Cron
cat > /etc/cron.d/gmz-s3-backup << 'EOF'
0 4 * * * deploy mc mirror /opt/gmz/backups/ ionos-s3/gmz-backups/$(hostname)/ --overwrite
EOF

# Retention Policy (30 Tage)
mc ilm add ionos-s3/gmz-backups-$(hostname) \
  --expiry-days 30
```

### 12.4 Restore-Test (Quartalsweise)

```bash
# Restore-Prozedur dokumentieren und testen:

# 1. VM aus Backup wiederherstellen (auf Test-Node)
qmrestore /var/lib/vz/dump/vzdump-qemu-101-*.vma.zst \
  --storage local-lvm \
  --unique true \
  --vmid 201

# 2. VM starten und Funktionalität prüfen
qm start 201
sleep 30
ssh deploy@$(qm agent 201 network-get-interfaces | jq -r '.[].ip-addresses[0].["ip-address"]')

# 3. App-Erreichbarkeit prüfen
curl -k https://nextcloud.test.apps.example.com/status.php

# 4. Daten-Integrität prüfen
# (app-spezifische Prüfungen)

# 5. Test-VM wieder löschen
qm stop 201 && qm destroy 201

# Restore-Test dokumentieren:
echo "Restore-Test $(date): ERFOLGREICH" >> /opt/gmz/logs/restore-tests.log
```

---

## 13. Troubleshooting

### 13.1 Traefik: Kein TLS-Zertifikat

**Symptom:** Browser zeigt "Verbindung nicht sicher", `acme.json` ist leer.

**Ursache:** IONOS API-Key falsch, DNS-01-Challenge schlägt fehl.

**Lösung:**
```bash
# 1. IONOS API-Key prüfen
curl -X GET "https://api.hosting.ionos.com/dns/v1/zones" \
  -H "X-API-Key: $IONOS_API_KEY"
# → Sollte Liste der Zonen zurückgeben

# 2. Traefik-Logs auf ACME-Fehler prüfen
docker logs traefik 2>&1 | grep -i "acme\|error\|dns"

# 3. acme.json zurücksetzen und neu versuchen
docker exec traefik rm /acme/acme.json
docker restart traefik

# 4. DNS-Propagation abwarten (bis zu 5 Minuten)
watch -n5 "dig TXT _acme-challenge.mgmt.example.com @1.1.1.1"
```

### 13.2 Tenant-VM: Cloud-Init schlägt fehl

**Symptom:** VM startet, bleibt aber bei Cloud-Init hängen.

**Ursache:** Falsches Template, fehlende Cloud-Init-Konfiguration.

**Lösung:**
```bash
# Proxmox-Konsole öffnen
qm terminal 101

# Cloud-Init-Status prüfen
cloud-init status --wait
cloud-init analyze show

# Cloud-Init-Logs
journalctl -u cloud-init -n 50
cat /var/log/cloud-init-output.log

# Template neu erstellen falls nötig (siehe Abschnitt 2.2)
```

### 13.3 Ansible: SSH-Verbindung zu Tenant schlägt fehl

**Symptom:** `UNREACHABLE! => {"msg": "Failed to connect to the host via ssh"}`

**Ursache:** SSH-Key nicht auf VM, falsche IP, Firewall.

**Lösung:**
```bash
# SSH-Key manuell kopieren
ssh-copy-id -i /home/deploy/.ssh/id_ed25519.pub root@10.20.101.10

# Verbindung testen
ansible tenant-acme-corp -m ping -v

# IP-Adresse aus Proxmox abrufen
qm agent 101 network-get-interfaces | jq '.[].["ip-addresses"][].["ip-address"]'

# Inventory aktualisieren
cat /opt/gmz/infrastructure/inventory/hosts.yml
```

### 13.4 WebApp: Service startet nicht

**Symptom:** `systemctl status gmz-webapp` zeigt `failed`.

**Ursache:** Fehlende Umgebungsvariablen, Port bereits belegt.

**Lösung:**
```bash
# Logs ansehen
journalctl -u gmz-webapp -n 50 --no-pager

# Port-Konflikt prüfen
lsof -i :3000

# .env-Syntax prüfen
node -e "require('dotenv').config({path:'/opt/gmz/.env'}); console.log(process.env.WEBAPP_PORT)"

# Manuell starten für Debug-Output
sudo -u deploy bash -c "cd /opt/gmz/webapp && node dist/server.js"
```

### 13.5 Proxmox: API-Verbindung schlägt fehl

**Symptom:** OpenTofu-Plan schlägt fehl mit `401 Unauthorized`.

**Ursache:** API-Token abgelaufen oder falsche Permissions.

**Lösung:**
```bash
# Token-Gültigkeit prüfen
curl -k -H "Authorization: PVEAPIToken=root@pam!terraform=<secret>" \
  https://10.10.10.1:8006/api2/json/version

# Neuen Token erstellen (Proxmox Web-UI)
# Datacenter → Permissions → API Tokens → root@pam → Add
# Token-ID: terraform2
# Privilege Separation: NO

# .env aktualisieren
sed -i "s/^PROXMOX_TOKEN_SECRET=.*/PROXMOX_TOKEN_SECRET=neuer-secret/" /opt/gmz/.env
```

### 13.6 Nextcloud: Falsche Domain / Redirect-Loop

**Symptom:** Nextcloud zeigt "Zugriff über nicht vertrauenswürdige Domain".

**Ursache:** `trusted_domains` in Nextcloud-Konfiguration nicht gesetzt.

**Lösung:**
```bash
# SSH auf Tenant-VM
ssh deploy@10.20.101.10

# Nextcloud-Container
docker exec -u www-data nextcloud \
  php occ config:system:set trusted_domains 0 \
  --value="nextcloud.acme.apps.example.com"

docker exec -u www-data nextcloud \
  php occ config:system:set overwrite.cli.url \
  --value="https://nextcloud.acme.apps.example.com"

docker exec -u www-data nextcloud \
  php occ config:system:set overwriteprotocol --value="https"
```

### 13.7 Grafana: Keine Metriken von Tenant-VM

**Symptom:** Tenant-VM erscheint nicht in Grafana-Dashboards.

**Ursache:** Node-Exporter läuft nicht, Prometheus-Target fehlt.

**Lösung:**
```bash
# Node-Exporter auf Tenant prüfen
ssh deploy@10.20.101.10 "systemctl status node_exporter"

# Falls nicht installiert:
ansible-playbook playbooks/install-node-exporter.yml --limit "tenant-acme-corp"

# Prometheus-Target prüfen
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="node") | {instance: .labels.instance, health: .health}'

# Firewall auf Tenant (Port 9100 für Prometheus freigeben)
ssh deploy@10.20.101.10 "ufw allow from 10.10.10.10 to any port 9100"
```

### 13.8 Authentik: Login schlägt fehl

**Symptom:** SSO-Login gibt `Error: invalid_grant`.

**Ursache:** OIDC-Redirect-URI stimmt nicht überein.

**Lösung:**
```bash
# Authentik Provider-Konfiguration prüfen
# Admin UI → Applications → Providers → GMZ WebApp

# Redirect-URI muss exakt übereinstimmen:
# https://mgmt.example.com/auth/callback

# In WEBAPP_AUTHENTIK_CLIENT_ID und _SECRET prüfen
grep WEBAPP_AUTHENTIK /opt/gmz/.env

# Authentik-Logs
docker logs authentik-server 2>&1 | grep -i "error\|oauth\|oidc" | tail 20
```

### 13.9 Docker: Container startet immer wieder neu

**Symptom:** `docker ps` zeigt Container im Status `Restarting`.

**Ursache:** Fehlende Umgebungsvariablen, Datenbank-Verbindungsfehler.

**Lösung:**
```bash
# Container-Logs analysieren
docker logs <container-name> --tail 50

# docker-compose.yml auf fehlende Variablen prüfen
docker compose config | grep -E "^\s+[A-Z_]+:$"

# Manuell starten für Debugging
docker run --rm -it \
  --env-file /opt/gmz/infrastructure/tenants/acme-corp/.env \
  nextcloud:latest \
  /entrypoint.sh apache2-foreground
```

### 13.10 OpenTofu: State-Konflikt

**Symptom:** `Error: Resource already exists` oder `State file locked`.

**Ursache:** Parallele Ausführung, abgebrochenes Deployment.

**Lösung:**
```bash
# State-Lock aufheben (nur wenn sicher kein anderer Prozess läuft!)
cd /opt/gmz/infrastructure/tofu/tenants/acme-corp
tofu force-unlock <LOCK_ID>

# State-Datei auf Konsistenz prüfen
tofu state list
tofu plan -refresh-only

# Im Notfall: State-Import für bereits existierende Ressourcen
tofu import proxmox_virtual_environment_vm.tenant_vm pve01/qemu/101
```

### 13.11 DNS: App nicht erreichbar trotz korrekter Route

**Symptom:** Browser zeigt `ERR_NAME_NOT_RESOLVED`.

**Ursache:** DNS-Eintrag noch nicht propagiert oder falsche IP.

**Lösung:**
```bash
# DNS-Auflösung prüfen
dig nextcloud.acme.apps.example.com @1.1.1.1
dig nextcloud.acme.apps.example.com @8.8.8.8

# IONOS DNS-Einträge prüfen
curl -s -X GET "https://api.hosting.ionos.com/dns/v1/zones" \
  -H "X-API-Key: $IONOS_API_KEY" | jq '.[] | select(.name=="apps.example.com")'

# DNS-Eintrag manuell erstellen (falls Automation fehlschlug)
ansible-playbook playbooks/create-dns-record.yml \
  --extra-vars "record=nextcloud.acme subdomain=acme tenant=acme-corp"
```

---

## 14. Umgebungsvariablen-Referenz

Vollständige Tabelle aller `WEBAPP_*` Umgebungsvariablen und weiterer Plattform-Variablen:

### Server & Basis-Konfiguration

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|-------------|
| `WEBAPP_HOST` | Nein | `0.0.0.0` | Bind-Adresse des HTTP-Servers |
| `WEBAPP_PORT` | Nein | `3000` | HTTP-Port der WebApp |
| `WEBAPP_BASE_URL` | **Ja** | – | Öffentliche URL der WebApp (z. B. `https://mgmt.example.com`) |
| `WEBAPP_SECRET` | **Ja** | – | 64-Zeichen Hex-String für JWT-Signing und Session-Verschlüsselung |
| `WEBAPP_NODE_ENV` | Nein | `production` | `development`, `test`, `production` |
| `WEBAPP_LOG_LEVEL` | Nein | `info` | `error`, `warn`, `info`, `debug`, `trace` |
| `WEBAPP_LOG_FORMAT` | Nein | `json` | `json` oder `pretty` |

### Authentifizierung & Sicherheit

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|-------------|
| `WEBAPP_TRUSTED_BEARER` | **Ja** | – | 96-Zeichen Hex-Token für interne API-Aufrufe (Ansible → WebApp) |
| `WEBAPP_SESSION_TIMEOUT` | Nein | `3600` | Session-Timeout in Sekunden |
| `WEBAPP_RATE_LIMIT_WINDOW` | Nein | `60000` | Rate-Limit-Fenster in Millisekunden |
| `WEBAPP_RATE_LIMIT_MAX` | Nein | `100` | Max. Requests pro Fenster pro IP |
| `WEBAPP_ADMIN_EMAIL` | **Ja** | – | E-Mail des initialen Admin-Accounts |
| `WEBAPP_ADMIN_PASSWORD` | **Ja** | – | Passwort des initialen Admin-Accounts (wird gehasht gespeichert) |
| `WEBAPP_CORS_ORIGINS` | Nein | `WEBAPP_BASE_URL` | Kommagetrennte Liste erlaubter CORS-Origins |
| `WEBAPP_CSRF_ENABLED` | Nein | `true` | CSRF-Schutz aktivieren |
| `WEBAPP_HELMET_ENABLED` | Nein | `true` | HTTP-Security-Headers (Helmet.js) |

### Datenbank

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|-------------|
| `WEBAPP_DB_TYPE` | Nein | `sqlite` | `sqlite` oder `postgres` |
| `WEBAPP_DB_PATH` | Nein | `./data/webapp.db` | Pfad zur SQLite-Datenbankdatei |
| `WEBAPP_DB_URL` | Nein* | – | PostgreSQL-Connection-String (`postgresql://user:pass@host:5432/db`). *Pflicht wenn `DB_TYPE=postgres` |
| `WEBAPP_DB_POOL_MIN` | Nein | `2` | Minimale DB-Pool-Verbindungen |
| `WEBAPP_DB_POOL_MAX` | Nein | `10` | Maximale DB-Pool-Verbindungen |
| `WEBAPP_DB_SSL` | Nein | `false` | TLS für PostgreSQL-Verbindung |

### Proxmox-Integration

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|-------------|
| `WEBAPP_PROXMOX_URL` | **Ja** | – | Proxmox API-URL (z. B. `https://10.10.10.1:8006`) |
| `WEBAPP_PROXMOX_TOKEN_ID` | **Ja** | – | API-Token-ID (z. B. `root@pam!terraform`) |
| `WEBAPP_PROXMOX_TOKEN_SECRET` | **Ja** | – | API-Token-Secret |
| `WEBAPP_PROXMOX_NODE` | **Ja** | – | Proxmox-Node-Name (z. B. `pve01`) |
| `WEBAPP_PROXMOX_STORAGE` | Nein | `local-lvm` | Standard-Storage für VM-Disks |
| `WEBAPP_PROXMOX_TEMPLATE_ID` | **Ja** | – | VMID des Debian-13-Templates |
| `WEBAPP_PROXMOX_VERIFY_SSL` | Nein | `false` | SSL-Zertifikat des Proxmox-Servers verifizieren |
| `WEBAPP_PROXMOX_TIMEOUT` | Nein | `30000` | API-Timeout in Millisekunden |

### Netzwerk & DNS

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|-------------|
| `WEBAPP_BASE_DOMAIN` | **Ja** | – | Basis-Domain für Tenant-Apps (z. B. `apps.example.com`) |
| `WEBAPP_MGMT_DOMAIN` | **Ja** | – | Management-Domain (z. B. `mgmt.example.com`) |
| `WEBAPP_MANAGEMENT_VLAN` | Nein | `10` | VLAN-ID für Management-Netz |
| `WEBAPP_TENANT_VLAN_START` | Nein | `101` | Erste VLAN-ID für Tenants |
| `WEBAPP_TENANT_VLAN_END` | Nein | `200` | Letzte VLAN-ID für Tenants |
| `WEBAPP_TENANT_NETWORK_BASE` | Nein | `10.20` | Netzwerk-Prefix für Tenant-IPs |
| `WEBAPP_IONOS_API_KEY` | **Ja** | – | IONOS DNS API-Key (Public.Secret Format) |
| `WEBAPP_DNS_TTL` | Nein | `300` | DNS-TTL in Sekunden |
| `WEBAPP_FEATURE_AUTO_DNS` | Nein | `true` | DNS-Einträge automatisch erstellen |

### Authentik SSO

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|-------------|
| `WEBAPP_AUTHENTIK_URL` | Nein | – | Authentik-Instanz-URL (z. B. `https://auth.example.com`) |
| `WEBAPP_AUTHENTIK_CLIENT_ID` | Nein | – | OIDC Client-ID |
| `WEBAPP_AUTHENTIK_CLIENT_SECRET` | Nein | – | OIDC Client-Secret |
| `WEBAPP_AUTHENTIK_SCOPE` | Nein | `openid email profile groups` | OAuth2-Scopes |
| `WEBAPP_AUTHENTIK_ADMIN_GROUP` | Nein | `gmz-admins` | Authentik-Gruppe für WebApp-Admins |
| `WEBAPP_SSO_ENABLED` | Nein | `false` | SSO aktivieren (erfordert Authentik-Konfiguration) |

### SMTP & Benachrichtigungen

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|-------------|
| `WEBAPP_SMTP_HOST` | Nein | – | SMTP-Server-Hostname |
| `WEBAPP_SMTP_PORT` | Nein | `587` | SMTP-Port |
| `WEBAPP_SMTP_USER` | Nein | – | SMTP-Benutzername |
| `WEBAPP_SMTP_PASSWORD` | Nein | – | SMTP-Passwort |
| `WEBAPP_SMTP_FROM` | Nein | – | Absender-Adresse (z. B. `GMZ Cloud <noreply@example.com>`) |
| `WEBAPP_SMTP_TLS` | Nein | `true` | STARTTLS aktivieren |
| `WEBAPP_SMTP_REJECT_UNAUTHORIZED` | Nein | `true` | TLS-Zertifikat verifizieren |
| `WEBAPP_NOTIFY_TEAMS_WEBHOOK` | Nein | – | Teams-Webhook für Job-Benachrichtigungen |
| `WEBAPP_NOTIFY_ON_PROVISION` | Nein | `true` | Benachrichtigung bei neuem Tenant |
| `WEBAPP_NOTIFY_ON_ERROR` | Nein | `true` | Benachrichtigung bei Job-Fehler |

### Feature-Flags & Limits

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|-------------|
| `WEBAPP_MAX_TENANTS` | Nein | `50` | Maximale Anzahl Tenants |
| `WEBAPP_FEATURE_AUTO_DNS` | Nein | `true` | Automatische DNS-Einträge |
| `WEBAPP_FEATURE_AUTO_SNAPSHOT` | Nein | `true` | Automatische Snapshots vor Updates |
| `WEBAPP_FEATURE_NIGHTLY_UPDATES` | Nein | `true` | Nightly-Update-Workflow aktivieren |
| `WEBAPP_FEATURE_APP_CATALOG` | Nein | `true` | App-Katalog in UI anzeigen |
| `WEBAPP_FEATURE_BILLING` | Nein | `false` | Billing-Modul (experimentell) |
| `WEBAPP_MAINTENANCE_WINDOW_START` | Nein | `02:00` | Beginn Maintenance-Window (HH:MM) |
| `WEBAPP_MAINTENANCE_WINDOW_END` | Nein | `04:00` | Ende Maintenance-Window (HH:MM) |
| `WEBAPP_MAINTENANCE_TIMEZONE` | Nein | `Europe/Berlin` | Zeitzone für Maintenance-Window |

### Infrastruktur-Variablen (nicht WEBAPP_*)

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|-------------|
| `PROXMOX_URL` | **Ja** | – | Proxmox API-Endpunkt |
| `PROXMOX_TOKEN_ID` | **Ja** | – | API-Token-ID für OpenTofu |
| `PROXMOX_TOKEN_SECRET` | **Ja** | – | API-Token-Secret für OpenTofu |
| `PROXMOX_NODE` | **Ja** | – | Proxmox-Node-Name |
| `IONOS_API_KEY` | **Ja** | – | IONOS DNS API-Key für Traefik ACME |
| `BASE_DOMAIN` | **Ja** | – | Basis-Domain für alle Apps |
| `AUTHENTIK_SECRET_KEY` | **Ja** | – | Authentik Django Secret Key |
| `AUTHENTIK_DOMAIN` | **Ja** | – | Öffentliche Authentik-Domain |
| `GRAFANA_ADMIN_PASSWORD` | **Ja** | – | Initialer Grafana-Admin-Passwort |
| `GRAFANA_DOMAIN` | **Ja** | – | Öffentliche Grafana-Domain |
| `ALERTMANAGER_TEAMS_WEBHOOK` | Nein | – | Teams-Webhook für Alertmanager |
| `SMTP_HOST` | Nein | – | SMTP-Host für Alertmanager |
| `SMTP_PORT` | Nein | `587` | SMTP-Port für Alertmanager |
| `SMTP_USER` | Nein | – | SMTP-User für Alertmanager |
| `SMTP_PASSWORD` | Nein | – | SMTP-Passwort für Alertmanager |

---

## Anhang

### Nützliche Befehle (Quick Reference)

```bash
# WebApp Status
systemctl status gmz-webapp
journalctl -u gmz-webapp -f

# Alle Container-Status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Tenant-VM-Liste
qm list | grep -v "^  *100 "

# Logs eines Ansible-Jobs
tail -f /opt/gmz/logs/ansible/$(ls -t /opt/gmz/logs/ansible/ | head -1)

# Proxmox-Cluster-Status
pvecm status

# Backup-Status
pbs-client list --repository backup@10.10.10.5:gmz-backups

# Traefik-Zertifikate
docker exec traefik cat /acme/acme.json | python3 -m json.tool | grep -A2 '"main"'

# Authentik-Status
docker exec authentik-server ak check
```

### Versionsverlauf

| Version | Datum | Änderungen |
|---------|-------|-----------|
| 1.0.0 | 2026-03-09 | Initiale Version |

---

*Dieses Dokument wird automatisch bei größeren Plattform-Updates aktualisiert. Für Fragen und Verbesserungsvorschläge bitte ein Issue im Repository eröffnen.*
