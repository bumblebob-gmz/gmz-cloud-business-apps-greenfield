# REVIEW-014 – JWT/OIDC Integration & Vault-Compatible Token Abstraction

**Date:** 2026-03-09
**Status:** ✅ Delivered
**Sprint:** Backlog / Security Layer Extension
**Author:** BMAD Agent

---

## 1. Summary

This review documents the implementation of JWT/OIDC authentication support added
to the `gmz-cloud-webapp` platform layer. The changes extend the existing
`trusted-bearer` auth mode with a fully async `jwt` mode backed by the `jose`
library, and introduce a Vault-compatible abstract token layer for future
multi-source auth unification.

---

## 2. Scope

| Area | Files Changed |
|------|--------------|
| JWT validation core | `lib/jwt-oidc.ts` (new) |
| Vault token abstraction | `lib/vault-token.ts` (new) |
| Auth mode routing | `lib/auth-core.ts` (extended) |
| Auth context guards | `lib/auth-context.ts` (re-exports, unchanged) |
| Tests | `tests/jwt-oidc.test.ts` (new), test bugfixes |
| Docs | `docs/bmad/REVIEW-014-JWT-OIDC.md` (this file) |

---

## 3. Environment Variables Added

| Variable | Required in JWT mode | Description |
|----------|---------------------|-------------|
| `WEBAPP_AUTH_MODE=jwt` | Yes | Activates JWT validation path |
| `WEBAPP_OIDC_ISSUER` | Yes | OIDC provider base URL (e.g. `https://auth.example.com/realms/myrealm`) |
| `WEBAPP_OIDC_AUDIENCE` | Yes | Expected `aud` claim value (e.g. `gmz-cloud-webapp`) |

Existing variables (`WEBAPP_TRUSTED_TOKENS_JSON`, `WEBAPP_AUTH_MODE=trusted-bearer`) remain fully backward-compatible.

---

## 4. Architecture

### 4.1 Auth Mode Routing (`auth-core.ts`)

`resolveAuthMode()` now supports three modes:

```
dev-header       → sets X-User-Id / X-User-Role headers (development only)
trusted-bearer   → static pre-shared token list (WEBAPP_TRUSTED_TOKENS_JSON)
jwt              → RS256/ES256 JWT validated against remote JWKS endpoint
```

The synchronous `getAuthContextFromRequest()` returns `null` for `jwt` mode
(JWT validation is inherently async). All production guards use the async
`getAuthContextFromRequestAsync()` path which delegates to `lib/jwt-oidc.ts`.

### 4.2 JWT Validation (`lib/jwt-oidc.ts`)

- Uses `jose` v6 `jwtVerify` + `createRemoteJWKSet` (JWKS cached per-issuer at module level)
- Accepts `RS256` and `ES256` signing algorithms
- JWKS URI derived from issuer via OIDC convention: `{issuer}/.well-known/jwks.json`
- Role extracted via claim priority: `roles[]` → `role` → `groups[]` → default `readonly`
- UserId extracted via claim priority: `sub` → `preferred_username` → `email` → `client_id`

### 4.3 Vault-Compatible Token Abstraction (`lib/vault-token.ts`)

Provides an `AbstractToken` type and three factory functions:

| Factory | Source |
|---------|--------|
| `buildVaultToken()` | HashiCorp Vault AppRole / K8s auth |
| `buildOidcToken()` | OIDC JWT bearer |
| `buildTrustedBearerToken()` | Static trusted-bearer entries |

All tokens share a common schema: `raw`, `userId`, `role`, `source`, `expiresAt`, and optional `vaultLeaseId`.

A stub `renewVaultLease()` function is provided for future Vault lease renewal integration.

---

## 5. RBAC Integration

JWT mode is fully integrated with the existing RBAC policy layer:

- `requireProtectedOperation()` calls `getAuthContextFromRequestAsync()` which resolves JWT auth context
- Roles extracted from JWT claims are mapped to `UserRole` (`admin` | `technician` | `readonly`)
- Denied requests follow the same audit event pipeline as other auth modes
- `buildForbiddenResponse()` and `buildUnauthorizedResponse()` are unchanged

---

## 6. Test Coverage

| Test File | Tests | Pass |
|-----------|-------|------|
| `tests/jwt-oidc.test.ts` | 18 | 18 ✅ |
| `tests/auth-context.test.ts` | (included in suite) | ✅ |
| Full suite (`npm run test:rbac`) | 33 | 33 ✅ |

**JWT test coverage includes:**
- `extractRoleFromClaims`: all 3 claim paths + default
- `extractUserIdFromClaims`: all 4 priority fields + fallback
- `validateJwt`: valid RS256, missing token, missing config, wrong audience (RS256), expired token (ES256)
- `resolveJwtAuthConfig`: missing env, complete env
- `resolveAuthMode`: all three modes
- Vault abstraction: `buildVaultToken`, `buildOidcToken` (with/without exp), `buildTrustedBearerToken`, `isAbstractTokenExpired`, `isAbstractTokenExpiringSoon`

**Bug fixed during review:** Two tests (`validateJwt rejects token with wrong audience` and
`validateJwt rejects expired token`) called `generateKeyPair()` without `{ extractable: true }`,
causing a `TypeError: non-extractable CryptoKey cannot be exported as a JWK` at runtime.
Fixed by adding the option.

---

## 7. Security Notes

- JWT validation enforces issuer, audience, expiry, and algorithm constraints (no `alg: none` accepted)
- JWKS is fetched lazily and cached in-process; a process restart clears the cache (acceptable for Next.js)
- No sensitive claims are logged; `validateJwt` returns only `userId`, `role`, and the raw `JWTPayload` (used internally, not serialized to logs)
- The `trusted-bearer` path is unaffected; both modes can coexist in different deployment configs

---

## 8. Known Limitations / Future Work

- OIDC discovery (`/.well-known/openid-configuration`) not used; JWKS URI is derived directly. If an issuer deviates from the standard path, `WEBAPP_JWKS_URI` override env var could be added.
- Vault renewal (`renewVaultLease`) is a stub; full Vault HTTP API wiring is a separate backlog item.
- JWKS cache TTL is `jose`'s default. A configurable `WEBAPP_JWKS_CACHE_TTL_SECONDS` could be added if key rotation latency becomes a concern.
- `getAuthContextFromRequest()` (sync) returns `null` in JWT mode; callers that use the sync path should be audited to ensure they use the async guard helpers.

---

## 9. Acceptance Criteria Checklist

- [x] `WEBAPP_AUTH_MODE=jwt` activates JWT validation path
- [x] `WEBAPP_OIDC_ISSUER` and `WEBAPP_OIDC_AUDIENCE` env vars consumed
- [x] RS256 and ES256 supported
- [x] Roles extracted from `roles`, `role`, `groups` claims
- [x] Integration with existing RBAC guards via `AuthContext`
- [x] Vault-compatible `AbstractToken` abstraction with `buildVaultToken`, `buildOidcToken`, `buildTrustedBearerToken`
- [x] All tests pass (18/18 JWT tests, 33/33 full suite)
- [x] BMAD review artifact written
