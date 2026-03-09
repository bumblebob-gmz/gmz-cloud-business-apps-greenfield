import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  parseTrustedTokensJson,
  resolveAuthMode,
  assertAuthModeSafe,
  getAuthContextFromRequest,
  getTrustedTokenExpiryWarningDays,
  getTrustedTokenHealthSummary
} from '../lib/auth-core.ts';
import { requireProtectedOperation } from '../lib/auth-context.ts';

const AUDIT_PATH = path.join(process.cwd(), '.data', 'audit-events.jsonl');

function withEnv(env: Partial<NodeJS.ProcessEnv>, run: () => void | Promise<void>) {
  const previous = process.env;
  process.env = { ...previous, ...env };
  return Promise.resolve()
    .then(() => run())
    .finally(() => {
      process.env = previous;
    });
}

async function resetAuditLog() {
  await mkdir(path.dirname(AUDIT_PATH), { recursive: true });
  await rm(AUDIT_PATH, { force: true });
}

test('parseTrustedTokensJson parses valid entries and ignores invalid ones', () => {
  const tokens = parseTrustedTokensJson(
    JSON.stringify([
      { token: 't-admin', userId: 'u-admin', role: 'admin', tokenId: 'ops-admin' },
      { token: ' ', userId: 'u-x', role: 'technician' },
      { token: 't-2', userId: 'u-2', role: 'unknown' },
      { token: 't-3', userId: 'u-3', role: 'readonly', expiresAt: 'not-a-date' }
    ])
  );

  assert.deepEqual(tokens, [
    { token: 't-admin', userId: 'u-admin', role: 'admin', tokenId: 'ops-admin' },
    { token: 't-2', userId: 'u-2', role: 'technician' }
  ]);
  assert.deepEqual(parseTrustedTokensJson('not json'), []);
});

test('resolveAuthMode defaults to trusted-bearer (fail-safe) when no valid mode is set', () => {
  // Empty env → fail-safe default
  assert.equal(resolveAuthMode({} as NodeJS.ProcessEnv), 'trusted-bearer');
  // Explicit trusted-bearer
  assert.equal(resolveAuthMode({ WEBAPP_AUTH_MODE: 'trusted-bearer' } as NodeJS.ProcessEnv), 'trusted-bearer');
  // jwt mode
  assert.equal(resolveAuthMode({ WEBAPP_AUTH_MODE: 'jwt' } as NodeJS.ProcessEnv), 'jwt');
});

