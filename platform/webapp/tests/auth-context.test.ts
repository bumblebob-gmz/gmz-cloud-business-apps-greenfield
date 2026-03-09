import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrustedTokensJson, resolveAuthMode, getAuthContextFromRequest } from '../lib/auth-core.ts';

function withEnv(env: Partial<NodeJS.ProcessEnv>, run: () => void) {
  const previous = { ...process.env };
  Object.assign(process.env, env);
  try {
    run();
  } finally {
    process.env = previous;
  }
}

test('parseTrustedTokensJson parses valid entries and ignores invalid ones', () => {
  const tokens = parseTrustedTokensJson(
    JSON.stringify([
      { token: 't-admin', userId: 'u-admin', role: 'admin' },
      { token: ' ', userId: 'u-x', role: 'technician' },
      { token: 't-2', userId: 'u-2', role: 'unknown' }
    ])
  );

  assert.deepEqual(tokens, [
    { token: 't-admin', userId: 'u-admin', role: 'admin' },
    { token: 't-2', userId: 'u-2', role: 'technician' }
  ]);
  assert.deepEqual(parseTrustedTokensJson('not json'), []);
});

test('resolveAuthMode defaults to dev-header and supports trusted-bearer', () => {
  assert.equal(resolveAuthMode({} as NodeJS.ProcessEnv), 'dev-header');
  assert.equal(resolveAuthMode({ WEBAPP_AUTH_MODE: 'trusted-bearer' } as NodeJS.ProcessEnv), 'trusted-bearer');
});

test('trusted-bearer mode rejects missing/invalid bearer token auth context', () => {
  withEnv(
    {
      WEBAPP_AUTH_MODE: 'trusted-bearer',
      WEBAPP_TRUSTED_TOKENS_JSON: JSON.stringify([{ token: 'valid-token', userId: 'admin-1', role: 'admin' }])
    },
    () => {
      const missingTokenRequest = new Request('http://localhost/api/jobs');
      assert.equal(getAuthContextFromRequest(missingTokenRequest), null);

      const invalidTokenRequest = new Request('http://localhost/api/jobs', {
        headers: { Authorization: 'Bearer no-match' }
      });
      assert.equal(getAuthContextFromRequest(invalidTokenRequest), null);
    }
  );
});
