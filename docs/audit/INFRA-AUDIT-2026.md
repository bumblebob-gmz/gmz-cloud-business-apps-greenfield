# GMZ Cloud Business Apps — Infrastructure Audit 2026

**Erstellt:** 2026-03-10  
**Autor:** Senior DevOps/Infrastructure Engineer (AI Audit Agent)  
**Scope:** Vollständige Infrastruktur-Analyse — Ansible, App-Katalog, CI/CD, Ops-Scripts  
**Projektpfad:** `/home/lola/.openclaw/workspace/gmz-cloud-business-apps/`

---

## 1. Executive Summary

Die GMZ Cloud Business Apps Infrastruktur zeigt eine gut durchdachte Architektur mit klarer Trennung zwischen Tenant-Katalog, Ansible-Automatisierung und CI/CD-Pipelines. Allerdings wurden **mehrere kritische Fehler** identifiziert, die in Produktion zu **kompletten Ausfällen** führen würden — insbesondere fehlerhafte Template-Variablen in Traefik, fehlende Ansible-Role-Templates und ein kompromissfähiges `eval`-Pattern in der CI.

**Zusammenfassung der Befunde:**

| Severity | Anzahl | Kategorien |
|----------|--------|-----------|
| 🔴 CRITICAL | 6 | Ansible-Stubs, fehlerhafte Vars, fehlende Templates, CI-Injection |
| 🟠 HIGH | 12 | Sicherheit, Fehlkonfig, Konsistenz |
| 🟡 MEDIUM | 14 | Code-Qualität, Monitoring-Lücken, Schema-Inkonsistenz |
| 🟢 LOW | 8 | Best Practices, Minor Issues |

**Sofortiger Handlungsbedarf vor einem Prod-Rollout:**
1. Traefik ACME-Email-Bug fixen (Zertifikate werden nie ausgestellt)
2. Documenso-Rolle-Templates erstellen (Role crashed sofort)
3. UFW Ports 80/443 öffnen (kein HTTP/HTTPS-Traffic möglich)
4. Grafana Default-Passwort entfernen
5. `eval`-Injection in CI schließen

---

## 2. Ansible-Analyse

### 2.1 Role-Struktur Übersicht

| Role | Tasks | Defaults | Handlers | Templates | Status |
|------|-------|---------|---------|---------|--------|
| traefik | ✅ | ✅ | ✅ | ✅ | Teilweise fehlerhaft |
| common-hardening | ✅ | ❌ | ✅ | ❌ | Unvollständig |
| docker-runtime | ✅ | ❌ | ❌ | ❌ | Konflikt mit traefik-Role |
| monitoring | ✅ | ❌ | ❌ | ❌ | Deprecated Module |
| authentik-bootstrap | ✅ | ❌ | ❌ | ❌ | **TODO-Stub** |
| catalog-deployer | ✅ | ❌ | ❌ | ❌ | **TODO-Stub** |
| documenso | ✅ | ✅ | ❌ | ❌ | **Templates fehlen** |

---

### [CRITICAL] Traefik ACME-Email wird nie aufgelöst — TLS-Zertifikate können nicht ausgestellt werden

**Datei:** `automation/ansible/roles/traefik/templates/traefik.yml.j2:36`  
**Problem:**
```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: "${ACME_EMAIL}"   # ← Shell-Syntax, KEIN Jinja2, KEIN Traefik-Feature!
      storage: {{ traefik_acme_dir }}/acme.json
```
Traefik liest seine statische Konfiguration als YAML. Die Datei wird von Ansible als Jinja2-Template gerendert — dabei werden nur `{{ }}` Ausdrücke ersetzt. `${ACME_EMAIL}` bleibt **literal** in der gerenderten `traefik.yml` stehen. Traefik selbst unterstützt kein Environment-Variable-Substitution in der statischen YAML-Config. Let's Encrypt würde Zertifikatsanfragen mit der E-Mail `${ACME_EMAIL}` ablehnen.

Im Gegensatz dazu funktioniert `${IONOS_API_KEY}` in der `docker-compose.yml.j2`, weil Docker Compose nativ `.env`-Dateien expandiert — aber auch dort fehlt eine `.env`-Datei (s.u.).

**Auswirkung:** Kein einziges TLS-Zertifikat kann ausgestellt werden. Alle HTTPS-Endpunkte sind unbrauchbar. Kompletter Service-Ausfall in Produktion.

**Fix:**
```yaml
# traefik.yml.j2 — Zeile 36 ersetzen:
      email: "{{ acme_email }}"   # Jinja2-Variable, wird von Ansible korrekt ersetzt
```

---

### [CRITICAL] Traefik .env-Datei wird nie deployed

**Datei:** `automation/ansible/roles/traefik/templates/docker-compose.yml.j2`  
**Problem:**
```yaml
    environment:
      - IONOS_API_KEY=${IONOS_API_KEY}
      - ACME_EMAIL=${ACME_EMAIL}
```
Docker Compose ersetzt `${VAR}` Syntax aus einer `.env`-Datei im gleichen Verzeichnis wie die `docker-compose.yml`. Die Ansible-Role deployt die `docker-compose.yml.j2` nach `{{ traefik_config_dir }}`, erstellt aber **niemals eine `.env`-Datei** in diesem Verzeichnis.

Gleichzeitig hält die Ansible-Role die Secrets `acme_email` und `ionos_api_key` als Variablen bereit (in `defaults/main.yml` und per `-e` Runtime). Es gibt keinen Task, der diese in eine `.env` schreibt.

**Auswirkung:** Traefik startet ohne IONOS API Key → DNS-Challenge schlägt fehl → Keine Zertifikate. Container-Environment enthält leere Strings.

**Fix:** Task hinzufügen der eine `.env`-Datei schreibt:
```yaml
- name: Deploy Traefik .env file
  ansible.builtin.template:
    src: traefik.env.j2
    dest: "{{ traefik_config_dir }}/.env"
    owner: root
    group: root
    mode: "0600"
```
```
# traefik.env.j2
IONOS_API_KEY={{ ionos_api_key }}
ACME_EMAIL={{ acme_email }}
```

