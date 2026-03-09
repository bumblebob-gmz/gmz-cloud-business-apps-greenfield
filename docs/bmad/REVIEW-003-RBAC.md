# REVIEW-003-RBAC

## Scope reviewed
Focused review of latest RBAC changes in `platform/webapp` (working tree):

- `lib/auth-context.ts`
- `lib/dev-auth-client.ts`
- `components/dev-role-provider.tsx`
- `components/dev-role-switch.tsx`
- `app/layout.tsx`, `components/navigation.tsx`
- API routes:
  - `app/api/jobs/route.ts`
  - `app/api/tenants/route.ts`
  - `app/api/provision/tenant/route.ts`
  - `app/api/setup/plan/route.ts`
  - `app/api/audit/events/route.ts`
  - `app/api/deployments/route.ts`
  - `app/api/reports/route.ts`
  - `app/api/reports.csv/route.ts`
  - `app/api/provision/preflight/route.ts`

## Pass/Fail checklist

- [x] **Auth extraction**: `x-user-id` + `x-user-role` are extracted centrally via `getAuthContextFromRequest`.
- [~] **Role enforcement**: enforced on write/sensitive POST routes (`/jobs`, `/tenants`, `/provision/tenant`, `/setup/plan`) and now `/audit/events`; **not enforced** on several GET endpoints (`/tenants`, `/jobs`, `/deployments`, `/reports`, `/reports.csv`, `/provision/preflight`).
- [x] **Denial behavior**: centralized 403 JSON response with operation, effective role, required role, userId.
- [x] **Audit actor integration**: actor (`id`, `role`) wired into tenant/provision audit events.
- [x] **Client header propagation**: client fetch wrapper injects role/user headers for API calls.
- [x] **Default role fallback**: invalid/missing role falls back predictably (`technician`, for backward-compatible internal dev flow).

## Quick safe fixes patched

1. **Header leakage guard**
   - Hardened `DevRoleProvider` to inject auth headers **only for same-origin `/api/*`** requests (prevents accidental header leak to external URLs containing `/api/`).
2. **Audit feed protection**
   - Added `requireMinimumRole(request, 'admin', 'GET /api/audit/events')` to `app/api/audit/events/route.ts`.

## Security concerns (current)

1. **Unauthenticated read surface**: key GET endpoints still have no role gate; data exposure risk remains.
2. **Header-trust model**: server trusts caller-provided `x-user-role`/`x-user-id`; without trusted upstream auth/signing this is spoofable.
3. **No integrity binding**: no session/JWT verification tying role to identity.
4. **No deny audit on generic RBAC failures**: `requireMinimumRole` returns 403 but does not emit an audit event by default.
5. **Dev-role mechanism active in app shell**: useful for dev, risky if not clearly disabled/guarded outside development.

## Top 8 follow-up actions

1. Add `readonly` minimum-role checks on all read endpoints (`GET /tenants`, `/jobs`, `/deployments`, `/reports`, `/reports.csv`, `/provision/preflight`).
2. Move from raw header trust to verified identity (JWT/session middleware) and derive role server-side.
3. Add an environment guard so dev role switching/header injection is enabled only in local/dev mode.
4. Extend `requireMinimumRole` (or wrapper) to emit standardized `outcome=denied` audit events.
5. Define route-level RBAC policy map (single source of truth) and enforce consistently.
6. Add integration tests for role matrix (readonly/technician/admin) on each API route.
7. Add spoofing tests ensuring externally supplied headers are ignored/overridden when real auth is present.
8. Document RBAC contract in `platform/webapp/README.md` (roles, defaults, protected routes, denial format).

---
Overall: RBAC foundation is solid and centralized, but enforcement is currently partial (mostly write paths). Closing GET-route coverage and replacing header-trust with verified auth should be prioritized.