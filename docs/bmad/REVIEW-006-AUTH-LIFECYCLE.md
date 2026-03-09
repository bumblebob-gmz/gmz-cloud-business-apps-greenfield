# REVIEW-006 — Auth Lifecycle Hardening

## Implemented improvements

1. **Trusted bearer token lifecycle hardening**
   - `WEBAPP_TRUSTED_TOKENS_JSON` entries now support optional:
     - `tokenId`
     - `expiresAt` (ISO timestamp)
   - Tokens with expired `expiresAt` are rejected in `trusted-bearer` mode.
   - Backward compatibility preserved: entries without `expiresAt` remain valid.
   - Added safe helper `getTrustedTokenHealthSummary(...)` returning only counts:
     - `total`
     - `expired`
     - `active`

2. **Reusable deny-auditing guard for protected endpoints**
   - Added `requireProtectedOperation(...)` and migrated protected API routes to it.
   - On `401` and `403` decisions, emits `auth.guard.denied` audit event with:
     - `operation`
     - `requiredRole`
     - `effectiveRole` (or `null`)
     - `authMode`

3. **New admin auth posture endpoint**
   - Added `GET /api/auth/health` (admin-only) with safe response:
     - `authMode`
     - `trustedTokens` (`total`, `expired`, `active`)
     - `devRoleSwitchEnabled`
   - No secrets or raw token values are returned.

4. **Docs + tests updated**
   - Updated root and webapp README with trusted token fields, expiry behavior, denied-audit behavior, and auth health endpoint.
   - Extended tests for:
     - trusted token expiry behavior
     - token health summary counts
     - deny-audit decision path and payload fields

## Remaining risks / next hardening steps

- Trusted token matching is still static-env based; consider secret manager integration and forced rotation policy.
- No cryptographic token signature validation (intentional for current trusted-token model); JWT/JWK verification can be introduced later.
- `auth.guard.denied` uses generic actor id for unauthorized requests; optional future enrichment with source IP/user-agent could improve incident triage.
- Consider strict startup validation / warning output for malformed trusted token entries to improve operability.
