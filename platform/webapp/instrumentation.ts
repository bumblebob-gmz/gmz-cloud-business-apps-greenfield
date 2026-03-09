/**
 * Next.js instrumentation hook.
 *
 * Executed once per Node.js process startup (not per request).
 * Verifies the configured storage backend (file or PostgreSQL) is reachable
 * and that the database schema is current before the app begins serving traffic.
 *
 * Reference: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run health check in the Node.js runtime (not edge).
  if (process.env.NEXT_RUNTIME === 'edge') return;

  // Dynamically imported so that missing generated Prisma client never breaks
  // file-only mode at module load time.
  const { runStartupHealthCheck } = await import('./lib/db/health-check.ts');
  await runStartupHealthCheck();
}
