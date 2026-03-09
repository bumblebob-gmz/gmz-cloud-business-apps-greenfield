import { getTrustedTokenExpiryWarningDays, type TrustedTokenHealthSummary, type UserRole } from './auth-context.ts';

export type TokenMetadata = {
  tokenId: string;
  expiresAt: string;
  role: UserRole;
  userId: string;
};

export type RotationImpactSummary = {
  total: number;
  expired: number;
  expiringSoon: number;
  active: number;
  warningDays: number;
  suggestedPriorityActions: string[];
};

function isExpired(expiresAt: string, now: number) {
  return Date.parse(expiresAt) <= now;
}

function isExpiringSoon(expiresAt: string, warningDays: number, now: number) {
  const expiresAtMs = Date.parse(expiresAt);
  return expiresAtMs > now && expiresAtMs <= now + warningDays * 24 * 60 * 60 * 1000;
}

export function computeRotationImpactSummary(
  metadata: TokenMetadata[],
  options: { now?: number; warningDays?: number; env?: NodeJS.ProcessEnv } = {}
): RotationImpactSummary {
  const now = options.now ?? Date.now();
  const warningDays = options.warningDays ?? getTrustedTokenExpiryWarningDays(options.env);

  const expired = metadata.filter((item) => isExpired(item.expiresAt, now)).length;
  const expiringSoon = metadata.filter((item) => isExpiringSoon(item.expiresAt, warningDays, now)).length;
  const active = metadata.length - expired;

  const suggestedPriorityActions: string[] = [];
  if (expired > 0) suggestedPriorityActions.push(`Replace ${expired} expired token(s) immediately.`);
  if (expiringSoon > 0) suggestedPriorityActions.push(`Schedule rotation for ${expiringSoon} token(s) expiring within ${warningDays} day(s).`);
  if (expired === 0 && expiringSoon === 0) suggestedPriorityActions.push('No urgent rotation required. Keep standard validation cadence.');

  return {
    total: metadata.length,
    expired,
    expiringSoon,
    active,
    warningDays,
    suggestedPriorityActions
  };
}

export function findForbiddenRotationSecretKeys(payload: unknown, path = ''): string[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item, index) => findForbiddenRotationSecretKeys(item, `${path}[${index}]`));
  }

  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;

  const hits: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (/^(token|password|secret)$/i.test(key)) hits.push(currentPath);
    hits.push(...findForbiddenRotationSecretKeys(value, currentPath));
  }

  return hits;
}

export function buildRotationChecklist(reason: string | undefined, authHealth: TrustedTokenHealthSummary) {
  return {
    reason: reason?.trim() || 'routine-rotation',
    generatedAt: new Date().toISOString(),
    checklist: [
      'Generate a new token set in your secure secrets manager (do not paste secrets into this UI/API).',
      'Assign unique tokenId values and explicit expiresAt timestamps for each new token.',
      'Stage both old and new token metadata in WEBAPP_TRUSTED_TOKENS_JSON during overlap window.',
      'Validate admin, technician, and readonly API access paths with the new token set.',
      'Review /api/auth/health and audit events for denied/failed auth operations.',
      'Cut over by removing old token entries after validation and overlap window completion.',
      'Run post-cutover smoke checks and document rollback token IDs (without token values).'
    ],
    overlapWindowGuidance: 'Keep old and new tokens valid in parallel for a short, predefined overlap window (for example 24-72 hours).',
    validationChecks: [
      'GET /api/auth/health returns expected health counts for remaining active tokens.',
      'Admin-only endpoints remain accessible only to admin tokens.',
      'No spike in auth.guard.denied or auth.rotation.* failure events during cutover.'
    ],
    cutoverCriteria: [
      'All validation checks pass for at least one full operational cycle.',
      'No required clients still using old token IDs.',
      'Rollback token IDs documented and timeboxed.'
    ],
    authHealth
  };
}
