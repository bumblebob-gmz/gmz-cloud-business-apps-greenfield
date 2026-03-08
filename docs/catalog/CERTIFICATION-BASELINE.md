# Certified App Baseline Checklist

Praktische Mindestanforderungen für `certified-reference` Apps im Katalog.

## Scope
Aktuell verpflichtend für:
- `authentik`
- `nextcloud`

Empfehlung: schrittweise auf weitere Apps ausrollen.

## 1) Metadata (`app.yaml`)
- `id` ist stabil und kebab-case
- `status: certified-reference`
- `requires` ist ein Array von App-IDs
- `exposes` enthält mindestens einen Eintrag mit:
  - `service`
  - `port`
  - `hostPattern` im Format `<service>.{tenant}.irongeeks.eu`
- `supportsSSO` / `supportsBranding` korrekt gesetzt

## 2) Runtime Template (`compose.template.yml`)
- Kein TODO-Stub: vollständige Services/Abhängigkeiten enthalten
- Alle tenant-spezifischen Werte sind Variablen (`${...}`)
- Keine hardcodierten Secrets
- Reverse-Proxy Routing auf Hostpattern abgestimmt

## 3) Variable Contract (`vars.schema.json`)
- `required` enthält alle betriebskritischen Variablen
- Typen + sinnvolle Constraints (`pattern`, `minLength`, `enum`, Defaults)
- `additionalProperties: false`
- Secrets als Input-Variablen, nicht als Klartextwerte

## 4) Operational Checks (`healthchecks.yaml`)
- Mindestens ein HTTP/Liveness-Check auf den public entrypoint
- Realistische Zeitparameter (`intervalSeconds`, `timeoutSeconds`)
- Optional: zusätzlicher Readiness-/Login-/Status-Check

## 5) CI/Validation
- `ops/scripts/validate_catalog.py` muss erfolgreich laufen
- Validiert mindestens:
  - Pflichtdateien
  - Pflichtfelder in `app.yaml`
  - `requires` als Liste
  - `exposes`-Struktur
  - `hostPattern`-Shape
  - `healthchecks.yaml` für zertifizierte Referenz-Apps

## Naming & Domain Conventions
- Service-ID: kebab-case (z. B. `paperless-ngx`)
- Tenant-Slug: lowercase alnum + `-`
- Produktionsdomain folgt: `service.tenant.irongeeks.eu`
- Katalog-Template nutzt Platzhalterform: `service.{tenant}.irongeeks.eu`
