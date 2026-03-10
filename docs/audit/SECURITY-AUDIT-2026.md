# Security Audit Report — GMZ Cloud Business Apps

**Datum:** 2026-03-10  
**Auditor:** Senior Security Engineer (automatisierte Analyse)  
**Scope:** Platform Webapp (Auth, API, Middleware), Secrets/CI/CD, Docker Compose Catalog, Ansible Automation  
**Projektpfad:** `/home/lola/.openclaw/workspace/gmz-cloud-business-apps/`

---

## Executive Summary

Die Codebasis weist ein solides Auth-Grundgerüst auf (RBAC-Policy, Audit-Logging, assertAuthModeSafe). Allerdings wurden **15 konkrete Sicherheitsbefunde** identifiziert, davon ein kritischer (Docker-Socket-Mount), drei hochkritisch (fehlende RBAC-Einträge, Header-Injection, Nicht-konstanter Tokenvergleich) sowie mehrere mittlere und niedrige Findings.

**Priorisierung für sofortige Maßnahme:**
1. Docker-Socket-Mount in `authentik-worker` entfernen
2. Fehlende RBAC-Einträge für `GET /api/jobs/:id` und `GET /api/tenants/[id]/documenso` ergänzen
3. `Content-Disposition`-Header-Injection beheben
4. Timing-sicheren Tokenvergleich implementieren

---

## Findings

---

### 🔴 CRITICAL — Docker-Socket-Mount in authentik-worker

**Datei:** `catalog/apps/authentik/compose.template.yml` (Zeile ~49)  
**Beschreibung:**  
Der `authentik-worker`-Container mountet `/var/run/docker.sock` direkt ins Containerfilesystem:
```yaml
authentik-worker:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```
Ein Prozess mit Zugriff auf den Docker-Socket kann beliebige Container starten, Volumes mounten und dadurch vollen Root-Zugriff auf den Host erlangen.

**Risiko:**  
Falls der `authentik-worker`-Container kompromittiert wird (z.B. durch eine Schwachstelle in Authentik), hat ein Angreifer unmittelbaren Root-Zugriff auf den Host und kann alle anderen Tenant-Container übernehmen. Dieses Angriffsmuster ist gut dokumentiert (CVE-Klasse: Container Escape via Docker Socket).

**Fix:**  
Wenn Authentik den Docker-Socket für Worker-Funktionalität benötigt (z.B. für Blueprint-Anwendung), kann stattdessen ein dedizierter Socket-Proxy verwendet werden:
```yaml
  authentik-socket-proxy:
    image: tecnativa/docker-socket-proxy:latest
    restart: unless-stopped
    environment:
      CONTAINERS: 1   # minimal permissions
      NETWORKS: 0
      VOLUMES: 0
      POST: 0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - socket_proxy_net

  authentik-worker:
    # ...
    environment:
      DOCKER_HOST: tcp://authentik-socket-proxy:2375
    # volumes: KEIN docker.sock Mount mehr
```
Falls der Socket-Mount nicht funktional notwendig ist (viele Authentik-Deployments laufen ohne ihn), einfach die Volume-Zeile entfernen.

---

### 🟠 HIGH — Fehlende RBAC-Policy-Einträge (Route-Handler werden zur Laufzeit blockiert)

**Datei:** `platform/webapp/lib/rbac-policy.ts`, `platform/webapp/app/api/jobs/[id]/route.ts`, `platform/webapp/app/api/tenants/[id]/documenso/route.ts`  
**Beschreibung:**  
Zwei Route-Handler rufen `requireProtectedOperation()` mit Operationsstrings auf, die **nicht in `RBAC_POLICY`** definiert sind:

1. `jobs/[id]/route.ts:6` → `'GET /api/jobs/:id'`
2. `tenants/[id]/documenso/route.ts:11` → `'GET /api/tenants/[id]/documenso'`

