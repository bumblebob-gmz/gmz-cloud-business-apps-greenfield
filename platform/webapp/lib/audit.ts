import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import { isDatabaseEnabled } from './db/client.ts';

const DATA_DIR = path.join(process.cwd(), '.data');
const AUDIT_FILE = path.join(DATA_DIR, 'audit-events.jsonl');

/** Maximum number of audit entries to keep in file-store mode. */
export const MAX_AUDIT_ENTRIES = (() => {
  const raw = process.env.AUDIT_MAX_ENTRIES;
  if (!raw) return 100_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100_000;
})();

/** When true, use date-stamped audit files (.data/audit-YYYY-MM-DD.jsonl). */
const AUDIT_LOG_ROTATE = process.env.AUDIT_LOG_ROTATE === 'true';

/** Returns the audit file path: date-stamped if rotation is enabled, otherwise fixed. */
export function getAuditFilePath(date?: Date): string {
  if (!AUDIT_LOG_ROTATE) return AUDIT_FILE;
  const d = date ?? new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return path.join(DATA_DIR, `audit-${yyyy}-${mm}-${dd}.jsonl`);
}

/**
 * After appending, enforce MAX_AUDIT_ENTRIES by trimming the oldest entries
 * from the given file if needed.
 */
async function enforceAuditCap(filePath: string): Promise<void> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    if (lines.length <= MAX_AUDIT_ENTRIES) return;
    const trimmed = lines.slice(lines.length - MAX_AUDIT_ENTRIES);
    await writeFile(filePath, `${trimmed.join('\n')}\n`, 'utf8');
  } catch {
    // best-effort; never throw
  }
}

const REQUIRED_FIELDS = ['eventId', 'timestamp', 'correlationId', 'actor', 'tenantId', 'action', 'resource', 'outcome', 'source'] as const;
const OUTCOMES = new Set(['success', 'failure', 'denied']);
const ACTOR_TYPES = new Set(['user', 'service']);

export type AuditEvent = {
  eventId: string;
  timestamp: string;
  correlationId: string;
  actor: { type: 'user' | 'service'; id: string; role?: string };
  tenantId: string;
  action: string;
  resource: string;
  outcome: 'success' | 'failure' | 'denied';
  source: { service: string; operation: string; ip?: string };
  details?: Record<string, unknown>;
};

export type AuditEventFilters = {
  limit: number;
  outcome?: AuditEvent['outcome'];
  actionContains?: string;
  operationContains?: string;
  since?: string;
};

export function getCorrelationIdFromRequest(request: Request) {
  const header = request.headers.get('x-correlation-id')?.trim();
  if (header && header.length >= 8) return header;
  return randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeError(message: string) {
  return `audit_write_failed:${message.slice(0, 140)}`;
}

function sanitizeLimit(value: unknown, fallback = 50) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
}

function sanitizeOutcome(value: unknown): AuditEvent['outcome'] | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'success' || normalized === 'failure' || normalized === 'denied') {
    return normalized;
  }
  return undefined;
}

function sanitizeContains(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function sanitizeSince(value: unknown): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

export function parseAuditEventFilters(searchParams: URLSearchParams): AuditEventFilters {
  return {
    limit: sanitizeLimit(searchParams.get('limit'), 50),
    outcome: sanitizeOutcome(searchParams.get('outcome')),
    actionContains: sanitizeContains(searchParams.get('actionContains')),
    operationContains: sanitizeContains(searchParams.get('operationContains')),
    since: sanitizeSince(searchParams.get('since'))
  };
}

export function validateAuditEnvelope(value: unknown): { ok: boolean; error?: string } {
  if (!isRecord(value)) return { ok: false, error: 'payload must be an object' };

  for (const field of REQUIRED_FIELDS) {
    if (!(field in value)) return { ok: false, error: `missing required field: ${field}` };
  }

  const allowedTopLevel = new Set([...REQUIRED_FIELDS, 'details']);
  for (const key of Object.keys(value)) {
    if (!allowedTopLevel.has(key)) return { ok: false, error: `unsupported top-level field: ${key}` };
  }

  if (typeof value.eventId !== 'string' || value.eventId.length < 8) return { ok: false, error: 'eventId must be a string (minLength 8)' };
  if (typeof value.correlationId !== 'string' || value.correlationId.length < 8) return { ok: false, error: 'correlationId must be a string (minLength 8)' };
  if (typeof value.timestamp !== 'string' || Number.isNaN(Date.parse(value.timestamp))) return { ok: false, error: 'timestamp must be an ISO date-time string' };
  if (typeof value.tenantId !== 'string' || value.tenantId.length < 1) return { ok: false, error: 'tenantId must be a non-empty string' };
  if (typeof value.action !== 'string' || value.action.length < 1) return { ok: false, error: 'action must be a non-empty string' };
  if (typeof value.resource !== 'string' || value.resource.length < 1) return { ok: false, error: 'resource must be a non-empty string' };
  if (typeof value.outcome !== 'string' || !OUTCOMES.has(value.outcome)) return { ok: false, error: 'outcome must be success|failure|denied' };

  if (!isRecord(value.actor)) return { ok: false, error: 'actor must be an object' };
  if (typeof value.actor.type !== 'string' || !ACTOR_TYPES.has(value.actor.type)) return { ok: false, error: 'actor.type must be user|service' };
  if (typeof value.actor.id !== 'string' || value.actor.id.length < 1) return { ok: false, error: 'actor.id must be a non-empty string' };
  if ('role' in value.actor && typeof value.actor.role !== 'string') return { ok: false, error: 'actor.role must be a string when present' };

  if (!isRecord(value.source)) return { ok: false, error: 'source must be an object' };
  if (typeof value.source.service !== 'string' || value.source.service.length < 1) return { ok: false, error: 'source.service must be a non-empty string' };
  if (typeof value.source.operation !== 'string' || value.source.operation.length < 1) return { ok: false, error: 'source.operation must be a non-empty string' };
  if ('ip' in value.source && typeof value.source.ip !== 'string') return { ok: false, error: 'source.ip must be a string when present' };

  return { ok: true };
}

function redactValue(input: unknown): unknown {
  const secretKeyPattern = /(token|password|secret|api[-_]?key|private[-_]?key)/i;

  if (Array.isArray(input)) {
    return input.map((item) => redactValue(item));
  }

  if (!isRecord(input)) {
    return input;
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (secretKeyPattern.test(key)) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = redactValue(value);
    }
  }

  return output;
}

