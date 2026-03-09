/**
 * Vault-compatible token abstraction layer.
 *
 * Provides a unified interface for token sources so that the rest of the
 * application does not need to know whether a token was issued by:
 *   - HashiCorp Vault (via Vault Agent / token file / AppRole)
 *   - An OIDC provider (e.g. Keycloak, Auth0, Azure AD)
 *   - A static trusted-bearer token (dev / internal ops)
 *
 * This abstraction is intentionally thin: it normalises metadata into a
 * common shape and defers actual validation to the appropriate subsystem
 * (jwt-oidc.ts for JWTs, auth-core.ts for trusted-bearer, Vault SDK for
 * Vault tokens).
 *
 * Production integrations (Vault AppRole / Kubernetes auth) are represented
 * as stubs here – full Vault SDK wiring is out of scope for this slice.
 */

import type { UserRole } from './auth-core.ts';

// --------------------------------------------------------------------------
// Token source types
// --------------------------------------------------------------------------

export type TokenSource = 'trusted-bearer' | 'oidc-jwt' | 'vault';

export type AbstractToken = {
  /** Raw token value as presented in the Authorization header or obtained from Vault Agent */
  raw: string;
  /** Logical identity of the token holder */
  userId: string;
  /** RBAC role resolved from the token */
  role: UserRole;
  /** Origin of the token */
  source: TokenSource;
  /** ISO-8601 expiry or null if unknown / non-expiring */
  expiresAt: string | null;
  /** Vault-specific: lease ID for renewal, if applicable */
  vaultLeaseId?: string;
};

// --------------------------------------------------------------------------
// Vault-compatible lease metadata
// --------------------------------------------------------------------------

export type VaultLeaseInfo = {
  leaseId: string;
  leaseDurationSeconds: number;
  renewable: boolean;
};

/**
 * Wraps a Vault Kubernetes/AppRole auth response into an AbstractToken.
 *
 * **DESIGN STUB — NOT WIRED INTO PRODUCTION.**
 * This function models the intended interface for a future Vault integration
 * (Kubernetes auth / AppRole login) but is not called by any production code path.
 * Full Vault SDK wiring is out of scope for the current slice.
 * Do NOT enable WEBAPP_AUTH_MODE=vault; assertAuthModeSafe() will throw at startup.
 *
 * In a real integration this would be called after a successful
 * `POST /v1/auth/kubernetes/login` or `POST /v1/auth/approle/login`
 * request to the Vault API.
 *
 * @param params.clientToken - Raw Vault client token from the login response
 * @param params.userId      - Logical identity to associate with the token
 * @param params.role        - RBAC role resolved from Vault policies
 * @param params.lease       - Vault lease metadata (ID, duration, renewability)
 * @param params.now         - Optional epoch ms override for testing
 */
export function buildVaultToken(params: {
  clientToken: string;
  userId: string;
  role: UserRole;
  lease: VaultLeaseInfo;
  now?: number;
}): AbstractToken {
  const nowMs = params.now ?? Date.now();
  const expiresAt = new Date(nowMs + params.lease.leaseDurationSeconds * 1000).toISOString();
  return {
    raw: params.clientToken,
    userId: params.userId,
    role: params.role,
    source: 'vault',
    expiresAt,
    vaultLeaseId: params.lease.leaseId,
  };
}

/**
 * Wraps an OIDC JWT result into an AbstractToken.
 *
 * **DESIGN STUB — NOT WIRED INTO PRODUCTION.**
 * This function shapes the interface for wrapping OIDC/JWT tokens into the
 * common AbstractToken abstraction. The actual JWT validation and claims
 * extraction are handled by `jwt-oidc.ts`; this builder is a helper stub
 * for unit tests and future integration plumbing.
 *
 * @param params.raw    - Raw JWT string from the Authorization header
 * @param params.userId - Logical user ID from the `sub` or custom claim
 * @param params.role   - RBAC role resolved from the JWT claims
 * @param params.exp    - Optional JWT `exp` claim (seconds since epoch)
 */
export function buildOidcToken(params: {
  raw: string;
  userId: string;
  role: UserRole;
  exp?: number; // JWT `exp` claim (seconds since epoch)
}): AbstractToken {
  const expiresAt = typeof params.exp === 'number'
    ? new Date(params.exp * 1000).toISOString()
    : null;

  return {
    raw: params.raw,
    userId: params.userId,
    role: params.role,
    source: 'oidc-jwt',
    expiresAt,
  };
}

/**
 * Wraps a static trusted-bearer entry into an AbstractToken.
 */
export function buildTrustedBearerToken(params: {
  raw: string;
  userId: string;
  role: UserRole;
  expiresAt?: string;
}): AbstractToken {
  return {
    raw: params.raw,
    userId: params.userId,
    role: params.role,
    source: 'trusted-bearer',
    expiresAt: params.expiresAt ?? null,
  };
}

// --------------------------------------------------------------------------
// Token health helpers
// --------------------------------------------------------------------------

export function isAbstractTokenExpired(token: AbstractToken, now = Date.now()): boolean {
  if (!token.expiresAt) return false;
  return Date.parse(token.expiresAt) <= now;
}

export function isAbstractTokenExpiringSoon(token: AbstractToken, warningSeconds: number, now = Date.now()): boolean {
  if (!token.expiresAt) return false;
  const expiresAtMs = Date.parse(token.expiresAt);
  if (expiresAtMs <= now) return false;
  return expiresAtMs <= now + warningSeconds * 1000;
}

// --------------------------------------------------------------------------
// Vault renewal stub
// --------------------------------------------------------------------------

export type VaultRenewResult = { renewed: true; newExpiresAt: string } | { renewed: false; reason: string };

/**
 * Stub: renews a Vault token lease via `PUT /v1/sys/leases/renew`.
 *
 * **DESIGN STUB — NOT WIRED INTO PRODUCTION.**
 * This function is a placeholder for the Vault lease renewal flow. It always
 * returns `{ renewed: false }` and performs no network calls. A production
 * implementation would call the Vault HTTP API using the VAULT_ADDR and
 * VAULT_TOKEN environment variables (or Vault Agent socket).
 * Do NOT enable WEBAPP_AUTH_MODE=vault; assertAuthModeSafe() will throw at startup.
 *
 * @param token      - The abstract token with a Vault lease ID to renew
 * @param _vaultAddr  - Vault server address (e.g. https://vault.example.com) — unused in stub
 * @param _vaultToken - Vault management token with `sys/leases/renew` capability — unused in stub
 */
export async function renewVaultLease(
  token: AbstractToken,
  _vaultAddr: string,
  _vaultToken: string
): Promise<VaultRenewResult> {
  if (token.source !== 'vault' || !token.vaultLeaseId) {
    return { renewed: false, reason: 'Not a Vault token or missing lease ID.' };
  }

  // Stub — real implementation:
  // const res = await fetch(`${vaultAddr}/v1/sys/leases/renew`, {
  //   method: 'PUT',
  //   headers: { 'X-Vault-Token': vaultToken, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ lease_id: token.vaultLeaseId }),
  // });
  // const data = await res.json();
  // return { renewed: true, newExpiresAt: new Date(Date.now() + data.lease_duration * 1000).toISOString() };

  return { renewed: false, reason: 'Vault renewal not yet wired (stub).' };
}
