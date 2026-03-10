#!/usr/bin/env bash
# =============================================================================
#  GMZ Cloud Business Apps — Interaktiver Installations-Wizard
#  Schritte 3.1–3.7: Node.js, Docker, OpenTofu, Ansible, Repo, Konfig, Services
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# GMZ-Farben für whiptail (NEWT_COLORS)
# Echte ANSI-Farbnamen — keine Hex-Werte!
# ---------------------------------------------------------------------------
export NEWT_COLORS='
  root=white,black
  border=white,blue
  window=white,blue
  shadow=black,black
  title=brightyellow,blue
  button=black,cyan
  actbutton=black,brightyellow
  checkbox=white,blue
  actcheckbox=black,cyan
  entry=white,black
  disentry=brightblack,blue
  label=brightwhite,blue
  listbox=white,black
  actlistbox=white,blue
  sellistbox=black,cyan
  actsellistbox=black,brightyellow
  textbox=white,black
  acttextbox=brightyellow,blue
  emptyscale=black,blue
  fullscale=blue,cyan
  helpline=black,cyan
  roottext=brightwhite,black
'

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------
LOGFILE="/tmp/gmz-install-$(date +%Y%m%d-%H%M%S).log"
CONF_FILE="/tmp/gmz-install.conf"
: > "$CONF_FILE"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOGFILE"; }
save_conf() { echo "$1=$2" >> "$CONF_FILE"; }

check_root() {
  if [[ $EUID -ne 0 ]]; then
    whiptail --title "❌ Fehler" --msgbox \
      "Dieser Wizard muss als root ausgeführt werden.\n\nBitte mit 'sudo bash install-wizard.sh' starten." \
      10 60
    exit 1
  fi
}

check_deps() {
  local missing=()
  for cmd in whiptail curl git apt-get systemctl; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Fehlende Abhängigkeiten: ${missing[*]}" >&2
    echo "Bitte zuerst installieren: apt-get install -y whiptail curl git" >&2
    exit 1
  fi
}