Da das Projekt mit `--experimental-strip-types` ausgeführt wird (kein TypeScript-Typecheck in CI/Tests), wird der Typfehler nicht abgefangen. Zur Laufzeit gibt `RBAC_POLICY['GET /api/jobs/:id']` den Wert `undefined` zurück. `hasMinimumRole(auth.role, undefined)` ergibt `false`, wodurch **alle authentifizierten Requests 403 Forbidden** erhalten — die Endpoints sind funktional blockiert.

**Risiko:**  
- Funktionaler Ausfall: `/api/jobs/:id` und das Documenso-Tenant-Endpoint sind für alle Nutzer unzugänglich.
- Latentes Sicherheitsrisiko: Das fail-closed-Verhalten maskiert den eigentlichen Bug. Zukünftige Refactorings könnten das Verhalten unbeabsichtigt aufheben (z.B. wenn `getRequiredRoleForOperation` einen Fallback-Wert bekommt).
- Die CI-Pipeline erkennt diesen Typfehler **nicht**, weil `--experimental-strip-types` Typen ohne Prüfung entfernt.

**Fix:**  
In `rbac-policy.ts` die fehlenden Einträge ergänzen:
```typescript
export const RBAC_POLICY = {
  // ... bestehende Einträge ...
  'GET /api/jobs/:id': 'readonly',           // NEU
  'GET /api/tenants/:id/documenso': 'readonly', // NEU (Naming normalisieren: :id statt [id])
  // ...
} as const satisfies Record<string, UserRole>;
```
Außerdem: TypeScript-Typechecking in CI aktivieren:
```yaml
# .github/workflows/authz-audit-regression.yml
- name: TypeScript type check
  run: npx tsc --noEmit
```

---

### 🟠 HIGH — Content-Disposition Header-Injection via unsanitiertes `tenantId`

**Datei:** `platform/webapp/app/api/reports/generate/route.ts` (Zeilen 78, 112, 141, 150)  
**Beschreibung:**  
Der `tenantId`-Wert aus dem Request-Body wird direkt in den `Content-Disposition`-Responseheader interpoliert:
```typescript
filename = `tenant-${options.tenantId}-${Date.now()}.csv`;
// ...
'Content-Disposition': `attachment; filename="${filename}"`
```
Ein Angreifer kann als `tenantId` einen String wie `foo"; X-Evil: injected` übergeben, was zum Header:
```
Content-Disposition: attachment; filename="tenant-foo"; X-Evil: injected-1234567890.csv"
```
führt. Da der Endpoint `POST /api/reports/generate` `admin`-Rolle erfordert, ist die Angriffsfläche begrenzt, aber Header-Injection kann dennoch Cache-Poisoning oder Response-Splitting ermöglichen.

**Risiko:**  
Cache-Poisoning, Response-Splitting, Cross-Site-Scripting über Proxy-Caches (bei bestimmten CDN-Konfigurationen).

**Fix:**  
```typescript
// Sanitize: nur alphanumerisch, Bindestriche und Unterstriche erlauben
function sanitizeFilename(input: string | undefined | null): string {
  if (!input) return 'unknown';
  return input.replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 64);
}

// Verwendung:
filename = `tenant-${sanitizeFilename(options.tenantId)}-${Date.now()}.csv`;

// Und im Header nach RFC 6266 korrekt escapen oder encodeURIComponent nutzen:
'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
```

---

### 🟠 HIGH — Nicht-konstanter Zeitvergleich bei Bearer-Token-Authentifizierung (Timing-Attack)

**Datei:** `platform/webapp/lib/auth-core.ts` (Zeile ~203)  
**Beschreibung:**  
Der Vergleich des Bearer-Tokens mit gespeicherten Trusted-Tokens erfolgt via einfachem `===`-Operator:
```typescript
const match = trustedTokens.find((entry) => entry.token === token);
```
JavaScript-String-Vergleiche (`===`) brechen beim ersten unterschiedlichen Zeichen ab. Ein Angreifer kann durch statistisch signifikante Zeitmessungen der API-Antwortzeiten Rückschlüsse auf Token-Präfixe ziehen (Timing Side-Channel Attack).

**Risiko:**  
Theoretisches Oracle-Angriffsmuster zur Enumeration valider Tokens, insbesondere in Hochlatenz-Netzwerken mit vielen parallelen Requests.

