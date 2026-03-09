# REVIEW-009 — Audit Usability + Token-Risk Alerts

## Delivered

- Added server-side audit filtering on `GET /api/audit/events`:
  - `limit` (1..200)
  - `outcome` (`success|failure|denied`)
  - `actionContains` (case-insensitive)
  - `operationContains` (case-insensitive)
  - `since` (ISO-parsed)
- Added admin-only CSV export: `GET /api/audit/events.csv` (same filters as JSON endpoint).
- Added admin-only auth risk alerts: `GET /api/auth/alerts`.
  - Returns actionable alerts with `severity`, `title`, and `recommendation`.
  - Derived from trusted-token health (`expired`, `expiringSoon`, `warningDays`).
  - No token values or secret material returned.
- Extended `/admin/security` UI:
  - Server-side audit filter controls + apply action.
  - CSV export link honoring active filter controls.
  - Alerts panel backed by `/api/auth/alerts`.
  - Kept readable 401/403 handling with explicit messages.
- Added lightweight tests:
  - `tests/audit-filters.test.ts`
  - `tests/auth-alerts.test.ts`
- Updated docs in:
  - `platform/webapp/README.md`
  - root `README.md`

## Remaining Gaps / Next Hardening Ideas

- CSV export currently returns all matching rows up to selected `limit`; if operators need full-range exports, add explicit pagination/streaming strategy.
- `since` parsing is permissive (Date.parse); consider strict RFC3339 validation for predictability.
- Alert recommendations are static templates; could be enhanced with role-aware runbook links and remediation playbooks.
- No explicit integration/API tests for route handlers yet (logic is unit-tested).
