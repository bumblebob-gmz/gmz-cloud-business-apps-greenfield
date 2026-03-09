# REVIEW-004-RBAC-HARDENING

## Scope
RBAC hardening pass in `platform/webapp` with focus on protected GET coverage and policy centralization.

## What improved
- Added centralized RBAC policy map in `platform/webapp/lib/rbac-policy.js`.
- Added operation-based enforcement helper in `platform/webapp/lib/auth-context.ts` (`requireOperationRole`).
- Enforced `readonly` minimum on key GET routes:
  - `GET /api/tenants`
  - `GET /api/jobs`
  - `GET /api/deployments`
  - `GET /api/reports`
  - `GET /api/reports.csv`
  - `GET /api/provision/preflight`
- Switched existing protected POST routes to policy-based helper (keeps `technician` requirement):
  - `POST /api/tenants`, `POST /api/jobs`, `POST /api/provision/tenant`, `POST /api/setup/plan`
- Kept `GET /api/audit/events` as `admin` via central policy.
- Added lightweight Node test coverage (`tests/rbac-policy.test.mjs`) for:
  - role ranking
  - policy requirements
  - denial payload contract
- Updated RBAC docs in:
  - `platform/webapp/README.md`
  - root `README.md`

## Remaining gaps
- No end-to-end route tests yet for full HTTP denial/allow matrix (currently policy/unit-level only).
- Header-based mock auth is still dev-oriented and not integrated with a real IdP/session layer.