**Fix:**  
```typescript
import { timingSafeEqual } from 'node:crypto';

function timingSafeTokenCompare(a: string, b: string): boolean {
  // Beide Strings müssen gleich lang sein für timingSafeEqual
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// In getAuthContextFromTrustedBearer:
const match = trustedTokens.find((entry) => timingSafeTokenCompare(entry.token, token));
```

---

### 🟠 HIGH — Command-Injection-Risiko via `eval` in CI/CD-Rollback

**Datei:** `.github/workflows/nightly-updates.yml` (Zeile ~207)  
**Beschreibung:**  
Im Rollback-Schritt wird ein Shell-Befehl aus einem GitHub-Secret direkt per `eval` ausgeführt:
```bash
if [[ -n "${PROVISION_ROLLBACK_HOOK_CMD}" ]]; then
  eval "${PROVISION_ROLLBACK_HOOK_CMD}"
fi
```
Sollte das Secret `PROVISION_ROLLBACK_HOOK_CMD` durch einen kompromittierten Admin oder eine Schwachstelle in GitHub Actions manipuliert werden, können beliebige Shell-Befehle im Runner-Kontext ausgeführt werden — inklusive Zugriff auf alle anderen Secrets des Runners (z.B. `TENANT_SSH_PRIVATE_KEY`).

**Risiko:**  
Beliebige Remote-Code-Execution im CI/CD-Runner. Exfiltration aller GitHub Actions Secrets. Im schlimmsten Fall Kompromittierung aller Tenant-Server via SSH-Key-Diebstahl.

**Fix:**  
Statt eines beliebigen Shell-Befehls ein fest definiertes Skript verwenden:
```yaml
# Im Workflow: kein eval
- name: Execute rollback hook
  if: ${{ env.PROVISION_ROLLBACK_HOOK_CMD != '' }}
  run: |
    # Nur ein vordefinierten Skriptpfad erlauben, kein freier Shellcode
    ops/scripts/rollback-hook.sh
  env:
    ROLLBACK_TARGET: ${{ needs.snapshot.outputs.tenant_host }}
    ROLLBACK_SNAPSHOT: ${{ steps.locate.outputs.snapshot_file }}
```
Alternativ: das `PROVISION_ROLLBACK_HOOK_CMD`-Feature vollständig entfernen und Rollback-Logik in `ops/scripts/tenant-rollback.sh` konsolidieren.

---

### 🟠 HIGH — Stirling-PDF deaktiviert explizit Security-Features

**Datei:** `catalog/apps/stirling-pdf/compose.template.yml` (Zeile ~9)  
**Beschreibung:**  
```yaml
stirling-pdf:
  environment:
    DOCKER_ENABLE_SECURITY: "false"
```
Die Variable `DOCKER_ENABLE_SECURITY: "false"` deaktiviert in Stirling-PDF die eingebauten Authentifizierungs- und Sicherheitsfunktionen (Spring Security). Der Service ist damit für alle Nutzer im Netzwerk ohne Authentifizierung zugänglich.

**Risiko:**  
Stirling-PDF verarbeitet potenziell sensible Dokumente (PDF-Konvertierung, Merge, OCR). Ohne Authentifizierung kann jeder Nutzer mit Netzwerkzugang Dokumente hochladen, verarbeiten und auf den Verlauf zugreifen. Abhängig von der Netzwerktopologie betrifft dies auch Mandanten-Trennungen.

**Fix:**  
```yaml
  environment:
    DOCKER_ENABLE_SECURITY: "true"   # Authentifizierung aktivieren
    SECURITY_ENABLE_LOGIN: "true"
    SECURITY_INITIALLOGIN_USERNAME: admin
    SECURITY_INITIALLOGIN_PASSWORD: ${SPDF_ADMIN_PASSWORD}  # via Secret
```
Zusätzlich Traefik-BasicAuth als zweiten Faktor für admin-Zugriff konfigurieren (wie bei Ollama implementiert).

---

### 🟡 MEDIUM — Mattermost-Datenbankverbindung ohne TLS (`sslmode=disable`)

