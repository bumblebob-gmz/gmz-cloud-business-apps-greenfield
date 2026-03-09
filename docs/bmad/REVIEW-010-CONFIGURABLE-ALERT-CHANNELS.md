# REVIEW-010 — Configurable Alert Channels (Teams + Email)

## Scope
Implemented admin-configurable alert channel delivery in `platform/webapp` with persistent JSON config, masked secret handling, dispatch/test APIs, admin UI controls, RBAC updates, and audit coverage.

## What was added

- Persistent config store:
  - `platform/webapp/lib/notification-config.ts`
  - File: `platform/webapp/.data/notification-config.json`
  - Channels: `teams`, `email`
  - Flags: channel `enabled` + route toggles (`authAlerts`, `testAlerts`)
  - Email SMTP fields: host/port/secure/user/pass/from/to
  - GET masking for secret fields (`webhookUrl`, `smtpPass`)

- Channel dispatch logic:
  - `platform/webapp/lib/alert-dispatch.ts`
  - Teams sender via incoming webhook `MessageCard` payload
  - Email sender via `nodemailer` with TLS-safe defaults
  - Per-channel status return (`attempted`, `ok`, `message`)

- New admin APIs:
  - `GET /api/alerts/config`
  - `POST /api/alerts/config`
  - `POST /api/alerts/test`
  - `POST /api/auth/alerts/dispatch`

- Admin UI additions:
  - `/admin/security` now includes **Alert Channels** panel
  - Teams + Email config fields
  - Save, Test Send, Dispatch Current Auth Alerts actions
  - Success/error messaging in UI
  - Secret values masked after reload (never shown raw)

- RBAC policy updates:
  - Added admin-only operations for all new endpoints

- Audit events:
  - Added denied/success/failure audit events for config update, test send, and dispatch actions

- Tests:
  - `tests/notification-config.test.ts` (masking behavior)
  - `tests/alert-dispatch.test.ts` (route decision behavior)
  - `tests/rbac-policy.test.mjs` extended with new endpoint assertions

## Validation

- `npm run test:rbac` ✅
- `npm run build` ✅

## Notes

- Implementation is backward-compatible and defaults to disabled channels unless explicitly configured.
- Secrets are persisted server-side for dispatch but masked in API/UI reads.