---

### [CRITICAL] authentik-bootstrap Role ist ein TODO-Stub

**Datei:** `automation/ansible/roles/authentik-bootstrap/tasks/main.yml`  
**Problem:**
```yaml
- name: TODO deploy authentik base stack
  ansible.builtin.debug:
    msg: "Authentik bootstrap template will be injected from catalog in next iteration"
```
Authentik ist der SSO-Provider für alle Tenant-Apps. Die Role, die ihn deployen soll, ist ein leeres Debug-Statement. Wenn `provision-tenant.yml` läuft, wird kein Authentik deployed.

**Auswirkung:** Jeder Tenant-Provisioning-Lauf scheinbar erfolgreich (RC=0), aber kein SSO-Provider vorhanden. Alle Apps, die SSO nutzen (`supportsSSO: true`), sind defekt.

**Fix:** Vollständige Implementierung erforderlich. Mindestens:
```yaml
- name: Deploy Authentik compose file
  ansible.builtin.template:
    src: compose.yml.j2
    dest: "/opt/gmz/apps/authentik/docker-compose.yml"
    mode: "0640"
  notify: restart authentik

- name: Start Authentik stack
  community.docker.docker_compose_v2:
    project_src: /opt/gmz/apps/authentik
    state: present
```

---

### [CRITICAL] catalog-deployer Role ist ein TODO-Stub

**Datei:** `automation/ansible/roles/catalog-deployer/tasks/main.yml`  
**Problem:**
```yaml
- name: TODO render selected app templates from GMZ app catalog
  ansible.builtin.debug:
    msg: "Catalog render + deploy pipeline follows (includes per-tenant variables and secrets)"
```
Dies ist die zentrale Role für das App-Deployment. Sie tut nichts außer eine Nachricht zu drucken.

**Auswirkung:** `provision-tenant.yml` und `playbooks/deploy-apps.yml` deployen **keine einzige App**. Der gesamte Deployment-Workflow ist nicht funktionsfähig.

**Fix:** Muss vollständig implementiert werden. Template-Rendering + Docker Compose Deployment für jede angeforderte App aus `{{ apps }}`.

---

### [CRITICAL] documenso Role referenziert nicht-existente Templates

**Datei:** `automation/ansible/roles/documenso/tasks/main.yml:14-25`  
**Problem:**
```yaml
- name: Deploy Documenso compose file
  ansible.builtin.template:
    src: compose.yml.j2          # ← Diese Datei existiert nicht!
    dest: "{{ documenso_compose_dir }}/docker-compose.yml"

- name: Deploy Documenso .env file
  ansible.builtin.template:
    src: env.j2                   # ← Diese Datei existiert nicht!
    dest: "{{ documenso_compose_dir }}/.env"
```
Das `templates/`-Verzeichnis der Role existiert nicht (`ls automation/ansible/roles/documenso/` zeigt nur `defaults/` und `tasks/`).

**Auswirkung:** Die Role schlägt sofort mit `ERROR! Could not find or access 'compose.yml.j2'` fehl. Documenso kann nie deployed werden.

**Fix:** `templates/`-Verzeichnis erstellen und `compose.yml.j2` sowie `env.j2` aus dem Catalog-Template ableiten.

---

### [CRITICAL] eval-Injection in nightly-updates CI

**Datei:** `.github/workflows/nightly-updates.yml:241`  
**Problem:**
```bash
if [[ -n "${PROVISION_ROLLBACK_HOOK_CMD}" ]]; then
  echo "[rollback] Invoking PROVISION_ROLLBACK_HOOK_CMD ..." >&2
  eval "${PROVISION_ROLLBACK_HOOK_CMD}"   # ← Command Injection!
fi
```
`PROVISION_ROLLBACK_HOOK_CMD` ist ein GitHub Secret. Jeder mit Schreibzugriff auf das Repository (oder Secrets) kann beliebige Shell-Commands auf dem GitHub Actions Runner ausführen. `eval` auf Secret-Werte ist ein bekanntes Code-Injection-Pattern.

**Auswirkung:** Remote Code Execution auf dem CI-Runner. Bei kompromittiertem Secret: Shell-Zugriff mit den Rechten des Runners, inklusive SSH-Key aus dem gleichen Workflow.

**Fix:**
```bash
# Statt eval: definiertes Rollback-Script ausführen
if [[ -n "${PROVISION_ROLLBACK_HOOK_CMD}" ]]; then
  # Nur erlaubte Werte: z.B. Pfad zu einem Script
  ops/scripts/tenant-rollback-hook.sh "${HOST}" "${USER}" "${SNAP}"
fi
```

---

### [HIGH] UFW blockiert HTTP/HTTPS — Traefik nicht erreichbar

**Datei:** `automation/ansible/roles/common-hardening/tasks/main.yml:17-27`  
**Problem:**
```yaml
- name: Allow SSH
  community.general.ufw:
    rule: allow
    port: '22'
    proto: tcp

- name: Enable UFW
  community.general.ufw:
    state: enabled
```
UFW wird aktiviert, aber nur Port 22 wird geöffnet. Ports 80 und 443 (Traefik), 8080 (diverse Apps) sowie 9090/3001 (Monitoring) bleiben geschlossen.

**Auswirkung:** Nach dem ersten `provision-tenant.yml`-Lauf ist der Tenant-Server von außen nur per SSH erreichbar. Keine App ist über das Web zugänglich.

**Fix:**
```yaml
- name: Allow HTTP
  community.general.ufw:
    rule: allow
    port: '80'
    proto: tcp

- name: Allow HTTPS
  community.general.ufw:
    rule: allow
    port: '443'
    proto: tcp

- name: Set UFW default incoming policy to deny
  community.general.ufw:
    policy: deny
    direction: incoming
```

---

### [HIGH] Dual Docker-Installation — Konflikte zwischen Roles

