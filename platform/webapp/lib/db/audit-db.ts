/**
 * PostgreSQL implementation for audit events.
 * Used when DATABASE_URL is configured.
 */

import { getDbClient } from './client.ts';
import type { AuditEvent, AuditEventFilters } from '../audit.ts';

function dbRowToAuditEvent(row: Record<string, unknown>): AuditEvent {
  return {
    eventId: row.eventId as string,
    timestamp: (row.timestamp as Date).toISOString(),
    correlationId: row.correlationId as string,
    tenantId: row.tenantId as string,
    action: row.action as string,
    resource: row.resource as string,
    outcome: row.outcome as AuditEvent['outcome'],
    actor: {
      type: row.actorType as AuditEvent['actor']['type'],
      id: row.actorId as string,
      role: (row.actorRole as string) ?? undefined
    },
    source: {
      service: row.sourceService as string,
      operation: row.sourceOperation as string,
      ip: (row.sourceIp as string) ?? undefined
    },
    details: (row.details as Record<string, unknown>) ?? undefined
  };
}

export async function dbAppendAuditEvent(event: AuditEvent): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getDbClient();

    await db.auditEvent.create({
      data: {
        eventId: event.eventId,
        timestamp: new Date(event.timestamp),
        correlationId: event.correlationId,
        tenantId: event.tenantId,
        action: event.action,
        resource: event.resource,
        outcome: event.outcome,
        actorType: event.actor.type,
        actorId: event.actor.id,
        actorRole: event.actor.role,
        sourceService: event.source.service,
        sourceOperation: event.source.operation,
        sourceIp: event.source.ip,
        details: event.details ? (event.details as object) : undefined
      }
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, error: `audit_write_failed:${message.slice(0, 140)}` };
  }
}

export async function dbListAuditEvents(filters: AuditEventFilters): Promise<AuditEvent[]> {
  const db = getDbClient();

  const where: Record<string, unknown> = {};

  if (filters.outcome) {
    where.outcome = filters.outcome;
  }

  if (filters.actionContains) {
    where.action = { contains: filters.actionContains, mode: 'insensitive' };
  }

  if (filters.operationContains) {
    where.sourceOperation = { contains: filters.operationContains, mode: 'insensitive' };
  }

  if (filters.since) {
    where.timestamp = { gte: new Date(filters.since) };
  }

  const rows = await db.auditEvent.findMany({
    where,
    orderBy: { timestamp: 'asc' },
    take: filters.limit
  });

  return rows.map((r) => dbRowToAuditEvent(r as unknown as Record<string, unknown>));
}
