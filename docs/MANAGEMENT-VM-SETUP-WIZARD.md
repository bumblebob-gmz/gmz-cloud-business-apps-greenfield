# Management-VM Setup-Wizard (Debian)

## Ziel
Ein geführter Erstinstallationsprozess, der die Management-VM vollständig betriebsbereit macht.

## Wizard Steps

### Step 1 – System Preflight
- Debian Version prüfen
- CPU/RAM/Disk Mindestwerte prüfen
- Netzwerk/Outbound DNS prüfen
- Uhrzeit/NTP prüfen

### Step 2 – Core Dependencies
- Docker + Compose installieren
- Runtime-Verzeichnisse anlegen
- Firewall Basisregeln anwenden

### Step 3 – Proxmox Integration
- Eingaben:
  - Proxmox URL
  - API User
  - API Token ID/Secret
  - Node(s), Storage-Profil (LVM-Thin/Ceph)
- Test:
  - API Zugriff
  - VM create/list Rechte
  - Network read Rechte

### Step 4 – DNS / TLS (IONOS)
- IONOS API Credentials erfassen
- Zone `irongeeks.eu` prüfen
- DNS Challenge Test für ACME

### Step 5 – Data Services
- PostgreSQL initialisieren
- Redis initialisieren
- Migrations ausführen

### Step 6 – Platform Services
- GMZ API + Worker starten
- Traefik starten
- Monitoring Stack starten (Prometheus/Grafana/Loki)

### Step 7 – Security Setup
- Initial Admin User anlegen
- RBAC Basisrollen aktivieren
- Secret-Encryption-Key setzen
- Audit Logging aktivieren

### Step 8 – Validation
- End-to-End Smoke Tests:
  - Proxmox connectivity
  - DNS challenge
  - DB/Redis
  - Queue processing
  - Traefik routing test

## Ausgabe
- Setup-Report (JSON + PDF)
- Status Dashboard mit Ampeln (grün/gelb/rot)
- Hinweise für optionale HA-Aktivierung

## Operator-Hilfe: Proxmox API User Erstellung
Wizard liefert zusätzlich klickbare Schritt-für-Schritt Kommandos für Proxmox Shell:
- Rolle anlegen
- User anlegen
- Token erzeugen
- Rechte auf Datacenter/Node/Storage/SDN zuweisen

> Hinweis: Exakte Rechte werden als minimaler Satz + "erweiterter Satz" angeboten, weil die Plattform laut Vorgabe fast alle Operationen ausführen darf.
