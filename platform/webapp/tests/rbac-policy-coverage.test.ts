/**
 * RBAC policy coverage test.
 *
 * Parses every route file under app/api/ to extract the operation strings
 * passed to requireProtectedOperation(), then asserts that each one has a
 * corresponding entry in RBAC_POLICY.
 *
 * This catches the case where a developer adds a new route and wires up
 * auth enforcement but forgets to add the operation to the central policy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RBAC_POLICY } from '../lib/rbac-policy.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const apiDir = join(__dirname, '..', 'app', 'api');

/** Recursively collect all route.ts files under a directory. */
function collectRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectRouteFiles(full));
    } else if (entry === 'route.ts') {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extract every operation string literal passed to requireProtectedOperation()
 * in the given source text. Matches calls like:
 *   requireProtectedOperation(request, 'GET /api/foo')
 */
function extractOperationsFromSource(source: string): string[] {
  const ops: string[] = [];
  // Match: requireProtectedOperation(<anything>, '<operation>') — single or double quotes
  const re = /requireProtectedOperation\s*\([^,]+,\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    ops.push(m[1]);
  }
  return ops;
}

test('every requireProtectedOperation() call in app/api/ has a RBAC_POLICY entry', () => {
  const routeFiles = collectRouteFiles(apiDir);
  assert.ok(routeFiles.length > 0, 'Expected at least one route file under app/api/');

  const policyKeys = new Set(Object.keys(RBAC_POLICY));
  const missing: Array<{ file: string; operation: string }> = [];

  for (const filePath of routeFiles) {
    const source = readFileSync(filePath, 'utf8');
    const ops = extractOperationsFromSource(source);

    for (const op of ops) {
      if (!policyKeys.has(op)) {
        missing.push({ file: relative(join(__dirname, '..'), filePath), operation: op });
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    `The following operations are used in route files but missing from RBAC_POLICY:\n` +
      missing.map((m) => `  ${m.operation}  (${m.file})`).join('\n')
  );
});

test('all RBAC_POLICY keys are used by at least one requireProtectedOperation() call', () => {
  const routeFiles = collectRouteFiles(apiDir);

  const usedOps = new Set<string>();
  for (const filePath of routeFiles) {
    const source = readFileSync(filePath, 'utf8');
    for (const op of extractOperationsFromSource(source)) {
      usedOps.add(op);
    }
  }

  const unused = Object.keys(RBAC_POLICY).filter((key) => !usedOps.has(key));
  assert.deepEqual(
    unused,
    [],
    `The following RBAC_POLICY entries are not used by any route:\n` +
      unused.map((k) => `  ${k}`).join('\n')
  );
});
