#!/usr/bin/env bash
# =============================================================================
#  GMZ Cloud Business Apps — Interaktiver Installations-Wizard
#  Schritte 3.2–3.7: Software, Repo, Konfiguration, Services
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# GMZ-Farben für whiptail (NEWT_COLORS)
# Primär: #1f2b57 (GMZ Dunkelblau) — als ANSI 17 (dark blue) approximiert
# ---------------------------------------------------------------------------
export NEWT_COLORS='
  root=,black
  border=white,#1f2b57
  window=white,#1f2b57
  shadow=black,black
  title=yellow,#1f2b57
  button=black,#99bbe3
  actbutton=white,#0269e3
  checkbox=white,#1f2b57
  actcheckbox=black,#99bbe3
  entry=white,#0d1a3a
  disentry=gray,#1f2b57
  label=white,#1f2b57
  listbox=white,#0d1a3a
  actlistbox=black,#99bbe3
  sellistbox=black,#0269e3
  actsellistbox=white,#0269e3
  textbox=white,#1f2b57
  acttextbox=white,#0269e3
  emptyscale=,black
  fullscale=,#0269e3
  helpline=black,#99bbe3
  roottext=white,black
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

progress_box() {
  local title="$1"
  local steps=("${@:2}")
  local total=${#steps[@]}
  local current=0

  for step in "${steps[@]}"; do
    current=$((current + 1))
    local pct=$(( current * 100 / total ))
    echo "$pct"
    echo "XXX"
    echo "$pct"
    echo "$step"
    echo "XXX"
    sleep 0.5
  done | whiptail --title "$title" --gauge "Bitte warten..." 8 70 0
}

# ---------------------------------------------------------------------------
# Willkommensbildschirm
# ---------------------------------------------------------------------------
show_welcome() {
  whiptail --title "🚀 GMZ Cloud Business Apps — Installations-Wizard" \
    --msgbox "\
Willkommen beim interaktiven Setup-Wizard!

Dieser Wizard führt Sie durch die Schritte:

  3.2  Docker installieren
  3.3  OpenTofu installieren
  3.4  Ansible installieren
  3.5  Repository klonen
  3.6  Umgebungsvariablen konfigurieren
  3.7  Services starten und verifizieren

Voraussetzungen:
  ✓ Debian 12/13 (root-Zugang)
  ✓ Internetverbindung
  ✓ ca. 10–15 Minuten Zeit

Log-Datei: $LOGFILE

Weiter mit OK — Abbrechen mit ESC." \
    22 72
}

# ---------------------------------------------------------------------------
# Schritt 3.2: Docker installieren
# ---------------------------------------------------------------------------
step_docker() {
  whiptail --title "Schritt 3.2 — Docker" \
    --yesno "Docker wird jetzt installiert.\n\nInstallationsmethode: Offizielles Docker-Repository\n\nFortsetzung?" \
    10 60 || return 1

  {
    echo "10"; echo "XXX"; echo "10"; echo "Pakete aktualisieren..."; echo "XXX"
    apt-get update -qq

    echo "30"; echo "XXX"; echo "30"; echo "Abhängigkeiten installieren..."; echo "XXX"
    apt-get install -y -qq ca-certificates curl gnupg lsb-release

    echo "50"; echo "XXX"; echo "50"; echo "Docker GPG-Key hinzufügen..."; echo "XXX"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "70"; echo "XXX"; echo "70"; echo "Docker-Repository einrichten..."; echo "XXX"
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -qq

    echo "85"; echo "XXX"; echo "85"; echo "Docker Engine installieren..."; echo "XXX"
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

    echo "95"; echo "XXX"; echo "95"; echo "Docker-Service starten..."; echo "XXX"
    systemctl enable --now docker

    echo "100"; echo "XXX"; echo "100"; echo "Docker installiert!"; echo "XXX"
  } | whiptail --title "Docker wird installiert..." --gauge "Bitte warten..." 8 70 0

  local version
  version=$(docker --version 2>/dev/null || echo "unbekannt")

  whiptail --title "✅ Docker installiert" \
    --msgbox "Docker wurde erfolgreich installiert!\n\n$version\n\nDocker Compose: $(docker compose version 2>/dev/null || echo 'nicht verfügbar')" \
    10 60
}

# ---------------------------------------------------------------------------
# Schritt 3.3: OpenTofu installieren
# ---------------------------------------------------------------------------
step_opentofu() {
  # Version auswählen
  local version
  version=$(whiptail --title "Schritt 3.3 — OpenTofu" \
    --inputbox "OpenTofu-Version installieren:\n(empfohlen: 1.6.2)" \
    10 60 "1.6.2" 3>&1 1>&2 2>&3) || return 1

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
    tofu version

    echo "100"; echo "XXX"; echo "100"; echo "Fertig!"; echo "XXX"
  } | whiptail --title "OpenTofu wird installiert..." --gauge "Bitte warten..." 8 70 0

  whiptail --title "✅ OpenTofu installiert" \
    --msgbox "OpenTofu wurde erfolgreich installiert!\n\n$(tofu version 2>/dev/null || echo 'Version nicht ermittelbar')" \
    10 60
}

