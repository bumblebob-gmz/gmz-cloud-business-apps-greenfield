/**
 * Tests for vault-token.ts stubs and the SEC-005 runtime guard.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVaultToken,
  buildOidcToken,
  buildTrustedBearerToken,
  isAbstractTokenExpired,
  isAbstractTokenExpiringSoon,
  renewVaultLease,
} from '../lib/vault-token.ts';
import { assertAuthModeSafe, resolveAuthMode } from '../lib/auth-core.ts';

// ---------------------------------------------------------------------------
// SEC-005: WEBAPP_AUTH_MODE=vault must throw at startup
// ---------------------------------------------------------------------------

test('SEC-005: assertAuthModeSafe throws when WEBAPP_AUTH_MODE=vault', () => {
  const env = { WEBAPP_AUTH_MODE: 'vault' } as NodeJS.ProcessEnv;
  const logger = { warn: () => {}, error: () => {} };

  assert.throws(
    () => assertAuthModeSafe(env, logger),
    (err: unknown) => {
      assert.ok(err instanceof Error, 'Should throw an Error instance');
      assert.ok(
        err.message.includes('Vault auth mode is not yet implemented'),
        `Error message should mention vault not implemented, got: ${err.message}`
      );
      assert.ok(
        err.message.includes('trusted-bearer') || err.message.includes('jwt'),
        `Error message should suggest alternatives, got: ${err.message}`
      );
      return true;
    }
  );
});

test('SEC-005: assertAuthModeSafe throws for vault even in development', () => {
  const env = {
    WEBAPP_AUTH_MODE: 'vault',
    NODE_ENV: 'development',
  } as NodeJS.ProcessEnv;
  const logger = { warn: () => {}, error: () => {} };

  assert.throws(() => assertAuthModeSafe(env, logger), Error);
});

test('SEC-005: assertAuthModeSafe throws for vault in production', () => {
  const env = {
    WEBAPP_AUTH_MODE: 'vault',
    NODE_ENV: 'production',
  } as NodeJS.ProcessEnv;
  const logger = { warn: () => {}, error: () => {} };

  assert.throws(() => assertAuthModeSafe(env, logger), Error);
});

test('SEC-005: resolveAuthMode returns vault when WEBAPP_AUTH_MODE=vault', () => {
  const env = { WEBAPP_AUTH_MODE: 'vault' } as NodeJS.ProcessEnv;
  assert.equal(resolveAuthMode(env), 'vault');
});

test('SEC-005: assertAuthModeSafe does NOT throw for trusted-bearer mode', () => {
  const env = { WEBAPP_AUTH_MODE: 'trusted-bearer' } as NodeJS.ProcessEnv;
  const logger = { warn: () => {}, error: () => {} };
  assert.doesNotThrow(() => assertAuthModeSafe(env, logger));
});

test('SEC-005: assertAuthModeSafe does NOT throw for jwt mode', () => {
  const env = { WEBAPP_AUTH_MODE: 'jwt' } as NodeJS.ProcessEnv;
  const logger = { warn: () => {}, error: () => {} };
  assert.doesNotThrow(() => assertAuthModeSafe(env, logger));
});

// ---------------------------------------------------------------------------
// buildVaultToken stub
// ---------------------------------------------------------------------------

test('buildVaultToken returns correct AbstractToken shape', () => {
  const now = new Date('2025-01-01T00:00:00Z').getTime();
  const token = buildVaultToken({
    clientToken: 'hvs.test-token',
    userId: 'svc-account',
    role: 'technician',
    lease: { leaseId: 'lease-abc', leaseDurationSeconds: 3600, renewable: true },
    now,
  });

  assert.equal(token.raw, 'hvs.test-token');
  assert.equal(token.userId, 'svc-account');
  assert.equal(token.role, 'technician');
  assert.equal(token.source, 'vault');
  assert.equal(token.vaultLeaseId, 'lease-abc');
  assert.equal(token.expiresAt, new Date(now + 3600 * 1000).toISOString());
});

// ---------------------------------------------------------------------------
// buildOidcToken stub
// ---------------------------------------------------------------------------

test('buildOidcToken returns correct AbstractToken shape with exp', () => {
  const expSecs = Math.floor(new Date('2025-06-01T00:00:00Z').getTime() / 1000);
  const token = buildOidcToken({
    raw: 'eyJ.test.jwt',
    userId: 'user-42',
    role: 'admin',
    exp: expSecs,
  });

  assert.equal(token.raw, 'eyJ.test.jwt');
  assert.equal(token.userId, 'user-42');
  assert.equal(token.role, 'admin');
  assert.equal(token.source, 'oidc-jwt');
  assert.equal(token.expiresAt, new Date(expSecs * 1000).toISOString());
});

test('buildOidcToken returns null expiresAt when exp is absent', () => {
  const token = buildOidcToken({ raw: 'raw', userId: 'u1', role: 'readonly' });
  assert.equal(token.expiresAt, null);
});

// ---------------------------------------------------------------------------
// buildTrustedBearerToken
// ---------------------------------------------------------------------------

test('buildTrustedBearerToken returns correct AbstractToken shape', () => {
  const token = buildTrustedBearerToken({ raw: 'tok', userId: 'ops', role: 'admin' });
  assert.equal(token.source, 'trusted-bearer');
  assert.equal(token.expiresAt, null);
});

// ---------------------------------------------------------------------------
// Token health helpers
// ---------------------------------------------------------------------------

test('isAbstractTokenExpired returns false when expiresAt is null', () => {
  const token = buildTrustedBearerToken({ raw: 't', userId: 'u', role: 'readonly' });
  assert.equal(isAbstractTokenExpired(token), false);
});

test('isAbstractTokenExpired returns true when token is expired', () => {
  const token = buildOidcToken({
    raw: 't',
    userId: 'u',
    role: 'readonly',
    exp: Math.floor(new Date('2020-01-01T00:00:00Z').getTime() / 1000),
  });
  assert.equal(isAbstractTokenExpired(token), true);
});

test('isAbstractTokenExpiringSoon returns true within warning window', () => {
  const nowMs = Date.now();
  const exp = Math.floor((nowMs + 60_000) / 1000); // expires in 60 seconds
  const token = buildOidcToken({ raw: 't', userId: 'u', role: 'readonly', exp });
  assert.equal(isAbstractTokenExpiringSoon(token, 300 /* 5 minutes */), true);
  assert.equal(isAbstractTokenExpiringSoon(token, 30 /* 30 seconds */), false);
});

// ---------------------------------------------------------------------------
// renewVaultLease stub
// ---------------------------------------------------------------------------

test('renewVaultLease returns renewed:false for non-vault token', async () => {
  const token = buildTrustedBearerToken({ raw: 't', userId: 'u', role: 'readonly' });
  const result = await renewVaultLease(token, 'https://vault.example.com', 'root-token');
  assert.equal(result.renewed, false);
});

test('renewVaultLease returns renewed:false for vault token (stub not wired)', async () => {
  const now = Date.now();
  const token = buildVaultToken({
    clientToken: 'hvs.stub',
    userId: 'svc',
    role: 'technician',
    lease: { leaseId: 'lease-1', leaseDurationSeconds: 3600, renewable: true },
    now,
  });
  const result = await renewVaultLease(token, 'https://vault.example.com', 'root-token');
  assert.equal(result.renewed, false);
  if (!result.renewed) {
    assert.ok(result.reason.includes('stub') || result.reason.length > 0);
  }
});
