/**
 * SEC-009: Rollback hook command hardening tests
 *
 * Covers:
 *  - validateRollbackHookCmd allowlist validation
 *  - checkRollbackHookConfig startup warning behaviour
 *  - runRollbackHook rejects unsafe commands before execution
 *  - runRollbackHook accepts safe absolute-path commands and uses execFile (no shell)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRollbackHookCmd, checkRollbackHookConfig, runRollbackHook } from '../lib/provisioning.ts';

// ---------------------------------------------------------------------------
// validateRollbackHookCmd – allowlist unit tests
// ---------------------------------------------------------------------------

test('SEC-009: valid absolute path to .sh script is accepted', () => {
  const result = validateRollbackHookCmd('/usr/local/bin/rollback.sh');
  assert.equal(result.valid, true);
});

test('SEC-009: valid absolute path without extension is accepted', () => {
  const result = validateRollbackHookCmd('/opt/scripts/rollback');
  assert.equal(result.valid, true);
});

test('SEC-009: valid command with safe arguments is accepted', () => {
  const result = validateRollbackHookCmd('/opt/scripts/rollback.sh tenant-123 eu-central-1');
  assert.equal(result.valid, true);
});

test('SEC-009: path with hyphens, underscores, and dots in segments is accepted', () => {
  const result = validateRollbackHookCmd('/opt/my-app_scripts/rollback_v2.0.sh');
  assert.equal(result.valid, true);
});

test('SEC-009: empty string is rejected', () => {
  const result = validateRollbackHookCmd('');
  assert.equal(result.valid, false);
  assert.ok(result.reason);
});

test('SEC-009: whitespace-only string is rejected', () => {
  const result = validateRollbackHookCmd('   ');
  assert.equal(result.valid, false);
});

test('SEC-009: relative path is rejected', () => {
  const result = validateRollbackHookCmd('./rollback.sh');
  assert.equal(result.valid, false);
  assert.ok(result.reason?.includes('absolute'));
});

test('SEC-009: command with pipe is rejected', () => {
  const result = validateRollbackHookCmd('/bin/sh rollback.sh | tee /tmp/out');
  assert.equal(result.valid, false);
  assert.ok(result.reason);
});

test('SEC-009: command with semicolon is rejected', () => {
  const result = validateRollbackHookCmd('/usr/local/bin/rollback.sh; rm -rf /');
  assert.equal(result.valid, false);
});

test('SEC-009: command with subshell $() is rejected', () => {
  const result = validateRollbackHookCmd('/usr/local/bin/rollback.sh $(whoami)');
  assert.equal(result.valid, false);
});

test('SEC-009: command with backtick subshell is rejected', () => {
  const result = validateRollbackHookCmd('/usr/local/bin/rollback.sh `id`');
  assert.equal(result.valid, false);
});

test('SEC-009: command with ampersand is rejected', () => {
  const result = validateRollbackHookCmd('/usr/local/bin/rollback.sh & /bin/sh');
  assert.equal(result.valid, false);
});

test('SEC-009: command with redirect > is rejected', () => {
  const result = validateRollbackHookCmd('/usr/local/bin/rollback.sh > /etc/passwd');
  assert.equal(result.valid, false);
});

test('SEC-009: command with newline injection is rejected', () => {
  const result = validateRollbackHookCmd('/usr/local/bin/rollback.sh\nrm -rf /');
  assert.equal(result.valid, false);
});

test('SEC-009: command with spaces-only arg is still valid structure', () => {
  // This exercises the trimmed whitespace branch
  const result = validateRollbackHookCmd('  /usr/local/bin/rollback.sh  ');
  // validateRollbackHookCmd receives the raw string; trim happens inside
  assert.equal(result.valid, true);
});

// ---------------------------------------------------------------------------
// checkRollbackHookConfig – startup warning behaviour
// ---------------------------------------------------------------------------

test('SEC-009: checkRollbackHookConfig does not throw when env var is unset', () => {
  const saved = process.env.PROVISION_ROLLBACK_HOOK_CMD;
  delete process.env.PROVISION_ROLLBACK_HOOK_CMD;
  try {
    assert.doesNotThrow(() => checkRollbackHookConfig());
  } finally {
    if (saved !== undefined) process.env.PROVISION_ROLLBACK_HOOK_CMD = saved;
  }
});

test('SEC-009: checkRollbackHookConfig does not throw for a safe value', () => {
  const saved = process.env.PROVISION_ROLLBACK_HOOK_CMD;
  process.env.PROVISION_ROLLBACK_HOOK_CMD = '/opt/scripts/rollback.sh';
  try {
    assert.doesNotThrow(() => checkRollbackHookConfig());
  } finally {
    if (saved !== undefined) process.env.PROVISION_ROLLBACK_HOOK_CMD = saved;
    else delete process.env.PROVISION_ROLLBACK_HOOK_CMD;
  }
});

test('SEC-009: checkRollbackHookConfig emits console.warn for unsafe value', () => {
  const saved = process.env.PROVISION_ROLLBACK_HOOK_CMD;
  process.env.PROVISION_ROLLBACK_HOOK_CMD = '/bin/sh -c "rm -rf /"';

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(' '));

  try {
    checkRollbackHookConfig();
    assert.ok(warnings.length > 0, 'Expected a console.warn for unsafe hook cmd');
    assert.ok(warnings[0].includes('SEC-009'), 'Warning should reference SEC-009');
    assert.ok(warnings[0].includes('unsafe'), 'Warning should say "unsafe"');
  } finally {
    console.warn = originalWarn;
    if (saved !== undefined) process.env.PROVISION_ROLLBACK_HOOK_CMD = saved;
    else delete process.env.PROVISION_ROLLBACK_HOOK_CMD;
  }
});

// ---------------------------------------------------------------------------
// runRollbackHook – rejects unsafe commands at runtime (no execution)
// ---------------------------------------------------------------------------

test('SEC-009: runRollbackHook rejects a command with shell injection', async () => {
  const result = await runRollbackHook('/usr/local/bin/rollback.sh; rm -rf /');
  assert.equal(result.ok, false);
  assert.ok(result.snippet.includes('SEC-009'), 'Rejection snippet should mention SEC-009');
  assert.equal(result.exitCode, 1);
});

test('SEC-009: runRollbackHook rejects relative path', async () => {
  const result = await runRollbackHook('./rollback.sh');
  assert.equal(result.ok, false);
  assert.ok(result.snippet.includes('SEC-009'));
});

test('SEC-009: runRollbackHook rejects empty command', async () => {
  const result = await runRollbackHook('');
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// runRollbackHook – executes a safe real command without a shell
// ---------------------------------------------------------------------------

test('SEC-009: runRollbackHook executes /bin/echo as a safe absolute path command', async () => {
  const result = await runRollbackHook('/bin/echo hello-rollback');
  assert.equal(result.ok, true, `Expected ok=true but got: ${result.snippet}`);
  assert.ok(result.snippet.includes('hello-rollback'), 'stdout should contain the echoed string');
  assert.equal(result.exitCode, 0);
  assert.ok(result.at, 'Result must have a timestamp');
});

test('SEC-009: runRollbackHook reports failure when command exits non-zero', async () => {
  // /bin/false always exits 1
  const result = await runRollbackHook('/bin/false');
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
});