# ---------------------------------------------------------------------------
# Schritt 3.4: Ansible installieren
# ---------------------------------------------------------------------------
step_ansible() {
  whiptail --title "Schritt 3.4 — Ansible" \
    --yesno "Ansible wird installiert.\n\nQuelle: pipx (empfohlen) oder APT\n\nMit pipx installieren?" \
    10 60

  local use_pipx=$?

  {
    echo "20"; echo "XXX"; echo "20"; echo "Python3 und pipx vorbereiten..."; echo "XXX"
    apt-get install -y -qq python3 python3-pip pipx 2>/dev/null || true

    if [[ $use_pipx -eq 0 ]]; then
      echo "50"; echo "XXX"; echo "50"; echo "Ansible via pipx installieren..."; echo "XXX"
      pipx install --include-deps ansible
      pipx ensurepath
    else
      echo "30"; echo "XXX"; echo "30"; echo "Ansible-PPA hinzufügen..."; echo "XXX"
      apt-get install -y -qq software-properties-common
      apt-add-repository --yes --update ppa:ansible/ansible 2>/dev/null || \
        apt-get install -y -qq ansible
      echo "70"; echo "XXX"; echo "70"; echo "Ansible installieren..."; echo "XXX"
      apt-get install -y -qq ansible
    fi

    echo "90"; echo "XXX"; echo "90"; echo "Collections installieren..."; echo "XXX"
    ansible-galaxy collection install community.docker community.general 2>/dev/null || true

    echo "100"; echo "XXX"; echo "100"; echo "Fertig!"; echo "XXX"
  } | whiptail --title "Ansible wird installiert..." --gauge "Bitte warten..." 8 70 0

  whiptail --title "✅ Ansible installiert" \
    --msgbox "Ansible wurde erfolgreich installiert!\n\n$(ansible --version 2>/dev/null | head -1 || echo 'Version nicht ermittelbar')" \
    10 60
}

# ---------------------------------------------------------------------------
# Schritt 3.5: Repository klonen
# ---------------------------------------------------------------------------
step_clone_repo() {
  local install_dir
  install_dir=$(whiptail --title "Schritt 3.5 — Repository klonen" \
    --inputbox "Installationsverzeichnis:" \
    10 70 "/opt/gmz-cloud-business-apps" 3>&1 1>&2 2>&3) || return 1

  local repo_url
  repo_url=$(whiptail --title "Schritt 3.5 — Repository klonen" \
    --inputbox "Repository-URL:" \
    10 70 "https://github.com/bumblebob-gmz/gmz-cloud-business-apps-greenfield.git" 3>&1 1>&2 2>&3) || return 1

  save_conf "INSTALL_DIR" "$install_dir"
  save_conf "REPO_URL" "$repo_url"

  {
    echo "30"; echo "XXX"; echo "30"; echo "Repository wird geklont..."; echo "XXX"
    if [[ -d "$install_dir" ]]; then
      cd "$install_dir" && git pull origin main
    else
      git clone "$repo_url" "$install_dir"
    fi

    echo "80"; echo "XXX"; echo "80"; echo "Node.js Dependencies installieren..."; echo "XXX"
    if command -v node &>/dev/null; then
      cd "$install_dir/platform/webapp" && npm install --silent 2>/dev/null || true
    fi

    echo "100"; echo "XXX"; echo "100"; echo "Fertig!"; echo "XXX"
  } | whiptail --title "Repository wird geklont..." --gauge "Bitte warten..." 8 70 0

  whiptail --title "✅ Repository geklont" \
    --msgbox "Repository erfolgreich geklont nach:\n$install_dir\n\nVerzeichnisstruktur:\n$(ls "$install_dir" 2>/dev/null | head -10 | sed 's/^/  /')" \
    16 65
}

