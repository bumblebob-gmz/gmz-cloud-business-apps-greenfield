# App Catalog Spec (Git-basiert)

## Ziel
Standardisierte, versionierte und erweiterbare App-Definitionen für Tenant-Deployments mit konsistentem Routing-Schema `<service>.<tenant>.irongeeks.eu`.

## Ordnerstruktur
```text
catalog/apps/
  authentik/
    app.yaml
    compose.template.yml
    vars.schema.json
    healthchecks.yaml
  nextcloud/
    app.yaml
    compose.template.yml
    vars.schema.json
    healthchecks.yaml
  <weitere-app>/
    ...
```

## `app.yaml` (Felder)
Pflichtfelder:
- `id` (kebab-case, eindeutig)
- `name`
- `version`
- `status` (`draft`, `approved`, `certified-reference`, `deprecated`)
- `requires` (Array von App-IDs)
- `supportsBranding` (boolean)
- `supportsSSO` (boolean)
- `exposes` (mind. ein Eintrag)

Empfohlene Zusatzfelder für produktionsnahe Katalogeinträge:
- `category`
- `summary`
- `website`
- `docsUrl`

Beispiel:
```yaml
id: nextcloud
name: Nextcloud
version: 30.0.2
status: certified-reference
category: collaboration
summary: File sync and collaboration suite with SSO support via OIDC/SAML.
website: https://nextcloud.com/
docsUrl: https://docs.nextcloud.com/
requires:
  - authentik
supportsBranding: true
supportsSSO: true
exposes:
  - service: nextcloud
    component: app
    protocol: https
    port: 80
    hostPattern: nextcloud.{tenant}.irongeeks.eu
```

## `exposes` + Domain-/Naming-Konventionen
Jeder `exposes`-Eintrag muss enthalten:
- `service`: DNS-kompatibler Service-Slug (kebab-case)
- `port`: interner Container-Port (1-65535)
- `hostPattern`: `<service>.{tenant}.irongeeks.eu`

Konventionen:
- Der erste Host-Label entspricht dem Service (`service`)
- `{tenant}` wird zur Laufzeit durch den Tenant-Slug ersetzt
- Effektive Route im Betrieb: `service.tenant.irongeeks.eu`

## `vars.schema.json`
- Definiert Pflicht-/Optionalvariablen für Template-Rendering
- Typen, Defaults, Min/Max, Regex
- Secrets nur als Variablenreferenz; echte Werte kommen aus Secret Store
- `additionalProperties: false` für harte Kataloghygiene

## `compose.template.yml`
- Tenant-fähige Docker-Compose-Referenz
- Hostnamen/Secrets über Variablen (`${...}`)
- Reverse-Proxy Labels (Traefik) auf `hostPattern` abgestimmt
- Keine hardcodierten Tenant-spezifischen Domains

## `healthchecks.yaml`
- Definiert post-deploy Laufzeitchecks (z. B. HTTP 200 auf status endpoint)
- Für zertifizierte Referenz-Apps verpflichtend
- Ziel: Deployability + schnelle Fehlerdiagnose

## Certified App Baseline
Für `authentik` und `nextcloud` gilt als Mindeststandard:
1. `status: certified-reference`
2. Vollständige `compose.template.yml` mit realistischen Abhängigkeiten
3. Nicht-triviales `vars.schema.json` mit Required-Feldern und Validierungsregeln
4. `healthchecks.yaml` vorhanden
5. `hostPattern` folgt `<service>.{tenant}.irongeeks.eu`

Siehe auch: `docs/catalog/CERTIFICATION-BASELINE.md`.

## Deployment-Konzept
1. Katalog-Version wird im Tenant-Deployment gespeichert
2. Compose-Template wird mit Tenant-Variablen gerendert
3. Secrets werden nur aus Secret Store injiziert
4. Healthchecks validieren erfolgreiche Inbetriebnahme

## Erweiterbarkeit
- Neue App = neuer App-Ordner + Schema-Validierung + CI-Check
- Optionaler Freigabeprozess:
  - `draft` -> `approved` -> `certified-reference` -> `deployable` (optionaler interner Status)

## Vorgesehene Initial-Apps
- authentik
- nextcloud (+talk, collabora)
- IT Tools
- paperless-ngx
- vaultwarden
- bookstack
- joplin
- libretranslate
- ollama
- openwebui
- searxng
- snipe-it
- wiki.js