export async function appendAuditEvent(event: AuditEvent): Promise<{ ok: boolean; error?: string }> {
  const validation = validateAuditEnvelope(event);
  if (!validation.ok) {
    return { ok: false, error: safeError(validation.error ?? 'invalid envelope') };
  }

  if (isDatabaseEnabled()) {
    const { dbAppendAuditEvent } = await import('./db/audit-db.ts');
    return dbAppendAuditEvent(event);
  }

  try {
    await mkdir(DATA_DIR, { recursive: true });
    const filePath = getAuditFilePath();
    await appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
    await enforceAuditCap(filePath);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, error: safeError(message) };
  }
}

function matchesAuditFilters(event: AuditEvent, filters: AuditEventFilters): boolean {
  if (filters.outcome && event.outcome !== filters.outcome) return false;
  if (filters.actionContains && !event.action.toLowerCase().includes(filters.actionContains)) return false;
  if (filters.operationContains && !event.source.operation.toLowerCase().includes(filters.operationContains)) return false;
  if (filters.since && Date.parse(event.timestamp) < Date.parse(filters.since)) return false;
  return true;
}

export function filterAuditEvents(events: AuditEvent[], filters: Partial<AuditEventFilters> = {}): AuditEvent[] {
  const normalized: AuditEventFilters = {
    limit: sanitizeLimit(filters.limit, 50),
    outcome: sanitizeOutcome(filters.outcome),
    actionContains: sanitizeContains(filters.actionContains),
    operationContains: sanitizeContains(filters.operationContains),
    since: sanitizeSince(filters.since)
  };

  return events.filter((event) => matchesAuditFilters(event, normalized)).slice(-normalized.limit);
}

export async function listAuditEvents(filtersOrLimit: number | Partial<AuditEventFilters> = 50): Promise<AuditEvent[]> {
  const filters: AuditEventFilters = typeof filtersOrLimit === 'number'
    ? { limit: sanitizeLimit(filtersOrLimit, 50) }
    : {
        limit: sanitizeLimit(filtersOrLimit.limit, 50),
        outcome: sanitizeOutcome(filtersOrLimit.outcome),
        actionContains: sanitizeContains(filtersOrLimit.actionContains),
        operationContains: sanitizeContains(filtersOrLimit.operationContains),
        since: sanitizeSince(filtersOrLimit.since)
      };

  if (isDatabaseEnabled()) {
    const { dbListAuditEvents } = await import('./db/audit-db.ts');
    return dbListAuditEvents(filters);
  }

  try {
    const raw = await readFile(getAuditFilePath(), 'utf8');
    const lines = raw.split('\n').filter(Boolean);

    const parsed = lines
      .map((line) => {
        try {
          return redactValue(JSON.parse(line) as AuditEvent) as AuditEvent;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is AuditEvent => Boolean(entry));

    return filterAuditEvents(parsed, filters);
  } catch {
    return [];
  }
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toAuditEventsCsv(events: AuditEvent[]): string {
  const header = ['timestamp', 'eventId', 'correlationId', 'tenantId', 'actorType', 'actorId', 'actorRole', 'action', 'resource', 'outcome', 'service', 'operation'];
  const rows = events.map((event) => [
    event.timestamp,
    event.eventId,
    event.correlationId,
    event.tenantId,
    event.actor.type,
    event.actor.id,
    event.actor.role ?? '',
    event.action,
    event.resource,
    event.outcome,
    event.source.service,
    event.source.operation
  ]);

  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\n');
}

export function buildAuditEvent(input: Omit<AuditEvent, 'eventId' | 'timestamp'>): AuditEvent {
  return {
    ...input,
    eventId: randomUUID(),
    timestamp: new Date().toISOString()
  };
}
