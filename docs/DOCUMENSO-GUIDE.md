# Documenso — Vollständige Installations- und Betriebsanleitung

**Plattform:** GMZ Cloud Business Apps  
**Version:** Documenso 1.5.6  
**Stand:** 2026-03  
**Maintainer:** GMZ Platform Team

---

## Inhaltsverzeichnis

1. [Was ist Documenso?](#1-was-ist-documenso)
2. [Architektur in dieser Plattform](#2-architektur-in-dieser-plattform)
3. [Voraussetzungen](#3-voraussetzungen)
4. [Installation via WebApp-Tenant-Wizard](#4-installation-via-webapp-tenant-wizard)
5. [Manuelle Installation via Ansible](#5-manuelle-installation-via-ansible)
6. [Umgebungsvariablen-Referenz](#6-umgebungsvariablen-referenz)
7. [SMTP-Konfiguration](#7-smtp-konfiguration)
8. [SSO / OIDC-Integration mit Authentik](#8-sso--oidc-integration-mit-authentik)
9. [Traefik Reverse Proxy Konfiguration](#9-traefik-reverse-proxy-konfiguration)
10. [Erste Schritte](#10-erste-schritte)
11. [Dokumentvorlagen](#11-dokumentvorlagen)
12. [Dokumente zur Signatur senden](#12-dokumente-zur-signatur-senden)
13. [Webhooks](#13-webhooks)
14. [API-Referenz](#14-api-referenz)
15. [Backup und Restore](#15-backup-und-restore)
16. [Upgrade-Prozedur](#16-upgrade-prozedur)
17. [Troubleshooting](#17-troubleshooting)
18. [Security Hardening Checklist](#18-security-hardening-checklist)

---

## 1. Was ist Documenso?

Documenso ist eine **vollständig Open-Source-Lösung für elektronische Dokumentensignaturen** — die selbst gehostete Alternative zu DocuSign, HelloSign und ähnlichen SaaS-Diensten.

### Warum Documenso statt DocuSign?

| Kriterium | DocuSign | HelloSign | Documenso (self-hosted) |
|---|---|---|---|
| Datenschutz | US-Server, kein DSGVO-Opt-out | US-Server | Eigene Server, vollständige Datenkontrolle |
| Kosten | ab ~$25/User/Monat | ab ~$15/User/Monat | Infrastrukturkosten only |
| API-Limits | Kontingentiert je Plan | Kontingentiert je Plan | Unbegrenzt |
| Quellcode | Closed Source | Closed Source | AGPLv3, vollständig einsehbar |
| Customizing | Nicht möglich | Eingeschränkt | Vollständig anpassbar |
| Offline-Betrieb | Nicht möglich | Nicht möglich | Möglich |
| Vendor Lock-in | Hoch | Mittel | Keiner |

### Funktionsumfang

- **Elektronische Signaturen** — rechtsgültig nach eIDAS (qualifizierte eSignatur mit separater Infrastruktur möglich)
- **Dokumentvorlagen** — wiederverwendbare Templates mit frei platzierbaren Feldern
- **Signatur-Felder** — Unterschrift, Initiale, Datum, Text, Checkbox, Dropdown
- **Signing-Order** — definierbare Reihenfolge mehrerer Unterzeichner
- **Audit-Trail** — vollständiges Protokoll aller Aktionen mit Zeitstempeln und IP-Adressen
- **Webhook-Events** — Echtzeit-Benachrichtigung bei Signaturereignissen
- **REST-API** — vollständige Automatisierung über API-Keys
- **Team-Funktionen** — Organisationen, Rollen, geteilte Vorlagen
- **OIDC/OAuth2** — Integration mit bestehenden Identity-Providern (Authentik, Keycloak, etc.)

---

## 2. Architektur in dieser Plattform

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Traefik (Management-VM)                            │
│  sign.<tenant>.irongeeks.eu → IONOS DNS ACME TLS   │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  Tenant-VM (Debian 13, VLAN-isoliert)               │
│                                                     │
│  ┌─────────────────┐  ┌──────────────────────────┐ │
│  │  Documenso App  │  │  PostgreSQL (sidecar)     │ │
│  │  :3000          │  │  :5432                    │ │
│  └────────┬────────┘  └──────────────────────────┘ │
│           │                                         │
│  ┌────────┴────────┐                               │
│  │  Authentik SSO  │  (optional, shared service)   │
│  │  OIDC Provider  │                               │
│  └─────────────────┘                               │
└─────────────────────────────────────────────────────┘
```

### Komponenten

| Komponente | Rolle | Port |
|---|---|---|
| `documenso/documenso` | Next.js Webapp + API | 3000 |
| `postgres:16-alpine` | Datenbank (Sidecar) | 5432 (intern) |
| Traefik | TLS-Terminierung + Routing | 443 |
| Authentik | OIDC Identity Provider | (shared) |

### Datenisolierung

Jeder Tenant erhält eine **eigene Documenso-Instanz** mit eigener PostgreSQL-Datenbank und eigenem Datenvolumen. Es gibt keine mandantenübergreifenden Daten.

---

## 3. Voraussetzungen

### Pflicht

- [ ] **Tenant-VM** erfolgreich provisioniert und `Active`
- [ ] **Domain** konfiguriert — Subdomain `sign.<tenant-slug>.irongeeks.eu` oder eigene Domain
- [ ] **SMTP-Zugang** — für Versand von Signatureinladungen und Benachrichtigungen
- [ ] **Traefik** auf Management-VM deployt und IONOS DNS ACME konfiguriert
- [ ] Mindestens **4 GB RAM** und **20 GB Disk** auf der Tenant-VM

### Optional

- [ ] **Authentik** — für SSO/OIDC-Login statt lokalen Accounts
- [ ] **S3-kompatibler Storage** — für skalierbare Dokumentablage (Standard: lokales Volume)

### Netzwerk-Anforderungen

```
Tenant-VM benötigt ausgehend:
  - TCP 443: IONOS DNS API (für ACME)
  - TCP 587/465: SMTP-Server
  - TCP 443: OIDC-Endpunkt (falls Authentik extern)
  
Eingehend (via Traefik):
  - TCP 443: HTTPS-Traffic von Internet
```

---

## 4. Installation via WebApp-Tenant-Wizard

### 4.1 Tenant-Wizard öffnen

1. In der WebApp-Control-Plane einloggen
2. **Tenants** → gewünschten Tenant auswählen → **Apps** → **App hinzufügen**
3. Im App-Katalog **Documenso** auswählen

### 4.2 Pflichtfelder

| Feld | Beschreibung | Beispiel |
|---|---|---|
| **Domain** | Vollständiger FQDN für Documenso | `sign.atlasretail.irongeeks.eu` |
| **DB-Passwort** | PostgreSQL-Passwort (min. 16 Zeichen) | `MyS3cur3DB!Pass2026` |
| **Secret Key** | NextAuth-Secret (min. 32 Zeichen) | `$(openssl rand -hex 32)` |
| **Encryption Key** | AES-Schlüssel (exakt 32 Zeichen) | `$(openssl rand -hex 16)` |
| **SMTP Host** | Hostname des SMTP-Servers | `smtp.office365.com` |
| **SMTP Port** | SMTP-Port | `587` |
| **SMTP User** | SMTP-Benutzername / E-Mail | `sign@atlasretail.de` |
| **SMTP Passwort** | SMTP-Passwort / App-Passwort | `***` |
| **SMTP From** | Absenderadresse | `sign@atlasretail.de` |

### 4.3 Optionale Felder

| Feld | Beschreibung | Standard |
|---|---|---|
| **SMTP From Name** | Anzeigename des Absenders | `Documenso` |
| **SMTP Secure** | SSL/TLS für Port 465 | `false` |
| **OIDC Well-Known** | Authentik OIDC Discovery URL | leer |
| **OIDC Client ID** | OIDC Application ID | leer |
| **OIDC Client Secret** | OIDC Application Secret | leer |
| **Version** | Documenso Image-Tag | `1.5.6` |

### 4.4 Deployment starten

1. Alle Pflichtfelder ausfüllen → **Speichern**
2. Deployment-Job startet automatisch (Status: `Running`)
3. Job-Fortschritt unter **Jobs** → Job-ID verfolgen
4. Nach ca. 2–5 Minuten: Status `Success`
5. Documenso unter `https://<domain>` erreichbar

### 4.5 Initialer Admin-Account

Beim ersten Start erstellt Documenso automatisch einen Admin-Account. Die Zugangsdaten werden in den Job-Logs angezeigt:

```
POST https://sign.atlasretail.irongeeks.eu/api/v1/admin/setup
{
  "name": "Admin",
  "email": "admin@atlasretail.de",
  "password": "<generiertes Passwort>"
}
```

---

## 5. Manuelle Installation via Ansible

### 5.1 Variablen vorbereiten

Erstelle eine Variablendatei für den Tenant:

```yaml
# inventory/host_vars/tenant-atlasretail.yml
documenso_domain: "sign.atlasretail.irongeeks.eu"
documenso_db_password: "{{ vault_documenso_db_password }}"
documenso_secret_key: "{{ vault_documenso_secret_key }}"
documenso_encryption_key: "{{ vault_documenso_encryption_key }}"
documenso_smtp_host: "smtp.office365.com"
documenso_smtp_port: "587"
documenso_smtp_user: "sign@atlasretail.de"
documenso_smtp_pass: "{{ vault_documenso_smtp_pass }}"
documenso_smtp_from: "sign@atlasretail.de"
documenso_smtp_from_name: "Atlas Retail Signaturen"
```

### 5.2 Ansible Vault für Secrets

```bash
# Secrets in Vault verschlüsseln
ansible-vault encrypt_string 'MyS3cur3DB!Pass2026' --name vault_documenso_db_password
ansible-vault encrypt_string 'abcdef1234567890abcdef1234567890' --name vault_documenso_secret_key
ansible-vault encrypt_string '1234567890abcdef1234567890abcdef' --name vault_documenso_encryption_key
ansible-vault encrypt_string 'SmtpPassw0rd!' --name vault_documenso_smtp_pass
```

### 5.3 Playbook ausführen

```bash
cd automation/ansible

# Documenso auf einem Tenant deployen
ansible-playbook deploy-app.yml \
  -i inventory/production.yml \
  -l tenant-atlasretail \
  --extra-vars "app=documenso" \
  --ask-vault-pass

# Nur Documenso-Tasks ausführen (nach initialem Deploy)
ansible-playbook deploy-app.yml \
  -i inventory/production.yml \
  -l tenant-atlasretail \
  --tags documenso \
  --ask-vault-pass
```

### 5.4 Deployment verifizieren

```bash
# SSH auf Tenant-VM
ssh deploy@10.120.10.100

# Container-Status prüfen
docker compose -f /opt/documenso/docker-compose.yml ps

# Logs prüfen
docker compose -f /opt/documenso/docker-compose.yml logs --tail=50 documenso

# Healthcheck manuell
curl -sf http://localhost:3000/api/health && echo "OK"
```

---

## 6. Umgebungsvariablen-Referenz

### 6.1 Pflicht-Variablen

| Variable | Beschreibung | Beispiel | Pflicht |
|---|---|---|---|
| `NEXTAUTH_URL` | Vollständige öffentliche URL der App | `https://sign.domain.de` | ✅ |
| `NEXTAUTH_SECRET` | Zufälliger Secret für Session-Tokens (min. 32 Zeichen) | `openssl rand -hex 32` | ✅ |
| `NEXT_PUBLIC_WEBAPP_URL` | Identisch mit NEXTAUTH_URL (für Client-seitige Aufrufe) | `https://sign.domain.de` | ✅ |
| `DATABASE_URL` | PostgreSQL Connection String | `postgresql://user:pass@host:5432/db` | ✅ |
| `NEXT_PRIVATE_ENCRYPTION_KEY` | AES-256 Schlüssel für Dokumentverschlüsselung (exakt 32 Zeichen) | `openssl rand -hex 16` | ✅ |

### 6.2 SMTP-Variablen

| Variable | Beschreibung | Beispiel | Pflicht |
|---|---|---|---|
| `NEXT_PRIVATE_SMTP_HOST` | Hostname des SMTP-Servers | `smtp.office365.com` | ✅ |
| `NEXT_PRIVATE_SMTP_PORT` | SMTP-Port | `587` | ✅ |
| `NEXT_PRIVATE_SMTP_USERNAME` | SMTP-Benutzername | `sign@domain.de` | ✅ |
| `NEXT_PRIVATE_SMTP_PASSWORD` | SMTP-Passwort | `***` | ✅ |
| `NEXT_PRIVATE_SMTP_FROM_ADDRESS` | Absenderadresse | `sign@domain.de` | ✅ |
| `NEXT_PRIVATE_SMTP_FROM_NAME` | Anzeigename | `Meine Firma Signaturen` | ❌ |
| `NEXT_PRIVATE_SMTP_SECURE` | SSL/TLS aktivieren (für Port 465) | `false` | ❌ |

### 6.3 OIDC/SSO-Variablen (optional)

| Variable | Beschreibung | Beispiel |
|---|---|---|
| `NEXT_PRIVATE_OIDC_WELL_KNOWN` | OIDC Discovery URL | `https://auth.domain.de/application/o/documenso/.well-known/openid-configuration` |
| `NEXT_PRIVATE_OIDC_CLIENT_ID` | Application Client ID | `documenso-production` |
| `NEXT_PRIVATE_OIDC_CLIENT_SECRET` | Application Client Secret | `***` |
| `NEXT_PRIVATE_OIDC_CALLBACK_URL` | Callback URL (automatisch) | `https://sign.domain.de/api/auth/callback/oidc` |
| `NEXT_PRIVATE_OIDC_SCOPE` | Angeforderte Scopes | `openid email profile` |

### 6.4 Erweiterte Variablen

| Variable | Beschreibung | Standard |
|---|---|---|
| `NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY` | Sekundärer Encryption-Key für Key-Rotation | = Primary Key |
| `NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS` | Base64-kodiertes P12-Zertifikat für qualifizierte Signatur | leer |
| `NEXT_PRIVATE_SIGNING_LOCAL_FILE_PASSWORD` | Passwort für P12-Zertifikat | leer |
| `NEXT_PRIVATE_STORAGE_TRANSPORT` | Storage-Backend (`local` oder `s3`) | `local` |
| `NEXT_PRIVATE_STORAGE_LOCAL_PATH` | Lokaler Uploadpfad | `/app/public/uploads` |
| `NEXT_PRIVATE_S3_ACCESS_KEY_ID` | S3 Access Key (falls storage=s3) | leer |
| `NEXT_PRIVATE_S3_SECRET_ACCESS_KEY` | S3 Secret Key | leer |
| `NEXT_PRIVATE_S3_BUCKET` | S3 Bucket Name | leer |
| `NEXT_PRIVATE_S3_ENDPOINT` | S3 Endpoint (für MinIO) | leer |

---

## 7. SMTP-Konfiguration

### 7.1 Microsoft Office 365 / Exchange Online

```env
NEXT_PRIVATE_SMTP_HOST=smtp.office365.com
NEXT_PRIVATE_SMTP_PORT=587
NEXT_PRIVATE_SMTP_USERNAME=sign@deinefirma.de
NEXT_PRIVATE_SMTP_PASSWORD=DeinPasswort123!
NEXT_PRIVATE_SMTP_FROM_ADDRESS=sign@deinefirma.de
NEXT_PRIVATE_SMTP_FROM_NAME=Firmensignaturen
NEXT_PRIVATE_SMTP_SECURE=false
```

**Wichtig für Office 365:**
- SMTP AUTH muss im Microsoft 365 Admin Center aktiviert sein
- Für moderne Authentifizierung: App-Passwort verwenden (MFA-Umgebungen)
- SMTP AUTH aktivieren: `Admin Center → Users → [User] → Mail → Manage email apps → Authenticated SMTP ✅`

### 7.2 Gmail / Google Workspace

```env
NEXT_PRIVATE_SMTP_HOST=smtp.gmail.com
NEXT_PRIVATE_SMTP_PORT=587
NEXT_PRIVATE_SMTP_USERNAME=sign@deinefirma.de
NEXT_PRIVATE_SMTP_PASSWORD=app-passwort-hier  # App-Passwort, nicht Account-Passwort!
NEXT_PRIVATE_SMTP_FROM_ADDRESS=sign@deinefirma.de
NEXT_PRIVATE_SMTP_FROM_NAME=Firmensignaturen
NEXT_PRIVATE_SMTP_SECURE=false
```

**App-Passwort generieren:**
1. Google Account → Sicherheit → 2-Faktor-Authentifizierung aktivieren
2. Google Account → Sicherheit → App-Passwörter → App: E-Mail, Gerät: Server
3. Generierten 16-stelligen Code als `SMTP_PASSWORD` verwenden

### 7.3 Custom SMTP (z.B. Postfix/Dovecot)

```env
NEXT_PRIVATE_SMTP_HOST=mail.interneserver.de
NEXT_PRIVATE_SMTP_PORT=465
NEXT_PRIVATE_SMTP_USERNAME=sign@deinefirma.de
NEXT_PRIVATE_SMTP_PASSWORD=DeinPasswort!
NEXT_PRIVATE_SMTP_FROM_ADDRESS=sign@deinefirma.de
NEXT_PRIVATE_SMTP_SECURE=true  # true bei Port 465 (SSL), false bei 587 (STARTTLS)
```

### 7.4 SMTP-Verbindung testen

```bash
# Auf der Tenant-VM (ohne Documenso):
docker run --rm alpine/curl sh -c \
  "apk add --no-cache openssl && \
   openssl s_client -connect smtp.office365.com:587 -starttls smtp"

# Mit swaks (Swiss Army Knife for SMTP):
swaks --to empfaenger@test.de \
      --from sign@deinefirma.de \
      --server smtp.office365.com \
      --port 587 \
      --auth LOGIN \
      --auth-user sign@deinefirma.de \
      --auth-password 'DeinPasswort!' \
      --tls
```

---

## 8. SSO / OIDC-Integration mit Authentik

### 8.1 Authentik Application anlegen

1. **Authentik Admin** → **Applications** → **Create Application**
2. Felder:
   - **Name:** `Documenso - Atlas Retail`
   - **Slug:** `documenso-atlasretail`
   - **Provider:** Neuen erstellen → **OAuth2/OpenID Provider**

### 8.2 OAuth2 Provider konfigurieren

| Feld | Wert |
|---|---|
| **Name** | `Documenso Atlas Retail Provider` |
| **Authorization flow** | `default-provider-authorization-explicit-consent` |
| **Client type** | `Confidential` |
| **Client ID** | (automatisch generiert — notieren!) |
| **Client Secret** | (automatisch generiert — notieren!) |
| **Redirect URIs** | `https://sign.atlasretail.irongeeks.eu/api/auth/callback/oidc` |
| **Scopes** | `openid`, `email`, `profile` |
| **Subject mode** | `Based on the User's Email` |

### 8.3 Documenso OIDC Variablen setzen

```env
NEXT_PRIVATE_OIDC_WELL_KNOWN=https://auth.atlasretail.irongeeks.eu/application/o/documenso-atlasretail/.well-known/openid-configuration
NEXT_PRIVATE_OIDC_CLIENT_ID=<Client-ID aus Schritt 8.2>
NEXT_PRIVATE_OIDC_CLIENT_SECRET=<Client-Secret aus Schritt 8.2>
```

### 8.4 Authentik User-Attributes mappen

Damit Vor- und Nachname korrekt übertragen werden, muss in Authentik ein **Property Mapping** aktiv sein:

- `OAuth Mapping: OpenID 'profile'` — überträgt `given_name`, `family_name`, `name`
- `OAuth Mapping: OpenID 'email'` — überträgt `email`, `email_verified`

Diese Mappings sind in Authentik standardmäßig vorhanden.

### 8.5 Login-Flow testen

1. Documenso öffnen: `https://sign.atlasretail.irongeeks.eu`
2. **Sign in with SSO** klicken
3. Weiterleitung zu Authentik Login-Seite
4. Authentik-Zugangsdaten eingeben
5. Consent-Seite bestätigen (einmalig)
6. Redirect zurück zu Documenso — eingeloggt als Authentik-User

### 8.6 Auto-Provisioning

Beim ersten SSO-Login wird automatisch ein Documenso-Account mit der Authentik-E-Mail-Adresse erstellt. Admin-Rechte müssen manuell vergeben werden:

```bash
# Admin-API-Key setzen und Rechte vergeben
curl -X PATCH https://sign.atlasretail.irongeeks.eu/api/v1/admin/users/<user-id> \
  -H "Authorization: Bearer <admin-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"role": "ADMIN"}'
```

---

## 9. Traefik Reverse Proxy Konfiguration

### 9.1 Automatische Konfiguration

Die Plattform konfiguriert Traefik automatisch über Docker Labels in `compose.template.yml`:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.documenso.rule=Host(`sign.atlasretail.irongeeks.eu`)"
  - "traefik.http.routers.documenso.entrypoints=websecure"
  - "traefik.http.routers.documenso.tls.certresolver=ionos"
  - "traefik.http.services.documenso.loadbalancer.server.port=3000"
```

### 9.2 SSL-Zertifikat

Traefik bezieht automatisch ein Let's Encrypt Wildcard-Zertifikat über die IONOS DNS Challenge:

- `*.atlasretail.irongeeks.eu` — deckt alle Subdomains ab
- Automatische Erneuerung 30 Tage vor Ablauf
- Kein manuelles Eingreifen erforderlich

### 9.3 Eigene Domain

Falls der Tenant eine eigene Domain (`sign.atlasretail.de`) verwenden möchte:

1. DNS-CNAME-Eintrag: `sign.atlasretail.de → management-vm.irongeeks.eu`
2. In der App-Konfiguration `domain: sign.atlasretail.de` setzen
3. Traefik konfiguriert automatisch ein separates Let's Encrypt Zertifikat

---

## 10. Erste Schritte

### 10.1 Initialer Login

Nach erfolgreichem Deployment:

1. `https://sign.<tenant>.irongeeks.eu` öffnen
2. **Create an account** mit Admin-E-Mail und sicherem Passwort
3. Passwort-Bestätigungsmail abwarten und Link klicken

### 10.2 Organisation einrichten

1. **Settings** → **Organisation** → **Name** setzen
2. **Logo** hochladen (PNG/SVG, empfohlen 200×60px)
3. **Branding** → Primärfarbe anpassen

### 10.3 API-Key erstellen

```
Settings → API Keys → Create API Key
Name: "Platform Integration"
Permissions: Read + Write
Expiry: Nach Bedarf
```

Den generierten Key sicher aufbewahren — er wird nur einmal angezeigt.

---

## 11. Dokumentvorlagen

### 11.1 Neue Vorlage erstellen

1. **Templates** → **New Template**
2. PDF hochladen (max. 50 MB)
3. Felder platzieren:
   - **Signature** — Unterschriftsfeld (erforderlich für gültige Signatur)
   - **Initial** — Kürzel-Feld
   - **Date** — Datum (automatisch befüllt beim Signieren)
   - **Text** — Freitextfeld
   - **Checkbox** — Zustimmungsfeld
   - **Dropdown** — Auswahlliste

### 11.2 Empfänger definieren

Für jede Vorlage können mehrere Empfänger-Rollen definiert werden:

- **Signer** — muss aktiv unterzeichnen
- **Approver** — muss nur genehmigen (kein Unterschriftfeld erforderlich)
- **CC** — erhält Kopie nach Abschluss, muss nicht unterzeichnen

### 11.3 Signing Order

Bei mehreren Unterzeichnern kann eine Reihenfolge erzwungen werden:

```
Empfänger 1: Mitarbeiter (Order: 1)
Empfänger 2: Abteilungsleiter (Order: 2)  ← erhält erst E-Mail wenn Empfänger 1 unterschrieben hat
Empfänger 3: Geschäftsführer (Order: 3)
```

---

## 12. Dokumente zur Signatur senden

### 12.1 Via UI

1. **New Document** → PDF hochladen
2. Empfänger hinzufügen (E-Mail + Name)
3. Felder platzieren und Empfängern zuweisen
4. **Send** → Bestätigung

### 12.2 Via API

Vollständiges Beispiel für einen Signaturworkflow:

```bash
API_KEY="dein-api-key"
BASE_URL="https://sign.atlasretail.irongeeks.eu"

# 1. Dokument hochladen
DOCUMENT_ID=$(curl -s -X POST "${BASE_URL}/api/v1/documents" \
  -H "Authorization: Bearer ${API_KEY}" \
  -F "file=@/path/to/vertrag.pdf" \
  -F "title=Arbeitsvertrag Mustermann" \
  | jq -r '.documentId')

echo "Document ID: ${DOCUMENT_ID}"

# 2. Empfänger hinzufügen
curl -s -X POST "${BASE_URL}/api/v1/documents/${DOCUMENT_ID}/recipients" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": [
      {
        "name": "Max Mustermann",
        "email": "max.mustermann@example.de",
        "role": "SIGNER"
      },
      {
        "name": "HR Manager",
        "email": "hr@atlasretail.de",
        "role": "CC"
      }
    ]
  }'

# 3. Dokument zur Signatur senden
curl -s -X POST "${BASE_URL}/api/v1/documents/${DOCUMENT_ID}/send" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Bitte unterzeichnen Sie Ihren Arbeitsvertrag.",
    "sendEmail": true
  }'

echo "Dokument gesendet!"
```

### 12.3 Status abfragen

```bash
# Dokumentstatus abfragen
curl -s "${BASE_URL}/api/v1/documents/${DOCUMENT_ID}" \
  -H "Authorization: Bearer ${API_KEY}" \
  | jq '{status: .status, recipients: [.recipients[] | {name: .name, status: .signingStatus}]}'
```

### 12.4 Signiertes Dokument herunterladen

```bash
# Nach Status "COMPLETED"
curl -s "${BASE_URL}/api/v1/documents/${DOCUMENT_ID}/download" \
  -H "Authorization: Bearer ${API_KEY}" \
  -o "vertrag-signed-${DOCUMENT_ID}.pdf"
```

---

## 13. Webhooks

### 13.1 Webhook anlegen

```
Settings → Webhooks → Create Webhook
URL: https://deine-app.de/webhooks/documenso
Events: Alle auswählen
Secret: <zufälliger String>
```

### 13.2 Webhook-Events

| Event | Auslöser |
|---|---|
| `document.created` | Neues Dokument angelegt |
| `document.sent` | Dokument zur Signatur gesendet |
| `document.opened` | Empfänger öffnet Signaturlink |
| `document.signed` | Einzelner Empfänger hat unterschrieben |
| `document.completed` | Alle Empfänger haben unterschrieben |
| `document.declined` | Empfänger hat abgelehnt |
| `document.cancelled` | Dokument wurde storniert |

### 13.3 Payload-Format

```json
{
  "event": "document.completed",
  "createdAt": "2026-03-09T14:30:00.000Z",
  "webhookEndpoint": "https://deine-app.de/webhooks/documenso",
  "data": {
    "id": 1234,
    "title": "Arbeitsvertrag Mustermann",
    "status": "COMPLETED",
    "documentDataId": "clx...",
    "createdAt": "2026-03-09T10:00:00.000Z",
    "updatedAt": "2026-03-09T14:30:00.000Z",
    "completedAt": "2026-03-09T14:30:00.000Z",
    "recipients": [
      {
        "id": 567,
        "name": "Max Mustermann",
        "email": "max.mustermann@example.de",
        "signingStatus": "SIGNED",
        "signedAt": "2026-03-09T14:30:00.000Z"
      }
    ]
  }
}
```

### 13.4 Webhook-Signatur verifizieren

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Express Beispiel
app.post('/webhooks/documenso', (req, res) => {
  const signature = req.headers['x-documenso-signature'] as string;
  const payload = JSON.stringify(req.body);
  
  if (!verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET!)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const { event, data } = req.body;
  
  switch (event) {
    case 'document.completed':
      // Signiertes Dokument herunterladen und archivieren
      break;
    case 'document.declined':
      // Benachrichtigung an Ersteller senden
      break;
  }
  
  res.status(200).json({ received: true });
});
```

---

## 14. API-Referenz

### 14.1 Authentifizierung

Alle API-Requests erfordern einen API-Key im `Authorization`-Header:

```bash
curl -H "Authorization: Bearer dein-api-key" \
     https://sign.atlasretail.irongeeks.eu/api/v1/...
```

### 14.2 Dokumente

```bash
# Alle Dokumente auflisten
curl -s "https://sign.domain.de/api/v1/documents" \
  -H "Authorization: Bearer ${API_KEY}" \
  | jq '.documents[] | {id: .id, title: .title, status: .status}'

# Einzelnes Dokument abrufen
curl -s "https://sign.domain.de/api/v1/documents/${DOCUMENT_ID}" \
  -H "Authorization: Bearer ${API_KEY}"

# Dokument löschen
curl -s -X DELETE "https://sign.domain.de/api/v1/documents/${DOCUMENT_ID}" \
  -H "Authorization: Bearer ${API_KEY}"
```

### 14.3 Vorlagen

```bash
# Alle Vorlagen auflisten
curl -s "https://sign.domain.de/api/v1/templates" \
  -H "Authorization: Bearer ${API_KEY}" \
  | jq '.templates[] | {id: .id, title: .title}'

# Dokument aus Vorlage erstellen
curl -s -X POST "https://sign.domain.de/api/v1/templates/${TEMPLATE_ID}/use" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Vertrag - Max Mustermann - 2026",
    "recipients": [
      {"name": "Max Mustermann", "email": "max@example.de", "role": "SIGNER"}
    ],
    "sendEmail": true
  }'
```

---

## 15. Backup und Restore

### 15.1 Automatisches Backup (täglich)

Das Plattform-Nightly-Update-System führt automatisch Backups durch, wenn `backup_enabled: true` in der App-Konfiguration gesetzt ist.

Manuelles Backup:

```bash
# Auf der Tenant-VM
BACKUP_DIR="/opt/backups/documenso/$(date +%Y-%m-%d)"
mkdir -p "${BACKUP_DIR}"

# PostgreSQL-Dump
docker exec <tenant>-documenso-db \
  pg_dump -U documenso documenso \
  | gzip > "${BACKUP_DIR}/documenso-db.sql.gz"

# Upload-Volumes sichern
docker run --rm \
  -v <tenant>-documenso_uploads:/data \
  -v "${BACKUP_DIR}":/backup \
  alpine tar czf /backup/documenso-uploads.tar.gz /data

echo "Backup abgeschlossen: ${BACKUP_DIR}"
ls -lh "${BACKUP_DIR}"
```

### 15.2 Backup nach S3 übertragen

```bash
# MinIO / S3 Upload
mc alias set backup https://minio.irongeeks.eu ACCESS_KEY SECRET_KEY
mc cp --recursive "${BACKUP_DIR}" backup/documenso-backups/
```

### 15.3 Restore-Prozedur

```bash
BACKUP_DIR="/opt/backups/documenso/2026-03-09"

# 1. Documenso stoppen
docker compose -f /opt/documenso/docker-compose.yml stop documenso

# 2. Datenbank wiederherstellen
docker exec -i <tenant>-documenso-db \
  psql -U documenso documenso \
  < <(gunzip -c "${BACKUP_DIR}/documenso-db.sql.gz")

# 3. Uploads wiederherstellen
docker run --rm \
  -v <tenant>-documenso_uploads:/data \
  -v "${BACKUP_DIR}":/backup \
  alpine tar xzf /backup/documenso-uploads.tar.gz -C /

# 4. Documenso starten
docker compose -f /opt/documenso/docker-compose.yml start documenso

# 5. Healthcheck
sleep 30 && curl -sf http://localhost:3000/api/health && echo "Restore erfolgreich"
```

---

## 16. Upgrade-Prozedur

### 16.1 Aktuelle Version prüfen

```bash
# Aktuelle Version des laufenden Containers
docker inspect <tenant>-documenso \
  | jq -r '.[0].Config.Image'
# Ausgabe: documenso/documenso:1.5.6

# Verfügbare Versionen auf Docker Hub
curl -s "https://hub.docker.com/v2/repositories/documenso/documenso/tags/?page_size=10" \
  | jq '.results[].name'
```

### 16.2 Upgrade durchführen

```bash
# 1. Backup erstellen (IMMER vor Upgrade!)
# → Siehe Abschnitt 15.1

# 2. Neue Image-Version in Compose-Datei setzen
sed -i 's/documenso\/documenso:1.5.6/documenso\/documenso:1.6.0/' \
  /opt/documenso/docker-compose.yml

# 3. Neues Image pullen
docker compose -f /opt/documenso/docker-compose.yml pull

# 4. Container neu starten (minimale Downtime)
docker compose -f /opt/documenso/docker-compose.yml up -d

# 5. Datenbankmigrationen laufen automatisch beim Start

# 6. Healthcheck abwarten
sleep 60
curl -sf http://localhost:3000/api/health && echo "Upgrade erfolgreich"

# 7. Logs prüfen
docker compose -f /opt/documenso/docker-compose.yml logs --tail=100 documenso
```

### 16.3 Rollback bei Fehler

```bash
# Vorherige Version wiederherstellen
sed -i 's/documenso\/documenso:1.6.0/documenso\/documenso:1.5.6/' \
  /opt/documenso/docker-compose.yml

docker compose -f /opt/documenso/docker-compose.yml up -d

# Datenbank aus Backup wiederherstellen (falls Migration fehlgeschlagen)
# → Siehe Abschnitt 15.3
```

---

## 17. Troubleshooting

### Problem 1: "Cannot connect to SMTP server"

**Symptom:** Keine Signatur-E-Mails werden versendet, Fehlermeldung in Logs: `ECONNREFUSED` oder `ETIMEDOUT`

**Ursache:** SMTP-Host nicht erreichbar oder Port blockiert

**Lösung:**
```bash
# Erreichbarkeit prüfen
docker exec <tenant>-documenso \
  nc -zv smtp.office365.com 587
# Erwartete Ausgabe: "Connection to smtp.office365.com 587 port [tcp/submission] succeeded!"

# Falls blockiert: UFW-Regel prüfen
ufw status | grep 587
# Ggf. freigeben: ufw allow out 587/tcp
```

---

### Problem 2: Documenso startet nicht — "Error: Invalid encryption key length"

**Symptom:** Container startet sofort wieder neu, Logs zeigen Encryption-Key-Fehler

**Ursache:** `NEXT_PRIVATE_ENCRYPTION_KEY` ist nicht exakt 32 Zeichen lang

**Lösung:**
```bash
# Korrekte Länge prüfen
echo -n "$NEXT_PRIVATE_ENCRYPTION_KEY" | wc -c
# Muss exakt 32 ausgeben

# Neuen 32-Zeichen-Key generieren
openssl rand -hex 16  # Ausgabe ist exakt 32 Hex-Zeichen
```

---

### Problem 3: OIDC-Login schlägt fehl — "Callback URL mismatch"

**Symptom:** Nach Authentik-Login Fehlermeldung "redirect_uri did not match"

**Ursache:** Redirect-URI in Authentik stimmt nicht mit Documenso-URL überein

**Lösung:**
```
Authentik Admin → Provider → Redirect URIs:
Exakt: https://sign.atlasretail.irongeeks.eu/api/auth/callback/oidc

(Kein trailing Slash, exakt HTTPS, exakte Domain)
```

---

### Problem 4: PDF-Upload schlägt fehl — 413 Request Entity Too Large

**Symptom:** Große PDFs können nicht hochgeladen werden

**Ursache:** Traefik hat ein Request-Size-Limit

**Lösung:** In der Traefik Dynamic Config:
```yaml
http:
  middlewares:
    upload-limit:
      buffering:
        maxRequestBodyBytes: 104857600  # 100 MB
```

---

### Problem 5: Datenbank-Migration schlägt fehl beim Upgrade

**Symptom:** Container startet, Logs zeigen Migration-Fehler

**Ursache:** Inkompatibler Datenbankzustand

**Lösung:**
```bash
# Migrations-Status prüfen
docker exec <tenant>-documenso-db \
  psql -U documenso -c "SELECT * FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;"

# Datenbank aus Backup wiederherstellen und vorherige Version verwenden
```

---

### Problem 6: E-Mails landen im Spam

**Symptom:** Signatur-E-Mails werden als Spam markiert

**Ursache:** Fehlende SPF/DKIM/DMARC-Einträge für die From-Domain

**Lösung:**
```
DNS für die From-Domain konfigurieren:
  SPF:  v=spf1 include:spf.protection.outlook.com -all
  DKIM: Über SMTP-Provider konfigurieren
  DMARC: v=DMARC1; p=quarantine; rua=mailto:dmarc@deinefirma.de
```

---

### Problem 7: "Database connection refused"

**Symptom:** Documenso-Container startet, aber Datenbankverbindung schlägt fehl

**Ursache:** PostgreSQL-Container noch nicht bereit (Startup-Reihenfolge)

**Lösung:**
```bash
# PostgreSQL-Status prüfen
docker inspect <tenant>-documenso-db \
  | jq '.[0].State.Health.Status'
# Muss "healthy" sein, bevor Documenso startet

# PostgreSQL-Logs prüfen
docker logs <tenant>-documenso-db --tail=20
```

---

### Problem 8: Signaturlink abgelaufen

**Symptom:** Empfänger berichtet "Signing link has expired"

**Ursache:** Standard-Link-Ablauf ist 7 Tage

**Lösung:** In Documenso Admin:
```
Settings → Organisation → Document Signing Link Expiry → 30 days
```

Oder ein neues Dokument senden und vorheriges stornieren.

---

### Problem 9: Webhook-Events werden nicht empfangen

**Symptom:** Webhook-Endpoint antwortet, aber keine Events kommen an

**Ursache:** Documenso-Container kann Webhook-Endpoint nicht erreichen

**Lösung:**
```bash
# Erreichbarkeit des Webhook-Endpoints aus Container prüfen
docker exec <tenant>-documenso \
  curl -sf https://deine-app.de/webhooks/documenso

# Falls intern: Traefik-Netzwerk-Routing prüfen
```

---

### Problem 10: Hoher Speicherverbrauch

**Symptom:** Documenso-Container nutzt >2 GB RAM

**Ursache:** Viele gleichzeitige PDF-Verarbeitungen (PDF.js ist speicherintensiv)

**Lösung:**
```yaml
# In compose.template.yml Memory-Limit setzen
services:
  documenso:
    deploy:
      resources:
        limits:
          memory: 2g
```

---

## 18. Security Hardening Checklist

- [ ] **Starkes Admin-Passwort** — min. 20 Zeichen, Passwort-Manager verwenden
- [ ] **API-Keys rotieren** — monatlich oder bei Verdacht auf Kompromittierung
- [ ] **OIDC/SSO aktivieren** — keine lokalen Passwörter für Produktionsnutzer
- [ ] **SMTP-Credentials schützen** — nur über Ansible Vault / Secret Manager
- [ ] **Encryption Key sichern** — Verlust = Datenverlust aller verschlüsselten Dokumente
- [ ] **Encryption Key Backup** — sicher und getrennt vom System aufbewahren
- [ ] **TLS 1.3 erzwingen** — Traefik-Config: `minVersion = "VersionTLS13"`
- [ ] **Security Headers prüfen** — `curl -I https://sign.domain.de` → X-Frame-Options, HSTS, CSP
- [ ] **Webhook-Signaturverifikation** — immer `x-documenso-signature` prüfen
- [ ] **Rate-Limiting aktivieren** — Traefik-Middleware für `/api/auth` (max. 10 req/min)
- [ ] **Datei-Uploads beschränken** — nur PDFs akzeptieren, max. 50 MB
- [ ] **Regelmäßige Backups testen** — monatlich Restore-Test durchführen
- [ ] **Audit-Trail aktivieren** — alle Dokumentereignisse werden automatisch geloggt
- [ ] **Nightly Security Updates** — OS-Patches automatisch via Plattform-Update-Pipeline
- [ ] **Netzwerk-Isolation** — Documenso-DB nur intern erreichbar (kein exposed Port)
- [ ] **CSP-Header konfigurieren** — `frame-ancestors 'self'` verhindert Clickjacking
- [ ] **Admin-Account E-Mail bestätigen** — nicht-bestätigte Accounts erhalten eingeschränkten Zugriff
- [ ] **Signing-Link-Ablauf reduzieren** — Standard 7 Tage, ggf. auf 3 Tage verkürzen
- [ ] **DKIM/SPF/DMARC** für From-Domain konfigurieren — verhindert E-Mail-Spoofing
- [ ] **Container als non-root ausführen** — Documenso läuft standardmäßig als non-root ✅

---

*Diese Anleitung wird mit jeder Plattform-Version aktualisiert. Letzte Aktualisierung: 2026-03.*
