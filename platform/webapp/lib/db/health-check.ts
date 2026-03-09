/**
 * Backend health check — called at application startup.
 *
 * For file-based storage: verifies the `.data/` directory is writable.
 * For PostgreSQL: connects via Prisma, executes a ping query, and confirms
 * all expected schema tables exist (i.e. migrations are current).
 *
 * Throws on fatal misconfiguration so the process fails fast rather than
 * serving requests against a broken backend.
 */

import { isDatabaseEnabled, getDbClient } from './client.ts';
import { mkdir, access, constants } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), '.data');

/** Tables the Prisma schema creates.  Must match schema.prisma exactly. */
const EXPECTED_TABLES = [
  'tenants',
  'jobs',
  'deployments',
  'reports',
  'audit_events',
  'notification_config',
] as const;

export type HealthCheckResult = {
  backend: 'file' | 'postgresql';
  ok: boolean;
  error?: string;
  details?: Record<string, unknown>;
};

/**
 * Verify that the file-based storage directory is accessible and writable.
 */
async function checkFileBackend(): Promise<HealthCheckResult> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await access(DATA_DIR, constants.W_OK | constants.R_OK);
    return { backend: 'file', ok: true, details: { dataDir: DATA_DIR } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { backend: 'file', ok: false, error: `File backend not writable: ${message}` };
  }
}

/**
 * Verify that PostgreSQL is reachable and the schema is current by checking
 * that all expected tables exist.
 */
async function checkPostgresBackend(): Promise<HealthCheckResult> {
  let client: ReturnType<typeof getDbClient>;

  try {
    client = getDbClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { backend: 'postgresql', ok: false, error: `Prisma client init failed: ${message}` };
  }

  try {
    // Basic connectivity ping
    await client.$queryRaw`SELECT 1`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      backend: 'postgresql',
      ok: false,
      error: `PostgreSQL unreachable: ${message}`,
    };
  }

  // Verify schema tables exist (detects missing migrations)
  try {
    const rows: Array<{ tablename: string }> = await client.$queryRaw`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `;

    const existing = new Set(rows.map((r) => r.tablename));
    const missing = EXPECTED_TABLES.filter((t) => !existing.has(t));

    if (missing.length > 0) {
      return {
        backend: 'postgresql',
        ok: false,
        error: `Schema out of date — missing tables: ${missing.join(', ')}. Run: npm run db:migrate`,
        details: { missingTables: missing, existingTables: [...existing] },
      };
    }

    return {
      backend: 'postgresql',
      ok: true,
      details: { tablesVerified: EXPECTED_TABLES.length },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      backend: 'postgresql',
      ok: false,
      error: `Schema verification failed: ${message}`,
    };
  }
}

/**
 * Run the appropriate backend health check and throw on failure.
 *
 * Call this at application startup (e.g. from instrumentation.ts).
 */
export async function runStartupHealthCheck(): Promise<HealthCheckResult> {
  const result = isDatabaseEnabled()
    ? await checkPostgresBackend()
    : await checkFileBackend();

  const label = `[startup:health-check] backend=${result.backend}`;

  if (result.ok) {
    console.info(`${label} ok`);
  } else {
    console.error(`${label} FAILED — ${result.error}`);
    throw new Error(`Backend health check failed: ${result.error}`);
  }

  return result;
}
