# REVIEW-007 — Admin Security Page + Token Rotation Observability

## Summary of improvements

Implemented a production-minded security observability slice across auth, API, and UI:

1. **Trusted token health enhancements (safe aggregation only)**
   - Added token expiry warning window support via:
     - `WEBAPP_TRUSTED_TOKEN_EXPIRY_WARNING_DAYS` (optional, default `14`)
   - Extended trusted token health summary with:
     - `total`
     - `active`
     - `expired`
     - `expiringSoon`
     - `warningDays`
   - No raw token values are exposed.

2. **`GET /api/auth/health` response extension**
   - API remains admin-protected via existing RBAC guard.
   - Response now includes new health counts and warning-days context.

3. **New admin UI page: `/admin/security`**
   - Displays auth health from `/api/auth/health`.
   - Displays latest audit events from `/api/audit/events?limit=50`.
   - Includes client-side text filters for:
     - action contains
     - outcome contains
   - Shows clear warning visuals when expired/expiringSoon tokens are present.
   - Includes readable, explicit 401/403 error states.
   - Responsive layout aligned with existing design system.

4. **Navigation update**
   - Added **Admin Security** entry in sidebar (always visible).
   - API-level RBAC enforcement remains authoritative.

5. **Test coverage updates**
   - Extended auth tests for expiring-soon logic and warning-days env parsing.

6. **Documentation updates**
   - Updated `platform/webapp/README.md`.
   - Updated root `README.md`.

## Remaining gaps / follow-ups

- **Per-token rotation workflow** is still intentionally out of scope here (no token listing/rotation actions, only aggregate observability).
- **Pagination/filtering server-side for audit events** could be added later if event volume grows.
- **Alerting hooks** (e.g., notify on expired > 0) are not yet implemented.
- **Role-aware nav visibility** can be added later for UX polish; currently always shown by design.
