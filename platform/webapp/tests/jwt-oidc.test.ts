/**
 * Tests for JWT/OIDC authentication module (lib/jwt-oidc.ts)
 * and Vault-compatible token abstraction (lib/vault-token.ts).
 *
 * These tests use Node.js built-in test runner (node:test).
 * They do NOT make real network calls – JWT validation is tested via
 * signed tokens produced in-process with SubtleCrypto.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, importJWK } from 'jose';

import {
  extractRoleFromClaims,
  extractUserIdFromClaims,
  validateJwt,
  resolveJwtAuthConfig,
  clearJwksCache,
  type JwtAuthConfig,
} from '../lib/jwt-oidc.ts';

import {
  buildVaultToken,
  buildOidcToken,
  buildTrustedBearerToken,
  isAbstractTokenExpired,
  isAbstractTokenExpiringSoon,
} from '../lib/vault-token.ts';

import { resolveAuthMode } from '../lib/auth-core.ts';

// ---------------------------------------------------------------------------
// Helpers: sign a JWT in-process for testing
// ---------------------------------------------------------------------------

async function signTestJwt(payload: Record<string, unknown>, alg: 'RS256' | 'ES256' = 'RS256'): Promise<{ token: string; jwk: Record<string, unknown> }> {
  const { SignJWT, importJWK: importJWKLocal, generateKeyPair: gpPair } = await import('jose');
  const { privateKey, publicKey } = await gpPair(alg);
  const { exportJWK: exportJWKLocal } = await import('jose');
  const pubJwk = await exportJWKLocal(publicKey);
  // Add kid and alg so the key is identifiable
  pubJwk.kid = 'test-key-1';
  pubJwk.alg = alg;

  const privJwk = await exportJWKLocal(privateKey);
  privJwk.kid = 'test-key-1';
  privJwk.alg = alg;

  const privateKeyObj = await importJWKLocal(privJwk, alg);

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg, kid: 'test-key-1' })
    .sign(privateKeyObj);

  return { token, jwk: pubJwk };
}

// ---------------------------------------------------------------------------
// Spin up a tiny JWKS HTTP server for validateJwt tests
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';

async function withJwksServer(
  jwks: Record<string, unknown>[],
  run: (issuer: string) => Promise<void>
): Promise<void> {
  const body = JSON.stringify({ keys: jwks });

  const server = createServer((req, res) => {
    if (req.url?.includes('.well-known/jwks.json')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const issuer = `http://127.0.0.1:${addr.port}`;

  try {
    clearJwksCache();
    await run(issuer);
  } finally {
    clearJwksCache();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// ---------------------------------------------------------------------------
// Tests: extractRoleFromClaims
// ---------------------------------------------------------------------------

test('extractRoleFromClaims picks from roles array (first valid)', () => {
  assert.equal(extractRoleFromClaims({ roles: ['admin'] }), 'admin');
  assert.equal(extractRoleFromClaims({ roles: ['technician', 'admin'] }), 'technician');
  assert.equal(extractRoleFromClaims({ roles: ['ADMIN'] }), 'admin');
  assert.equal(extractRoleFromClaims({ roles: ['unknown', 'readonly'] }), 'readonly');
});

test('extractRoleFromClaims falls back to role string claim', () => {
  assert.equal(extractRoleFromClaims({ role: 'admin' }), 'admin');
  assert.equal(extractRoleFromClaims({ role: 'TECHNICIAN' }), 'technician');
  assert.equal(extractRoleFromClaims({ role: 'nope' }), 'readonly'); // default
});

test('extractRoleFromClaims falls back to groups array', () => {
  assert.equal(extractRoleFromClaims({ groups: ['/engineering', 'admin'] }), 'admin');
  assert.equal(extractRoleFromClaims({ groups: ['readonly'] }), 'readonly');
});

test('extractRoleFromClaims defaults to readonly when no role claim present', () => {
  assert.equal(extractRoleFromClaims({}), 'readonly');
  assert.equal(extractRoleFromClaims({ roles: ['unknown-role'] }), 'readonly');
});

// ---------------------------------------------------------------------------
// Tests: extractUserIdFromClaims
// ---------------------------------------------------------------------------

test('extractUserIdFromClaims prefers sub > preferred_username > email > client_id', () => {
  assert.equal(extractUserIdFromClaims({ sub: 'u-123' }), 'u-123');
  assert.equal(extractUserIdFromClaims({ preferred_username: 'alice' }), 'alice');
  assert.equal(extractUserIdFromClaims({ email: 'a@b.com' }), 'a@b.com');
  assert.equal(extractUserIdFromClaims({ client_id: 'my-service' }), 'my-service');
  assert.equal(extractUserIdFromClaims({}), 'jwt-user');
});

// ---------------------------------------------------------------------------
// Tests: validateJwt (full integration with JWKS server)
// ---------------------------------------------------------------------------

test('validateJwt succeeds with valid RS256 JWT and correct issuer/audience', async () => {
  const { SignJWT, importJWK: iJWK, generateKeyPair: gKP, exportJWK: eJWK } = await import('jose');
  const { privateKey, publicKey } = await gKP('RS256', { extractable: true });
  const pubJwk = await eJWK(publicKey);
  pubJwk.kid = 'key-rs256';
  pubJwk.alg = 'RS256';
  const privJwk = await eJWK(privateKey);
  privJwk.kid = 'key-rs256';
  privJwk.alg = 'RS256';
  const pk = await iJWK(privJwk, 'RS256');

  await withJwksServer([pubJwk], async (issuer) => {
    const signedToken = await new SignJWT({ sub: 'user-rs256', role: 'admin' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key-rs256' })
      .setIssuer(issuer)
      .setAudience('test-audience')
      .setExpirationTime('1h')
      .sign(pk);

    const result = await validateJwt(signedToken, { issuer, audience: 'test-audience' });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.userId, 'user-rs256');
      assert.equal(result.role, 'admin');
    }
  });
});

test('validateJwt returns error for missing token', async () => {
  const result = await validateJwt('', { issuer: 'https://example.com', audience: 'aud' });
  assert.equal(result.ok, false);
});

test('validateJwt returns error for missing config', async () => {
  const result = await validateJwt('some.token.here', { issuer: '', audience: 'aud' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.reason.length > 0);
});

test('validateJwt rejects token with wrong audience', async () => {
  const { SignJWT, importJWK: iJWK, generateKeyPair: gKP, exportJWK: eJWK } = await import('jose');
  const { privateKey, publicKey } = await gKP('RS256', { extractable: true });
  const pubJwk = await eJWK(publicKey);
  pubJwk.kid = 'k-aud';
  pubJwk.alg = 'RS256';
  const privJwk = await eJWK(privateKey);
  privJwk.kid = 'k-aud';
  privJwk.alg = 'RS256';
  const pk = await iJWK(privJwk, 'RS256');

  await withJwksServer([pubJwk], async (issuer) => {
    const badAudToken = await new SignJWT({ sub: 'u1' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k-aud' })
      .setIssuer(issuer)
      .setAudience('wrong-audience')
      .setExpirationTime('1h')
      .sign(pk);

    const result = await validateJwt(badAudToken, { issuer, audience: 'correct-audience' });
    assert.equal(result.ok, false);
  });
});

test('validateJwt rejects expired token', async () => {
  const { SignJWT, importJWK: iJWK, generateKeyPair: gKP, exportJWK: eJWK } = await import('jose');
  const { privateKey, publicKey } = await gKP('ES256', { extractable: true });
  const pubJwk = await eJWK(publicKey);
  pubJwk.kid = 'k-exp';
  pubJwk.alg = 'ES256';
  const privJwk = await eJWK(privateKey);
  privJwk.kid = 'k-exp';
  privJwk.alg = 'ES256';
  const pk = await iJWK(privJwk, 'ES256');

  await withJwksServer([pubJwk], async (issuer) => {
    const expiredToken = await new SignJWT({ sub: 'u-expired' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k-exp' })
      .setIssuer(issuer)
      .setAudience('aud')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // expired 1h ago
      .sign(pk);

    const result = await validateJwt(expiredToken, { issuer, audience: 'aud' });
    assert.equal(result.ok, false);
  });
});

// ---------------------------------------------------------------------------
// Tests: resolveJwtAuthConfig
// ---------------------------------------------------------------------------

test('resolveJwtAuthConfig returns null when env vars missing', () => {
  assert.equal(resolveJwtAuthConfig({} as NodeJS.ProcessEnv), null);
  assert.equal(resolveJwtAuthConfig({ WEBAPP_OIDC_ISSUER: 'https://x.com' } as NodeJS.ProcessEnv), null);
  assert.equal(resolveJwtAuthConfig({ WEBAPP_OIDC_AUDIENCE: 'aud' } as NodeJS.ProcessEnv), null);
});

test('resolveJwtAuthConfig returns config when both env vars set', () => {
  const config = resolveJwtAuthConfig({
    WEBAPP_OIDC_ISSUER: 'https://auth.example.com',
    WEBAPP_OIDC_AUDIENCE: 'my-app',
  } as NodeJS.ProcessEnv);
  assert.deepEqual(config, { issuer: 'https://auth.example.com', audience: 'my-app' });
});

// ---------------------------------------------------------------------------
// Tests: resolveAuthMode with jwt
// ---------------------------------------------------------------------------

test('resolveAuthMode supports jwt mode', () => {
  assert.equal(resolveAuthMode({ WEBAPP_AUTH_MODE: 'jwt' } as NodeJS.ProcessEnv), 'jwt');
  assert.equal(resolveAuthMode({ WEBAPP_AUTH_MODE: 'trusted-bearer' } as NodeJS.ProcessEnv), 'trusted-bearer');
  assert.equal(resolveAuthMode({} as NodeJS.ProcessEnv), 'dev-header');
});

// ---------------------------------------------------------------------------
// Tests: Vault-compatible token abstraction
// ---------------------------------------------------------------------------

test('buildVaultToken creates abstract token with correct expiry', () => {
  const now = Date.parse('2026-01-01T00:00:00.000Z');
  const token = buildVaultToken({
    clientToken: 'hvs.abc123',
    userId: 'vault-user',
    role: 'technician',
    lease: { leaseId: 'auth/token/create/1234', leaseDurationSeconds: 3600, renewable: true },
    now,
  });

  assert.equal(token.raw, 'hvs.abc123');
  assert.equal(token.userId, 'vault-user');
  assert.equal(token.role, 'technician');
  assert.equal(token.source, 'vault');
  assert.equal(token.vaultLeaseId, 'auth/token/create/1234');
  assert.equal(token.expiresAt, '2026-01-01T01:00:00.000Z');
});

test('buildOidcToken creates abstract token from JWT claims', () => {
  const exp = Math.floor(Date.parse('2026-06-01T00:00:00.000Z') / 1000);
  const token = buildOidcToken({ raw: 'eyJ.jwt.token', userId: 'alice', role: 'admin', exp });

  assert.equal(token.source, 'oidc-jwt');
  assert.equal(token.role, 'admin');
  assert.equal(token.expiresAt, '2026-06-01T00:00:00.000Z');
});

test('buildOidcToken handles missing exp gracefully', () => {
  const token = buildOidcToken({ raw: 'tok', userId: 'svc', role: 'readonly' });
  assert.equal(token.expiresAt, null);
});

test('buildTrustedBearerToken wraps static token correctly', () => {
  const token = buildTrustedBearerToken({
    raw: 'static-token-xyz',
    userId: 'ops-user',
    role: 'admin',
    expiresAt: '2027-01-01T00:00:00.000Z',
  });
  assert.equal(token.source, 'trusted-bearer');
  assert.equal(token.expiresAt, '2027-01-01T00:00:00.000Z');
});

test('isAbstractTokenExpired and isAbstractTokenExpiringSoon work correctly', () => {
  const now = Date.parse('2026-01-01T12:00:00.000Z');

  const expired = buildOidcToken({ raw: 't', userId: 'u', role: 'readonly', exp: Math.floor(Date.parse('2026-01-01T10:00:00.000Z') / 1000) });
  assert.equal(isAbstractTokenExpired(expired, now), true);
  assert.equal(isAbstractTokenExpiringSoon(expired, 3600, now), false);

  const soonExpiring = buildOidcToken({ raw: 't', userId: 'u', role: 'readonly', exp: Math.floor(Date.parse('2026-01-01T12:30:00.000Z') / 1000) });
  assert.equal(isAbstractTokenExpired(soonExpiring, now), false);
  assert.equal(isAbstractTokenExpiringSoon(soonExpiring, 3600, now), true);

  const farFuture = buildOidcToken({ raw: 't', userId: 'u', role: 'readonly', exp: Math.floor(Date.parse('2027-01-01T00:00:00.000Z') / 1000) });
  assert.equal(isAbstractTokenExpired(farFuture, now), false);
  assert.equal(isAbstractTokenExpiringSoon(farFuture, 3600, now), false);

  const noExpiry = buildOidcToken({ raw: 't', userId: 'u', role: 'readonly' });
  assert.equal(isAbstractTokenExpired(noExpiry, now), false);
  assert.equal(isAbstractTokenExpiringSoon(noExpiry, 3600, now), false);
});
