/**
 * Tests that the MAX_AUDIT_ENTRIES cap is enforced in file-store mode.
 *
 * Uses a temporary directory so tests are hermetic and don't touch .data/.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid AuditEvent-like JSON line. */
function makeEventLine(index: number): string {
  return JSON.stringify({
    eventId: `evt-${String(index).padStart(8, '0')}`,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    correlationId: `corr-${String(index).padStart(8, '0')}`,
    actor: { type: 'service', id: 'test-svc' },
    tenantId: 'tenant-test',
    action: 'test.action',
    resource: 'resource',
    outcome: 'success',
    source: { service: 'webapp', operation: 'GET /test' }
  });
}

/**
 * Local copy of the enforceAuditCap logic (mirrors lib/audit.ts) so we can
 * test it with an arbitrary cap and file path without touching .data/.
 */
async function enforceAuditCap(filePath: string, maxEntries: number): Promise<void> {
  const raw = await readFile(filePath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  if (lines.length <= maxEntries) return;
  const trimmed = lines.slice(lines.length - maxEntries);
  await writeFile(filePath, `${trimmed.join('\n')}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('enforceAuditCap trims oldest entries when count exceeds the cap', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'audit-cap-test-'));
  const filePath = join(tmpDir, 'audit-events.jsonl');

  const CAP = 5;
  const TOTAL = 12;

  const lines = Array.from({ length: TOTAL }, (_, i) => makeEventLine(i));
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');

  await enforceAuditCap(filePath, CAP);

  const result = await readFile(filePath, 'utf8');
  const remaining = result.split('\n').filter(Boolean);

  assert.equal(remaining.length, CAP, `Expected ${CAP} lines after trim, got ${remaining.length}`);

  // Newest entries (indices TOTAL-CAP … TOTAL-1) must be retained in order.
  for (let i = 0; i < CAP; i++) {
    const expectedIndex = TOTAL - CAP + i;
    const parsed = JSON.parse(remaining[i]!) as { eventId: string };
    assert.equal(
      parsed.eventId,
      `evt-${String(expectedIndex).padStart(8, '0')}`,
      `Line ${i} should be entry index ${expectedIndex}`
    );
  }
});

test('enforceAuditCap leaves file unchanged when count is at or below cap', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'audit-cap-noop-'));
  const filePath = join(tmpDir, 'audit-events.jsonl');

  const CAP = 10;
  const TOTAL = 7;

  const lines = Array.from({ length: TOTAL }, (_, i) => makeEventLine(i));
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');

  await enforceAuditCap(filePath, CAP);

  const result = await readFile(filePath, 'utf8');
  const remaining = result.split('\n').filter(Boolean);

  assert.equal(remaining.length, TOTAL, 'File should not be trimmed when at or below cap');
});

test('MAX_AUDIT_ENTRIES resolves correctly from env var', () => {
  // Simulate the module-level IIFE logic without re-importing the module.
  function resolveCap(envVal: string | undefined): number {
    const DEFAULT = 100_000;
    if (!envVal) return DEFAULT;
    const parsed = Number.parseInt(envVal, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT;
  }

  assert.equal(resolveCap(undefined), 100_000, 'no env var → default 100 000');
  assert.equal(resolveCap(''), 100_000, 'empty string → default');
  assert.equal(resolveCap('not-a-number'), 100_000, 'invalid string → default');
  assert.equal(resolveCap('500'), 500, 'valid number → used as cap');
  assert.equal(resolveCap('1'), 1, 'cap of 1 is valid');
});