**Dateien:**
- `automation/ansible/roles/traefik/tasks/main.yml:18-30` — installiert `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin` aus dem **Docker-offiziellen Repository**
- `automation/ansible/roles/docker-runtime/tasks/main.yml:11-15` — installiert `docker.io`, `docker-compose-v2` aus dem **Debian/Ubuntu-Repository**

**Problem:** Beide Packages liefern `/usr/bin/dockerd`. Bei gleichzeitiger Verwendung (z.B. wenn `bootstrap-tenant.yml` die `docker-runtime`-Role nutzt und dann manuell Traefik deployed wird) entstehen Paket-Konflikte.

**Auswirkung:** `dpkg`-Fehler, kaputte Docker-Installation, Services starten nicht.

**Fix:** Eine einzige Docker-Installation standardisieren. Empfehlung: Docker CE aus dem offiziellen Repository (wie in der traefik-Role). `docker-runtime` auf das offizielle Repo umstellen. `apt_key` und `apt_repository` Module sind deprecated — `deb822_repository` verwenden.

---

### [HIGH] monitoring Role nutzt deprecated/non-FQDN Module

**Datei:** `automation/ansible/roles/monitoring/tasks/main.yml`  
**Problem:**
```yaml
- name: Create monitoring directories
  file:                    # ← Muss: ansible.builtin.file
    ...

- name: Template monitoring files
  copy:                    # ← Muss: ansible.builtin.copy
    ...

- name: Start monitoring stack
  docker_compose:          # ← Deprecated! Muss: community.docker.docker_compose_v2
    ...
```
`docker_compose` (v1 Modul) ist seit Ansible 2.10 deprecated und in modernen Collections nicht mehr vorhanden. `file:` und `copy:` ohne FQDN-Namespace können beim Einsatz von Custom Collections shadowed werden.

**Auswirkung:** `docker_compose` kann bei neueren Ansible-Versionen nicht gefunden werden → Role schlägt fehl.

**Fix:** Alle Module auf FQDN umstellen:
```yaml
  ansible.builtin.file:
  ansible.builtin.copy:
  community.docker.docker_compose_v2:
```

---

### [HIGH] ansible.builtin.apt_key ist deprecated

**Datei:** `automation/ansible/roles/traefik/tasks/main.yml:14-17`  
**Problem:**
```yaml
- name: Add Docker GPG key
  ansible.builtin.apt_key:
    url: https://download.docker.com/linux/debian/gpg
    state: present
```
`apt_key` ist seit Debian Bullseye/Ubuntu 22.04 deprecated. Der Key wird in einen globalen Keyring importiert statt in `/etc/apt/keyrings/`. Außerdem ist keine Fingerprint-Überprüfung konfiguriert.

**Auswirkung:** Deprecation-Warnung, potenziell unsicherer Key-Import ohne Verifikation.

**Fix:**
```yaml
- name: Add Docker GPG key
  ansible.builtin.get_url:
    url: https://download.docker.com/linux/debian/gpg
    dest: /etc/apt/keyrings/docker.asc
    mode: '0644'
    checksum: "sha256:1500c1f56fa9e26b9b8f42452a553675796ade0807cdce11975eb98170b3a570"
```

---

### [HIGH] Hardcoded amd64-Architektur in apt_repository

**Datei:** `automation/ansible/roles/traefik/tasks/main.yml:19-22`  
**Problem:**
```yaml
- name: Add Docker repository
  ansible.builtin.apt_repository:
    repo: "deb [arch=amd64] https://download.docker.com/linux/debian {{ ansible_distribution_release }} stable"
```
`arch=amd64` ist fest kodiert. Auf ARM-basierten Servern (z.B. Raspberry Pi, ARM64-VMs) schlägt die Installation fehl.

**Fix:**
```yaml
    repo: "deb [arch={{ ansible_architecture | replace('x86_64', 'amd64') }}] https://..."
```

---

### [HIGH] ANSIBLE_HOST_KEY_CHECKING deaktiviert — MITM-Risiko

**Datei:** `.github/workflows/nightly-updates.yml:124`  
**Problem:**
```yaml
env:
  ANSIBLE_HOST_KEY_CHECKING: "False"
```
SSH Host-Key-Checking ist für alle Tenant-Verbindungen deaktiviert. Ein Angreifer mit DNS/ARP-Zugriff kann einen Tenant-Host spoofing und SSH-Credentials abgreifen.

**Auswirkung:** Man-in-the-Middle-Angriff möglich. Credentials werden an falschen Host gesendet.

**Fix:** Known hosts aus der Inventory-Datei oder einem sicheren Store vorher einspielen:
```yaml
- name: Add tenant host to known_hosts
  run: ssh-keyscan -H "$TENANT_HOST" >> ~/.ssh/known_hosts
```

---

## 3. Infrastruktur-Konfiguration (infra/)

---

### [CRITICAL] Grafana Default-Passwort hardcoded

**Datei:** `infra/monitoring/docker-compose.yml:24`  
**Problem:**
```yaml
grafana:
  environment:
    - GF_SECURITY_ADMIN_USER=admin
    - GF_SECURITY_ADMIN_PASSWORD=admin    # ← Hardcoded Standard-Passwort!
    - GF_USERS_ALLOW_SIGN_UP=false
```
Das Admin-Passwort für Grafana ist `admin` und direkt in der Compose-Datei im Repository. Grafana ist damit sofort nach dem Deployment kompromittierbar, besonders wenn Port 3001 offen ist.

**Auswirkung:** Jeder mit Netzwerkzugang kann sich in Grafana einloggen und Monitoring-Daten einsehen, Dashboards manipulieren oder bei Schwachstellen RCE erlangen.

**Fix:**
```yaml
# infra/monitoring/.env (nicht im Repo!)
GRAFANA_ADMIN_PASSWORD=<sicheres-passwort>

# docker-compose.yml:
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
```

---

### [HIGH] monitoring_net ist internal: true — Prometheus kann host.docker.internal nicht erreichen

