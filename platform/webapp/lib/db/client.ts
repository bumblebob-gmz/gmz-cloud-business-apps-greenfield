/**
 * Prisma client singleton — canonical source of truth for backend selection.
 *
 * `isDatabaseEnabled()` is the single, centralised check for whether PostgreSQL
 * is the active backend.  All data-access layers (data-store.ts, audit.ts,
 * notification-config.ts) import it from here.  Route handlers must NOT call
 * this function directly — they interact exclusively through the data-access
 * layer public API.
 *
 * Only instantiated when DATABASE_URL is configured.
 * Falls back to file-based storage otherwise.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

export function isDatabaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDbClient() {
  if (!isDatabaseEnabled()) {
    throw new Error('DATABASE_URL is not set – file-based fallback should be used');
  }

  if (!_client) {
    // Dynamic import so that missing generated client doesn't break file-only mode
    const { PrismaClient } = require('../../generated/prisma') as typeof import('../../generated/prisma');
    _client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
    });
  }

  return _client!;
}
