# REVIEW-005 — Trusted Auth Mode + Dev Tooling Gating

## What improved

- Added explicit auth modes in `platform/webapp/lib/auth-context.ts`:
  - `dev-header` (default, backward-compatible)
  - `trusted-bearer` (deployment-safe option)
- In `trusted-bearer` mode:
  - Server reads `Authorization: Bearer <token>`
  - Validates token via `WEBAPP_TRUSTED_TOKENS_JSON`
  - Ignores `x-user-id` / `x-user-role`
  - Returns `401` with clear error when token is missing/invalid on protected endpoints
- Kept existing RBAC enforcement model and policy mapping unchanged.
- Added lightweight auth tests for:
  - trusted token parsing/validation behavior
  - auth mode selection
  - `401` path for missing/invalid bearer token
- Gated local dev role tooling for production safety:
  - `DevRoleProvider` fetch header injection only when `NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH=true`
  - `DevRoleSwitch` only renders when enabled
- Updated docs in root README + `platform/webapp/README.md` with env variables and local enable flow.

## Remaining risks / follow-ups

- Static bearer token map in env is operationally simple but not ideal long-term:
  - no rotation workflow built-in
  - token lifecycle/audit remains manual
- No signature-based token validation (JWT/OIDC) yet.
- No per-token expiry or scoped permissions beyond static role assignment.
- Trust boundary still depends on correct environment hygiene (secret handling, deployment config, access controls).

## Recommendation

- Use `trusted-bearer` outside local development.
- Keep `NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH` disabled in shared/non-local environments.
- Plan next slice toward short-lived signed tokens + centralized identity provider integration.
