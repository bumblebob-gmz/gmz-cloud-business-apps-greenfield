# 03 – Debian 13 Installation

> **[← 02 Voraussetzungen](02-prerequisites.md)** | **[Wiki-Index](README.md)** | Weiter: [04 – Management-VM Setup →](04-management-vm-setup.md)

---

## Überblick

Debian 13 „Trixie" ist das Basis-OS für alle VMs in dieser Plattform:
- **Management-VM**: manuell aus ISO oder Proxmox-Template
- **Tenant-VMs**: vollautomatisch via Cloud-Init-Template + OpenTofu

---

## 3.1 Debian 13 ISO herunterladen

```bash
# Aktuelles Debian 13 Netinstall-ISO
wget https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-13.0.0-amd64-netinst.iso
```

Offizielle Download-Seite: https://www.debian.org/distrib/netinst

---

## 3.2 Manuelle Installation (für Management-VM)

### Installations-Empfehlungen

| Einstellung | Wert |
|-------------|------|
| Sprache | Deutsch oder Englisch (Englisch empfohlen für Logs) |
| Hostname | `mgmt-vm` |
| Domain | `irongeeks.eu` |
| Benutzer | `deploy` (kein root-Login empfohlen) |
| Root-Passwort | Starkes Passwort oder deaktivieren (sudo-only) |
| Partitionierung | LVM, getrennte `/`, `/var`, `/home` |
| Software | Nur „SSH server" + „Standard-Systemwerkzeuge" |

### Partitionsschema (Empfehlung)

```
/boot       1 GB    ext4  (kein LVM)
/           20 GB   ext4  (LVM)
/var        20 GB   ext4  (LVM) — für Docker-Daten
/var/lib    30 GB   ext4  (LVM) — alternativ direkt /var groß anlegen
swap        4 GB    swap  (LVM)
```

> **Hinweis:** Docker-Daten liegen standardmäßig in `/var/lib/docker`. Sicherstellen, dass `/var` ausreichend groß ist.

### Netzwerk-Konfiguration nach Installation

```bash
# Als root oder mit sudo:

# /etc/network/interfaces (statische IP im Management-VLAN)
cat > /etc/network/interfaces << 'EOF'
auto lo
iface lo inet loopback

auto eth0
iface eth0 inet static
    address 10.10.10.10
    netmask 255.255.255.0
    gateway 10.10.10.1
    dns-nameservers 1.1.1.1 8.8.8.8
EOF

systemctl restart networking
```

---

## 3.3 Cloud-Init Template erstellen (für Tenant-VMs)

Dieses Template wird von OpenTofu für alle Tenant-VMs verwendet. Die folgenden Befehle werden **auf dem Proxmox-Host** als root ausgeführt.

### 3.3.1 Cloud-Image herunterladen

```bash
# Auf dem Proxmox-Host (als root):
cd /var/lib/vz/template/iso

wget -O debian-13-genericcloud-amd64.qcow2 \
  https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2

# SHA512-Checksumme prüfen (empfohlen)
wget https://cloud.debian.org/images/cloud/trixie/latest/SHA512SUMS
sha512sum -c SHA512SUMS --ignore-missing
```

### 3.3.2 VM-Shell erstellen

```bash
# Bestehende VM bereinigen (falls vorhanden)
qm stop 9000 || true
qm destroy 9000 --purge || true

# Neue VM-Shell anlegen
qm create 9000 \
  --name debian-13-cloudinit \
  --memory 2048 \
  --cores 2 \
  --net0 virtio,bridge=vmbr0 \
  --serial0 socket \
  --vga serial0 \
  --agent enabled=1
```

### 3.3.3 Disk importieren

**LVM-Thin (Standard):**
```bash
qm importdisk 9000 \
  /var/lib/vz/template/iso/debian-13-genericcloud-amd64.qcow2 \
  local-lvm

qm set 9000 \
  --scsihw virtio-scsi-pci \
  --scsi0 local-lvm:vm-9000-disk-0
```

**Ceph (optional):**
```bash
qm importdisk 9000 \
  /var/lib/vz/template/iso/debian-13-genericcloud-amd64.qcow2 \
  ceph-vm

qm set 9000 \
  --scsihw virtio-scsi-pci \
  --scsi0 ceph-vm:vm-9000-disk-0
```

### 3.3.4 Cloud-Init-Drive und Boot konfigurieren

```bash
# Cloud-Init-Drive hinzufügen
qm set 9000 --ide2 local-lvm:cloudinit

# Bootorder: von scsi0 (der importierten Disk) starten
qm set 9000 --boot c --bootdisk scsi0

# DHCP für initiales Booten
qm set 9000 --ipconfig0 ip=dhcp

# Standard-User festlegen
qm set 9000 --ciuser debian

# SSH-Key hinterlegen (wird von OpenTofu überschrieben)
qm set 9000 --sshkeys ~/.ssh/id_ed25519.pub
```

### 3.3.5 In Template umwandeln

```bash
qm template 9000
```

### 3.3.6 Template testen

```bash
# Testklone erstellen
qm clone 9000 19000 --name template-test --full true

# VM starten und Cloud-Init abwarten
qm start 19000
sleep 60

# IP abrufen und SSH-Test
qm agent 19000 network-get-interfaces
ssh debian@<IP-aus-Cloud-Init>

# Testklone wieder entfernen
qm stop 19000 && qm destroy 19000 --purge
```

---

## 3.4 Ordner-Berechtigungen (Management-VM)

Nach der Installation den Deploy-User anlegen und Verzeichnisse vorbereiten:

```bash
# Als root:

# Deploy-User anlegen (kein direkter root-Login nötig)
useradd -m -s /bin/bash -G sudo,docker deploy

# SSH-Verzeichnis mit korrekten Berechtigungen
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chown deploy:deploy /home/deploy/.ssh

# Authorized Keys kopieren
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys

# Installationsverzeichnis anlegen
mkdir -p /opt/gmz
chown deploy:deploy /opt/gmz
chmod 750 /opt/gmz
```

> ⚠️ **Wichtig:** Alle weiteren Installation- und Setup-Schritte in [04 – Management-VM Setup](04-management-vm-setup.md) werden **als Benutzer `deploy` mit `sudo`** ausgeführt — **nicht als root**, sofern nicht anders angegeben.

---

## 3.5 SSH absichern

```bash
# Als root:
cat > /etc/ssh/sshd_config.d/10-hardening.conf << 'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

systemctl restart ssh
```

---

> **[← 02 Voraussetzungen](02-prerequisites.md)** | **[Wiki-Index](README.md)** | Weiter: [04 – Management-VM Setup →](04-management-vm-setup.md)
