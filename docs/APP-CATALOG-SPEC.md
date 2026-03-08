# App Catalog Spec (Git-basiert)

## Ziel
Standardisierte, versionierte und erweiterbare App-Definitionen für Tenant-Deployments.

## Ordnerstruktur
```text
catalog/apps/
  authentik/
    app.yaml
    compose.template.yml
    vars.schema.json
    # optional in späteren Sprints:
    # branding.schema.json
    # healthchecks.yaml
  nextcloud/
    ...
```

## app.yaml (Beispiel)
```yaml
id: nextcloud
name: Nextcloud
version: 1.0.0
status: stable
requires:
  - authentik
supportsBranding: true
supportsSSO: true
exposes:
  - service: nextcloud
    port: 8080
    hostPattern: nextcloud.{tenant}.irongeeks.eu
```

## vars.schema.json
- Definiert Pflicht-/Optionalvariablen
- Typen, Defaults, Min/Max, Regex
- Tenant-overrides erlaubt

## Deployment-Konzept
1. Katalog-Version wird im Tenant-Deployment gespeichert
2. Compose-Template wird mit Tenant-Variablen gerendert
3. Secrets werden nur aus Secret Store injiziert
4. Healthchecks validieren erfolgreiche Inbetriebnahme

## Erweiterbarkeit
- Neue App = neuer App-Ordner + Schema-Validierung + CI check
- Optionaler Freigabeprozess:
  - draft -> approved -> deployable

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