# ---------------------------------------------------------------------------
# Schritt 3.6: Umgebungsvariablen konfigurieren
# ---------------------------------------------------------------------------
step_configure_env() {
  local install_dir
  install_dir=$(grep "^INSTALL_DIR=" "$CONF_FILE" 2>/dev/null | cut -d= -f2 || echo "/opt/gmz-cloud-business-apps")

  whiptail --title "Schritt 3.6 — Konfiguration" \
    --msgbox "Jetzt werden die Umgebungsvariablen konfiguriert.\n\nPflichtfelder:\n  • Auth-Mode (trusted-bearer empfohlen)\n  • API-Token(s) für Authentifizierung\n  • Datenbank-URL (optional)\n  • SMTP-Konfiguration (optional)\n\nDie .env-Datei wird erstellt in:\n  $install_dir/platform/webapp/.env" \
    16 70

  # Auth-Mode
  local auth_mode
  auth_mode=$(whiptail --title "Auth-Modus" \
    --menu "Authentifizierungsmodus wählen:" 15 60 3 \
    "trusted-bearer" "API-Token (empfohlen für Produktion)" \
    "jwt"            "JWT/OIDC (für SSO mit Authentik)" \
    "dev-header"     "Header-basiert (NUR für lokale Entwicklung!)" \
    3>&1 1>&2 2>&3) || auth_mode="trusted-bearer"

  # API-Token
  local api_token=""
  if [[ "$auth_mode" == "trusted-bearer" ]]; then
    local token_name
    token_name=$(whiptail --title "API-Token konfigurieren" \
      --inputbox "Name für den Admin-Token:" 10 60 "admin-token" 3>&1 1>&2 2>&3) || token_name="admin-token"

    local token_value
    token_value=$(openssl rand -hex 32 2>/dev/null || cat /proc/sys/kernel/random/uuid | tr -d '-')

    whiptail --title "API-Token generiert" \
      --msgbox "Admin-Token wurde generiert:\n\n  Name:  $token_name\n  Token: $token_value\n\n⚠️  Diesen Token jetzt sicher aufbewahren!\nEr wird nur einmal angezeigt." \
      14 70

    api_token="{\"$token_name\":{\"role\":\"admin\",\"token\":\"$token_value\"}}"
  fi

  # PostgreSQL
  local use_postgres
  whiptail --title "Datenbank" \
    --yesno "PostgreSQL als Datenbank-Backend verwenden?\n\n(Nein = dateibasierter Speicher, für Produktion PostgreSQL empfohlen)" \
    10 65
  use_postgres=$?

  local database_url=""
  if [[ $use_postgres -eq 0 ]]; then
    database_url=$(whiptail --title "PostgreSQL" \
      --inputbox "PostgreSQL Connection-URL:" \
      10 70 "postgresql://webapp:passwort@localhost:5432/gmz_webapp" 3>&1 1>&2 2>&3) || database_url=""
  fi

  # Umgebungsvariablen schreiben
  local env_file="$install_dir/platform/webapp/.env"
  cat > "$env_file" << EOF
# GMZ Cloud Business Apps — Konfiguration
# Generiert: $(date)

# ─── Authentifizierung ───────────────────────────────────────────────────────
WEBAPP_AUTH_MODE=${auth_mode}
$([ -n "$api_token" ] && echo "WEBAPP_TRUSTED_TOKENS_JSON='${api_token}'" || true)

# ─── Datenbank ───────────────────────────────────────────────────────────────
$([ -n "$database_url" ] && echo "DATABASE_URL=${database_url}" || echo "# DATABASE_URL=postgresql://user:pass@host:5432/dbname")

# ─── Sicherheit ──────────────────────────────────────────────────────────────
WEBAPP_NOTIFICATION_ENCRYPTION_KEY=$(openssl rand -hex 16 2>/dev/null || echo "changeme32charkey123456789012345")

# ─── Provisioning ────────────────────────────────────────────────────────────
# PROVISION_EXECUTION_ENABLED=true       # Aktiviert echte VM-Provisionierung
# PROVISION_PROXMOX_ENDPOINT=https://proxmox.local:8006/api2/json
# PROVISION_PROXMOX_API_TOKEN=user@pve!token=secret

# ─── Entwicklung ─────────────────────────────────────────────────────────────
NODE_ENV=production
# NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH=false  # NUR für dev-header auth mode
EOF

  whiptail --title "✅ Konfiguration gespeichert" \
    --msgbox "Konfiguration gespeichert in:\n  $env_file\n\nAuth-Mode: $auth_mode\nDatenbank: $([ -n "$database_url" ] && echo 'PostgreSQL' || echo 'Dateibasiert')\n\n⚠️  Bitte .env prüfen und vervollständigen bevor Services gestartet werden!" \
    14 70
}