**Datei:** `catalog/apps/mattermost/compose.template.yml` (Zeile ~15)  
**Beschreibung:**  
```yaml
MM_SQLSETTINGS_DATASOURCE: postgres://${MM_DB_USER}:${MM_DB_PASSWORD}@mattermost-db:5432/${MM_DB_NAME}?sslmode=disable
```
Die PostgreSQL-Verbindung von Mattermost läuft explizit ohne TLS. Zwar sind die Container im selben Docker-Netzwerk, aber in einer Multi-Tenant-Umgebung oder bei Ausbruch aus der Netzwerkisolierung können Datenbankzugangsdaten und -inhalte im Klartext abgefangen werden.

**Risiko:**  
Klartext-Übertragung von Datenbankzugangsdaten und Nachrichteninhalten zwischen App- und Datenbankcontainer bei Netzwerk-Sniffing.

**Fix:**  
```yaml
MM_SQLSETTINGS_DATASOURCE: postgres://${MM_DB_USER}:${MM_DB_PASSWORD}@mattermost-db:5432/${MM_DB_NAME}?sslmode=require
```
PostgreSQL-Container müssen entsprechend mit TLS-Zertifikaten konfiguriert sein. Für interne Docker-Netzwerke ist mindestens `sslmode=prefer` empfohlen.

---

### 🟡 MEDIUM — `.env.example` mit ungültigem Auth-Mode und falschen Variablennamen

**Datei:** `platform/webapp/.env.example`  
**Beschreibung:**  
Das Beispiel-Envfile enthält mehrere kritische Abweichungen zur tatsächlichen Implementierung:

1. **Ungültiger Auth-Mode:** `WEBAPP_AUTH_MODE="none"` — Der Wert `"none"` ist kein gültiger Mode. `resolveAuthMode()` kennt nur `trusted-bearer`, `jwt`, `vault`, `dev-header`. Bei `"none"` fällt der Code auf `DEFAULT_AUTH_MODE = 'trusted-bearer'` zurück, ohne dass Entwickler das erwarten.

2. **Falsche Variablennamen für JWT:**  
   `.env.example` listet: `JWT_SECRET`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`  
   Der Code (`jwt-oidc.ts`) verwendet: `WEBAPP_OIDC_ISSUER`, `WEBAPP_OIDC_AUDIENCE`  
   JWT funktioniert nicht, wenn Entwickler das Beispielfile unverändert übernehmen.

**Risiko:**  
Entwickler, die `.env.example` kopieren und `WEBAPP_AUTH_MODE="none"` setzen in der Annahme, Auth sei deaktiviert, haben tatsächlich `trusted-bearer`-Auth aktiv. Falls `WEBAPP_TRUSTED_TOKENS_JSON` leer ist, schlagen alle API-Calls mit 401 fehl. Der Operator könnte dann aus Frustration Auth ganz deaktivieren oder einen unsicheren Workaround wählen.

**Fix:**  
```bash
# .env.example — korrigierte Version

# Auth Mode: "trusted-bearer" | "jwt" | "dev-header" (nur dev!)
WEBAPP_AUTH_MODE="trusted-bearer"

# Trusted-Bearer Tokens (JSON-Array) — für trusted-bearer mode
# WEBAPP_TRUSTED_TOKENS_JSON='[{"token":"<secret>","userId":"ops-user","role":"technician","tokenId":"t1","expiresAt":"2027-01-01T00:00:00Z"}]'