**Datei:** `infra/monitoring/docker-compose.yml:60-62`  
**Problem:**
```yaml
networks:
  monitoring_net:
    driver: bridge
    internal: true    # ← Kein externer Netzwerkzugang!
```
Das Monitoring-Netzwerk ist als `internal` definiert. Gleichzeitig konfiguriert Prometheus einen Scrape-Target auf `host.docker.internal:9100`:
```yaml
# prometheus/prometheus.yml:12
  - targets: ['host.docker.internal:9100']
```
`host.docker.internal` wird via DNS in die Host-IP aufgelöst — aber mit `internal: true` sind externe Netzwerkzugriffe blockiert. Node Exporter kann nicht gescrapt werden.

**Auswirkung:** Keine Host-Metriken in Prometheus. Monitoring ist blind für CPU, RAM, Disk der Management-VM.

**Fix:** `internal: true` entfernen oder ein separates externes Netzwerk für Prometheus-Scraping hinzufügen.

---

### [HIGH] Alle Monitoring-Images sind unpinned (:latest)

**Datei:** `infra/monitoring/docker-compose.yml:5,20,39,47`  
**Problem:**
```yaml
image: prom/prometheus:latest
image: grafana/grafana:latest
image: grafana/loki:latest
image: grafana/promtail:latest
```
Keine Image-Versionen gepinnt. `docker compose pull` kann jederzeit Breaking Changes einziehen.

**Auswirkung:** Nach jedem Pull kann Grafana/Prometheus brechen. Breaking Changes passieren regelmäßig bei Grafana (Dashboard-JSON-Format, Plugin-API).

**Fix:** Spezifische Versionen pinnen:
```yaml
image: prom/prometheus:v2.52.0
image: grafana/grafana:11.0.0
image: grafana/loki:3.0.0
image: grafana/promtail:3.0.0
```

---

### [MEDIUM] Deprecated `version:` in Monitoring Compose

**Datei:** `infra/monitoring/docker-compose.yml:1`  
**Problem:**
```yaml
version: '3.8'
```
Das `version:`-Field in Docker Compose V2 (Compose Spec) ist deprecated und wird ignoriert. Erzeugt eine Warnung und suggeriert, dass veraltete Dokumentation genutzt wurde.

**Fix:** Das `version:`-Field komplett entfernen.

---

### [MEDIUM] Promtail Positions-Datei in /tmp

**Datei:** `infra/monitoring/promtail/config.yml:5-6`  
**Problem:**
```yaml
positions:
  filename: /tmp/positions.yaml
```
`/tmp` wird bei Container-Restart geleert. Bei jedem Restart verliert Promtail seine Log-Position und re-sendet alle Logs an Loki — führt zu massivem Log-Duplikaten.

**Fix:** Ein persistentes Volume verwenden:
```yaml
positions:
  filename: /var/promtail/positions.yaml
# + Volume-Mount: promtail_positions:/var/promtail
```

---

### [MEDIUM] Alertmanager fehlt komplett

`infra/monitoring/` enthält keine Alertmanager-Konfiguration. Es gibt keine Alert-Rules in Prometheus. Monitoring sammelt Metriken, aber nobody gets notified.

**Fix:** Alertmanager Container + Config hinzufügen, Prometheus Alert-Rules definieren (Node-Down, Disk-Full, Container-Restart-Loop).

---

### [MEDIUM] Prometheus scrapet keine Tenant-VMs

**Datei:** `infra/monitoring/prometheus/prometheus.yml`  
**Problem:** Nur 2 Scrape-Targets konfiguriert:
```yaml
  - targets: ['localhost:9090']      # Prometheus selbst
  - targets: ['host.docker.internal:9100']  # Management-VM
```
Keine Tenant-VMs, keine Container-Metriken (cAdvisor), keine App-spezifischen Metriken.

**Fix:** Dynamisches Service Discovery via Docker-Labels oder File-Based SD für Tenants:
```yaml
  - job_name: 'tenant-node-exporters'
    file_sd_configs:
      - files: ['/etc/prometheus/targets/tenants/*.json']
```

---

### [MEDIUM] Traefik Dashboard ohne Forward-Auth

**Datei:** `infra/traefik/dynamic/default.yml`  
**Problem:** Der Traefik-Dashboard-Router ist nur durch ein IP-Allowlist geschützt:
```yaml
    traefik-dashboard:
      middlewares:
        - mgmt-ipallowlist
        - strip-traefik-prefix
```
Es gibt kein `basicAuth`, kein `forwardAuth` zu Authentik. Jeder auf dem Management-Netzwerk (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) kann auf das Dashboard zugreifen.

**Fix:** BasicAuth oder ForwardAuth zu Authentik hinzufügen:
```yaml
      middlewares:
        - mgmt-ipallowlist
        - strip-traefik-prefix
        - traefik-auth  # BasicAuth oder ForwardAuth
```

---

## 4. App-Katalog-Analyse

### 4.1 Compose Templates

---

### [HIGH] Keine Resource-Limits in einem einzigen App-Template

**Problem:** Alle 35 Apps (`catalog/apps/*/compose.template.yml`) haben keinerlei `deploy.resources.limits` oder `mem_limit`-Definitionen.

**Beispiel:** `catalog/apps/taiga/compose.template.yml` — 8 Services, alle ohne Resource-Limits.

**Auswirkung:** Ein fehlerhafter Container (Memory-Leak, infinite Loop) kann die gesamte Tenant-VM zum Stillstand bringen und alle anderen Apps dieses Tenants ausfallen lassen. OOM-Killer greift unkontrolliert.

**Fix:** Für jeden Service Resource-Limits hinzufügen, z.B.:
```yaml
    deploy:
      resources:
        limits:
          memory: 512m
          cpus: '0.5'
        reservations:
          memory: 128m
```

---

### [HIGH] Fehlende Healthchecks in 30 von 35 App-Templates

**Problem:** Nur 5 Apps haben eine `healthcheck:`-Definition im Compose-Template:
- `bookstack` ✅
- `documenso` ✅
- `joplin` ✅
- `snipe-it` ✅
- `wiki-js` ✅