test('resolveAuthMode allows dev-header only when NODE_ENV=development AND WEBAPP_ENABLE_DEV_AUTH=true', () => {
  // dev-header without the required flags → falls back to fail-safe
  assert.equal(
    resolveAuthMode({ WEBAPP_AUTH_MODE: 'dev-header' } as NodeJS.ProcessEnv),
    'trusted-bearer'
  );
  assert.equal(
    resolveAuthMode({ WEBAPP_AUTH_MODE: 'dev-header', NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    'trusted-bearer'
  );
  assert.equal(
    resolveAuthMode({ WEBAPP_AUTH_MODE: 'dev-header', NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    'trusted-bearer'
  );
  // Both conditions met → dev-header allowed
  assert.equal(
    resolveAuthMode({ WEBAPP_AUTH_MODE: 'dev-header', NODE_ENV: 'development', WEBAPP_ENABLE_DEV_AUTH: 'true' } as NodeJS.ProcessEnv),
    'dev-header'
  );
});

test('assertAuthModeSafe throws in production when dev-header is resolved', () => {
  // Resolves to dev-header in dev → warns but does not throw
  const warnMessages: string[] = [];
  const logger = { warn: (m: string) => warnMessages.push(m), error: (_m: string) => {} };
  assertAuthModeSafe(
    { WEBAPP_AUTH_MODE: 'dev-header', NODE_ENV: 'development', WEBAPP_ENABLE_DEV_AUTH: 'true' } as NodeJS.ProcessEnv,
    logger
  );
  assert.equal(warnMessages.length, 1);
  assert.ok(warnMessages[0]?.includes('SEC-001'));

  // Resolves to trusted-bearer (production) → no throw, no warn
  const logger2 = { warn: (_m: string) => { throw new Error('unexpected warn'); }, error: (_m: string) => { throw new Error('unexpected error'); } };
  assertAuthModeSafe({ WEBAPP_AUTH_MODE: 'trusted-bearer', NODE_ENV: 'production' } as NodeJS.ProcessEnv, logger2);

  // dev-header somehow forced in production → throws
  const errorMessages: string[] = [];
  const logger3 = { warn: (_m: string) => {}, error: (m: string) => errorMessages.push(m) };
  // Note: resolveAuthMode will downgrade dev-header in production to trusted-bearer,
  // but the explicit env var check in assertAuthModeSafe still catches the intent.
  assert.throws(
    () => assertAuthModeSafe(
      { WEBAPP_AUTH_MODE: 'dev-header', NODE_ENV: 'production' } as NodeJS.ProcessEnv,
      logger3
    ),
    /SEC-001/
  );
  assert.ok(errorMessages.length >= 1);
});

test('trusted-bearer mode rejects missing/invalid/expired bearer token auth context', async () => {
  await withEnv(
    {
      WEBAPP_AUTH_MODE: 'trusted-bearer',
      WEBAPP_TRUSTED_TOKENS_JSON: JSON.stringify([
        { token: 'valid-token', userId: 'admin-1', role: 'admin' },
        { token: 'expired-token', userId: 'admin-2', role: 'admin', expiresAt: '2000-01-01T00:00:00.000Z' }
      ])
    },
    () => {
      const missingTokenRequest = new Request('http://localhost/api/jobs');
      assert.equal(getAuthContextFromRequest(missingTokenRequest), null);

      const invalidTokenRequest = new Request('http://localhost/api/jobs', {
        headers: { Authorization: 'Bearer no-match' }
      });
      assert.equal(getAuthContextFromRequest(invalidTokenRequest), null);

      const expiredTokenRequest = new Request('http://localhost/api/jobs', {
        headers: { Authorization: 'Bearer expired-token' }
      });
      assert.equal(getAuthContextFromRequest(expiredTokenRequest), null);
    }
  );
});

test('trusted token health summary returns safe counts with expiringSoon signal', () => {
  const summary = getTrustedTokenHealthSummary(
    JSON.stringify([
      { token: 'a', userId: 'u1', role: 'readonly' },
      { token: 'b', userId: 'u2', role: 'admin', expiresAt: '2026-01-10T00:00:00.000Z' },
      { token: 'c', userId: 'u3', role: 'admin', expiresAt: '2000-01-01T00:00:00.000Z' }
    ]),
    { now: Date.parse('2026-01-01T00:00:00.000Z'), warningDays: 14 }
  );

  assert.deepEqual(summary, { total: 3, expired: 1, active: 2, expiringSoon: 1, warningDays: 14 });
});

test('trusted token expiry warning days defaults to 14 and accepts valid env override', () => {
  assert.equal(getTrustedTokenExpiryWarningDays({} as NodeJS.ProcessEnv), 14);
  assert.equal(getTrustedTokenExpiryWarningDays({ WEBAPP_TRUSTED_TOKEN_EXPIRY_WARNING_DAYS: '7' } as NodeJS.ProcessEnv), 7);
  assert.equal(getTrustedTokenExpiryWarningDays({ WEBAPP_TRUSTED_TOKEN_EXPIRY_WARNING_DAYS: '-1' } as NodeJS.ProcessEnv), 14);
});

test('requireProtectedOperation emits denied audit payload for 401 and 403 decisions', async () => {
  await resetAuditLog();

  await withEnv(
    {
      WEBAPP_AUTH_MODE: 'trusted-bearer',
      WEBAPP_TRUSTED_TOKENS_JSON: JSON.stringify([{ token: 'readonly-token', userId: 'r-1', role: 'readonly' }])
    },
    async () => {
      const unauthorized = await requireProtectedOperation(new Request('http://localhost/api/tenants'), 'GET /api/tenants');
      assert.equal(unauthorized.ok, false);
      assert.equal(unauthorized.response.status, 401);

      const forbidden = await requireProtectedOperation(
        new Request('http://localhost/api/tenants', { headers: { Authorization: 'Bearer readonly-token' } }),
        'POST /api/tenants'
      );
      assert.equal(forbidden.ok, false);
      assert.equal(forbidden.response.status, 403);
    }
  );

  const lines = (await readFile(AUDIT_PATH, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  const denied = lines.filter((item) => item?.action === 'auth.guard.denied');
  assert.equal(denied.length, 2);

  assert.equal(denied[0].outcome, 'denied');
  assert.equal(denied[0].source.operation, 'GET /api/tenants');
  assert.deepEqual(denied[0].details, {
    operation: 'GET /api/tenants',
    requiredRole: 'readonly',
    effectiveRole: null,
    authMode: 'trusted-bearer'
  });

  assert.equal(denied[1].source.operation, 'POST /api/tenants');
  assert.equal(denied[1].details.requiredRole, 'technician');
  assert.equal(denied[1].details.effectiveRole, 'readonly');
});