# JWT / OIDC (nur für jwt mode benötigt)
WEBAPP_OIDC_ISSUER="https://your-idp.example.com/realms/myrealm"
WEBAPP_OIDC_AUDIENCE="gmz-cloud-webapp"
```

---

### 🟡 MEDIUM — Keine Resource-Limits in Docker Compose Templates (DoS-Risiko)

**Datei:** Alle `catalog/apps/*/compose.template.yml`  
**Beschreibung:**  
Kein einziges Compose-Template definiert CPU- oder Speicher-Limits für Container:
```yaml
# Fehlend in allen Templates, Beispiel plane-api:
services:
  plane-api:
    image: makeplane/plane-backend:${PLANE_VERSION}
    # Kein: deploy.resources.limits
    # Kein: mem_limit
```
Ein kompromittierter oder fehlerhafter Container kann den gesamten Host-Speicher und CPU verbrauchen und andere Tenant-Dienste zum Absturz bringen.

**Risiko:**  
Denial-of-Service auf Multi-Tenant-Infrastruktur: Ein einziger fehlerhafter Container kann alle anderen Mandanten beeinträchtigen (Noisy-Neighbor-Problem).

**Fix:**  
Für jeden App-Container mindestens Speicher-Limits setzen:
```yaml
services:
  plane-api:
    image: makeplane/plane-backend:${PLANE_VERSION}
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          memory: 256M
```
Realistische Werte je nach App-Typ festlegen (Datenbanken: mehr RAM, Worker: CPU-limitiert).

---

### 🟡 MEDIUM — Container ohne explizite User-Konfiguration laufen als root

**Datei:** Alle `catalog/apps/*/compose.template.yml` (außer Bookstack)  
**Beschreibung:**  
Die meisten App-Container definieren keine `user:`-Direktive und laufen damit als `root` (UID 0) innerhalb des Containers. Bookstack ist eine Ausnahme (`PUID: "1000"`, `PGID: "1000"`).

Betroffen sind u.a.: `plane`, `taiga`, `vikunja`, `twenty-crm`, `planka`, `mattermost`, `outline`, `umami`, `searxng`, `orangehrm`.

**Risiko:**  
Bei einem Container-Escape-Bug läuft der Prozess im Host-Namespace als root, was sofortige Host-Kompromittierung ermöglicht. Dateien in gemounteten Volumes werden als root angelegt.

**Fix:**  
Für Images, die es unterstützen, `user:` setzen:
```yaml
services:
  vikunja:
    image: vikunja/vikunja:${VIKUNJA_IMAGE_TAG}
    user: "1000:1000"
```
Für Images, die keine Non-Root-User unterstützen: Compose-File-Dokumentation ergänzen und upstream-Issue einreichen. Als Minimalmaßnahme `read_only: true` für das Root-Filesystem setzen wo möglich.

---

### 🟡 MEDIUM — ANSIBLE_HOST_KEY_CHECKING=False in CI/CD-Workflow

**Datei:** `.github/workflows/nightly-updates.yml` (Zeile 124)  
**Beschreibung:**  
```yaml
env:
  ANSIBLE_HOST_KEY_CHECKING: "False"
```
Das Deaktivieren der SSH-Host-Key-Prüfung in automatisierten Deployments schützt nicht vor Man-in-the-Middle-Angriffen. Ein Angreifer im Netzwerkpfad kann sich zwischen Runner und Tenant-Server schalten.

**Risiko:**  
SSH-MITM-Angriff: Angreifer können Ansible-Befehle abfangen und modifizieren, SSH-Keys stehlen oder schädliche Commands in Deployments injizieren.

**Fix:**  
Host-Keys aller Tenant-Server in einem bekannten `known_hosts`-File erfassen und dieses als GitHub Secret hinterlegen:
```yaml
- name: Configure SSH known_hosts
  run: |
    mkdir -p ~/.ssh
    echo "${{ secrets.TENANT_KNOWN_HOSTS }}" >> ~/.ssh/known_hosts
    chmod 600 ~/.ssh/known_hosts

# Und entfernen:
# env:
#   ANSIBLE_HOST_KEY_CHECKING: "False"
```

---

### 🟡 MEDIUM — Huly: MongoDB und Elasticsearch ohne Authentifizierung

**Datei:** `catalog/apps/huly/compose.template.yml`  
**Beschreibung:**  
Beide Backend-Datenbanken des Huly-Stacks haben keine Authentifizierung konfiguriert:
```yaml
huly-mongo:
  image: mongo:7
  # Kein MONGO_INITDB_ROOT_USERNAME / MONGO_INITDB_ROOT_PASSWORD

huly-elastic:
  image: elasticsearch:7.14.2
  environment:
    discovery.type: single-node
    # Kein xpack.security.enabled: "true"