# ---------------------------------------------------------------------------
# Schritt 3.7: Services starten und verifizieren
# ---------------------------------------------------------------------------
step_start_services() {
  local install_dir
  install_dir=$(grep "^INSTALL_DIR=" "$CONF_FILE" 2>/dev/null | cut -d= -f2 || echo "/opt/gmz-cloud-business-apps")

  local CHOICES
  CHOICES=$(whiptail --title "Schritt 3.7 — Services starten" \
    --checklist "Welche Services sollen gestartet werden?" 18 70 5 \
    "webapp"     "Control-Plane WebApp (Next.js)"         ON  \
    "monitoring" "Monitoring Stack (Prometheus/Grafana)"   OFF \
    "traefik"    "Traefik (via Ansible Playbook)"          OFF \
    3>&1 1>&2 2>&3) || return 1

  # WebApp
  if echo "$CHOICES" | grep -q "webapp"; then
    whiptail --title "WebApp starten" \
      --yesno "WebApp als systemd-Service einrichten und starten?\n\nErfordert Node.js 20+ auf diesem System." \
      10 65

    if [[ $? -eq 0 ]]; then
      {
        echo "20"; echo "XXX"; echo "20"; echo "WebApp bauen..."; echo "XXX"
        cd "$install_dir/platform/webapp" && npm run build 2>/dev/null

        echo "60"; echo "XXX"; echo "60"; echo "systemd-Service erstellen..."; echo "XXX"
        cat > /etc/systemd/system/gmz-webapp.service << SVCEOF
[Unit]
Description=GMZ Cloud Business Apps WebApp
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$install_dir/platform/webapp
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
EnvironmentFile=$install_dir/platform/webapp/.env

[Install]
WantedBy=multi-user.target
SVCEOF

        echo "80"; echo "XXX"; echo "80"; echo "Service aktivieren..."; echo "XXX"
        systemctl daemon-reload
        systemctl enable --now gmz-webapp

        echo "100"; echo "XXX"; echo "100"; echo "WebApp gestartet!"; echo "XXX"
      } | whiptail --title "WebApp wird gestartet..." --gauge "Bitte warten..." 8 70 0

      sleep 3
      local status
      status=$(systemctl is-active gmz-webapp 2>/dev/null || echo "unknown")
      whiptail --title "WebApp-Status" \
        --msgbox "WebApp-Service Status: $status\n\nErreichbar unter:\n  http://$(hostname -I | awk '{print $1}'):3000\n\nLog anzeigen:\n  journalctl -u gmz-webapp -f" \
        12 65
    fi
  fi

  # Monitoring
  if echo "$CHOICES" | grep -q "monitoring"; then
    {
      echo "40"; echo "XXX"; echo "40"; echo "Monitoring Stack starten..."; echo "XXX"
      cd "$install_dir/infra/monitoring" && docker compose up -d 2>/dev/null || true
      echo "100"; echo "XXX"; echo "100"; echo "Monitoring gestartet!"; echo "XXX"
    } | whiptail --title "Monitoring wird gestartet..." --gauge "Bitte warten..." 8 70 0

    whiptail --title "Monitoring Stack" \
      --msgbox "Monitoring Stack gestartet!\n\nErreichbar unter:\n  Grafana:    http://$(hostname -I | awk '{print $1}'):3001\n  Prometheus: http://$(hostname -I | awk '{print $1}'):9090\n\n⚠️  Grafana-Passwort in .env setzen (GRAFANA_ADMIN_PASSWORD)!" \
      13 65
  fi

  # Traefik
  if echo "$CHOICES" | grep -q "traefik"; then
    whiptail --title "Traefik via Ansible" \
      --msgbox "Traefik-Deployment über Ansible:\n\nBefehl:\n  cd $install_dir/automation/ansible\n  ansible-playbook deploy-traefik.yml -i inventory/production.yml\n\nVorher benötigt:\n  • inventory/production.yml konfigurieren\n  • IONOS_API_KEY in Ansible Vault setzen\n\nSiehe: docs/SETUP-GUIDE.md → Abschnitt 4" \
      16 70
  fi
}

