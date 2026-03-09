# REVIEW-011 — Alert Routing Rules (Severity + Recipient Groups)

## Scope
Implemented rule-based alert routing in `platform/webapp` with backward-compatible config migration:

- Severity levels: `info`, `warning`, `critical`
- Per-channel severity toggles for Teams + Email
- Optional email recipient groups with severity→group mapping
- Dry-run routing preview endpoint
- RBAC + audit coverage for preview endpoint

## Implementation Notes

### Config model (`lib/notification-config.ts`)
- Added:
  - `bySeverity` for Teams + Email
  - `recipientGroups` and `severityGroupMap` for Email
- Existing `routes.authAlerts/testAlerts` behavior remains unchanged.
- Sanitizer backfills defaults for old config files.
- Secret masking/preservation unchanged (`webhookUrl`, `smtpPass`).

### Dispatch logic (`lib/alert-dispatch.ts`)
- Added routing matrix builder `computeRoutingStatus(...)`.
- Routing now evaluates:
  1. channel enabled + route toggle
  2. severity toggle
  3. email recipients/group resolution
- Added per-alert per-channel decision payload in response status.

### API
- Added `POST /api/alerts/preview-routing`:
  - admin-only
  - accepts optional payload alerts; defaults to current auth alerts
  - returns routing matrix without sending
  - emits audit success/failure/denied events
- Updated RBAC policy/type declarations for new endpoint.

### Admin UI (`/admin/security`)
- Added controls for:
  - severity toggles per channel
  - recipient groups editor (`group=mail1,mail2` per line)
  - severity→group mapping
  - routing preview action + matrix view
- Existing masked secret workflow preserved.

### Tests
- Extended dispatch tests:
  - severity routing decisions
  - recipient-group resolution
- Updated RBAC tests for preview endpoint.

## Backward Compatibility
- Existing `notification-config.json` remains valid.
- Missing new fields are auto-defaulted.
- Existing route toggles and dispatch endpoints continue to function.