```
Jeder Container im selben Docker-Netzwerk kann ohne Credentials auf MongoDB (Port 27017) und Elasticsearch (Port 9200) zugreifen.

**Risiko:**  
Bei Kompromittierung eines anderen Containers im Docker-Netzwerk (z.B. durch eine App-Schwachstelle) ist der vollständige Datenzugriff auf alle Huly-Daten möglich — ohne weitere Credentials. Elasticsearch 7.x ohne Auth ist eine häufige Quelle von Datenlecks.

**Fix:**  
```yaml
huly-mongo:
  environment:
    MONGO_INITDB_ROOT_USERNAME: ${HULY_MONGO_USER}
    MONGO_INITDB_ROOT_PASSWORD: ${HULY_MONGO_PASSWORD}

huly-elastic:
  environment:
    discovery.type: single-node
    xpack.security.enabled: "true"
    ELASTIC_PASSWORD: ${HULY_ELASTIC_PASSWORD}
```
Und die Verbindungs-URLs in den App-Containern entsprechend anpassen.

---

### 🟢 LOW — Outline: Unpinnter `minio/minio:latest`-Tag

**Datei:** `catalog/apps/outline/compose.template.yml` (Zeile ~17)  
**Beschreibung:**  
```yaml
outline-minio:
  image: minio/minio:latest
```
Alle anderen MinIO-Instanzen im Projekt (z.B. `huly`) verwenden gepinnte Tags (`RELEASE.2024-01-16T16-07-38Z`). `latest` erhält bei jedem Pull automatisch die neueste Version, was Breaking Changes oder ungeprüfte Sicherheitsupdates einbringen kann.

**Risiko:**  
Unvorhergesehene Funktionsänderungen durch automatisches Update; unkontrollierte Einführung nicht validierter Versionen in Produktion.

**Fix:**  
```yaml
outline-minio:
  image: minio/minio:${OUTLINE_MINIO_VERSION}
# In .env: OUTLINE_MINIO_VERSION=RELEASE.2024-01-16T16-07-38Z
```

---

### 🟢 LOW — SSH in UFW ohne IP-Einschränkung erlaubt

**Datei:** `automation/ansible/roles/common-hardening/tasks/main.yml` (Zeile ~20)  
**Beschreibung:**  
```yaml
- name: Allow SSH
  community.general.ufw:
    rule: allow
    port: '22'
    proto: tcp
    # Kein: src oder from_ip
```
SSH wird von jeder IP-Adresse erlaubt. In einer Managed-Service-Umgebung sollte SSH auf bekannte Management-IP-Ranges (z.B. VPN, Jump-Host) beschränkt sein.

**Risiko:**  
Erhöhte Angriffsfläche für SSH-Brute-Force- und Credential-Stuffing-Angriffe aus dem öffentlichen Internet, auch wenn `PermitRootLogin no` gesetzt ist.

**Fix:**  
```yaml
- name: Allow SSH from management network only
  community.general.ufw:
    rule: allow
    port: '22'
    proto: tcp
    src: '{{ management_cidr }}'  # z.B. "10.0.0.0/8" oder VPN-Range
```
Variable `management_cidr` im Ansible Inventory oder Vault definieren.

---

### 🟢 LOW — Monitoring-Verzeichnisse world-readable (mode: 0755)

**Datei:** `automation/ansible/roles/monitoring/tasks/main.yml` (Zeile 6)  
**Beschreibung:**  
```yaml
- name: Create monitoring directories
  file:
    path: "{{ item }}"
    state: directory
    mode: '0755'   # World-readable
```
Directories wie `/opt/monitoring/prometheus/` und `/opt/monitoring/grafana/provisioning/` sind world-readable. Prometheus-Configs können Scrape-Targets, interne Service-URLs und Zugangsdaten enthalten.

**Risiko:**  
Lokale Benutzer ohne root-Rechte können Monitoring-Konfigurationen lesen und interne Service-Topologie, Zugangsdaten und Scrape-Konfigurationen einsehen.

**Fix:**  
```yaml
- name: Create monitoring directories
  file:
    path: "{{ item }}"
    state: directory
    owner: root
    group: docker
    mode: '0750'   # group docker, kein other-Zugriff