Alle 30 anderen Apps starten ohne Healthcheck. Gleichzeitig nutzen fast alle Apps `depends_on:` für ihre Datenbank-Services — aber **ohne** `condition: service_healthy`, weil kein Healthcheck definiert ist.

**Beispiel:** `catalog/apps/nextcloud/compose.template.yml:24+55`
```yaml
    depends_on:
      - db       # ← Keine condition! Race Condition!
```

**Auswirkung:** App-Container starten, während die Datenbank noch initialisiert. Race Conditions führen zu Startup-Fehlern, die ohne automatischen Restart nicht behoben werden.

**Fix für jeden DB-Service:**
```yaml
  db:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
```
**Fix für App-Service:**
```yaml
    depends_on:
      db:
        condition: service_healthy
```

---

### [MEDIUM] 10 Apps nutzen `"latest"` als Default Image-Tag

**Problem:** Folgende Apps haben `"default": "latest"` in ihrer `vars.schema.json` für den Image-Tag:

| App | Variable | Schema-Datei |
|-----|---------|-------------|
| akaunting | `AK_IMAGE_TAG` | `vars.schema.json` |
| appflowy | `APPFLOWY_VERSION` | `vars.schema.json` |
| docmost | `DOCMOST_IMAGE_TAG` | `vars.schema.json` |
| opencats | `OCATS_IMAGE_TAG` | `vars.schema.json` |
| orangehrm | `OHRM_IMAGE_TAG` | `vars.schema.json` |
| outline | `OUTLINE_IMAGE_TAG` | `vars.schema.json` |
| peppermint | `PP_IMAGE_TAG` | `vars.schema.json` |
| planka | `PLANKA_IMAGE_TAG` | `vars.schema.json` |
| stirling-pdf | `SPDF_IMAGE_TAG` | `vars.schema.json` |
| twenty-crm | `TWENTY_VERSION` | `vars.schema.json` |

**Auswirkung:** Nightly-Updates können bei diesen Apps Breaking Changes deployen. `pull: always` in der nightly-updates-Playbook zieht unkontrolliert neue Images.

**Fix:** Konkrete Versionen als Default setzen. `latest` nur für Development/Draft-Apps akzeptabel.

---

### 4.2 app.yaml Fehlende Felder

---

### [MEDIUM] 10 Apps fehlen required Fields in app.yaml

**Problem:** Folgende Apps fehlen die Felder `requires`, `supportsBranding`, und/oder `supportsSSO` in ihrer `app.yaml`. Dies führt zu Validation-Fehlern wenn der `validate_catalog.py` Script mit dem Feld-Check läuft:

| App | requires | supportsBranding | supportsSSO |
|-----|---------|-----------------|-------------|
| akaunting | ❌ | ❌ | ❌ |
| appflowy | ❌ | ❌ | ❌ |
| docmost | ❌ | ❌ | ❌ |
| limesurvey | ❌ | ❌ | ❌ |
| opencats | ❌ | ❌ | ❌ |
| outline | ❌ | ❌ | ❌ |
| peppermint | ❌ | ❌ | ❌ |
| planka | ❌ | ❌ | ❌ |
| stirling-pdf | ❌ | ❌ | ❌ |
| umami | ❌ | ❌ | ❌ |

(Die vollständigen Apps mit allen Feldern: authentik, bookstack, documenso, espocrm, huly, invoiceninja, it-tools, joplin, leantime, libretranslate, mattermost, metabase, nextcloud, ollama, openwebui, orangehrm, paperless-ngx, plane, searxng, snipe-it, taiga, twenty-crm, vaultwarden, vikunja, wiki-js)

**Fix:** Fehlende Felder in den jeweiligen `app.yaml`-Dateien ergänzen.

---

### 4.3 vars.schema.json Inkonsistenzen

---

### [HIGH] Documenso nutzt snake_case statt UPPER_CASE

**Datei:** `catalog/apps/documenso/vars.schema.json`  
**Problem:**
```json
"required": ["domain", "smtp_host", "smtp_port", "smtp_user", "smtp_pass",
             "secret_key", "encryption_key", "db_password"]
```
Alle anderen 34 Apps nutzen konsequent `UPPER_CASE` für Variablennamen (z.B. `AKAUNTING_DB_PASSWORD`, `MM_HOST`, `NEXTCLOUD_ADMIN_USER`). Documenso bricht diese Konvention komplett.

**Auswirkung:** Das Template-Rendering-System (catalog-deployer) muss Sonderfälle für Documenso implementieren oder die Variablen werden nicht korrekt expandiert.

**Fix:** Variablennamen nach Standard umbenennen:
```json
"required": ["DOCUMENSO_DOMAIN", "DOCUMENSO_SMTP_HOST", ..., "DOCUMENSO_DB_PASSWORD"]
```

---

### [MEDIUM] 9 Apps ohne hostPattern-Regex in HOST-Variable

**Problem:** Folgende Apps haben keine `pattern`-Validierung für ihre HOST-Variable in `vars.schema.json`:

| App | Variable | Hat pattern? |
|-----|---------|-------------|
| espocrm | `ESPOCRM_HOST` | ❌ |
| huly | `HULY_HOST` | ❌ |
| mattermost | `MM_HOST` | ❌ |
| metabase | `MB_HOST` | ❌ |
| orangehrm | `OHRM_HOST` | ❌ |
| plane | `PLANE_HOST` | ❌ |
| taiga | `TAIGA_HOST` | ❌ |
| twenty-crm | `TWENTY_HOST` | ❌ |
| vikunja | `VIKUNJA_HOST` | ❌ |

Andere Apps wie `nextcloud`, `limesurvey`, `opencats`, `paperless-ngx` haben korrekte Pattern:
```json
"pattern": "^nextcloud\\.[a-z0-9-]+\\.irongeeks\\.eu$"
```