run_step() {
  local desc="$1"
  shift
  log "Starte: $desc"
  if "$@" >> "$LOGFILE" 2>&1; then
    log "✅ Fertig: $desc"
    return 0
  else
    log "❌ Fehler bei: $desc"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Willkommensbildschirm
# ---------------------------------------------------------------------------
show_welcome() {
  whiptail --title "🚀 GMZ Cloud Business Apps — Installations-Wizard" \
    --msgbox "\
Willkommen beim interaktiven Setup-Wizard!

Dieser Wizard führt Sie durch die Schritte:

  3.1  Node.js 20 LTS installieren
  3.2  Docker installieren
  3.3  OpenTofu installieren
  3.4  Ansible installieren
  3.5  Repository klonen
  3.6  Umgebungsvariablen konfigurieren
  3.7  Services starten und verifizieren

Voraussetzungen:
  ✓ Debian 13 (root-Zugang)
  ✓ Benutzer 'gmzadmin' angelegt und in sudo-Gruppe
  ✓ Internetverbindung
  ✓ ca. 15–20 Minuten Zeit

Log-Datei: $LOGFILE

Weiter mit OK — Abbrechen mit ESC." \
    24 72
}

# ---------------------------------------------------------------------------
# Schritt 3.1: Node.js 20 LTS installieren
# ---------------------------------------------------------------------------
step_nodejs() {
  whiptail --title "Schritt 3.1 — Node.js 20 LTS" \
    --yesno "Node.js 20 LTS wird jetzt installiert.\n\nInstallationsmethode: NodeSource-Repository (offizielle Quelle)\n\nFortsetzen?" \
    10 65 || return 1

  {
    echo "10"; echo "XXX"; echo "10"; echo "Pakete aktualisieren..."; echo "XXX"
    apt-get update -qq

    echo "30"; echo "XXX"; echo "30"; echo "NodeSource-Repository einrichten..."; echo "XXX"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >> "$LOGFILE" 2>&1

    echo "60"; echo "XXX"; echo "60"; echo "Node.js installieren..."; echo "XXX"
    apt-get install -y -qq nodejs

    echo "90"; echo "XXX"; echo "90"; echo "Installation verifizieren..."; echo "XXX"
    node --version >> "$LOGFILE" 2>&1
    npm --version >> "$LOGFILE" 2>&1

    echo "100"; echo "XXX"; echo "100"; echo "Node.js installiert!"; echo "XXX"
  } | whiptail --title "Node.js wird installiert..." --gauge "Bitte warten..." 8 70 0

  local node_ver npm_ver
  node_ver=$(node --version 2>/dev/null || echo "unbekannt")
  npm_ver=$(npm --version 2>/dev/null || echo "unbekannt")

  whiptail --title "✅ Node.js installiert" \
    --msgbox "Node.js wurde erfolgreich installiert!\n\nNode.js: $node_ver\nnpm:     $npm_ver\n\nDies ist die Laufzeitumgebung für die GMZ WebApp." \
    12 60
}

# ---------------------------------------------------------------------------
# Schritt 3.2: Docker installieren
# ---------------------------------------------------------------------------
step_docker() {
  whiptail --title "Schritt 3.2 — Docker" \
    --yesno "Docker wird jetzt installiert.\n\nInstallationsmethode: Offizielles Docker-Repository\n\nHinweis: Der Benutzer 'gmzadmin' wird zur docker-Gruppe hinzugefügt.\nDanach sind KEINE sudo-Befehle mehr für docker nötig.\n\nFortsetzen?" \
    12 65 || return 1

  {
    echo "10"; echo "XXX"; echo "10"; echo "Pakete aktualisieren..."; echo "XXX"
    apt-get update -qq

    echo "20"; echo "XXX"; echo "20"; echo "Abhängigkeiten installieren..."; echo "XXX"
    apt-get install -y -qq ca-certificates curl gnupg lsb-release

    echo "40"; echo "XXX"; echo "40"; echo "Docker GPG-Key hinzufügen..."; echo "XXX"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "55"; echo "XXX"; echo "55"; echo "Docker-Repository einrichten..."; echo "XXX"
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -qq

    echo "70"; echo "XXX"; echo "70"; echo "Docker Engine installieren..."; echo "XXX"
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
      docker-buildx-plugin docker-compose-plugin

    echo "85"; echo "XXX"; echo "85"; echo "Docker-Service starten..."; echo "XXX"
    systemctl enable --now docker

    echo "95"; echo "XXX"; echo "95"; echo "gmzadmin zur docker-Gruppe hinzufügen..."; echo "XXX"
    if id gmzadmin &>/dev/null; then
      usermod -aG docker gmzadmin
    fi

    echo "100"; echo "XXX"; echo "100"; echo "Docker installiert!"; echo "XXX"
  } | whiptail --title "Docker wird installiert..." --gauge "Bitte warten..." 8 70 0

  local version
  version=$(docker --version 2>/dev/null || echo "unbekannt")

  whiptail --title "✅ Docker installiert" \
    --msgbox "Docker wurde erfolgreich installiert!\n\n$version\nDocker Compose: $(docker compose version 2>/dev/null || echo 'nicht verfügbar')\n\n✅ 'gmzadmin' wurde zur docker-Gruppe hinzugefügt.\nNeu einloggen oder 'newgrp docker' ausführen damit die Gruppe aktiv wird." \
    13 65
}

# ---------------------------------------------------------------------------
# Schritt 3.3: OpenTofu installieren
# ---------------------------------------------------------------------------
step_opentofu() {
  # Version auswählen
  local version
  version=$(whiptail --title "Schritt 3.3 — OpenTofu" \
    --inputbox "OpenTofu-Version installieren:\n(empfohlen: 1.7.0)" \
    10 60 "1.7.0" 3>&1 1>&2 2>&3) || return 1

  {
    echo "20"; echo "XXX"; echo "20"; echo "OpenTofu herunterladen..."; echo "XXX"
    local arch
    arch=$(dpkg --print-architecture)
    local url="https://github.com/opentofu/opentofu/releases/download/v${version}/tofu_${version}_${arch}.deb"
    curl -fsSL -o /tmp/opentofu.deb "$url"

    echo "60"; echo "XXX"; echo "60"; echo "OpenTofu installieren..."; echo "XXX"
    dpkg -i /tmp/opentofu.deb || apt-get install -f -y -qq
    rm -f /tmp/opentofu.deb

    echo "90"; echo "XXX"; echo "90"; echo "Installation verifizieren..."; echo "XXX"
    tofu version >> "$LOGFILE" 2>&1

    echo "100"; echo "XXX"; echo "100"; echo "Fertig!"; echo "XXX"
  } | whiptail --title "OpenTofu wird installiert..." --gauge "Bitte warten..." 8 70 0

  whiptail --title "✅ OpenTofu installiert" \
    --msgbox "OpenTofu wurde erfolgreich installiert!\n\n$(tofu version 2>/dev/null || echo 'Version nicht ermittelbar')\n\nOpenTofu ist der Open-Source-Fork von Terraform und wird\nfür die VM-Provisionierung auf Proxmox verwendet." \
    12 65
}

# ---------------------------------------------------------------------------
# Schritt 3.4: Ansible installieren
# ---------------------------------------------------------------------------
step_ansible() {
  whiptail --title "Schritt 3.4 — Ansible" \
    --yesno "Ansible wird installiert.\n\nQuelle: pipx (empfohlen, kein sudo-Ansible nötig)\n\nMit pipx installieren?" \
    10 60

  local use_pipx=$?

  {
    echo "20"; echo "XXX"; echo "20"; echo "Python3 und pipx vorbereiten..."; echo "XXX"
    apt-get install -y -qq python3 python3-pip pipx 2>/dev/null || true

    if [[ $use_pipx -eq 0 ]]; then
      echo "50"; echo "XXX"; echo "50"; echo "Ansible via pipx installieren (als gmzadmin)..."; echo "XXX"
      if id gmzadmin &>/dev/null; then
        su -c "pipx install --include-deps ansible && pipx ensurepath" gmzadmin >> "$LOGFILE" 2>&1
      else
        pipx install --include-deps ansible
        pipx ensurepath
      fi
    else
      echo "30"; echo "XXX"; echo "30"; echo "Ansible via APT installieren..."; echo "XXX"
      apt-get install -y -qq ansible
    fi

    echo "80"; echo "XXX"; echo "80"; echo "Ansible-Collections installieren..."; echo "XXX"
    if id gmzadmin &>/dev/null; then
      su -c "ansible-galaxy collection install community.docker community.general" gmzadmin >> "$LOGFILE" 2>&1 || true
    else
      ansible-galaxy collection install community.docker community.general >> "$LOGFILE" 2>&1 || true
    fi

    echo "100"; echo "XXX"; echo "100"; echo "Fertig!"; echo "XXX"
  } | whiptail --title "Ansible wird installiert..." --gauge "Bitte warten..." 8 70 0

  local ansible_ver
  if id gmzadmin &>/dev/null; then
    ansible_ver=$(su -c "ansible --version 2>/dev/null | head -1" gmzadmin 2>/dev/null || \
                  ansible --version 2>/dev/null | head -1 || echo "Version nicht ermittelbar")
  else
    ansible_ver=$(ansible --version 2>/dev/null | head -1 || echo "Version nicht ermittelbar")
  fi

  whiptail --title "✅ Ansible installiert" \
    --msgbox "Ansible wurde erfolgreich installiert!\n\n$ansible_ver\n\nCollections community.docker und community.general wurden installiert." \
    12 65
}

# ---------------------------------------------------------------------------
# Schritt 3.5: Repository klonen
# ---------------------------------------------------------------------------
step_clone_repo() {
  local install_dir
  install_dir=$(whiptail --title "Schritt 3.5 — Repository klonen" \
    --inputbox "Installationsverzeichnis:" \
    10 70 "/opt/gmz" 3>&1 1>&2 2>&3) || return 1

  local repo_url
  repo_url=$(whiptail --title "Schritt 3.5 — Repository klonen" \
    --inputbox "Repository-URL:" \
    10 70 "https://github.com/bumblebob-gmz/gmz-cloud-business-apps-greenfield.git" 3>&1 1>&2 2>&3) || return 1

  save_conf "INSTALL_DIR" "$install_dir"
  save_conf "REPO_URL" "$repo_url"

  {
    echo "20"; echo "XXX"; echo "20"; echo "Verzeichnis vorbereiten..."; echo "XXX"
    mkdir -p "$(dirname "$install_dir")"

    echo "30"; echo "XXX"; echo "30"; echo "Repository wird geklont..."; echo "XXX"
    if [[ -d "$install_dir/.git" ]]; then
      cd "$install_dir" && git pull origin main
    else
      git clone "$repo_url" "$install_dir"
    fi

    echo "70"; echo "XXX"; echo "70"; echo "Eigentümer auf gmzadmin setzen..."; echo "XXX"
    if id gmzadmin &>/dev/null; then
      chown -R gmzadmin:gmzadmin "$install_dir"
    fi

    echo "85"; echo "XXX"; echo "85"; echo "Verzeichnisstruktur prüfen..."; echo "XXX"
    ls -la "$install_dir" >> "$LOGFILE" 2>&1

    echo "100"; echo "XXX"; echo "100"; echo "Fertig!"; echo "XXX"
  } | whiptail --title "Repository wird geklont..." --gauge "Bitte warten..." 8 70 0

  whiptail --title "✅ Repository geklont" \
    --msgbox "Repository erfolgreich geklont nach:\n$install_dir\n\nVerzeichnisstruktur:\n$(ls "$install_dir" 2>/dev/null | head -10 | sed 's/^/  /')\n\nAlle Dateien gehören: gmzadmin:gmzadmin" \
    18 65
}

# ---------------------------------------------------------------------------
# Schritt 3.6: Umgebungsvariablen konfigurieren
# ---------------------------------------------------------------------------
step_configure_env() {
  local install_dir
  install_dir=$(grep "^INSTALL_DIR=" "$CONF_FILE" 2>/dev/null | cut -d= -f2 || echo "/opt/gmz")

  whiptail --title "Schritt 3.6 — Konfiguration" \
    --msgbox "Jetzt werden die Umgebungsvariablen konfiguriert.\n\nPflichtfelder:\n  • Auth-Mode (trusted-bearer empfohlen für Produktion)\n  • API-Token(s) für Authentifizierung\n  • Proxmox API-Zugangsdaten\n  • Domain-Konfiguration\n\nDie .env-Datei wird erstellt in:\n  $install_dir/platform/webapp/.env\n\n⚠️  chmod 600 und chown gmzadmin wird automatisch gesetzt!" \
    18 72

  # Auth-Mode
  local auth_mode
  auth_mode=$(whiptail --title "Auth-Modus wählen" \
    --menu "Authentifizierungsmodus für die WebApp:" 15 65 3 \
    "trusted-bearer" "API-Token (empfohlen für Produktion)" \
    "jwt"            "JWT/OIDC (für SSO mit Authentik)" \
    "none"           "Kein Auth (NUR für lokale Entwicklung!)" \
    3>&1 1>&2 2>&3) || auth_mode="trusted-bearer"

  # API-Token (nur bei trusted-bearer)
  local api_token_json=""
  if [[ "$auth_mode" == "trusted-bearer" ]]; then
    local token_name
    token_name=$(whiptail --title "API-Token — Name" \
      --inputbox "Name für den Admin-Token (z.B. admin-prod):" 10 60 "admin-prod" 3>&1 1>&2 2>&3) || token_name="admin-prod"

    local token_value
    token_value=$(openssl rand -hex 32 2>/dev/null || cat /proc/sys/kernel/random/uuid | tr -d '-')

    whiptail --title "🔑 API-Token generiert" \
      --msgbox "Admin-Token wurde generiert:\n\n  Name:  $token_name\n  Token: $token_value\n\n⚠️  WICHTIG: Diesen Token jetzt sicher aufbewahren!\nEr wird nur einmal angezeigt.\n\nVerwendung im HTTP-Header:\n  Authorization: Bearer $token_value" \
      16 72

    api_token_json="{\"$token_name\":{\"role\":\"admin\",\"token\":\"$token_value\"}}"
  fi

  # Proxmox-Konfiguration
  local proxmox_endpoint
  proxmox_endpoint=$(whiptail --title "Proxmox API-Endpoint" \
    --inputbox "Proxmox API-URL (z.B. https://proxmox.example.com:8006/api2/json):" \
    10 72 "https://proxmox.example.com:8006/api2/json" 3>&1 1>&2 2>&3) || proxmox_endpoint=""

  local proxmox_token
  proxmox_token=$(whiptail --title "Proxmox API-Token" \
    --inputbox "Proxmox API-Token (Format: user@realm!tokenname=secret):" \
    10 72 "root@pam!gmz-webapp=IHR_TOKEN_SECRET" 3>&1 1>&2 2>&3) || proxmox_token=""

  local proxmox_node
  proxmox_node=$(whiptail --title "Proxmox Node-Name" \
    --inputbox "Name des Proxmox-Nodes (z.B. pve):" \
    10 60 "pve" 3>&1 1>&2 2>&3) || proxmox_node="pve"

  # Domain-Konfiguration
  local base_domain
  base_domain=$(whiptail --title "Domain-Konfiguration" \
    --inputbox "Haupt-Domain (z.B. example.com):" \
    10 60 "example.com" 3>&1 1>&2 2>&3) || base_domain="example.com"

  # PostgreSQL
  local database_url=""
  whiptail --title "Datenbank-Backend" \
    --yesno "PostgreSQL als Datenbank-Backend verwenden?\n\nJa = PostgreSQL (für Produktion empfohlen)\nNein = Dateibasierter Speicher (für Tests/Demo)" \
    10 68
  local use_postgres=$?

  if [[ $use_postgres -eq 0 ]]; then
    database_url=$(whiptail --title "PostgreSQL Connection-URL" \
      --inputbox "PostgreSQL Connection-URL:" \
      10 72 "postgresql://webapp:sicherespasswort@localhost:5432/gmz_webapp" 3>&1 1>&2 2>&3) || database_url=""
  fi

  # Encryption Key generieren
  local encryption_key
  encryption_key=$(openssl rand -hex 16 2>/dev/null || echo "bitte_durch_32hex_zeichen_ersetzen_!!")

  # .env-Datei schreiben
  local env_file="$install_dir/platform/webapp/.env"

  # Sicherstellen dass das Verzeichnis existiert:
  mkdir -p "$(dirname "$env_file")"

  cat > "$env_file" << EOF
# GMZ Cloud Business Apps — Umgebungsvariablen
# Generiert: $(date '+%Y-%m-%d %H:%M:%S')
# ⚠️  Datei enthält Secrets — NIEMALS in Git committen!
# ⚠️  Berechtigungen: chmod 600, Besitzer: gmzadmin

# ─── Authentifizierung ───────────────────────────────────────────────────────
# Optionen: trusted-bearer (Produktion) | jwt (OIDC/Authentik) | none (nur Dev)
WEBAPP_AUTH_MODE=${auth_mode}
$([ -n "$api_token_json" ] && echo "WEBAPP_TRUSTED_TOKENS_JSON='${api_token_json}'" || echo "# WEBAPP_TRUSTED_TOKENS_JSON='{\"admin\":{\"role\":\"admin\",\"token\":\"IHR_TOKEN\"}}'")

# ─── Sicherheit ──────────────────────────────────────────────────────────────
# 32 Byte Hex-Schlüssel zur Verschlüsselung. Neu generieren: openssl rand -hex 16
WEBAPP_NOTIFICATION_ENCRYPTION_KEY=${encryption_key}

# ─── Datenbank ───────────────────────────────────────────────────────────────
$([ -n "$database_url" ] && echo "DATABASE_URL=${database_url}" || echo "# DATABASE_URL=postgresql://user:pass@host:5432/gmz_webapp")

# ─── Proxmox / Provisioning ──────────────────────────────────────────────────
PROVISION_PROXMOX_ENDPOINT=${proxmox_endpoint}
PROVISION_PROXMOX_API_TOKEN=${proxmox_token}
PROVISION_PROXMOX_NODE=${proxmox_node}
# Bei selbstsignierten Zertifikaten auf Proxmox (nicht für Produktion):
# PROVISION_PROXMOX_INSECURE=true

PROVISION_TEMPLATE_VMID=9000
PROVISION_STORAGE=local-lvm
PROVISION_BRIDGE=vmbr0
PROVISION_TENANT_VLAN=20

# SSH-Public-Key für Tenant-VM-Zugriff (für Ansible):
# PROVISION_SSH_PUBLIC_KEY=ssh-ed25519 AAAA...IHR_KEY user@host

# Echtes Provisioning aktivieren (auf true setzen wenn alles konfiguriert!):
PROVISION_EXECUTION_ENABLED=false

# ─── Domain-Konfiguration ────────────────────────────────────────────────────
WEBAPP_BASE_DOMAIN=${base_domain}
WEBAPP_TENANT_SUBDOMAIN_TEMPLATE=*.tenants.${base_domain}

# ─── JWT/OIDC (nur wenn WEBAPP_AUTH_MODE=jwt) ────────────────────────────────
# NEXTAUTH_URL=https://mgmt.${base_domain}
# NEXTAUTH_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "bitte_ersetzen")
# AUTHENTIK_CLIENT_ID=IHR_CLIENT_ID
# AUTHENTIK_CLIENT_SECRET=IHR_CLIENT_SECRET
# AUTHENTIK_ISSUER=https://auth.${base_domain}/application/o/gmz-webapp/

# ─── SMTP / Benachrichtigungen ───────────────────────────────────────────────
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=noreply@example.com
# SMTP_PASSWORD=IHR_SMTP_PASSWORT
# SMTP_FROM=GMZ Cloud <noreply@example.com>
# SMTP_SECURE=false

# ─── Umgebung ────────────────────────────────────────────────────────────────
NODE_ENV=production
# LOG_LEVEL=info

# ─── Entwicklung (NUR für lokales Testen!) ───────────────────────────────────
# NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH=false
EOF

  # Berechtigungen setzen:
  chmod 600 "$env_file"
  if id gmzadmin &>/dev/null; then
    chown gmzadmin:gmzadmin "$env_file"
  fi

  whiptail --title "✅ Konfiguration gespeichert" \
    --msgbox "Konfiguration gespeichert!\n\nDatei: $env_file\n\nBerechtigungen gesetzt:\n  chmod 600 (nur für Besitzer lesbar)\n  chown gmzadmin:gmzadmin\n\nAuth-Mode:  $auth_mode\nDatenbank:  $([ -n "$database_url" ] && echo 'PostgreSQL' || echo 'Dateibasiert')\nDomain:     $base_domain\n\n⚠️  Bitte .env vor dem Starten der Services prüfen!\nInsbesondere: PROVISION_SSH_PUBLIC_KEY setzen!" \
    18 72
}

# ---------------------------------------------------------------------------
# Schritt 3.7: Services starten und verifizieren
# ---------------------------------------------------------------------------
step_start_services() {
  local install_dir
  install_dir=$(grep "^INSTALL_DIR=" "$CONF_FILE" 2>/dev/null | cut -d= -f2 || echo "/opt/gmz")

  local CHOICES
  CHOICES=$(whiptail --title "Schritt 3.7 — Services starten" \
    --checklist "Welche Services sollen gestartet werden?" 20 72 5 \
    "webapp"     "Control-Plane WebApp (Next.js, Port 3000)"     ON  \
    "monitoring" "Monitoring Stack (Prometheus/Grafana/Loki)"     OFF \
    "traefik"    "Traefik Hinweise anzeigen (via Ansible)"        OFF \
    3>&1 1>&2 2>&3) || return 1

  # ── WebApp ──────────────────────────────────────────────────────────────
  if echo "$CHOICES" | grep -q "webapp"; then
    whiptail --title "WebApp als systemd-Service starten" \
      --yesno "Die WebApp wird als systemd-Service eingerichtet.\n\nService-Benutzer: gmzadmin\nWorkingDirectory: $install_dir/platform/webapp\nExecStart: /usr/bin/npm run start\nEnvironmentFile: $install_dir/platform/webapp/.env\n\nFortsetzen?" \
      14 72

    if [[ $? -eq 0 ]]; then
      {
        echo "10"; echo "XXX"; echo "10"; echo "Node.js-Dependencies installieren..."; echo "XXX"
        if id gmzadmin &>/dev/null; then
          su -c "cd '$install_dir/platform/webapp' && npm ci --silent" gmzadmin >> "$LOGFILE" 2>&1 || true
        fi

        echo "35"; echo "XXX"; echo "35"; echo "WebApp bauen (npm run build)..."; echo "XXX"
        if id gmzadmin &>/dev/null; then
          su -c "cd '$install_dir/platform/webapp' && npm run build" gmzadmin >> "$LOGFILE" 2>&1
        else
          cd "$install_dir/platform/webapp" && npm run build >> "$LOGFILE" 2>&1
        fi

        echo "65"; echo "XXX"; echo "65"; echo "Daten-Verzeichnis erstellen..."; echo "XXX"
        mkdir -p "$install_dir/data"
        if id gmzadmin &>/dev/null; then
          chown gmzadmin:gmzadmin "$install_dir/data"
        fi
        chmod 750 "$install_dir/data"

        echo "75"; echo "XXX"; echo "75"; echo "systemd-Service erstellen..."; echo "XXX"
        cat > /etc/systemd/system/gmz-webapp.service << SVCEOF
[Unit]
Description=GMZ Cloud Business Apps WebApp
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=gmzadmin
Group=gmzadmin
WorkingDirectory=${install_dir}/platform/webapp
EnvironmentFile=${install_dir}/platform/webapp/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gmz-webapp
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
SVCEOF

        echo "88"; echo "XXX"; echo "88"; echo "Service aktivieren und starten..."; echo "XXX"
        systemctl daemon-reload
        systemctl enable gmz-webapp
        systemctl start gmz-webapp

        echo "100"; echo "XXX"; echo "100"; echo "WebApp gestartet!"; echo "XXX"
      } | whiptail --title "WebApp wird eingerichtet und gestartet..." --gauge "Bitte warten..." 8 70 0

      sleep 3
      local status
      status=$(systemctl is-active gmz-webapp 2>/dev/null || echo "unknown")
      local mgmt_ip
      mgmt_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

      whiptail --title "WebApp-Status: $status" \
        --msgbox "WebApp-Service Status: $status\n\nErreichbar unter:\n  http://$mgmt_ip:3000\n  (oder via Traefik: https://mgmt.IHRE_DOMAIN.de)\n\nLog anzeigen:\n  journalctl -u gmz-webapp -f\n\nService-Befehle:\n  sudo systemctl status gmz-webapp\n  sudo systemctl restart gmz-webapp" \
        16 68
    fi
  fi

  # ── Monitoring ──────────────────────────────────────────────────────────
  if echo "$CHOICES" | grep -q "monitoring"; then
    {
      echo "30"; echo "XXX"; echo "30"; echo "Monitoring-Verzeichnis prüfen..."; echo "XXX"
      ls "$install_dir/infra/monitoring" >> "$LOGFILE" 2>&1 || true

      echo "60"; echo "XXX"; echo "60"; echo "Monitoring Stack starten (als gmzadmin)..."; echo "XXX"
      if id gmzadmin &>/dev/null; then
        su -c "cd '$install_dir/infra/monitoring' && docker compose up -d" gmzadmin >> "$LOGFILE" 2>&1 || true
      else
        cd "$install_dir/infra/monitoring" && docker compose up -d >> "$LOGFILE" 2>&1 || true
      fi

      echo "100"; echo "XXX"; echo "100"; echo "Monitoring gestartet!"; echo "XXX"
    } | whiptail --title "Monitoring Stack wird gestartet..." --gauge "Bitte warten..." 8 70 0

    local mgmt_ip
    mgmt_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

    whiptail --title "Monitoring Stack" \
      --msgbox "Monitoring Stack gestartet!\n\nErreichbar unter:\n  Grafana:      http://$mgmt_ip:3001\n  Prometheus:   http://$mgmt_ip:9090\n  Alertmanager: http://$mgmt_ip:9093\n\nHinweis: Grafana-Passwort in infra/monitoring/.env setzen:\n  GRAFANA_ADMIN_PASSWORD=sicheres_passwort\n\nDann: docker compose restart grafana" \
      15 68
  fi

  # ── Traefik-Hinweise ────────────────────────────────────────────────────
  if echo "$CHOICES" | grep -q "traefik"; then
    whiptail --title "Traefik — Deployment via Ansible" \
      --msgbox "Traefik wird über Ansible deployed (nicht direkt in diesem Wizard).\n\nBefehl (als gmzadmin, KEIN sudo):\n\n  cd $install_dir/automation/ansible\n  ansible-playbook deploy-traefik.yml \\\\\n    -e acme_email=admin@IHRE_DOMAIN.de \\\\\n    -e ionos_api_key=PREFIX.SECRET \\\\\n    -i inventory/management.yml\n\nVorher benötigt:\n  • inventory/management.yml konfigurieren\n  • IONOS DNS API-Key beschaffen\n  • DNS-Wildcard-Eintrag setzen:\n    *.tenants.DOMAIN.de → A → IHRE_IP\n\nSiehe: docs/SETUP-GUIDE.md → Abschnitt 5" \
      20 72
  fi
}

# ---------------------------------------------------------------------------
# Abschluss-Zusammenfassung
# ---------------------------------------------------------------------------
show_summary() {
  local install_dir
  install_dir=$(grep "^INSTALL_DIR=" "$CONF_FILE" 2>/dev/null | cut -d= -f2 || echo "nicht konfiguriert")
  local mgmt_ip
  mgmt_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

  whiptail --title "🎉 Installation abgeschlossen!" \
    --msgbox "\
GMZ Cloud Business Apps wurde eingerichtet!

Installationsverzeichnis:
  $install_dir

WebApp-Service:
  sudo systemctl status gmz-webapp
  journalctl -u gmz-webapp -f

WebApp erreichbar unter:
  http://$mgmt_ip:3000

Nächste Schritte:
  1. .env-Datei prüfen und vervollständigen:
     nano $install_dir/platform/webapp/.env
  2. PROVISION_SSH_PUBLIC_KEY in .env setzen
  3. PROVISION_EXECUTION_ENABLED=true setzen wenn bereit
  4. Traefik deployen (Ansible, Abschnitt 5)
  5. Ersten Tenant provisionieren

Wichtige Links:
  📖 Setup-Guide: $install_dir/docs/SETUP-GUIDE.md
  🌐 WebApp:      http://$mgmt_ip:3000

Log-Datei: $LOGFILE

Bei Problemen:
  docs/SETUP-GUIDE.md → Abschnitt 22 (Troubleshooting)" \
    26 72
}

# ---------------------------------------------------------------------------
# Hauptmenü
# ---------------------------------------------------------------------------
main_menu() {
  while true; do
    local choice
    choice=$(whiptail --title "🚀 GMZ Cloud Business Apps — Setup Wizard" \
      --menu "Installations-Schritt wählen:" 24 72 11 \
      "3.1" "Node.js 20 LTS installieren" \
      "3.2" "Docker installieren" \
      "3.3" "OpenTofu installieren" \
      "3.4" "Ansible installieren" \
      "3.5" "Repository klonen" \
      "3.6" "Umgebungsvariablen konfigurieren" \
      "3.7" "Services starten und verifizieren" \
      "all" "Alle Schritte nacheinander ausführen ✨" \
      "sum" "Zusammenfassung anzeigen" \
      "log" "Installations-Log anzeigen" \
      "exit" "Beenden" \
      3>&1 1>&2 2>&3) || break

    case "$choice" in
      "3.1") step_nodejs ;;
      "3.2") step_docker ;;
      "3.3") step_opentofu ;;
      "3.4") step_ansible ;;
      "3.5") step_clone_repo ;;
      "3.6") step_configure_env ;;
      "3.7") step_start_services ;;
      "all")
        step_nodejs
        step_docker
        step_opentofu
        step_ansible
        step_clone_repo
        step_configure_env
        step_start_services
        show_summary
        ;;
      "sum")
        show_summary
        ;;
      "log")
        if [[ -f "$LOGFILE" ]]; then
          whiptail --title "Installations-Log — $LOGFILE" \
            --textbox "$LOGFILE" 30 80
        else
          whiptail --title "Log" --msgbox "Log-Datei noch nicht vorhanden: $LOGFILE" 8 60
        fi
        ;;
      "exit") break ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Einstiegspunkt
# ---------------------------------------------------------------------------
check_deps
check_root
show_welcome
main_menu
show_summary