```

---

### 🔵 INFO — TypeScript läuft ohne Type-Checking (--experimental-strip-types)

**Datei:** `platform/webapp/package.json`, `.github/workflows/authz-audit-regression.yml`  
**Beschreibung:**  
Das Testframework und die CI-Pipeline verwenden `--experimental-strip-types`, was TypeScript-Typen vor der Ausführung entfernt, **ohne Typfehler zu prüfen**. Dadurch wurden die unter Finding #2 beschriebenen RBAC-Policy-Lücken nicht als Compile-Fehler erkannt.

**Empfehlung:**  
Separaten `tsc --noEmit`-Schritt in CI hinzufügen:
```yaml
- name: TypeScript type check
  working-directory: platform/webapp
  run: npx tsc --noEmit
```

---

### 🔵 INFO — Vault-Auth-Mode als Stub implementiert (nicht produktionsreif)

**Datei:** `platform/webapp/lib/vault-token.ts`, `platform/webapp/lib/auth-core.ts`  
**Beschreibung:**  
`assertAuthModeSafe()` wirft explizit einen Fehler beim Start, wenn `WEBAPP_AUTH_MODE=vault` gesetzt ist. Der Vault-Integrationscode ist als Stub markiert und nicht mit produktiven Code-Pfaden verbunden. Dies ist korrekt dokumentiert und sicher.

**Info:**  
Kein Handlungsbedarf bis Vault-Integration tatsächlich implementiert wird. Sicherheitsmechanismus ist vorhanden und aktiv.

---

## Zusammenfassung nach Severity

| Severity   | Anzahl | Befunde |
|------------|--------|---------|
| 🔴 CRITICAL | 1     | Docker Socket Mount in authentik-worker |
| 🟠 HIGH     | 5     | RBAC-Lücken, Header-Injection, Timing-Attack, eval-Injection CI, Stirling-PDF Security disabled |
| 🟡 MEDIUM   | 5     | Mattermost sslmode=disable, .env.example-Mismatch, fehlende Resource-Limits, Container als root, Host-Key-Checking, Huly ohne DB-Auth |
| 🟢 LOW      | 3     | Unpinnter MinIO-Tag, SSH ohne IP-Restriction, Monitoring-Dirs 0755 |
| 🔵 INFO     | 2     | TypeScript ohne Typecheck, Vault-Stub |

---

## Empfohlene Maßnahmen (priorisiert)

**Sofort (< 1 Woche):**
1. Docker-Socket-Mount aus `authentik-worker` entfernen oder Socket-Proxy einrichten
2. `RBAC_POLICY` um `'GET /api/jobs/:id'` und `'GET /api/tenants/:id/documenso'` erweitern
3. `Content-Disposition`-Header in `reports/generate` sanitisieren
4. `eval "${PROVISION_ROLLBACK_HOOK_CMD}"` durch sicheres Script-Call-Muster ersetzen

**Kurzfristig (< 1 Monat):**
5. Timing-sicheren Token-Vergleich mit `crypto.timingSafeEqual` implementieren
6. `.env.example` korrigieren (Auth-Mode-Werte und Variablennamen)
7. `DOCKER_ENABLE_SECURITY=true` für Stirling-PDF setzen
8. `ANSIBLE_HOST_KEY_CHECKING` entfernen, known_hosts-Management einführen
9. TypeScript-Type-Check in CI-Pipeline ergänzen

**Mittelfristig (< 1 Quartal):**
10. Resource-Limits für alle Docker Compose Templates definieren
11. Huly MongoDB und Elasticsearch mit Authentifizierung absichern
12. Non-Root-User für alle Container wo möglich konfigurieren
13. `sslmode=require` für Mattermost-DB-Verbindung

---

*Dieser Bericht basiert auf statischer Code-Analyse. Dynamische Tests (Penetrationstest, fuzzing) wurden nicht durchgeführt und werden als ergänzende Maßnahme empfohlen.*
