# GMZ Cloud Business Apps – Vollständiges Handbuch

**Version 2.0.0 | März 2026**

> **Dieses Dokument ist die EINZIGE offizielle Anlaufstelle** für Installation, Administration und Benutzung von GMZ Cloud Business Apps.
> Alle anderen READMEs und Teilanleitungen verweisen hierher.

---

## Inhaltsverzeichnis

- [Teil I: Installation & Erstkonfiguration](#teil-i-installation--erstkonfiguration)
  - [1. Überblick](#1-überblick)
  - [2. Voraussetzungen](#2-voraussetzungen)
  - [3. Debian 13 installieren](#3-debian-13-installieren)
  - [4. Management-VM einrichten](#4-management-vm-einrichten)
  - [5. Traefik deployen](#5-traefik-deployen)
  - [6. Monitoring Stack deployen](#6-monitoring-stack-deployen)
  - [7. WebApp deployen](#7-webapp-deployen)
  - [8. Ersten Tenant provisionieren](#8-ersten-tenant-provisionieren)
  - [9. Apps deployen](#9-apps-deployen)
  - [10. Authentik SSO einrichten](#10-authentik-sso-einrichten)
  - [11. Nightly Updates einrichten](#11-nightly-updates-einrichten)
- [Teil II: Admin-Handbuch](#teil-ii-admin-handbuch)
  - [12. Tenants verwalten](#12-tenants-verwalten)
  - [13. Apps verwalten](#13-apps-verwalten)
  - [14. Benutzer & Rollen (RBAC)](#14-benutzer--rollen-rbac)
  - [15. Monitoring & Alerting](#15-monitoring--alerting)
  - [16. Wartung & Updates](#16-wartung--updates)
  - [17. Sicherheits-Konfiguration](#17-sicherheits-konfiguration)
- [Teil III: Benutzerhandbuch](#teil-iii-benutzerhandbuch)
  - [18. Erste Schritte](#18-erste-schritte)
  - [19. Tenant-Übersicht](#19-tenant-übersicht)
  - [20. Apps nutzen](#20-apps-nutzen)
  - [21. Support & Troubleshooting (Endbenutzer)](#21-support--troubleshooting-endbenutzer)
- [Teil IV: Referenz](#teil-iv-referenz)
  - [22. Troubleshooting (technisch)](#22-troubleshooting-technisch)
  - [23. Umgebungsvariablen-Referenz](#23-umgebungsvariablen-referenz)
  - [24. Schnell-Referenz](#24-schnell-referenz)

---

# Teil I: Installation & Erstkonfiguration

## 1. Überblick

### Was ist GMZ Cloud Business Apps?

GMZ Cloud Business Apps ist eine selbst gehostete Multi-Tenant-Plattform zur Verwaltung und Bereitstellung von Cloud-Geschäftsanwendungen. Über ein zentrales Web-Portal (Control Plane) können IT-Administratoren Mandanten (Tenants) anlegen, Geschäftsanwendungen aus einem Katalog deployen und den Betrieb überwachen – alles auf eigener Infrastruktur, ohne Abhängigkeit von externen Cloud-Anbietern.

**Kernfunktionen:**
- Multi-Tenant-Verwaltung mit isolierten VMs pro Mandant
- App-Katalog mit 35 vorkonfigurierten Geschäftsanwendungen (Nextcloud, Mattermost, Metabase, Twenty CRM, …)
- Automatische TLS-Zertifikate via Let's Encrypt (DNS-01, Wildcard)
- Integriertes Monitoring (Prometheus, Grafana, Loki)
- SSO-Integration via Authentik (OIDC)
- Vollständig automatisiertes Provisioning via Ansible + OpenTofu

### Architektur

```
┌─────────────────────────────────────────────────────────────────────┐
│                          INTERNET                                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS (443) / HTTP (80)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       PROXMOX VE 8.x NODE                           │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              MANAGEMENT-VM (Debian 13, gmzadmin)             │   │
│  │                                                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │   │
│  │  │   Traefik    │  │  GMZ WebApp  │  │  Monitoring      │  │   │
│  │  │  (Reverse    │  │  (Next.js    │  │  Prometheus       │  │   │
│  │  │   Proxy +    │  │   Port 3000) │  │  Grafana          │  │   │
│  │  │   TLS)       │  │              │  │  Loki             │  │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────────────────┘  │   │
│  │         │                 │                                   │   │
│  │         │ Route /         │ Ansible / API                    │   │
│  └─────────┼─────────────────┼───────────────────────────────── ┘   │
│            │                 │                                        │
│  ┌─────────┼─────────────────┼────────────────────────────────────┐ │
│  │  VLAN 20 (Tenant-Netz)    │                                     │ │
│  │         │                 ▼                                     │ │
│  │  ┌──────▼─────────────────────────────────────────────────┐   │ │
│  │  │  Tenant-VMs (Debian 13, Cloud-Init, User: debian)       │   │ │
│  │  │                                                          │   │ │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │ │
│  │  │  │  Tenant A   │  │  Tenant B   │  │  Tenant C   │    │   │ │
│  │  │  │  (Nextcloud │  │  (Gitea,    │  │  (Vault-    │    │   │ │
│  │  │  │   Vault-    │  │   Nextcloud)│  │   warden)   │    │   │ │
│  │  │  │   warden)   │  │             │  │             │    │   │ │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘    │   │ │
│  │  └──────────────────────────────────────────────────────── ┘   │ │
│  └─────────────────────────────────────────────────────────────── ┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Tech-Stack

| Komponente        | Technologie                          | Zweck                                  |
|-------------------|--------------------------------------|----------------------------------------|
| Control Plane UI  | Next.js 14 (React)                   | Web-Interface für Admins               |
| Reverse Proxy     | Traefik v3                           | TLS-Terminierung, Routing              |
| Provisioning      | Ansible + OpenTofu                   | VM-Erstellung und -Konfiguration       |
| Hypervisor        | Proxmox VE 8.x                       | VM-Verwaltung                          |
| Tenant-OS         | Debian 13 "Trixie" (Cloud-Init)      | Basis-System für Tenant-VMs            |
| Container Runtime | Docker CE + Docker Compose v2        | App-Container auf Tenant-VMs           |
| Monitoring        | Prometheus + Grafana + Loki          | Metriken, Dashboards, Logs             |
| SSO               | Authentik                            | OIDC-Provider für alle Apps            |
| TLS-Zertifikate   | Let's Encrypt DNS-01 (IONOS API)     | Wildcard-Zertifikate                   |
| DNS               | IONOS DNS API                        | Automatische DNS-Einträge              |

---

## 2. Voraussetzungen

### 2.1 Hardware

#### Proxmox-Node (Hypervisor)

| Komponente | Minimum       | Empfohlen          |
|------------|---------------|--------------------|
| CPU        | 8 Kerne       | 16+ Kerne          |
| RAM        | 32 GB         | 64 GB+             |
| Disk       | 500 GB SSD    | 1–2 TB NVMe        |
| Netzwerk   | 1 GbE         | 10 GbE             |
| OS         | Proxmox VE 8.x | Proxmox VE 8.2+   |

#### Management-VM (Control Plane)

| Komponente | Minimum  | Empfohlen   |
|------------|----------|-------------|
| vCPU       | 2        | 4–8         |
| RAM        | 4 GB     | 8–16 GB     |
| Disk       | 40 GB    | 60–100 GB   |
| OS         | Debian 13 "Trixie" | Debian 13 |

#### Tenant-VMs (Größenklassen)

| Größe | vCPU | RAM   | Disk   | Empfohlen für              |
|-------|------|-------|--------|----------------------------|
| XS    | 1    | 1 GB  | 20 GB  | Einzelne leichte App       |
| S     | 2    | 2 GB  | 40 GB  | 1–2 Apps (z.B. Vaultwarden)|
| M     | 2    | 4 GB  | 60 GB  | Standard (Nextcloud etc.)  |
| L     | 4    | 8 GB  | 100 GB | Mehrere Apps, viele Nutzer |
| XL    | 8    | 16 GB | 200 GB | Intensive Workloads        |

### 2.2 Netzwerk

#### VLAN-Setup

| VLAN | ID | Beschreibung                                | Subnetz           |
|------|----|---------------------------------------------|-------------------|
| Mgmt | 10 | Management-VM, Proxmox-API                  | 10.10.10.0/24     |
| Tenant | 20 | Tenant-VMs (isoliert, kein direkter Zugang) | 10.20.0.0/16    |
| Public | – | Öffentliche IP für Traefik (Port 80/443)   | je nach Provider  |

#### DNS-Konfiguration (Wildcard)

Für automatische Tenant-Subdomains wird ein DNS-Wildcard-Eintrag benötigt:

```
*.tenants.example.com  → A  →  <Public-IP der Management-VM>
mgmt.example.com       → A  →  <Public-IP der Management-VM>
```

> **IONOS DNS API:** Das Projekt nutzt den IONOS DNS API-Provider für Traefik, um DNS-01 Challenges für Let's Encrypt Wildcard-Zertifikate automatisch zu lösen. Kein manuelles DNS-Update nötig.

#### Firewall-Ports (auf der Management-VM)

| Port | Protokoll | Richtung | Zweck                    |
|------|-----------|----------|--------------------------|
| 22   | TCP       | Eingehend | SSH-Zugang (nur Admin)   |
| 80   | TCP       | Eingehend | HTTP (Traefik → HTTPS)   |
| 443  | TCP       | Eingehend | HTTPS (Traefik)          |

> Alle anderen Ports sind per UFW blockiert. Tenant-VMs sind nicht direkt aus dem Internet erreichbar.

### 2.3 API-Keys beschaffen

#### Proxmox API-Token

1. In der Proxmox-Weboberfläche: **Datacenter → API Tokens → Add**
2. User: `root@pam` oder dedizierter API-User
3. Token-Name: `gmz-webapp`
4. Berechtigungen: `VM.Allocate`, `VM.Clone`, `VM.Config.*`, `VM.PowerMgmt`, `Datastore.AllocateSpace`, `SDN.Use`
5. Token-Secret notieren (wird nur einmal angezeigt)

Format im .env: `PROVISION_PROXMOX_API_TOKEN=user@pve!tokenname=secret`

#### IONOS DNS API-Key

1. IONOS Developer-Portal: https://developer.hosting.ionos.de/
2. API-Schlüssel erstellen (Prefix + Secret)
3. Format: `IONOS_API_KEY=PREFIX.SECRET`

#### SMTP-Zugangsdaten (optional, für Benachrichtigungen)

Wird für Authentik und App-Benachrichtigungen benötigt:
- SMTP-Host, Port, User, Passwort
- TLS-Einstellung (StartTLS oder SSL/TLS)

---

## 3. Debian 13 installieren

Debian 13 "Trixie" ist ab März 2026 der aktuelle Stable-Zweig.
Offizielle Downloadseite: https://www.debian.org/distrib/

### 3.1 Option A: Bare-Metal / ISO-Installation

#### Schritt 1: ISO herunterladen

```bash
# Als gmzadmin (auf einem beliebigen Linux-System):
wget https://cdimage.debian.org/cdimage/release/current/amd64/iso-cd/debian-13.0.0-amd64-netinst.iso
```

> Aktuelle ISO-URL immer auf https://www.debian.org/distrib/ prüfen. Bei Trixie als Stable-Release lautet der Pfad wie oben. Als tägliches Build (falls noch Testing):
> `https://cdimage.debian.org/cdimage/daily-builds/daily/arch-latest/amd64/iso-cd/debian-testing-amd64-netinst.iso`

SHA256-Prüfsumme verifizieren:
```bash
# Als gmzadmin:
sha256sum debian-13.0.0-amd64-netinst.iso
# Vergleichen mit: https://cdimage.debian.org/cdimage/release/current/amd64/iso-cd/SHA256SUMS
```

#### Schritt 2: Bootmedium erstellen

**Unter Linux (dd):**
```bash
# Als root (ACHTUNG: /dev/sdX durch das korrekte USB-Gerät ersetzen!):
dd if=debian-13.0.0-amd64-netinst.iso of=/dev/sdX bs=4M status=progress
sync
```

**Unter Windows:** Rufus (https://rufus.ie) oder Ventoy (https://www.ventoy.net)

#### Schritt 3: Debian-Installer durchlaufen

Booten Sie vom USB-Medium. Im Installer:

1. **Sprache:** Deutsch
2. **Ort:** Deutschland
3. **Tastaturbelegung:** Deutsch
4. **Hostname:** `mgmt-vm` (oder Wunschname, z.B. `gmz-mgmt`)
5. **Domäne:** Ihre Domain, z.B. `example.com`
6. **Root-Passwort:** Stark wählen (min. 20 Zeichen, Sonderzeichen). Root-Login wird später deaktiviert.
7. **Neuen Benutzer anlegen:**
   - Vollständiger Name: `GMZ Admin`
   - Benutzername: `gmzadmin`
   - Passwort: Sicher wählen
8. **Partitionierung:**
   - Methode: „Geführt – gesamte Festplatte verwenden mit LVM"
   - Separate `/home`-Partition: **Nein** (alles auf `/`)
   - LVM bestätigen: **Ja**
   - Alle Änderungen auf Disk schreiben: **Ja**
9. **Paketquellen:** Deutschland / deb.debian.org
10. **Beliebtheitswettbewerb:** Nach Wunsch
11. **Softwareauswahl:** **NUR** folgende anklicken:
    - ☑ SSH-Server
    - ☑ Standard-Systemwerkzeuge
    - **KEIN Desktop** (GNOME, KDE etc. abwählen!)
12. **GRUB:** Auf `/dev/sda` (oder das Haupt-Laufwerk) installieren

#### Schritt 4: Neustart

System neu starten, USB-Medium entfernen.

#### Schritt 5: Erster SSH-Login

```bash
# Vom eigenen Rechner (als normaler Nutzer):
ssh gmzadmin@<IP-der-Management-VM>
```

#### Schritt 6: sudo installieren (falls nicht bereits vorhanden)

Wenn `sudo` nicht verfügbar ist (minimales Debian-Install):

```bash
# Als root (su - um Root-Session zu öffnen):
su -
apt install -y sudo
usermod -aG sudo gmzadmin
exit
# Neu einloggen damit Gruppe aktiv wird:
exit
ssh gmzadmin@<IP>
```

---

### 3.2 Option B: Proxmox-VM aus ISO (für Management-VM)

Diese Option ist geeignet, wenn die Management-VM direkt auf dem Proxmox-Hypervisor laufen soll.

#### Schritt 1: ISO in Proxmox hochladen

1. Proxmox-Weboberfläche öffnen: `https://<proxmox-ip>:8006`
2. **Storage** (z.B. `local`) → **ISO Images** → **Upload**
3. Debian 13 ISO hochladen

#### Schritt 2: VM in Proxmox erstellen

In der Proxmox-GUI: **Create VM**

| Einstellung       | Wert                                      |
|-------------------|-------------------------------------------|
| VM ID             | z.B. `100`                                |
| Name              | `mgmt-vm`                                 |
| ISO               | Debian 13 ISO (wie hochgeladen)           |
| Disk-Controller   | VirtIO SCSI                               |
| Disk-Größe        | 60–100 GB                                 |
| CPU               | 4–8 vCPU (Typ: host)                      |
| RAM               | 8–16 GB (kein Ballooning für Produktion)  |
| Netzwerk          | VirtIO, Bridge: vmbr0, VLAN-Tag: 10       |
| QEMU Agent        | Aktiviert                                 |

#### Schritt 3: VM starten und Debian installieren

VM starten → Konsole öffnen → Debian-Installer wie in [3.1 Schritt 3](#schritt-3-debian-installer-durchlaufen) beschrieben.

#### Schritt 4: QEMU Guest Agent installieren

Nach der Debian-Installation:

```bash
# Als gmzadmin:
sudo apt install -y qemu-guest-agent
sudo systemctl enable --now qemu-guest-agent
```

Danach in der Proxmox-GUI: VM → **Summary** → IP-Adresse sollte sichtbar sein.

---

### 3.3 Debian 13 Cloud-Init-Template für Tenant-VMs erstellen

Dieses Template (VMID 9000) wird als Basis für alle Tenant-VMs geklont. Es muss **einmalig auf dem Proxmox-Node** eingerichtet werden.

```bash
# Als root auf dem Proxmox-Node:
cd /var/lib/vz/template/iso/

# Debian 13 Generic Cloud Image herunterladen
wget https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2

# Checksumme prüfen (empfohlen):
wget https://cloud.debian.org/images/cloud/trixie/latest/SHA512SUMS
sha512sum -c SHA512SUMS --ignore-missing

# VM erstellen (VMID 9000)
qm create 9000 \
  --name debian13-cloud-template \
  --memory 2048 \
  --cores 2 \
  --net0 virtio,bridge=vmbr0 \
  --serial0 socket \
  --vga serial0 \
  --scsihw virtio-scsi-pci \
  --agent enabled=1

# Disk importieren (in den lokalen LVM-Storage)
qm importdisk 9000 debian-13-genericcloud-amd64.qcow2 local-lvm

# Disk anschließen + Boot-Reihenfolge setzen
qm set 9000 \
  --scsi0 local-lvm:vm-9000-disk-0,discard=on \
  --ide2 local-lvm:cloudinit \
  --boot order=scsi0 \
  --ipconfig0 ip=dhcp

# Cloud-Init konfigurieren
# (Hinweis: SSH-Key hier eintragen, damit Ansible sich verbinden kann)
qm set 9000 \
  --ciuser debian \
  --sshkeys /root/.ssh/authorized_keys \
  --ciupgrade 1

# Als Template konvertieren (Template kann nicht mehr gestartet werden, nur geklont!)
qm template 9000

echo "✅ Template VMID 9000 erfolgreich erstellt."
```

> **Wichtig:** Der Standard-Benutzer in Tenant-VMs ist `debian` (Debian Cloud-Init Standard). Ansible-Playbooks verwenden diesen Benutzer: `ansible_user=debian`.

---

## 4. Management-VM einrichten

Alle folgenden Schritte werden auf der Management-VM ausgeführt. Der interaktive Installations-Wizard (`ops/scripts/install-wizard.sh`) kann die Schritte 4.6–4.11 automatisieren.

### 4.1 System aktualisieren

```bash
# Als gmzadmin:
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y curl wget git jq unzip htop tmux vim
```

### 4.2 Benutzer gmzadmin einrichten (falls nicht im Installer angelegt)

Dieser Schritt ist nur nötig, wenn `gmzadmin` nicht bereits während der Debian-Installation angelegt wurde.

```bash
# Als root:
useradd -m -s /bin/bash gmzadmin
# sudo: für sudo-Befehle | adm: für journalctl ohne sudo (Logs lesen)
usermod -aG sudo,adm gmzadmin
passwd gmzadmin

# SSH-Key hinterlegen (eigenen Public Key eintragen!)
mkdir -p /home/gmzadmin/.ssh
echo "ssh-ed25519 AAAA...IHR_PUBLIC_KEY hier@rechner" >> /home/gmzadmin/.ssh/authorized_keys
chmod 700 /home/gmzadmin/.ssh
chmod 600 /home/gmzadmin/.ssh/authorized_keys
chown -R gmzadmin:gmzadmin /home/gmzadmin/.ssh
```

### 4.3 SSH härten

> **⚠️ WICHTIG:** Stellen Sie **vor** diesem Schritt sicher, dass der SSH-Key-Login als `gmzadmin` funktioniert! Nach dem Deaktivieren der Passwort-Authentifizierung ist kein Passwort-Login mehr möglich.

```bash
# Als gmzadmin:
sudo tee /etc/ssh/sshd_config.d/10-hardening.conf << 'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
AllowTcpForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
sudo systemctl restart ssh
```

**Testen (in einem anderen Terminal, bevor das aktuelle geschlossen wird):**
```bash
# Als gmzadmin (vom eigenen Rechner, neues Terminal):
ssh -o PasswordAuthentication=no gmzadmin@<IP>
# → Muss ohne Passwort funktionieren
```

### 4.4 UFW-Firewall einrichten

```bash
# Als gmzadmin:
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP Traefik'
sudo ufw allow 443/tcp comment 'HTTPS Traefik'
sudo ufw --force enable
sudo ufw status verbose
```

Erwartete Ausgabe:
```
Status: active
To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere  (SSH)
80/tcp                     ALLOW IN    Anywhere  (HTTP Traefik)
443/tcp                    ALLOW IN    Anywhere  (HTTPS Traefik)
```

### 4.5 Automatische Sicherheitsupdates

```bash
# Als gmzadmin:
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Im Dialog „Automatische Updates aktivieren?" → **Ja** auswählen.

### 4.6 Docker installieren

Docker wird über das offizielle Docker-Repository installiert (nicht das veraltete Paket aus Debian-Quellen).

```bash
# Als gmzadmin:
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# gmzadmin zur docker-Gruppe hinzufügen (WICHTIG!)
# Nach dieser Zeile ist KEIN sudo mehr für docker-Befehle nötig.
sudo usermod -aG docker gmzadmin

# Gruppe in aktueller Shell aktivieren (oder neu einloggen):
newgrp docker

# Verifizieren – KEIN sudo!
docker run --rm hello-world
docker compose version
```

> **Hinweis:** Nach `newgrp docker` oder nach einem Neustart/Re-Login sind alle Docker-Befehle als `gmzadmin` ohne `sudo` ausführbar. Dies ist der korrekte Betrieb.

### 4.7 OpenTofu installieren

OpenTofu ist der Open-Source-Fork von Terraform und wird für die VM-Provisionierung auf Proxmox verwendet.

```bash
# Als gmzadmin:
TOFU_VERSION="1.7.0"
ARCH=$(dpkg --print-architecture)
curl -fsSL "https://github.com/opentofu/opentofu/releases/download/v${TOFU_VERSION}/tofu_${TOFU_VERSION}_${ARCH}.deb" \
  -o /tmp/opentofu.deb
sudo dpkg -i /tmp/opentofu.deb
rm /tmp/opentofu.deb

# Verifizieren:
tofu version
# Erwartete Ausgabe: OpenTofu v1.7.x
```

> Aktuelle Version prüfen: https://github.com/opentofu/opentofu/releases

### 4.8 Ansible installieren

Ansible wird über `pipx` installiert (empfohlen, da keine Root-Rechte für die Installation selbst nötig sind und keine Konflikte mit System-Python entstehen).

```bash
# Als gmzadmin:
sudo apt install -y python3 python3-pip pipx
pipx install --include-deps ansible
pipx ensurepath

# Neue Shell starten oder PATH neu laden:
source ~/.bashrc

# Verifizieren:
ansible --version
# Erwartete Ausgabe: ansible [core 2.16.x]

# Benötigte Collections installieren:
ansible-galaxy collection install community.docker community.general
```

### 4.9 Node.js 22 LTS installieren

Die WebApp benötigt Node.js **22 LTS** (Minimum). Node 22 wird für `--experimental-strip-types`
(natives TypeScript-Ausführen ohne Build-Schritt) und die npm-Scripts in `package.json` benötigt.
Node.js 20 reicht **nicht** aus.

```bash
# Als gmzadmin:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verifizieren:
node --version   # → v22.x.x
npm --version    # → 10.x.x
```

### 4.10 Repository klonen

```bash
# Als gmzadmin:
# Verzeichnis erstellen (sudo für /opt/, dann Eigentümer auf gmzadmin setzen):
sudo mkdir -p /opt/gmz
sudo chown gmzadmin:gmzadmin /opt/gmz

# Repository klonen – KEIN sudo!
git clone https://github.com/bumblebob-gmz/gmz-cloud-business-apps-greenfield.git /opt/gmz
cd /opt/gmz

# Verzeichnisrechte prüfen:
ls -la /opt/gmz/
# → Alle Einträge sollten gmzadmin:gmzadmin gehören
```

### 4.11 Umgebungsvariablen (.env) konfigurieren

```bash
# Als gmzadmin – KEIN sudo:
cp /opt/gmz/platform/webapp/.env.example /opt/gmz/platform/webapp/.env
chmod 600 /opt/gmz/platform/webapp/.env

# .env befüllen (Pflichtfelder, siehe Tabelle unten):
nano /opt/gmz/platform/webapp/.env
```

**Mindest-.env für Produktionsbetrieb:**

```bash
# ─── Authentifizierung ──────────────────────────────────────────────
# Für Produktion: trusted-bearer (API-Token-Authentifizierung)
# Optionen: trusted-bearer | jwt | none (nur Dev!)
WEBAPP_AUTH_MODE=trusted-bearer

# Admin-API-Token (sicher generieren: openssl rand -hex 32)
WEBAPP_TRUSTED_TOKENS_JSON='[{"tokenId":"tok-admin","userId":"platform-admin","role":"admin","token":"IHR_SICHERER_TOKEN_HIER","expiresAt":"2027-01-01T00:00:00Z"}]'

# ─── Sicherheit ─────────────────────────────────────────────────────
# Verschlüsselungsschlüssel für Benachrichtigungen (32 Byte hex)
WEBAPP_NOTIFICATION_ENCRYPTION_KEY=IHR_32_BYTE_SCHLUESSEL

# ─── Proxmox API ────────────────────────────────────────────────────
PROVISION_PROXMOX_ENDPOINT=https://proxmox.example.com:8006/api2/json
PROVISION_PROXMOX_API_TOKEN=root@pam!gmz-webapp=IHR_TOKEN_SECRET
PROVISION_PROXMOX_NODE=pve

# ─── Tenant-Template ────────────────────────────────────────────────
PROVISION_TEMPLATE_VMID=9000
PROVISION_TENANT_VLAN=20

# ─── SSH-Key für Tenant-VMs ─────────────────────────────────────────
PROVISION_SSH_PUBLIC_KEY=ssh-ed25519 AAAA...IHR_PUBLIC_KEY

# ─── Domain-Konfiguration ───────────────────────────────────────────
WEBAPP_BASE_DOMAIN=example.com
WEBAPP_TENANT_SUBDOMAIN_TEMPLATE=*.tenants.example.com

# ─── Umgebung ───────────────────────────────────────────────────────
NODE_ENV=production
```

Token sicher generieren:
```bash
# Als gmzadmin – KEIN sudo:
openssl rand -hex 32
# → Ausgabe als WEBAPP_TRUSTED_TOKENS_JSON-Token verwenden
```

> **Sicherheit:** Die `.env`-Datei enthält Secrets und muss mit `chmod 600` geschützt sein. Sie darf **niemals** in Git committet werden (ist in `.gitignore` eingetragen).

---

## 5. Traefik deployen

Traefik übernimmt TLS-Terminierung, HTTP→HTTPS-Weiterleitung und das Routing zu den Tenant-Apps. Die Konfiguration erfolgt über Ansible.

### 5.1 Sudo-Berechtigung einrichten (einmalig, Pflicht!)

Das Ansible-Playbook setzt Datei-Eigentümer und Berechtigungen als `root` (z. B. `acme.json` mit `0600`). Dafür braucht Ansible `become: true` (sudo-Eskalation). **Das muss einmalig eingerichtet werden:**

```bash
# Als gmzadmin – einmalig passwordless-sudo einrichten:
echo "gmzadmin ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/10-gmzadmin
chmod 440 /etc/sudoers.d/10-gmzadmin

# Prüfen:
sudo id
# → uid=0(root) ...
```

> **Alternativ** (ohne passwordless-sudo): `--ask-become-pass` an jeden `ansible-playbook`-Befehl anhängen — dann wird das sudo-Passwort einmalig pro Aufruf abgefragt.

### 5.2 Inventory-Datei anlegen

```bash
# Als gmzadmin:
cd /opt/gmz

# Inventory-Datei für die Management-VM anlegen (einmalig, nicht in Git):
cp automation/ansible/inventory/management.ini.example \
   automation/ansible/inventory/management.ini

# Datei prüfen / ggf. Benutzer anpassen:
cat automation/ansible/inventory/management.ini
```

### 5.3 Traefik deployen

```bash
# Als gmzadmin (passwordless-sudo muss konfiguriert sein):
ansible-playbook automation/ansible/deploy-traefik.yml \
  -e acme_email=admin@example.com \
  -e ionos_api_key=PREFIX.SECRET \
  -i automation/ansible/inventory/management.ini

# Alternativ mit Passwort-Prompt (wenn kein passwordless-sudo):
ansible-playbook automation/ansible/deploy-traefik.yml \
  -e acme_email=admin@example.com \
  -e ionos_api_key=PREFIX.SECRET \
  -i automation/ansible/inventory/management.ini \
  --ask-become-pass
```

**Was das Playbook macht:**
1. Traefik-Konfigurationsverzeichnis anlegen
2. `traefik.yml` (statische Konfiguration) schreiben
3. IONOS DNS-Provider für Let's Encrypt konfigurieren
4. Wildcard-Zertifikat für `*.tenants.example.com` und `mgmt.example.com` anfordern
5. Traefik als Docker-Container starten

**Traefik-Status prüfen:**
```bash
# Als gmzadmin – KEIN sudo für docker:
docker ps | grep traefik
docker logs traefik --tail 50
```

**Zertifikat-Status prüfen:**
```bash
# Als gmzadmin – KEIN sudo für docker:
docker exec traefik cat /etc/traefik/acme.json | python3 -m json.tool | grep -A2 "main"
```

---

## 6. Monitoring Stack deployen

Prometheus, Grafana und Loki werden als Docker-Compose-Stack auf der Management-VM betrieben.

> **Wichtig:** Vor dem Start des Monitoring-Stacks `.env` aus `.env.example` erstellen und alle Pflichtfelder setzen:
> ```bash
> cp infra/monitoring/.env.example infra/monitoring/.env
> chmod 600 infra/monitoring/.env
> nano infra/monitoring/.env
> # Pflicht: GRAFANA_ADMIN_PASSWORD, ALERTMANAGER_OPS_EMAIL,
> #          ALERTMANAGER_SMTP_HOST, ALERTMANAGER_SMTP_USER, ALERTMANAGER_SMTP_PASS
> ```

```bash
# Als gmzadmin – KEIN sudo für docker (gmzadmin ist in docker-Gruppe!):
cd /opt/gmz/infra/monitoring

# Stack starten:
docker compose up -d

# Status prüfen:
docker compose ps
```

Erwartete Container:
```
NAME                STATUS    PORTS
prometheus          running   9090/tcp
grafana             running   3001/tcp
loki                running   3100/tcp
promtail            running
alertmanager        running   9093/tcp
```

**Erste Anmeldung Grafana:**
- URL: `https://monitoring.example.com` (via Traefik) oder direkt `http://<IP>:3001`
- Benutzer: `admin`
- Passwort: in `infra/monitoring/.env` konfigurieren (Variable `GRAFANA_ADMIN_PASSWORD`)

```bash
# Als gmzadmin – KEIN sudo:
echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 24)" >> /opt/gmz/infra/monitoring/.env
chmod 600 /opt/gmz/infra/monitoring/.env
docker compose restart grafana
```

---

## 7. WebApp deployen

### 7.1 Dependencies installieren und bauen

```bash
# Als gmzadmin – KEIN sudo:
cd /opt/gmz/platform/webapp
npm ci
npm run build
```

> **Hinweis:** `npm run build` führt `next build` aus. Die Anwendung wird anschließend mit `npm run start` (= `next start`) gestartet. Es gibt **kein** `dist/server.js` – der Start erfolgt ausschließlich über `npm run start`.

### 7.2 Datenbank-Modus wählen

Die WebApp unterstützt zwei Storage-Backends:

| Modus | Wann | Konfiguration |
|-------|------|---------------|
| **Dateibasiert** (Standard) | Entwicklung / erste Einrichtung | `DATABASE_URL` nicht gesetzt → `.data/store.json` |
| **PostgreSQL** (Produktion) | Mehrere Nutzer, persistente Daten | `DATABASE_URL=postgresql://user:pass@host:5432/db` |

**Für Produktionsbetrieb: PostgreSQL einrichten**
```bash
# Als gmzadmin – KEIN sudo:
# DATABASE_URL in .env setzen, dann Migration ausführen:
cd /opt/gmz/platform/webapp
npm run db:migrate        # Schema anlegen (ohne Seed-Daten)
# oder:
npm run db:migrate:seed   # Schema anlegen + Demo-Daten einspielen
```

> **Hinweis:** Ohne `DATABASE_URL` wird `.data/store.json` verwendet. Diese Datei ist
> **nicht für Concurrent-Zugriffe unter Last geeignet** — nur für Einzelinstanz-Dev-Betrieb.

### 7.3 Daten-Verzeichnis erstellen (nur Datei-Modus)

```bash
# Als gmzadmin – KEIN sudo:
# /opt/gmz gehört gmzadmin (gesetzt in Schritt 4.10) → mkdir braucht kein sudo!
mkdir -p /opt/gmz/data
chmod 750 /opt/gmz/data
```

### 7.4 systemd-Service einrichten

```bash
# Als gmzadmin (sudo für systemd):
sudo tee /etc/systemd/system/gmz-webapp.service << 'EOF'
[Unit]
Description=GMZ Cloud Business Apps WebApp
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=gmzadmin
Group=gmzadmin
WorkingDirectory=/opt/gmz/platform/webapp
EnvironmentFile=/opt/gmz/platform/webapp/.env
ExecStart=/usr/bin/npm run start
Environment=NODE_ENV=production
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gmz-webapp
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable gmz-webapp
sudo systemctl start gmz-webapp
sudo systemctl status gmz-webapp
```

Erwartete Ausgabe:
```
● gmz-webapp.service - GMZ Cloud Business Apps WebApp
     Loaded: loaded (/etc/systemd/system/gmz-webapp.service; enabled)
     Active: active (running) since ...
```

**WebApp-Logs live verfolgen:**
```bash
# Als gmzadmin (kein sudo nötig wenn gmzadmin in adm-Gruppe – siehe Schritt 4.2):
journalctl -u gmz-webapp -f
```

**WebApp erreichbar unter:**
- Direkt: `http://localhost:3000` (nur lokal)
- Via Traefik: `https://mgmt.example.com`

---

## 8. Ersten Tenant provisionieren

### 8.1 Über die WebApp (empfohlen)

1. WebApp öffnen: `https://mgmt.example.com`
2. Mit Admin-API-Token einloggen (aus `.env`: `WEBAPP_TRUSTED_TOKENS_JSON`)
3. **Tenants** → **Neuer Tenant**
4. Pflichtfelder ausfüllen:
   - **Name:** Eindeutiger Bezeichner (z.B. `kunde-gmbh`)
   - **Anzeigename:** z.B. `Kunde GmbH`
   - **Größe:** XS / S / M / L / XL (siehe Tabelle in 2.1)
   - **VLAN-ID:** Automatisch vergeben oder manuell (20–4094)
   - **Admin-E-Mail:** E-Mail des Tenant-Admins
5. **Tenant erstellen** klicken

Der Provisioning-Job wird gestartet und durchläuft folgende Phasen:
```
pending → provisioning → configuring → active
```

### 8.2 Provisioning-Prozess (im Hintergrund)

Was automatisch passiert:
1. **OpenTofu** klont VM aus Template VMID 9000 in Proxmox
2. **Cloud-Init** konfiguriert Hostname, SSH-Key, Netzwerk auf der neuen VM
3. **Ansible** (`provision-tenant.yml`) installiert auf der Tenant-VM:
   - Docker (`roles/docker-runtime`: installiert `docker.io` + `docker-compose-v2`)
   - Common Hardening (`roles/common-hardening`: SSH-Härtung, Updates)
   - Traefik-Konfiguration für Tenant-Subdomain
4. DNS-Eintrag wird über IONOS API angelegt

> **Crash-Recovery:** Beim Start der WebApp läuft automatisch `lib/job-recovery.ts` und
> setzt Jobs, die länger als 30 Minuten im Status `Running` oder `Queued` hängen, auf
> `Failed` zurück. So bleiben nach einem Server-Neustart keine Zombie-Jobs offen.

### 8.3 Job-Status verfolgen

In der WebApp: **Tenants** → Tenant auswählen → **Jobs** Tab

Oder per CLI:
```bash
# Als gmzadmin (kein sudo wenn in adm-Gruppe – siehe Schritt 4.2):
journalctl -u gmz-webapp -f | grep -i "tenant\|provision"
```

---

## 9. Apps deployen

### 9.1 App aus dem Katalog deployen

1. WebApp: **Tenants** → Tenant auswählen → **Apps** → **App deployen**
2. App aus dem Katalog wählen (z.B. `nextcloud`, `vaultwarden`, `mattermost`, `metabase`, `plane`, `twenty-crm`)
3. App-spezifische Variablen konfigurieren:
   - Domains werden automatisch vorgeschlagen: `nextcloud.tenants.example.com`
   - Admin-Passwort setzen
   - Speichergröße wählen
4. **Deployen** klicken

### 9.2 Katalog-Apps

Verfügbare Apps befinden sich unter `catalog/apps/`. Jede App hat eine `app.yaml` mit Metadaten und eine `compose.template.yml` für das Docker-Compose-Template.

**35 Apps in 14 Kategorien:**

#### Collaboration & Produktivität

| App-Slug      | Name            | Beschreibung                              | Min-VM |
|---------------|-----------------|-------------------------------------------|--------|
| `authentik`   | Authentik        | SSO / Identity Provider (OIDC)           | M      |
| `nextcloud`   | Nextcloud        | Datei-Cloud, Kalender, Kontakte           | M      |
| `mattermost`  | Mattermost       | Team-Chat, Channels, Bots                 | M      |
| `huly`        | Huly             | All-in-One: Projekt, Chat, Docs           | L      |

#### Projektmanagement

| App-Slug     | Name      | Beschreibung                                  | Min-VM |
|--------------|-----------|-----------------------------------------------|--------|
| `plane`      | Plane     | Issues, Cycles, Modules (Linear-Style)        | M      |
| `vikunja`    | Vikunja   | Aufgaben, Listen, Kanban, Gantt               | S      |
| `taiga`      | Taiga     | Agiles PM: Scrum, Kanban, Epics               | M      |
| `leantime`   | Leantime  | PM für Teams ohne PM-Erfahrung                | S      |
| `planka`     | Planka    | Kanban-Board à la Trello                      | XS     |

#### CRM & Finanzen

| App-Slug        | Name           | Beschreibung                       | Min-VM |
|-----------------|----------------|------------------------------------|--------|
| `twenty-crm`    | Twenty CRM      | Modernes Open-Source CRM           | M      |
| `espocrm`       | EspoCRM         | CRM mit Workflows & Portalen       | S      |
| `invoiceninja`  | Invoice Ninja   | Rechnungen, Angebote, Zeiterfassung| S      |
| `akaunting`     | Akaunting       | Buchhaltung, Rechnungen, Berichte  | S      |

#### HR & Organisation

| App-Slug     | Name       | Beschreibung                            | Min-VM |
|--------------|------------|-----------------------------------------|--------|
| `orangehrm`  | OrangeHRM  | HR-Management, Urlaub, Performance      | M      |
| `opencats`   | OpenCATS   | Applicant Tracking System (ATS)         | S      |

#### Dokumente & Wissen

| App-Slug       | Name          | Beschreibung                         | Min-VM |
|----------------|---------------|--------------------------------------|--------|
| `paperless-ngx`| Paperless-ngx | Dokumenten-Scan, OCR, Archiv         | S      |
| `bookstack`    | BookStack     | Wiki, Bücher, Kapitel, Seiten        | S      |
| `wiki-js`      | Wiki.js       | Modernes Wiki mit vielen Editoren    | S      |
| `documenso`    | Documenso     | Dokument-Signatur (DocuSign-Ersatz)  | S      |
| `outline`      | Outline       | Team-Wissensdatenbank mit SSO        | M      |
| `docmost`      | Docmost       | Confluence-ähnliches Wiki            | S      |

#### Sicherheit & IT-Tools

| App-Slug       | Name          | Beschreibung                          | Min-VM |
|----------------|---------------|---------------------------------------|--------|
| `vaultwarden`  | Vaultwarden   | Passwort-Manager (Bitwarden-kompatibel)| XS   |
| `snipe-it`     | Snipe-IT      | Asset-Management, Lizenzen, Zubehör   | S      |
| `it-tools`     | IT-Tools      | Dev-Toolbox (100+ Web-Werkzeuge)      | XS     |
| `stirling-pdf` | Stirling PDF  | PDF-Werkzeugset (40+ Operationen)     | XS     |

#### Notizen & Sync

| App-Slug | Name          | Beschreibung                          | Min-VM |
|----------|---------------|---------------------------------------|--------|
| `joplin` | Joplin Server | Notizen-Sync für Joplin-Clients       | XS     |

#### Helpdesk

| App-Slug      | Name        | Beschreibung                              | Min-VM |
|---------------|-------------|-------------------------------------------|--------|
| `peppermint`  | Peppermint  | Helpdesk & Ticketsystem (Freshdesk-Ersatz)| S      |

#### Umfragen

| App-Slug      | Name        | Beschreibung                              | Min-VM |
|---------------|-------------|-------------------------------------------|--------|
| `limesurvey`  | LimeSurvey  | Umfrage-Software, 30+ Fragetypen          | S      |

#### Produktivität

| App-Slug    | Name      | Beschreibung                                  | Min-VM |
|-------------|-----------|-----------------------------------------------|--------|
| `appflowy`  | AppFlowy  | Notion/Linear-Ersatz, Docs, Kanban, KI        | M      |

#### Analytics

| App-Slug   | Name      | Beschreibung                              | Min-VM |
|------------|-----------|-------------------------------------------|--------|
| `metabase` | Metabase  | Business Intelligence, Dashboards, SQL    | M      |
| `umami`    | Umami     | DSGVO-konforme Web-Analyse, kein Cookie   | XS     |

#### Übersetzung & KI

| App-Slug        | Name           | Beschreibung                          | Min-VM |
|-----------------|----------------|---------------------------------------|--------|
| `searxng`       | SearXNG        | Datenschutz-freundliche Metasuche     | XS     |
| `libretranslate`| LibreTranslate | Selbst gehostete Übersetzungs-API     | S      |
| `openwebui`     | Open WebUI     | KI-Chat-Frontend für Ollama & OpenAI  | S      |
| `ollama`        | Ollama         | LLM-Runtime für lokale KI-Modelle    | XL     |

### 9.3 Deploy-Job verfolgen

**Tenant** → **Jobs** Tab → Job auswählen → Live-Log

---

## 10. Authentik SSO einrichten

Authentik wird als OIDC-Provider für alle Tenant-Apps und optional für die GMZ WebApp selbst eingesetzt.

### 10.1 Authentik als App deployen

Authentik wird wie jede andere App über den Katalog deployed (Schritt 9). Empfehlung: Als eigene „System"-App außerhalb eines Tenants auf der Management-VM.

```bash
# Als gmzadmin – KEIN sudo für docker:
cd /opt/gmz/infra/authentik
docker compose up -d
docker compose ps
```

### 10.2 Authentik Admin-Account einrichten

1. Authentik öffnen: `https://auth.example.com`
2. Ersten Start-Wizard durchlaufen
3. Admin-Passwort setzen
4. E-Mail-Integration konfigurieren (SMTP-Settings)

### 10.3 OIDC-Provider für GMZ WebApp konfigurieren

In Authentik:
1. **Applications** → **Providers** → **Create** → OAuth2/OpenID Connect Provider
2. Name: `gmz-webapp`
3. Client ID: notieren
4. Client Secret: notieren
5. Redirect URI: `https://mgmt.example.com/api/auth/callback/authentik`

In `.env` der WebApp:
```bash
# Als gmzadmin – KEIN sudo:
nano /opt/gmz/platform/webapp/.env
```

Hinzufügen:
```bash
WEBAPP_AUTH_MODE=jwt
NEXTAUTH_URL=https://mgmt.example.com
NEXTAUTH_SECRET=IHR_NEXTAUTH_SECRET
AUTHENTIK_CLIENT_ID=IHR_CLIENT_ID
AUTHENTIK_CLIENT_SECRET=IHR_CLIENT_SECRET
AUTHENTIK_ISSUER=https://auth.example.com/application/o/gmz-webapp/
```

```bash
# Als gmzadmin (sudo für systemd-Neustart):
sudo systemctl restart gmz-webapp
```

### 10.4 OIDC-Gruppen → WebApp-Rollen

Authentik-Gruppen werden auf WebApp-Rollen gemappt:

| Authentik-Gruppe | WebApp-Rolle  | Berechtigungen                    |
|------------------|---------------|-----------------------------------|
| `gmz-admins`     | `admin`       | Vollzugriff, Tenant-Verwaltung    |
| `gmz-operators`  | `technician`  | Tenant-Ops, App-Verwaltung        |
| `gmz-readonly`   | `readonly`    | Nur Lesen, keine Änderungen       |

---

## 11. Nightly Updates einrichten

### 11.1 GitHub Actions Workflow

Im Repository unter `.github/workflows/nightly-update.yml` ist ein Workflow definiert, der:
1. Jeden Tag um 02:00 Uhr läuft
2. Alle Docker-Images auf neue Versionen prüft
3. Änderungen als PR öffnet (optional)
4. Auf der Management-VM deployt (via SSH-Action)

### 11.2 Proxmox VM-Snapshots vor Updates

```bash
# Als root auf dem Proxmox-Node (vor jedem Update):
# Snapshot der Management-VM erstellen:
qm snapshot <VMID> "pre-update-$(date +%Y%m%d)" --vmstate 0

# Snapshot der Tenant-VMs (Beispiel):
for vmid in $(qm list | awk 'NR>1 {print $1}' | grep -v "^9000$"); do
  qm snapshot $vmid "pre-update-$(date +%Y%m%d)" --vmstate 0
  echo "Snapshot für VM $vmid erstellt"
done
```

### 11.3 Rollback nach fehlgeschlagenem Update

```bash
# Als root auf dem Proxmox-Node:
# Snapshot wiederherstellen:
qm rollback <VMID> "pre-update-YYYYMMDD"
qm start <VMID>
```

---

# Teil II: Admin-Handbuch

## 12. Tenants verwalten

### Tenant anlegen

**Pflichtfelder:**
| Feld          | Beschreibung                              | Beispiel           |
|---------------|-------------------------------------------|--------------------|
| `name`        | Technischer Name (lowercase, kein Leerzeichen) | `kunde-gmbh`  |
| `displayName` | Anzeigename                               | `Kunde GmbH`       |
| `size`        | VM-Größe (XS/S/M/L/XL)                   | `M`                |
| `adminEmail`  | E-Mail des Tenant-Admins                  | `it@kunde.de`      |

**Optionale Felder:**
| Feld       | Beschreibung                  | Standard           |
|------------|-------------------------------|--------------------|
| `vlanId`   | VLAN-ID (20–4094)             | Automatisch        |
| `ipv4Cidr` | IP-Bereich für Tenant         | `10.20.X.0/24`     |
| `notes`    | Notizen für Admins            | –                  |

### Tenant-Status verstehen

| Status         | Bedeutung                                              |
|----------------|--------------------------------------------------------|
| `pending`      | Provisioning in Warteschlange                          |
| `provisioning` | VM wird gerade erstellt (OpenTofu)                    |
| `configuring`  | Ansible konfiguriert die VM                            |
| `active`       | Bereit, Apps können deployed werden                   |
| `updating`     | Update oder Konfigurationsänderung läuft               |
| `error`        | Fehler beim Provisioning (Details im Job-Log)          |
| `suspended`    | Manuell deaktiviert (VM läuft, Apps nicht erreichbar)  |
| `terminated`   | Gelöscht (VM zerstört, Daten gelöscht)                 |

### Tenant deaktivieren (Suspend)

WebApp: **Tenants** → Tenant → **Aktionen** → **Deaktivieren**

Effekt: Traefik-Routing wird entfernt, Apps nicht mehr erreichbar. VM läuft weiter.

### Tenant löschen

> ⚠️ **Unwiderruflich!** Alle Daten werden gelöscht!

WebApp: **Tenants** → Tenant → **Aktionen** → **Löschen**
→ Bestätigungsdialog: Tenant-Namen eingeben

Was gelöscht wird:
- Proxmox-VM (und alle Disks)
- DNS-Einträge
- Monitoring-Konfiguration
- Alle App-Daten

**Vorher empfohlen:** Backup erstellen (Proxmox-Snapshot oder Backup-Job).

### VLAN- und IP-Verwaltung

VLANs und IP-Bereiche werden automatisch vergeben:
- VLAN-Range: 2–4094 (validiert in WebApp und Terraform)
- IP-Schema: `10.<VLAN-ID>.10.<host-suffix>/24` — z.B. VLAN 120 → `10.120.10.100/24`
- Der Host-Suffix (Standard: `100`) ist über `ip_host_suffix` im Terraform-Modul konfigurierbar,
  um bei Bedarf mehrere VMs pro VLAN zu unterstützen

Manuelle Anpassung möglich in: **Tenant** → **Netzwerk** → **Bearbeiten**

### Logs eines Tenants abrufen

**Via WebApp:** Tenant → **Events**-Tab

**Via CLI (Management-VM):**
```bash
# Als gmzadmin (kein sudo wenn in adm-Gruppe – siehe Schritt 4.2):
journalctl -u gmz-webapp -f | grep "tenant-name"
```

**Direkter Zugriff auf Tenant-VM (via SSH):**
```bash
# Als gmzadmin – KEIN sudo für SSH:
ssh -i ~/.ssh/id_ed25519 debian@<tenant-vm-ip>
# debian ist der Cloud-Init Standard-User auf Tenant-VMs!
```

---

## 13. Apps verwalten

### App aus Katalog deployen

1. **Tenant** auswählen → **Apps** → **+ App deployen**
2. App aus Liste wählen
3. Konfigurationsformular ausfüllen
4. **Deployen** klicken → Job-Status verfolgen

### App-Konfiguration ändern

**WebApp:** App → **Konfiguration** → Felder ändern → **Speichern**

Die Änderung wird als neuer Deploy-Job ausgeführt (Rolling Restart).

### App neu starten / stoppen

**WebApp:** App → **Aktionen** → **Neustart** / **Stoppen** / **Starten**

**Direkt auf der Tenant-VM:**
```bash
# Als gmzadmin auf der Management-VM (SSH zur Tenant-VM):
ssh debian@<tenant-vm-ip>
# Auf der Tenant-VM als debian:
# HINWEIS: Die Ansible-Rolle docker-runtime fügt 'debian' nicht zur docker-Gruppe hinzu.
# Docker-Befehle auf Tenant-VMs daher mit sudo ausführen!
cd /opt/apps/nextcloud
sudo docker compose restart
sudo docker compose ps
```

### App-Logs abrufen

**WebApp:** App → **Logs** Tab (Live-Streaming)

**CLI auf Tenant-VM:**
```bash
# Als gmzadmin (SSH zur Tenant-VM, dann dort):
ssh debian@<tenant-vm-ip>
# Auf der Tenant-VM: docker benötigt sudo (debian ist nicht in docker-Gruppe):
cd /opt/apps/<app-name>
sudo docker compose logs -f --tail 100
```

### App löschen / Daten sichern

> ⚠️ **Vor dem Löschen immer Backup erstellen!**

**Backup (auf Tenant-VM):**
```bash
# Auf der Tenant-VM als debian (docker mit sudo!):
cd /opt/apps/<app-name>
sudo docker compose stop
tar -czf /tmp/<app-name>-backup-$(date +%Y%m%d).tar.gz data/
# Backup auf Management-VM kopieren:
scp /tmp/<app-name>-backup-*.tar.gz gmzadmin@<mgmt-ip>:/opt/gmz/backups/
```

**App löschen:**
WebApp: App → **Aktionen** → **Löschen** → Bestätigen

---

## 14. Benutzer & Rollen (RBAC)

### Rollen

| Rolle       | Beschreibung                                     | Erlaubte Aktionen                              |
|-------------|--------------------------------------------------|------------------------------------------------|
| `admin`     | Vollständiger Systemzugriff                      | Alles: Tenants, Apps, Benutzer, Konfiguration  |
| `technician`| Technischer Operator                             | Tenants/Apps verwalten, keine Benutzer-Admin   |
| `readonly`  | Nur-Lesen-Zugriff                                | Alles anzeigen, nichts ändern                  |

### API-Token erstellen

**Modus: `trusted-bearer`**

In `.env`:
```bash
WEBAPP_TRUSTED_TOKENS_JSON='[
  {"tokenId":"tok-admin","userId":"platform-admin","role":"admin","token":"IHR_ADMIN_TOKEN","expiresAt":"2027-01-01T00:00:00Z"},
  {"tokenId":"tok-monitoring","userId":"monitoring-svc","role":"readonly","token":"IHR_MONITORING_TOKEN","expiresAt":"2027-01-01T00:00:00Z"},
  {"tokenId":"tok-cicd","userId":"cicd-pipeline","role":"technician","token":"IHR_CICD_TOKEN","expiresAt":"2027-01-01T00:00:00Z"}
]'
```

Token generieren:
```bash
# Als gmzadmin – KEIN sudo:
openssl rand -hex 32
```

Nach Änderung der `.env`:
```bash
# Als gmzadmin (sudo für systemd):
sudo systemctl restart gmz-webapp
```

### Token-Rotation ohne Downtime

1. Neuen Token generieren: `openssl rand -hex 32`
2. In `.env` alten und neuen Token **gleichzeitig** eintragen (temporär zwei Tokens mit gleicher Rolle)
3. Service neu starten: `sudo systemctl restart gmz-webapp`
4. Alle Clients auf neuen Token umstellen
5. Alten Token aus `.env` entfernen
6. Service neu starten

### Modus: `jwt` (OIDC mit Authentik)

Bei `WEBAPP_AUTH_MODE=jwt` werden Authentik-Gruppen auf Rollen gemappt (siehe [Abschnitt 10.4](#104-oidc-gruppen--webapp-rollen)).

---

## 15. Monitoring & Alerting

### Grafana-Dashboards öffnen

URL: `https://monitoring.example.com` oder `http://<IP>:3001`

Vorkonfigurierte Dashboards:
- **GMZ Overview:** Alle Tenants, VM-Status, CPU/RAM-Übersicht
- **Tenant Detail:** Ressourcen einer einzelnen Tenant-VM
- **App Health:** Container-Status aller Apps
- **Traefik:** HTTP-Anfragen, Response-Times, Error-Rates
- **System:** Management-VM CPU, RAM, Disk

### Alert-Regeln konfigurieren

Alert-Regeln liegen in `infra/monitoring/prometheus/alerts/`:

```yaml
# Beispiel: infra/monitoring/prometheus/alerts/tenant.yml
groups:
  - name: tenant-alerts
    rules:
      - alert: TenantVMDown
        expr: up{job="tenant"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Tenant VM {{ $labels.instance }} ist nicht erreichbar"
```

Nach Änderungen:
```bash
# Als gmzadmin – KEIN sudo für docker:
cd /opt/gmz/infra/monitoring
docker compose restart prometheus
```

### Microsoft Teams-Webhook einrichten

In `infra/monitoring/alertmanager/config.yml`:

```yaml
receivers:
  - name: 'teams-alerts'
    msteams_configs:
      - webhook_url: 'https://outlook.office.com/webhook/...'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
```

```bash
# Als gmzadmin – KEIN sudo für docker:
docker compose restart alertmanager
```

### Prometheus-Scraping-Targets prüfen

```bash
# Als gmzadmin – KEIN sudo für docker:
docker exec prometheus wget -qO- 'http://localhost:9090/api/v1/targets' \
  | python3 -m json.tool | grep -E '"health"|"scrapeUrl"'
```

Oder in Grafana: **Explore** → **Prometheus** → `up` → Alle Targets anzeigen

### Log-Suche in Loki/Grafana

Grafana → **Explore** → Datasource: Loki

Beispiel-Queries:
```
# Alle WebApp-Logs:
{job="gmz-webapp"}

# Fehler eines bestimmten Tenants:
{job="tenant", tenant="kunde-gmbh"} |= "error"

# Letzte 1h Traefik-Logs:
{job="traefik"} | json | status >= 500
```

---

## 16. Wartung & Updates

### Management-VM updaten

```bash
# Als gmzadmin:
sudo apt update && sudo apt full-upgrade -y
sudo apt autoremove -y
sudo systemctl restart gmz-webapp
```

**Nach Kernel-Updates:** Neustart empfohlen:
```bash
# Als gmzadmin:
sudo reboot
# (SSH-Verbindung kurz unterbrochen, dann neu verbinden)
```

### WebApp updaten

```bash
# Als gmzadmin – KEIN sudo:
cd /opt/gmz
git pull origin main
cd platform/webapp
npm ci
npm run build

# Als gmzadmin (sudo für systemd):
sudo systemctl restart gmz-webapp
sudo systemctl status gmz-webapp
```

**Update mit Zero-Downtime (empfohlen für Produktion):**
1. Neuen Build vorbereiten, während alter Service läuft
2. Kurzes Maintenance-Fenster (<30s) für `systemctl restart`

### Monitoring Stack updaten

```bash
# Als gmzadmin – KEIN sudo für docker:
cd /opt/gmz/infra/monitoring
docker compose pull
docker compose up -d
docker compose ps
```

### Token rotieren

Siehe [Abschnitt 14: Token-Rotation ohne Downtime](#token-rotation-ohne-downtime).

### Proxmox-Snapshot erstellen und prüfen

```bash
# Als root auf dem Proxmox-Node:
# Snapshot erstellen:
qm snapshot 100 "manual-$(date +%Y%m%d-%H%M)" --vmstate 0

# Snapshots auflisten:
qm listsnapshot 100

# Snapshot testen (VM klonen, testen, dann löschen):
qm clone 100 999 --name "test-restore-$(date +%Y%m%d)" --snapname "manual-YYYYMMDD-HHmm"
qm start 999
# ... testen ...
qm stop 999
qm destroy 999
```

### Backup-Strategie

**Tier 1: Proxmox Backup Server (PBS)**
```bash
# Als root auf Proxmox-Node (Backup-Job konfigurieren):
# GUI: Datacenter → Backup → Add
# Schedule: täglich, z.B. 03:00 Uhr
# Retention: 7 täglich, 4 wöchentlich, 3 monatlich
```

**Tier 2: S3/MinIO Offsite-Backup**
- PBS kann direkt in S3-kompatiblen Storage sichern
- Konfiguration: PBS → Remotes → S3 konfigurieren

**Kritische Daten:**
- `/opt/gmz/platform/webapp/.env` → Manuell sichern (enthält Secrets!)
- `/opt/gmz/data/` → Datenbank und App-Daten
- Proxmox-VM-Backups aller Tenant-VMs

---

## 17. Sicherheits-Konfiguration

### Bearer-Token-Sicherheit

- Tokens mit `openssl rand -hex 32` generieren (256 Bit Entropie)
- Verschiedene Tokens für verschiedene Rollen/Systeme
- Tokens **niemals** in Logs ausgeben oder in Git committen
- Rotation: mindestens alle 90 Tage oder bei Verdacht auf Kompromittierung

### gitleaks Pre-commit Hook

Verhindert versehentliches Committen von Secrets:

```bash
# Als gmzadmin – KEIN sudo:
cd /opt/gmz

# gitleaks installieren:
curl -fsSL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_linux_x64.tar.gz \
  | tar xz -C /tmp/
sudo mv /tmp/gitleaks /usr/local/bin/
sudo chmod +x /usr/local/bin/gitleaks

# Pre-commit Hook installieren:
cat > .git/hooks/pre-commit << 'HOOK'
#!/bin/bash
gitleaks protect --staged -v
HOOK
chmod +x .git/hooks/pre-commit
```

### Checkov IaC-Scanning

```bash
# Als gmzadmin – KEIN sudo:
pip3 install --user checkov

# Terraform/OpenTofu-Konfigurationen scannen:
checkov -d infra/ --framework terraform

# Docker-Compose-Dateien scannen:
checkov -d catalog/apps/ --framework dockerfile,docker_compose
```

### Container-Sicherheit: Non-Root User & Privilege Escalation

Alle App-Stacks im Katalog sind mit zwei Schutzebenen gehärtet:

#### Schutzebene 1: `no-new-privileges` (universell, alle Services)

Jeder Container im Katalog hat `security_opt: [no-new-privileges:true]` gesetzt.
Das verhindert Privilege Escalation via `setuid`/`setgid`-Bits, selbst wenn ein Prozess
initial als root läuft.

```yaml
# Beispiel — gilt für jeden Service:
services:
  my-app:
    image: example/app:1.0
    security_opt:
      - no-new-privileges:true
```

#### Schutzebene 2: Expliziter `user:` pro Image-Typ

Je nach Image-Design gibt es drei Kategorien:

**Kategorie A — Expliziter `user:` in Compose (UID fest gesetzt):**

| Image | UID:GID | Basis |
|-------|---------|-------|
| `vaultwarden/server` | `1000:1000` | offizielle Doku |
| `outlinewiki/outline` | `1000:1000` | nodejs-User im Image |
| `docmost/docmost` | `1000:1000` | nodejs-User |
| `joplin/server` | `1000:1000` | nodejs-User |
| `ghcr.io/plankanban/planka` | `1000:1000` | nodejs-User |
| `vikunja/vikunja` | `1000:1000` | offizielle Doku |
| `ghcr.io/requarks/wiki` | `1000:1000` | nodejs-User |
| `ghcr.io/umami-software/umami` | `1000:1000` | nextjs-User |
| `peppermint/peppermint` | `1000:1000` | nodejs-User |
| `stirlingtools/stirling-pdf` | `1000:1000` | offizielle Doku |
| `mattermost/mattermost-team-edition` | `2000:2000` | `mattermost`-User |
| `metabase/metabase` | `2000:2000` | `metabase`-User |
| `postgres:*` | `999:999` | `postgres`-User |
| `redis:*` | `999:999` | `redis`-User |
| `mariadb:*` / `mysql:*` | `999:999` | `mysql`-User |
| `mongo:*` | `999:999` | `mongodb`-User |

> **Volumes:** Wenn ein Container mit explizitem `user:` auf ein Volume schreibt,
> muss das Volume-Verzeichnis auf dem Host dem gleichen UID gehören.
> Die Ansible-Rollen (`catalog-deployer`, `authentik-bootstrap`) legen Verzeichnisse
> mit korrekten Berechtigungen an — **manuell erstellte Volumes** müssen entsprechend
> `chown`-ed werden:
> ```bash
> # Beispiel für UID 1000:
> sudo chown -R 1000:1000 /opt/gmz/apps/vikunja/
> ```

**Kategorie B — Privilege-Drop via Umgebungsvariablen:**

Diese Images starten als root und wechseln intern den User. Statt `user:` werden
spezielle Env-Variablen gesetzt:

| Image | Methode | Env-Variablen |
|-------|---------|---------------|
| `lscr.io/linuxserver/bookstack` | PUID/PGID | `PUID: "1000"`, `PGID: "1000"` |
| `ghcr.io/paperless-ngx/paperless-ngx` | USERMAP | `USERMAP_UID: "1000"`, `USERMAP_GID: "1000"` |

> Die entsprechenden Env-Vars sind in den `compose.template.yml`-Dateien bereits
> gesetzt. Bei Deployment über `catalog-deployer` werden sie via `app_configs` übergeben.

**Kategorie C — Root erforderlich oder intern geregelt (kein `user:` Override):**

| Image / App | Grund |
|-------------|-------|
| `nextcloud` | Startet als root, setzt Volume-Permissions, wechselt zu `www-data` (UID 33) |
| `ollama/ollama` | Root/Privileged für GPU-Hardware-Zugriff ggf. nötig |
| `ghcr.io/goauthentik/server` | Drops intern zu UID 1000 — `user:` Override würde Init brechen |
| `ghcr.io/open-webui/open-webui` | Root für Initialisierung, danach Drop |
| `tecnativa/docker-socket-proxy` | Root für Docker-Socket-Zugriff erforderlich |
| `taigaio/*`, `makeplane/*` | Multi-Process-Init als root, interne Drops |
| `hardcoreeng/*` (Huly) | Komplexer Startup, interner User-Switch |
| PHP-Apps (espocrm, orangehrm, akaunting, invoiceninja, opencats, limesurvey, leantime) | Apache/PHP-FPM braucht root für Port-Binding, wechselt zu `www-data` |
| `appflowyinc/appflowy-cloud` | Rust-Service, root für Init |
| `twentycrm/twenty` | Init als root |
| `searxng/searxng` | Searxng-User intern, Override würde Config-Read brechen |
| `corentinth/it-tools` | Nginx-User intern (UID 101) |

> Alle Kategorie-C-Container profitieren trotzdem von `no-new-privileges:true` (Schutzebene 1).

#### Härtungs-Status prüfen

```bash
# Alle Container ohne security_opt finden:
grep -rL "no-new-privileges" catalog/apps/*/compose.template.yml

# Alle root-laufenden Container auf einem Tenant prüfen:
ssh debian@<TENANT_IP> \
  "docker ps -q | xargs docker inspect --format '{{.Name}}: User={{.Config.User}}'"

# Effektiven UID eines laufenden Containers prüfen:
docker exec <container> id
```

---

### Sicherheits-Checkliste (vor Go-Live)

- [ ] SSH: Root-Login deaktiviert (`PermitRootLogin no`)
- [ ] SSH: Passwort-Authentifizierung deaktiviert (`PasswordAuthentication no`)
- [ ] UFW: Nur Ports 22, 80, 443 offen
- [ ] `.env`: `chmod 600`, Besitzer `gmzadmin`
- [ ] `.env`: Nicht in Git vorhanden (`.gitignore` prüfen)
- [ ] API-Tokens: Stark und zufällig generiert (min. 32 Byte)
- [ ] Proxmox API-Token: Minimale Berechtigungen
- [ ] Docker: `gmzadmin` in `docker`-Gruppe (kein `sudo docker`)
- [ ] Let's Encrypt: Gültiges Wildcard-Zertifikat aktiv
- [ ] Monitoring: Alerts für kritische Systeme konfiguriert
- [ ] Backup: Proxmox-Backup-Job aktiv und getestet
- [ ] gitleaks: Pre-commit Hook installiert
- [ ] unattended-upgrades: Aktiv für Sicherheitsupdates
- [ ] Container: `no-new-privileges:true` in allen Stacks gesetzt (via Katalog-Templates)
- [ ] Container: `user:` korrekt für DB-Sidecars (999:999) und App-Services (1000:1000 / 2000:2000)
- [ ] SSH: `ssh_allowed_source` in Ansible-Inventory auf Management-VM-IP gesetzt

---

# Teil III: Benutzerhandbuch

## 18. Erste Schritte

### Was ist das Mandanten-Portal?

Das GMZ Cloud Business Apps Portal ist das zentrale Verwaltungs-Interface für IT-Administratoren. Von hier aus können Sie:

- **Tenants (Mandanten)** anlegen und verwalten – jeder Tenant ist eine isolierte virtuelle Maschine
- **Geschäftsanwendungen** aus einem Katalog deployen (Nextcloud, Vaultwarden, etc.)
- **Ressourcen** überwachen (CPU, RAM, Disk-Auslastung)
- **Benutzer und Zugriffsrechte** verwalten

### Login

**URL:** `https://mgmt.example.com` (durch Ihre tatsächliche Domain ersetzen)

**Anmeldung je nach konfiguriertem Auth-Modus:**

- **trusted-bearer:** API-Token im Header `Authorization: Bearer IHR_TOKEN`
- **jwt/OIDC:** Klick auf „Mit Authentik anmelden" → Authentik-Loginseite

### Dashboard-Überblick

Nach dem Login sehen Sie das Dashboard mit:

| Bereich           | Beschreibung                                           |
|-------------------|--------------------------------------------------------|
| **Tenant-Karten** | Übersicht aller Mandanten mit Status-Anzeige           |
| **Status-Badges** | Grün = aktiv, Gelb = aktualisiert, Rot = Fehler        |
| **Schnellaktionen** | Neuer Tenant, App deployen, Logs anzeigen           |
| **Ressourcen-Leiste** | Gesamt-CPU, RAM, Disk-Nutzung über alle Tenants    |
| **Letzte Events** | Neueste Provisioning- und Deploy-Jobs                  |

---

## 19. Tenant-Übersicht

### Status-Bedeutungen

| Status         | Symbol | Bedeutung                                    | Aktion                            |
|----------------|--------|----------------------------------------------|-----------------------------------|
| `provisioning` | 🔄     | VM wird gerade erstellt                      | Warten (5–10 Min)                 |
| `active`       | ✅     | Bereit, Apps können deployed werden          | Apps deployen                     |
| `updating`     | 🔄     | Konfigurationsänderung läuft                 | Warten                            |
| `error`        | ❌     | Fehler aufgetreten                           | Job-Log prüfen, Admin kontaktieren|
| `suspended`    | ⏸️     | Manuell deaktiviert                          | „Aktivieren" klicken              |

### Ressourcen-Anzeige

In der Tenant-Detailansicht:

- **CPU:** Aktuelle Last in % (Durchschnitt letzte 5 Min)
- **RAM:** Belegter Arbeitsspeicher (Belegt / Gesamt)
- **Disk:** Genutzter Speicherplatz (Belegt / Gesamt)
- **Netzwerk:** Ein-/Ausgehender Traffic (letzte Stunde)

> Wenn Ressourcen dauerhaft über 80% liegen: Tenant-Größe upgraden (Tenant → Bearbeiten → Größe ändern).

### App-Liste und App-Status

Tenant → **Apps** Tab:

| Status     | Bedeutung                              |
|------------|----------------------------------------|
| `running`  | App läuft normal                       |
| `stopped`  | App manuell gestoppt                   |
| `error`    | App-Container in Fehler-Zustand        |
| `deploying`| Installation/Update läuft             |
| `updating` | Konfigurationsänderung oder Update     |

### Event-Log lesen

Tenant → **Events** Tab zeigt alle Aktionen chronologisch:

```
[2026-03-10 14:23] INFO  Provisioning gestartet (Size: M)
[2026-03-10 14:24] INFO  Proxmox-VM erstellt (VMID: 115)
[2026-03-10 14:26] INFO  Cloud-Init abgeschlossen
[2026-03-10 14:28] INFO  Ansible-Playbook erfolgreich (provision-tenant.yml)
[2026-03-10 14:28] INFO  Tenant aktiv
[2026-03-10 14:30] INFO  App 'nextcloud' deploy gestartet
[2026-03-10 14:33] INFO  App 'nextcloud' aktiv unter nextcloud.tenants.example.com
```

---

## 20. Apps nutzen

### App aufrufen

In der Tenant-Karte oder im Apps-Tab auf das 🔗 **Link-Icon** klicken → App öffnet sich in neuem Tab.

### Authentik-Login: Erstanmeldung

1. App-URL öffnen → Weiterleitung zu Authentik
2. Benutzername: durch Admin mitgeteilt (meist E-Mail-Adresse)
3. Passwort: Temporäres Passwort aus Willkommens-E-Mail
4. Passwort beim ersten Login ändern
5. MFA einrichten (empfohlen): **Konto** → **MFA** → TOTP-App (Authenticator) scannen

### Nextcloud: Erste Anmeldung

1. Nextcloud-URL aufrufen (z.B. `https://nextcloud.tenants.example.com`)
2. Mit Authentik einloggen (SSO)
3. Desktop-Client oder mobile App einrichten:
   - Serveradresse eingeben
   - Mit SSO anmelden
4. Erste Dateien hochladen:
   - Drag & Drop in das Browser-Fenster
   - Oder: **+ Neu** → **Datei hochladen**

### Vaultwarden: Browser-Extension einrichten

1. Bitwarden-Extension installieren (Chrome/Firefox/Edge)
2. In der Extension: **Server** → `https://vault.tenants.example.com`
3. Account erstellen oder einloggen
4. Extension für automatisches Ausfüllen konfigurieren

### App-spezifische Hilfe-Links

| App             | Offizielle Dokumentation                               |
|-----------------|--------------------------------------------------------|
| Nextcloud       | https://docs.nextcloud.com                             |
| Vaultwarden     | https://github.com/dani-garcia/vaultwarden/wiki        |
| Authentik       | https://docs.goauthentik.io                            |
| Mattermost      | https://docs.mattermost.com                            |
| Huly            | https://docs.huly.io                                   |
| Plane           | https://docs.plane.so                                  |
| Vikunja         | https://vikunja.io/docs/                               |
| Taiga           | https://docs.taiga.io                                  |
| Leantime        | https://docs.leantime.io                               |
| Twenty CRM      | https://twenty.com/developers                          |
| EspoCRM         | https://docs.espocrm.com                               |
| Invoice Ninja   | https://invoiceninja.github.io/en/docs/                |
| OrangeHRM       | https://opensource.orangehrm.com/                      |
| Paperless-ngx   | https://docs.paperless-ngx.com                         |
| BookStack       | https://www.bookstackapp.com/docs/                     |
| Wiki.js         | https://docs.requarks.io                               |
| Documenso       | https://docs.documenso.com                             |
| Snipe-IT        | https://snipe-it.readme.io/docs                        |
| Metabase        | https://www.metabase.com/docs/                         |
| Joplin Server   | https://joplinapp.org/help/                            |
| Ollama          | https://github.com/ollama/ollama/tree/main/docs        |
| Open WebUI      | https://docs.openwebui.com                             |

---

## 21. Support & Troubleshooting (Endbenutzer)

### App nicht erreichbar

1. **Warten und neu laden:** Kurzzeitige Unterbrechungen kommen vor (max. 1–2 Min)
2. **Status prüfen:** Admin fragen, ob Maintenance-Fenster aktiv ist
3. **Browser-Cache leeren:** Strg+F5 (Windows/Linux) oder Cmd+Shift+R (Mac)
4. **Anderen Browser testen:** Schließt Browser-spezifische Probleme aus
5. **Admin kontaktieren** (siehe unten)

### Admin kontaktieren

Folgende Informationen bereithalten:
- Welche App ist betroffen?
- Genaue Fehlermeldung (Screenshot)
- Uhrzeit, wann der Fehler aufgetreten ist
- Was Sie davor getan haben

### Häufige Fehler und Selbsthilfe

| Fehler                    | Mögliche Ursache             | Lösung                                   |
|---------------------------|------------------------------|------------------------------------------|
| „Verbindung abgelehnt"    | App gestoppt oder Fehler     | Admin informieren                        |
| SSL-Fehler / rotes Schloss | TLS-Zertifikat abgelaufen   | Admin informieren                        |
| Login funktioniert nicht  | Passwort falsch / gesperrt   | Passwort zurücksetzen via Authentik      |
| Upload schlägt fehl       | Datei zu groß                | Admin fragen nach Upload-Limit-Erhöhung  |
| „502 Bad Gateway"         | App-Container gestartet/gestoppt | Kurz warten, dann neu laden          |
| Seite lädt extrem langsam | Tenant-Ressourcen ausgeschöpft | Admin: VM upgraden                    |

---

# Teil IV: Referenz

## 22. Troubleshooting (technisch)

### Ansible: `sudo: Ein Passwort ist notwendig` / `Premature end of stream`

**Symptom:**
```
fatal: [localhost]: FAILED! => {"msg": "Premature end of stream waiting for become success.\n>>> Standard Error\nsudo: Ein Passwort ist notwendig"}
```

**Ursache:** Das Playbook verwendet `become: true` (Root-Eskalation). Der Ansible-User hat kein passwordless-sudo eingerichtet und das Passwort wurde nicht übergeben.

**Lösung A – Passwordless-sudo einrichten (empfohlen, einmalig):**
```bash
echo "gmzadmin ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/10-gmzadmin
chmod 440 /etc/sudoers.d/10-gmzadmin
# Test:
sudo id  # → uid=0(root)
```

**Lösung B – Passwort pro Aufruf angeben:**
```bash
ansible-playbook automation/ansible/deploy-traefik.yml \
  -e acme_email=admin@example.com \
  -e ionos_api_key=PREFIX.SECRET \
  -i automation/ansible/inventory/management.ini \
  --ask-become-pass   # ← Passwort wird einmalig abgefragt
```

**Wichtig:** `management.ini` muss existieren (aus Vorlage erstellen):
```bash
cp automation/ansible/inventory/management.ini.example \
   automation/ansible/inventory/management.ini
```

---

### Traefik: Kein TLS-Zertifikat

**Symptom:** Browser zeigt „Nicht sicher" oder SSL-Fehler.

**Diagnose:**
```bash
# Als gmzadmin – KEIN sudo für docker:
docker logs traefik 2>&1 | grep -i "acme\|cert\|error" | tail -20
docker exec traefik cat /etc/traefik/acme.json | python3 -m json.tool | grep -c "certificate"
```

**Ursachen und Lösungen:**

| Ursache                           | Lösung                                                          |
|-----------------------------------|-----------------------------------------------------------------|
| IONOS API-Key falsch               | `.env` prüfen: `IONOS_API_KEY=PREFIX.SECRET`                   |
| DNS-Wildcard nicht propagiert     | `dig *.tenants.example.com` → A-Record vorhanden?              |
| Let's Encrypt Rate-Limit erreicht | Bis zu 7 Tage warten (Staging nutzen für Tests)                |
| Traefik startet nicht             | `docker compose logs traefik` vollständig prüfen               |

**Let's Encrypt Staging für Tests:**
```bash
# Als gmzadmin – KEIN sudo für docker:
# In infra/traefik/traefik.yml:
# certificatesResolvers.letsencrypt.acme.caServer: https://acme-staging-v02.api.letsencrypt.org/directory
docker compose restart traefik
```

### Tenant-VM: Cloud-Init schlägt fehl

**Symptom:** Tenant bleibt in Status `provisioning`, VM antwortet nicht.

**Diagnose auf Proxmox-Node:**
```bash
# Als root auf dem Proxmox-Node:
qm status <VMID>
# Cloud-Init-Log aus VM holen (via Serial-Konsole):
qm terminal <VMID>
# In der Konsole:
cat /var/log/cloud-init-output.log
```

**Häufige Ursachen:**
- SSH-Key in Template nicht hinterlegt → `qm set 9000 --sshkeys ~/.ssh/authorized_keys`
- Netzwerk nicht erreichbar (VLAN-Config) → Proxmox VLAN-Tag prüfen
- Template VMID 9000 nicht vorhanden → Template neu erstellen (Abschnitt 3.3)

### Ansible: SSH-Verbindung schlägt fehl

**Symptom:** `ansible-playbook` schlägt mit „SSH connection failed" fehl.

```bash
# Als gmzadmin – KEIN sudo für ansible/ssh:
# Verbindung manuell testen:
ssh -i ~/.ssh/id_ed25519 debian@<tenant-vm-ip> -o ConnectTimeout=10

# Ansible verbose:
ansible-playbook automation/ansible/provision-tenant.yml \
  -i automation/ansible/inventory/tenant.ini \
  -vvv 2>&1 | head -50
```

**Inventory-Datei prüfen:**
```bash
# Als gmzadmin:
cat automation/ansible/inventory/tenant.ini.example
# → ansible_user=debian  (Debian Cloud-Init Default!)
```

**Häufige Ursachen:**
- `ansible_user=root` statt `debian` → korrigieren
- SSH-Key nicht auf Tenant-VM hinterlegt → Template prüfen (Abschnitt 3.3)
- Tenant-VM noch nicht gebootet → 30–60s warten

### WebApp: Service startet nicht

**Symptom:** `systemctl status gmz-webapp` zeigt `failed` oder `activating`.

```bash
# Als gmzadmin (sudo für systemctl, journalctl kein sudo wenn in adm-Gruppe):
sudo systemctl status gmz-webapp
journalctl -u gmz-webapp -n 50 --no-pager
```

**Häufige Ursachen:**

| Fehler in Logs                      | Lösung                                                         |
|-------------------------------------|----------------------------------------------------------------|
| `.env: file not found`              | `.env` anlegen: `cp .env.example .env && chmod 600 .env`      |
| `Port 3000 already in use`         | Anderen Prozess stoppen: `lsof -i :3000`                       |
| `MODULE_NOT_FOUND`                  | `npm ci && npm run build` erneut ausführen                     |
| `WEBAPP_AUTH_MODE is not set`      | `.env` prüfen, Pflichtfelder gesetzt?                          |
| Permission denied                   | WorkingDirectory und .env gehören `gmzadmin`?                  |

```bash
# Als gmzadmin:
# Rechte prüfen:
ls -la /opt/gmz/platform/webapp/.env
# → -rw------- 1 gmzadmin gmzadmin ...
ls -la /opt/gmz/platform/webapp/
# → Alles gmzadmin:gmzadmin
```

### Proxmox: API-Verbindung schlägt fehl

**Symptom:** Provisioning schlägt fehl mit „Proxmox API error" oder Timeout.

```bash
# Als gmzadmin – KEIN sudo:
# API-Verbindung testen:
curl -k -s \
  -H "Authorization: PVEAPIToken=root@pam!gmz-webapp=IHR_TOKEN" \
  https://proxmox.example.com:8006/api2/json/version
# → {"data":{"version":"8.x.x",...}}
```

**Häufige Ursachen:**
- API-Token-Format falsch: muss `user@realm!tokenname=secret` sein
- Proxmox nicht über Netzwerk erreichbar (Firewall?)
- Token-Berechtigungen fehlen → Proxmox GUI: API Tokens → Berechtigungen prüfen

### Nextcloud: Redirect-Loop / falsche Domain

**Symptom:** Nextcloud-Seite lädt endlos um oder zeigt falsche URL.

```bash
# Als gmzadmin → SSH zur Tenant-VM:
ssh debian@<tenant-vm-ip>
# Auf der Tenant-VM als debian (sudo für docker!):
cd /opt/apps/nextcloud
sudo docker exec nextcloud-app cat /var/www/html/config/config.php | grep -E "overwrite|trusted"
```

**Fix:**
```bash
# Auf der Tenant-VM als debian (sudo für docker!):
sudo docker exec nextcloud-app php /var/www/html/occ config:system:set overwrite.cli.url --value=https://nextcloud.tenants.example.com
sudo docker exec nextcloud-app php /var/www/html/occ config:system:set trusted_domains 0 --value=nextcloud.tenants.example.com
```

### Grafana: Keine Metriken von Tenant

**Symptom:** Grafana zeigt „No data" für Tenant-Dashboards.

```bash
# Als gmzadmin – KEIN sudo für docker:
# Prometheus-Targets prüfen:
curl -s http://localhost:9090/api/v1/targets | python3 -m json.tool | grep -A5 "tenant"

# node_exporter auf Tenant-VM erreichbar?
curl -s http://<tenant-vm-ip>:9100/metrics | head -5
```

**Häufige Ursachen:**
- `node_exporter` auf Tenant-VM nicht installiert → Ansible-Playbook erneut ausführen
- Firewall auf Tenant-VM blockiert Port 9100 → `ssh debian@<ip>` dann `sudo ufw status`
- Prometheus-Scraping-Config fehlt → `infra/monitoring/prometheus/prometheus.yml` prüfen

### Authentik: Login schlägt fehl

**Symptom:** SSO-Login gibt Fehler, Redirect-Fehler.

```bash
# Als gmzadmin – KEIN sudo für docker:
cd /opt/gmz/infra/authentik
docker compose logs authentik-server --tail 30
docker compose logs authentik-worker --tail 20
```

**Häufige Ursachen:**
- Redirect-URI in OIDC-Provider falsch → Authentik: Provider bearbeiten
- `NEXTAUTH_URL` in `.env` stimmt nicht mit tatsächlicher URL überein
- Authentik-Container nicht gestartet → `docker compose ps`

### Docker: Container startet immer neu

**Symptom:** `docker ps` zeigt `Restarting (1)` in kurzen Abständen.

```bash
# Auf der Management-VM als gmzadmin – KEIN sudo für docker:
docker logs <container-name> --tail 30
docker inspect <container-name> | python3 -m json.tool | grep -A3 '"State"'

# Auf einer Tenant-VM als debian – sudo erforderlich:
sudo docker logs <container-name> --tail 30
sudo docker inspect <container-name> | python3 -m json.tool | grep -A3 '"State"'
```

**Häufige Ursachen:**
- Fehlende Umgebungsvariable → `docker inspect` → Env-Section
- Port-Konflikt → `ss -tlnp | grep <port>`
- Volumes nicht vorhanden → `docker volume ls`
- Konfigurations-Datei Fehler → Compose-YAML prüfen

---

## 23. Umgebungsvariablen-Referenz

Datei: `/opt/gmz/platform/webapp/.env` | Berechtigungen: `chmod 600` | Besitzer: `gmzadmin`

### Authentifizierung

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|--------------|
| `WEBAPP_AUTH_MODE` | ✅ | – | Auth-Modus: `trusted-bearer` (Produktion), `jwt` (OIDC), `none` (nur Dev) |
| `WEBAPP_TRUSTED_TOKENS_JSON` | Wenn `trusted-bearer` | – | JSON-Array mit Token-Einträgen. Format: `[{"tokenId":"...","userId":"...","role":"admin","token":"...","expiresAt":"ISO-8601"}]` |
| `WEBAPP_OIDC_ISSUER` | Wenn `jwt` | – | OIDC Issuer-URL, z.B. `https://auth.example.com/application/o/slug/` |
| `WEBAPP_OIDC_AUDIENCE` | Wenn `jwt` | – | OAuth2 Audience (Client-ID aus Authentik) |

### Sicherheit

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|--------------|
| `WEBAPP_NOTIFICATION_ENCRYPTION_KEY` | ✅ | – | 32-Byte Hex-Schlüssel zur Verschlüsselung sensibler Daten. Generieren: `openssl rand -hex 16` |
| `NODE_ENV` | – | `development` | `production` für Produktivbetrieb (wichtig für Performance und Sicherheit!) |

### Datenbank

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|--------------|
| `DATABASE_URL` | – | Dateibasiert | PostgreSQL Connection-String: `postgresql://user:pass@host:5432/db`. Ohne diese Variable wird ein lokaler dateibasierter Speicher verwendet. |

### Proxmox / Provisioning

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|--------------|
| `PROVISION_PROXMOX_ENDPOINT` | ✅ | – | Proxmox-API-URL: `https://proxmox.example.com:8006/api2/json` |
| `PROVISION_PROXMOX_API_TOKEN` | ✅ | – | Format: `user@realm!tokenname=secret` |
| `PROVISION_PROXMOX_NODE` | ✅ | – | Name des Proxmox-Nodes, z.B. `pve` |
| `PROVISION_PROXMOX_INSECURE` | – | `false` | `true` wenn selbstsigniertes Zertifikat auf Proxmox (nicht für Produktion) |
| `PROVISION_TEMPLATE_VMID` | ✅ | – | VMID des Cloud-Init-Templates, z.B. `9000` |
| `PROVISION_STORAGE` | – | `local-lvm` | Proxmox-Storage-Name für VM-Disks |
| `PROVISION_BRIDGE` | – | `vmbr0` | Netzwerk-Bridge für Tenant-VMs |
| `PROVISION_TENANT_VLAN` | – | `20` | Basis-VLAN-ID für Tenant-Netz |
| `PROVISION_SSH_PUBLIC_KEY` | ✅ | – | SSH Public Key für Tenant-VM-Zugriff (Ansible) |
| `PROVISION_EXECUTION_ENABLED` | – | `false` | `true` um echtes Provisioning zu aktivieren (in Dev/Test auf `false` lassen!) |

### Domain / Netzwerk

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|--------------|
| `WEBAPP_BASE_DOMAIN` | ✅ | – | Haupt-Domain, z.B. `example.com` |
| `WEBAPP_TENANT_SUBDOMAIN_TEMPLATE` | – | `*.tenants.{base}` | Template für Tenant-Subdomains |
| `WEBAPP_MANAGEMENT_URL` | – | `NEXTAUTH_URL` | Öffentliche URL der WebApp (falls abweichend) |

### SMTP / Benachrichtigungen

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|--------------|
| `SMTP_HOST` | – | – | SMTP-Server-Adresse |
| `SMTP_PORT` | – | `587` | SMTP-Port (587 = StartTLS, 465 = SSL) |
| `SMTP_USER` | – | – | SMTP-Benutzername |
| `SMTP_PASSWORD` | – | – | SMTP-Passwort |
| `SMTP_FROM` | – | – | Absender-E-Mail: `GMZ Cloud <noreply@example.com>` |
| `SMTP_SECURE` | – | `false` | `true` für SSL/TLS auf Port 465 |

### Entwicklung / Debug

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|--------------|
| `NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH` | – | `false` | `true` erlaubt Rollen-Umschalten im UI (NUR mit `auth_mode=none`!) |
| `LOG_LEVEL` | – | `info` | Log-Level: `debug`, `info`, `warn`, `error` |

---

## 24. Schnell-Referenz

### Service-Verwaltung

```bash
# Als gmzadmin (sudo für systemctl):
# WebApp-Status prüfen:
sudo systemctl status gmz-webapp

# WebApp neu starten:
sudo systemctl restart gmz-webapp

# WebApp-Logs live:
journalctl -u gmz-webapp -f

# WebApp-Logs letzte 100 Zeilen:
journalctl -u gmz-webapp -n 100 --no-pager
```

### Docker-Befehle

```bash
# Als gmzadmin – KEIN sudo (docker-Gruppe!):
# Alle laufenden Container:
docker ps

# Monitoring-Stack neu starten:
cd /opt/gmz/infra/monitoring && docker compose restart

# Traefik-Logs:
docker logs traefik -f --tail 50

# Container-Ressourcennutzung:
docker stats --no-stream
```

### Ansible-Befehle

```bash
# Als gmzadmin – KEIN sudo:
# Tenant provisionieren:
ansible-playbook /opt/gmz/automation/ansible/provision-tenant.yml \
  -i /opt/gmz/automation/ansible/inventory/tenant.ini

# Traefik deployen:
ansible-playbook /opt/gmz/automation/ansible/deploy-traefik.yml \
  -i /opt/gmz/automation/ansible/inventory/management.yml

# Ad-hoc Befehl auf allen Tenant-VMs:
ansible all -i /opt/gmz/automation/ansible/inventory/tenant.ini \
  -m command -a "uptime"

# Ansible-Verbindung testen:
ansible all -i /opt/gmz/automation/ansible/inventory/tenant.ini -m ping
```

### Nützliche System-Befehle

```bash
# Als gmzadmin:
# Offene Ports anzeigen:
ss -tlnp

# UFW-Status:
sudo ufw status verbose

# Disk-Nutzung:
df -h

# RAM-Nutzung:
free -h

# CPU-Last:
uptime
htop

# Systemd-Service-Übersicht:
systemctl list-units --state=failed

# Letzten Boot prüfen:
last reboot | head -5

# Alle Docker-Volumes:
docker volume ls

# Docker-Disk-Nutzung:
docker system df
```

### SSH auf Tenant-VMs

```bash
# Als gmzadmin – KEIN sudo für SSH:
# Standard-Login (Debian Cloud-Init User):
ssh -i ~/.ssh/id_ed25519 debian@<tenant-vm-ip>

# Mit SSH-Config (empfohlen, ~/.ssh/config einrichten):
# Host tenant-01
#   HostName 10.20.1.100
#   User debian
#   IdentityFile ~/.ssh/id_ed25519
ssh tenant-01
```

### Logs schnell finden

```bash
# Als gmzadmin:
# WebApp-Fehler der letzten Stunde:
journalctl -u gmz-webapp --since "1 hour ago" | grep -i error

# System-Logs nach Fehler durchsuchen:
journalctl -p err --since "today" --no-pager

# Docker-Container-Log (letzter Fehler):
docker logs <container-name> 2>&1 | grep -i "error\|fatal\|panic" | tail -10

# Ansible-Playbook-Log:
cat /tmp/ansible-playbook-run-$(date +%Y%m%d)*.log
```

### Git-Workflow

```bash
# Als gmzadmin – KEIN sudo:
cd /opt/gmz

# Aktuellen Stand holen:
git fetch origin
git status

# Update einspielen:
git pull origin main

# Lokale Änderungen (z.B. .env.example aktualisiert):
git diff HEAD

# Commit-History:
git log --oneline -10
```

---

*Ende des Handbuchs*

---

> **Versionsverlauf:**
> | Version | Datum      | Änderungen                                         |
> |---------|------------|----------------------------------------------------|
> | 2.0.0   | März 2026  | Komplett neu: Debian 13 Install, sudo-Konsistenz, Authentik-SSO, vollständiges Benutzerhandbuch |
> | 1.x     | 2025       | Ursprüngliche Version                              |