# ---------------------------------------------------------------------------
# Abschluss-Zusammenfassung
# ---------------------------------------------------------------------------
show_summary() {
  local install_dir
  install_dir=$(grep "^INSTALL_DIR=" "$CONF_FILE" 2>/dev/null | cut -d= -f2 || "nicht konfiguriert")

  whiptail --title "🎉 Installation abgeschlossen!" \
    --msgbox "\
GMZ Cloud Business Apps wurde eingerichtet!

Installationsverzeichnis:
  $install_dir

Nächste Schritte:
  1. .env-Datei prüfen und vervollständigen
  2. Traefik deployen (Abschnitt 4 im Setup-Guide)
  3. Ersten Tenant provisionieren
  4. Apps deployen

Wichtige Links:
  📖 Setup-Guide: docs/SETUP-GUIDE.md
  🌐 WebApp:      http://$(hostname -I | awk '{print $1}' 2>/dev/null || 'localhost'):3000

Log-Datei: $LOGFILE

Bei Problemen: docs/SETUP-GUIDE.md → Abschnitt 13 (Troubleshooting)" \
    24 72
}

# ---------------------------------------------------------------------------
# Hauptmenü
# ---------------------------------------------------------------------------
main_menu() {
  while true; do
    local choice
    choice=$(whiptail --title "🚀 GMZ Cloud Business Apps — Setup Wizard" \
      --menu "Installations-Schritt wählen:" 22 72 9 \
      "3.2" "Docker installieren" \
      "3.3" "OpenTofu installieren" \
      "3.4" "Ansible installieren" \
      "3.5" "Repository klonen" \
      "3.6" "Umgebungsvariablen konfigurieren" \
      "3.7" "Services starten und verifizieren" \
      "all" "Alle Schritte nacheinander ausführen ✨" \
      "log" "Installations-Log anzeigen" \
      "exit" "Beenden" \
      3>&1 1>&2 2>&3) || break

    case "$choice" in
      "3.2") step_docker ;;
      "3.3") step_opentofu ;;
      "3.4") step_ansible ;;
      "3.5") step_clone_repo ;;
      "3.6") step_configure_env ;;
      "3.7") step_start_services ;;
      "all")
        step_docker
        step_opentofu
        step_ansible
        step_clone_repo
        step_configure_env
        step_start_services
        show_summary
        ;;
      "log")
        whiptail --title "Installations-Log" \
          --textbox "$LOGFILE" 30 80
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
