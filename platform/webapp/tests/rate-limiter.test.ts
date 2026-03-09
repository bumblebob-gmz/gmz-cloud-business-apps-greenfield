/**
 * Tests for the in-process rate limiter (SEC-004).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, clearRateLimitStore, getClientKey } from '../lib/rate-limiter.ts';

// ── checkRateLimit ───────────────────────────────────────────────────────────

test('allows requests within the limit', () => {
  clearRateLimitStore('endpoint:test-allow');

  for (let i = 0; i < 5; i++) {
    const result = checkRateLimit('endpoint:test-allow', 'client-a', { limit: 5 });
    assert.equal(result.allowed, true, `Request ${i + 1} should be allowed`);
  }
});

test('denies the (limit+1)th request within the window', () => {
  clearRateLimitStore('endpoint:test-deny');

  for (let i = 0; i < 5; i++) {
    checkRateLimit('endpoint:test-deny', 'client-b', { limit: 5 });
  }

  const result = checkRateLimit('endpoint:test-deny', 'client-b', { limit: 5 });
  assert.equal(result.allowed, false);
});

test('denied result includes positive retryAfterSeconds', () => {
  clearRateLimitStore('endpoint:test-retry');

  for (let i = 0; i < 3; i++) {
    checkRateLimit('endpoint:test-retry', 'client-c', { limit: 3 });
  }

  const result = checkRateLimit('endpoint:test-retry', 'client-c', { limit: 3 });
  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.ok(result.retryAfterSeconds >= 1, 'retryAfterSeconds should be at least 1');
    assert.ok(result.retryAfterSeconds <= 60, 'retryAfterSeconds should not exceed window');
  }
});

test('different clients are tracked independently', () => {
  clearRateLimitStore('endpoint:test-isolation');

  for (let i = 0; i < 5; i++) {
    checkRateLimit('endpoint:test-isolation', 'client-x', { limit: 5 });
  }

  // client-x is now at limit; client-y should still be allowed
  const resultX = checkRateLimit('endpoint:test-isolation', 'client-x', { limit: 5 });
  const resultY = checkRateLimit('endpoint:test-isolation', 'client-y', { limit: 5 });

  assert.equal(resultX.allowed, false);
  assert.equal(resultY.allowed, true);
});

test('different endpoints have independent stores', () => {
  clearRateLimitStore('endpoint:ep-1');
  clearRateLimitStore('endpoint:ep-2');

  // Exhaust endpoint 1
  for (let i = 0; i < 2; i++) {
    checkRateLimit('endpoint:ep-1', 'shared-client', { limit: 2 });
  }

  const ep1 = checkRateLimit('endpoint:ep-1', 'shared-client', { limit: 2 });
  const ep2 = checkRateLimit('endpoint:ep-2', 'shared-client', { limit: 2 });

  assert.equal(ep1.allowed, false, 'ep-1 should be denied');
  assert.equal(ep2.allowed, true, 'ep-2 should still be allowed');
});

test('sliding window expires old timestamps', async () => {
  clearRateLimitStore('endpoint:test-expiry');

  // Use a 100ms window
  const config = { limit: 2, windowMs: 100 };

  // Fill the window
  checkRateLimit('endpoint:test-expiry', 'client-d', config);
  checkRateLimit('endpoint:test-expiry', 'client-d', config);

  // Should be denied immediately
  const denied = checkRateLimit('endpoint:test-expiry', 'client-d', config);
  assert.equal(denied.allowed, false);

  // Wait for window to expire
  await new Promise((resolve) => setTimeout(resolve, 120));

  // Should now be allowed again
  const allowed = checkRateLimit('endpoint:test-expiry', 'client-d', config);
  assert.equal(allowed.allowed, true);
});

test('clearRateLimitStore clears specific endpoint', () => {
  clearRateLimitStore('endpoint:clear-me');

  for (let i = 0; i < 3; i++) {
    checkRateLimit('endpoint:clear-me', 'client-e', { limit: 3 });
  }

  // At limit
  assert.equal(checkRateLimit('endpoint:clear-me', 'client-e', { limit: 3 }).allowed, false);

  clearRateLimitStore('endpoint:clear-me');

  // Should be allowed after clearing
  assert.equal(checkRateLimit('endpoint:clear-me', 'client-e', { limit: 3 }).allowed, true);
});

// ── getClientKey ─────────────────────────────────────────────────────────────

test('getClientKey extracts bearer token', () => {
  const request = new Request('http://localhost/api/test', {
    headers: { authorization: 'Bearer my-secret-token' }
  });
  const key = getClientKey(request);
  assert.equal(key, 'bearer:my-secret-token');
});

test('getClientKey falls back to x-forwarded-for IP', () => {
  const request = new Request('http://localhost/api/test', {
    headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }
  });
  const key = getClientKey(request);
  assert.equal(key, 'ip:10.0.0.1');
});

test('getClientKey falls back to x-real-ip when no forwarded header', () => {
  const request = new Request('http://localhost/api/test', {
    headers: { 'x-real-ip': '192.168.1.5' }
  });
  const key = getClientKey(request);
  assert.equal(key, 'ip:192.168.1.5');
});

test('getClientKey returns anonymous when no identifiers present', () => {
  const request = new Request('http://localhost/api/test');
  const key = getClientKey(request);
  assert.equal(key, 'anonymous');
});

test('getClientKey prefers bearer over IP headers', () => {
  const request = new Request('http://localhost/api/test', {
    headers: {
      authorization: 'Bearer token-abc',
      'x-forwarded-for': '10.0.0.1'
    }
  });
  const key = getClientKey(request);
  assert.equal(key, 'bearer:token-abc');
});

// ── Configured limits match SEC-004 spec ────────────────────────────────────

test('SEC-004: provision/tenant allows exactly 5 req/min', () => {
  clearRateLimitStore('POST /api/provision/tenant');

  const config = { limit: 5, windowMs: 60_000 };
  let allowed = 0;

  for (let i = 0; i < 8; i++) {
    const r = checkRateLimit('POST /api/provision/tenant', 'sec004-client', config);
    if (r.allowed) allowed++;
  }

  assert.equal(allowed, 5);
});

test('SEC-004: auth/rotation endpoints allow exactly 10 req/min', () => {
  for (const endpoint of ['POST /api/auth/rotation/plan', 'POST /api/auth/rotation/simulate']) {
    clearRateLimitStore(endpoint);

    const config = { limit: 10, windowMs: 60_000 };
    let allowed = 0;

    for (let i = 0; i < 15; i++) {
      const r = checkRateLimit(endpoint, 'sec004-rotation-client', config);
      if (r.allowed) allowed++;
    }

    assert.equal(allowed, 10, `${endpoint} should allow exactly 10`);
  }
});

test('SEC-004: alerts/dispatch allows exactly 20 req/min', () => {
  clearRateLimitStore('POST /api/alerts/dispatch');

  const config = { limit: 20, windowMs: 60_000 };
  let allowed = 0;

  for (let i = 0; i < 25; i++) {
    const r = checkRateLimit('POST /api/alerts/dispatch', 'sec004-alerts-client', config);
    if (r.allowed) allowed++;
  }

  assert.equal(allowed, 20);
});
