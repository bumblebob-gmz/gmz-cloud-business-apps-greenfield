# Audit Event Contract v1 (Baseline)

Dieses Dokument definiert das minimale Audit-Event-Envelope für Provisioning/Deploy-Pfade (Sprint N+1, B4 baseline).

## Schema
- JSON Schema: `docs/audit/audit-event.schema.json`

## Pflichtfelder
- `eventId` – eindeutige Event-ID
- `timestamp` – RFC3339/ISO8601 UTC timestamp
- `correlationId` – durchgängige ID über API, Worker und Integrationen
- `actor` – wer hat ausgelöst (`type`, `id`, optional `role`)
- `tenantId` – betroffener Tenant
- `action` – fachliche Aktion (z. B. `tenant.provision.start`)
- `resource` – Zielobjekt (z. B. `vm/21001`, `app/nextcloud`)
- `outcome` – `success` | `failure` | `denied`
- `source` – Ursprungsdienst + Operation

## Correlation-ID Regeln
1. Eingehende Requests mit Correlation-ID übernehmen.
2. Falls keine vorhanden ist, am API-Edge erzeugen.
3. ID in jeden Folge-Log, Job-Step und Audit-Event übernehmen.
4. Bei asynchronen Jobs bleibt dieselbe Correlation-ID über den gesamten Ablauf bestehen.

## Redaction / Secret Handling
- Keine Secrets im Klartext in `details` oder sonstigen Feldern.
- Token, Passwörter, API Keys, Session-IDs maskieren (`***` oder hash/fingerprint).
- Fehlertexte aus externen APIs vor Persistierung sanitizen.
- Für Debugging nur nicht-sensitive Metadaten loggen (IDs, Status, Dauer, Zielressource).

## Minimal Example
```json
{
  "eventId": "evt_01HRX...",
  "timestamp": "2026-03-08T20:51:00Z",
  "correlationId": "corr_8f31...",
  "actor": { "type": "user", "id": "u_123", "role": "admin" },
  "tenantId": "tenant-a",
  "action": "tenant.provision.start",
  "resource": "vm/21001",
  "outcome": "success",
  "source": { "service": "api", "operation": "POST /tenants/provision" },
  "details": { "node": "pve01", "vlanId": 120 }
}
```
