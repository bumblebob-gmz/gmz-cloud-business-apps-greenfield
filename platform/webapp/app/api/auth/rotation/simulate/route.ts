import { NextResponse } from 'next/server';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { requireProtectedOperation } from '@/lib/auth-context';
import { computeRotationImpactSummary, findForbiddenRotationSecretKeys, type TokenMetadata } from '@/lib/token-rotation';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

type SimulateRequest = {
  tokens?: TokenMetadata[];
};

function isValidRole(role: unknown): role is TokenMetadata['role'] {
  return role === 'admin' || role === 'technician' || role === 'readonly';
}

function parseTokenMetadata(input: unknown): TokenMetadata | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;

  if (typeof candidate.tokenId !== 'string' || !candidate.tokenId.trim()) return null;
  if (typeof candidate.userId !== 'string' || !candidate.userId.trim()) return null;
  if (!isValidRole(candidate.role)) return null;
  if (typeof candidate.expiresAt !== 'string' || Number.isNaN(Date.parse(candidate.expiresAt))) return null;

  return {
    tokenId: candidate.tokenId.trim(),
    userId: candidate.userId.trim(),
    role: candidate.role,
    expiresAt: new Date(Date.parse(candidate.expiresAt)).toISOString()
  };
}

export async function POST(request: Request) {
  // Rate-limit: 10 requests per minute per token (SEC-004)
  const rateLimited = await applyRateLimit(request, 'POST /api/auth/rotation/simulate', { limit: 10 });
  if (rateLimited) return rateLimited;

  const correlationId = getCorrelationIdFromRequest(request);
  const authz = await requireProtectedOperation(request, 'POST /api/auth/rotation/simulate');

  if (!authz.ok) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: 'unknown' },
        tenantId: 'system',
        action: 'auth.rotation.simulate.denied',
        resource: 'auth-rotation',
        outcome: 'denied',
        source: { service: 'webapp', operation: 'POST /api/auth/rotation/simulate' }
      })
    );
    return authz.response;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as SimulateRequest;
    const forbiddenKeys = findForbiddenRotationSecretKeys(body);

    if (forbiddenKeys.length > 0) {
      await appendAuditEvent(
        buildAuditEvent({
          correlationId,
          actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
          tenantId: 'system',
          action: 'auth.rotation.simulate.failure',
          resource: 'auth-rotation',
          outcome: 'denied',
          source: { service: 'webapp', operation: 'POST /api/auth/rotation/simulate' },
          details: { reason: 'forbidden_secret_keys_in_request', fields: forbiddenKeys }
        })
      );

      return NextResponse.json(
        { error: 'Secret-like fields are not allowed. Submit metadata only.', forbiddenFields: forbiddenKeys, correlationId },
        { status: 400 }
      );
    }

    const tokens = Array.isArray(body.tokens) ? body.tokens.map(parseTokenMetadata).filter((item): item is TokenMetadata => Boolean(item)) : [];

    if (!Array.isArray(body.tokens) || tokens.length !== body.tokens.length) {
      await appendAuditEvent(
        buildAuditEvent({
          correlationId,
          actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
          tenantId: 'system',
          action: 'auth.rotation.simulate.failure',
          resource: 'auth-rotation',
          outcome: 'failure',
          source: { service: 'webapp', operation: 'POST /api/auth/rotation/simulate' },
          details: { reason: 'invalid_token_metadata' }
        })
      );
      return NextResponse.json(
        { error: 'Invalid payload. Expected { tokens: [{ tokenId, userId, role, expiresAt }] } with valid values.', correlationId },
        { status: 400 }
      );
    }

    const impact = computeRotationImpactSummary(tokens, { env: process.env });

    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: 'system',
        action: 'auth.rotation.simulate.success',
        resource: 'auth-rotation',
        outcome: 'success',
        source: { service: 'webapp', operation: 'POST /api/auth/rotation/simulate' },
        details: { tokenCount: tokens.length }
      })
    );

    return NextResponse.json({ impact, correlationId });
  } catch (error) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: 'system',
        action: 'auth.rotation.simulate.failure',
        resource: 'auth-rotation',
        outcome: 'failure',
        source: { service: 'webapp', operation: 'POST /api/auth/rotation/simulate' },
        details: { reason: error instanceof Error ? error.message : 'unknown_error' }
      })
    );

    return NextResponse.json({ error: 'Failed to simulate token rotation impact.', correlationId }, { status: 500 });
  }
}