**Auswirkung:** Ungültige Hostnames können deployed werden, was zu nicht funktionierenden Traefik-Routing-Regeln führt.

**Fix:** Pattern-Constraint für jede HOST-Variable ergänzen.

---

### [MEDIUM] Inkonsistentes $schema zwischen Apps

**Problem:** `documenso/vars.schema.json` nutzt:
```json
"$schema": "http://json-schema.org/draft-07/schema#"
```
Alle anderen Apps nutzen:
```json
"$schema": "https://json-schema.org/draft/2020-12/schema"
```

**Auswirkung:** JSON Schema Validator muss zwei Draft-Versionen unterstützen. Draft-07 hat andere Semantik (z.B. `$ref`, `$recursiveRef`).

**Fix:** Einheitlich `https://json-schema.org/draft/2020-12/schema` für alle Apps.

---

## 5. CI/CD-Analyse

---

### [HIGH] Kein timeout-minutes in einem einzigen Workflow

**Problem:** Alle 8 Workflows (authz-audit-regression, catalog-validator, gate-artifact-publisher, gate-evidence, iac-security-lint, infra-guards, nightly-updates, secret-scan) haben **keine** `timeout-minutes`-Direktive.

GitHub Actions Default: 6 Stunden. Ein hängender Job (z.B. SSH-Verbindung zu nicht-erreichbarem Tenant, endlose npm ci) verbraucht CI-Minutes bis zum Limit.

**Fix:** Jedes Job mit realistischem Timeout versehen:
```yaml
jobs:
  authz-audit-regression:
    timeout-minutes: 15
    runs-on: ubuntu-latest
```

---

### [HIGH] Floating Action-Tags — Supply Chain Risiko

**Dateien:**
- `.github/workflows/iac-security-lint.yml:23`: `uses: bridgecrewio/checkov-action@v12`
- `.github/workflows/secret-scan.yml`: `uses: gitleaks/gitleaks-action@v2`
- `.github/workflows/nightly-updates.yml`: `uses: webfactory/ssh-agent@v0.9.0` (gut, aber kein SHA)

**Problem:** Floating Major-Tags (`@v12`, `@v2`) können von den Action-Autoren auf bösartigen Code umgeleitet werden (Typosquatting/Hijacking). Best Practice ist SHA-Pinning.

**Auswirkung:** Supply-Chain-Angriff möglich. Eine kompromittierte Action könnte TENANT_SSH_PRIVATE_KEY exfiltrieren.

**Fix:**
```yaml
uses: bridgecrewio/checkov-action@e7484060a939e5a4549e3af5bd80b5c2a1064b9  # v12.2.0
uses: gitleaks/gitleaks-action@ff98106e4c7b2bc287b24d2c4921e6b74edab9e2  # v2.3.4
```

---

### [MEDIUM] Duplizierte Gate-Evidence-Workflows

**Dateien:** `.github/workflows/gate-evidence.yml` und `.github/workflows/gate-artifact-publisher.yml`

Beide Workflows triggern auf `push: branches: [main]` und generieren Gate-Evidence-Bundles. `gate-evidence.yml` führt zusätzlich Tests aus. Dies führt zu:
- Doppeltem CI-Ressourcenverbrauch
- Race Conditions bei Artifact-Upload (gleiche Namen)
- Verwirrung bei Audit-Trails (welcher Bundle ist der "offizielle"?)

**Fix:** `gate-artifact-publisher.yml` entfernen oder als separaten Workflow für andere Trigger konfigurieren.

---

### [MEDIUM] Fehlende Security-Checks in CI

**Problem:** Folgende Security-Checks fehlen in der CI-Pipeline:
1. **SAST (Static Application Security Testing)** — kein CodeQL, Semgrep oder ähnliches
2. **Dependency-Scanning** — kein Dependabot, npm audit, Safety für Python
3. **Container-Image-Scanning** — kein Trivy/Grype für deployed Images
4. **SBOM-Generierung** — kein Software Bill of Materials

**Fix:** Mindestens Dependabot aktivieren (`dependabot.yml`) und CodeQL für JS/TS-Code:
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/platform/webapp"
    schedule:
      interval: "weekly"
```

---

## 6. Ops-Scripts

---

### [MEDIUM] install-wizard.sh — OpenTofu Download ohne Checksumme

**Datei:** `ops/scripts/install-wizard.sh` (step_opentofu Funktion)  
**Problem:**
```bash
local url="https://github.com/opentofu/opentofu/releases/download/v${version}/tofu_${version}_${arch}.deb"
curl -fsSL -o /tmp/opentofu.deb "$url"
dpkg -i /tmp/opentofu.deb
```
Das `.deb`-Paket wird heruntergeladen und installiert **ohne SHA256-Checksumme-Verifikation**. Außerdem wird die `version`-Variable direkt aus Benutzer-Input übernommen — Path-Traversal in der URL möglich (z.B. Version `../../evil`).

**Auswirkung:** Man-in-the-Middle kann ein bösartiges `.deb` einspielen. Bei HTTPS kein Risiko des MitM, aber ohne Checksum-Verifikation würde ein kompromittiertes GitHub-Release unbemerkt bleiben.

**Fix:**
```bash
# Checksumme vom offiziellen Release herunterladen und verifizieren
curl -fsSL -o /tmp/opentofu.deb "${url}"
curl -fsSL -o /tmp/opentofu.sha256 "${url}.sha256"
sha256sum --check /tmp/opentofu.sha256 || { echo "Checksum mismatch!"; exit 1; }
```

---

### [MEDIUM] install-wizard.sh — Fehlerhafte Secret-Generierung mit Fallback

**Datei:** `ops/scripts/install-wizard.sh` (step_configure_env, In-Skript Kommentar)  
**Problem:**
```bash
# NEXTAUTH_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "bitte_ersetzen")
```
Dieser Fallback ist auskommentiert, aber das Pattern (`|| echo "bitte_ersetzen"`) existiert auch für `encryption_key`:
```bash
local encryption_key
encryption_key=$(openssl rand -hex 16 2>/dev/null || echo "bitte_durch_32hex_zeichen_ersetzen_!!")
```
Wenn `openssl` nicht verfügbar ist (unwahrscheinlich aber möglich), wird ein bekannter schwacher Fallback-Key in die `.env` geschrieben — ohne Warnung.

**Auswirkung:** Wenn `openssl` fehlt: alle Tenants bekommen denselben Encryption-Key `bitte_durch_32hex_zeichen_ersetzen_!!`.

**Fix:**
```bash
encryption_key=$(openssl rand -hex 16) || {
  echo "FEHLER: openssl nicht verfügbar — Installation kann nicht sicher fortgeführt werden." >&2
  exit 1
}
```

---

### [LOW] validate_catalog.py prüft keine Compose-Qualität

**Datei:** `ops/scripts/validate_catalog.py`  
**Problem:** Der CI-Validator prüft `compose.template.yml` nur auf:
- Stub-Erkennung (TODO/leere Datei)
- Existenz eines `services:`-Blocks
- Hardcoded Domains

Er prüft **nicht** auf:
- Fehlende `healthcheck:` Definitionen
- Fehlende `restart:` Policy
- Fehlende Resource-Limits
- `depends_on` ohne `condition: service_healthy`

**Fix:** Validate-Funktion erweitern:
```python
def validate_compose_quality(app_dir, result, status):
    # check for healthcheck:
    # check for restart:
    # check for resources:
    # check for depends_on without condition:
```

---

## 7. Kritische Befunde — Zusammenfassung

| # | Severity | Titel | Datei | Impact |
|---|---------|-------|-------|--------|
| 1 | 🔴 CRITICAL | ACME-Email Bug — keine TLS-Zertifikate | `roles/traefik/templates/traefik.yml.j2:36` | Kompletter HTTPS-Ausfall |
| 2 | 🔴 CRITICAL | Traefik .env fehlt — kein IONOS API Key | `roles/traefik/tasks/main.yml` | Keine ACME Challenge |
| 3 | 🔴 CRITICAL | authentik-bootstrap = TODO-Stub | `roles/authentik-bootstrap/tasks/main.yml` | Kein SSO für Tenants |
| 4 | 🔴 CRITICAL | catalog-deployer = TODO-Stub | `roles/catalog-deployer/tasks/main.yml` | Kein App-Deployment |
| 5 | 🔴 CRITICAL | Documenso-Templates fehlen | `roles/documenso/templates/*.j2` | Role crasht sofort |
| 6 | 🔴 CRITICAL | eval Injection in CI | `nightly-updates.yml:241` | RCE auf CI-Runner |
| 7 | 🟠 HIGH | Grafana Default-Passwort `admin` | `infra/monitoring/docker-compose.yml:24` | Sofort kompromittierbar |
| 8 | 🟠 HIGH | UFW blockiert 80/443 | `roles/common-hardening/tasks/main.yml` | Kein Web-Traffic |
| 9 | 🟠 HIGH | Dual Docker-Install Konflikt | traefik + docker-runtime roles | Package-Konflikte |
| 10 | 🟠 HIGH | monitoring_net internal=true | `infra/monitoring/docker-compose.yml:62` | Node Exporter tot |
| 11 | 🟠 HIGH | Keine Resource-Limits (35 Apps) | `catalog/apps/*/compose.template.yml` | OOM-Risiko |
| 12 | 🟠 HIGH | Fehlende Healthchecks (30/35 Apps) | `catalog/apps/*/compose.template.yml` | Race Conditions |
| 13 | 🟠 HIGH | Documenso snake_case Vars | `catalog/apps/documenso/vars.schema.json` | Rendering-Fehler |
| 14 | 🟠 HIGH | Kein timeout-minutes in CI | Alle 8 Workflows | CI-Minute-Drain |
| 15 | 🟠 HIGH | Floating Action-Tags | `iac-security-lint.yml`, `secret-scan.yml` | Supply-Chain-Risiko |
| 16 | 🟠 HIGH | MITM via kein Host-Key-Check | `nightly-updates.yml:124` | SSH-Credentials-Leak |
| 17 | 🟠 HIGH | deprecated apt_key Module | `roles/traefik/tasks/main.yml:14` | Key-Import ohne Verifikation |
| 18 | 🟠 HIGH | hardcoded amd64 Architektur | `roles/traefik/tasks/main.yml:21` | Kein ARM-Support |
| 19 | 🟡 MEDIUM | Monitoring deprecated docker_compose | `roles/monitoring/tasks/main.yml:26` | Role schlägt fehl |
| 20 | 🟡 MEDIUM | 10 Apps mit "latest" Image-Tag | `catalog/apps/*/vars.schema.json` | Unkontrollierte Updates |
| 21 | 🟡 MEDIUM | 10 Apps fehlen app.yaml Felder | `catalog/apps/*/app.yaml` | Validation-Fehler |
| 22 | 🟡 MEDIUM | Alle Monitoring-Images unpinned | `infra/monitoring/docker-compose.yml` | Breaking Updates |
| 23 | 🟡 MEDIUM | Promtail positions in /tmp | `infra/monitoring/promtail/config.yml:6` | Log-Duplikate |
| 24 | 🟡 MEDIUM | Kein Alertmanager | `infra/monitoring/` | Kein Alerting |
| 25 | 🟡 MEDIUM | Keine Tenant-VM Prometheus Targets | `infra/monitoring/prometheus/prometheus.yml` | Blindes Monitoring |
| 26 | 🟡 MEDIUM | 9 Apps ohne HOST Pattern-Validation | `catalog/apps/*/vars.schema.json` | Ungültige Hostnames |
| 27 | 🟡 MEDIUM | Inkonsistentes $schema Draft | `catalog/apps/documenso/vars.schema.json` | Validator-Kompatibilität |
| 28 | 🟡 MEDIUM | Duplizierte Gate-Evidence Workflows | `gate-evidence.yml`, `gate-artifact-publisher.yml` | CI-Doppelaufwand |
| 29 | 🟡 MEDIUM | validate_catalog.py prüft keine Compose-Qualität | `ops/scripts/validate_catalog.py` | Lücken im CI-Gate |
| 30 | 🟡 MEDIUM | Traefik Dashboard ohne Forward-Auth | `infra/traefik/dynamic/default.yml` | Intranet-Zugriff ohne Auth |
| 31 | 🟡 MEDIUM | OpenTofu Download ohne Checksumme | `ops/scripts/install-wizard.sh` | Manipulation möglich |
| 32 | 🟡 MEDIUM | Nightly hardcoded /opt/gmz/apps | `playbooks/nightly-updates.yml:39` | Konfiguration nicht flexibel |
| 33 | 🟢 LOW | Deprecated `version: 3.8` in Compose | `infra/monitoring/docker-compose.yml:1` | Deprecation Warning |
| 34 | 🟢 LOW | Fehlende SAST/Dependency Scanning | `.github/workflows/` | Sicherheitslücken unerkannt |
| 35 | 🟢 LOW | Non-FQDN Module in monitoring role | `roles/monitoring/tasks/main.yml` | Shadow-Risiko |
| 36 | 🟢 LOW | Encrypt-Key-Fallback mit bekanntem Wert | `ops/scripts/install-wizard.sh` | Schwache Crypto möglich |

---

## 8. Konsistenz-Matrix App-Katalog

| App | Status | restart: | healthcheck: | resources: | depends_on: | requires: | branding: | sso: | hostPattern: |
|-----|--------|---------|------------|----------|------------|---------|---------|-----|------------|
| akaunting | approved | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| appflowy | approved | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| authentik | certified-ref | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| bookstack | approved | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| docmost | approved | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| documenso | approved | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ⚠️ snake_case |
| espocrm | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ no pattern |
| huly | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ no pattern |
| invoiceninja | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| it-tools | approved | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| joplin | approved | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| leantime | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| libretranslate | approved | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| limesurvey | approved | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| mattermost | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ no pattern |
| metabase | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ no pattern |
| nextcloud | certified-ref | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ollama | approved | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| opencats | approved | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| openwebui | approved | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| orangehrm | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ no pattern |
| outline | approved | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| paperless-ngx | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| peppermint | approved | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| plane | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ no pattern |
| planka | approved | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| searxng | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| snipe-it | approved | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| stirling-pdf | approved | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| taiga | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ no pattern |
| twenty-crm | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ no pattern |
| umami | approved | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| vaultwarden | approved | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| vikunja | approved | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ no pattern |
| wiki-js | approved | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Legende:** ✅ vorhanden/korrekt | ❌ fehlt | ⚠️ problematisch

---

## 9. Empfehlungen — Priorisiert

### Sofort (vor Prod-Rollout): P0

1. **[BUG-FIX]** `traefik.yml.j2:36` — `${ACME_EMAIL}` → `{{ acme_email }}` *(1 Zeile)*
2. **[BUG-FIX]** Traefik `.env`-Deployment-Task in `roles/traefik/tasks/main.yml` *(5 Zeilen)*
3. **[BUG-FIX]** `roles/documenso/templates/` erstellen — `compose.yml.j2` + `env.j2` *(neues Verzeichnis)*
4. **[SICHERHEIT]** `GF_SECURITY_ADMIN_PASSWORD=admin` → aus `.env`-Datei *(1 Zeile + .env)*
5. **[BUG-FIX]** UFW Ports 80/443 in `common-hardening` öffnen *(2 Tasks)*
6. **[SICHERHEIT]** `eval "${PROVISION_ROLLBACK_HOOK_CMD}"` → definierten Script-Aufruf *(3 Zeilen)*

### Kurzfristig (Sprint 1): P1

7. **[FUNKTION]** `authentik-bootstrap` und `catalog-deployer` Rollen implementieren — Kernfunktionalität
8. **[SICHERHEIT]** `monitoring_net: internal: true` → entfernen; Alertmanager hinzufügen
9. **[SICHERHEIT]** SSH Host-Key-Checking in CI aktivieren (known_hosts vorausfüllen)
10. **[CI]** `timeout-minutes` für alle 8 Workflows definieren
11. **[CI]** Floating Action-Tags durch SHA-Pins ersetzen
12. **[ANSIBLE]** docker-runtime und traefik Role auf dieselbe Docker-Installations-Methode vereinheitlichen

### Mittelfristig (Sprint 2): P2

13. **[QUALITÄT]** Healthchecks für alle 30 Apps ohne Healthcheck hinzufügen
14. **[QUALITÄT]** Resource-Limits für alle 35 Apps hinzufügen
15. **[KONSISTENZ]** Documenso-Schema auf UPPER_CASE Variablen migrieren
16. **[KONSISTENZ]** HOST-Pattern-Validation für 9 Apps ergänzen
17. **[QUALITÄT]** `validate_catalog.py` um Compose-Qualitätsprüfungen erweitern
18. **[MONITORING]** Prometheus Scrape-Targets für Tenant-VMs (File-SD) konfigurieren
19. **[MONITORING]** Monitoring Images pinnen (keine `:latest`)

### Langfristig (Backlog): P3

20. **[SECURITY]** SAST (CodeQL/Semgrep) und Dependency-Scanning (Dependabot) aktivieren
21. **[SECURITY]** Container-Image-Scanning (Trivy) in CI integrieren
22. **[SECURITY]** Traefik Dashboard Forward-Auth zu Authentik
23. **[QUALITÄT]** Gate-Evidence-Duplikat bereinigen
24. **[QUALITÄT]** 10 App-YAML-Dateien mit fehlenden Feldern vervollständigen
25. **[QUALITÄT]** Promtail Positions-Datei auf persistentes Volume migrieren

---

*Audit abgeschlossen: 2026-03-10 | Alle Befunde basieren auf Code-Review ohne Live-System-Test.*  
*Nächste Prüfung empfohlen nach P0+P1-Fixes oder in 3 Monaten.*
