# REVIEW-013 – PostgreSQL Integration (Prisma ORM)

**Date:** 2026-03-09  
**Backlog Task:** Integrate PostgreSQL as WebApp backend database  
**Status:** ✅ Implemented & tested  
**Reviewer:** BMAD Agent (automated)  
**Commit:** See git log

---

## Summary

Integrated **PostgreSQL** as the primary persistence backend for the GMZ Cloud
webapp, using **Prisma 7** as the ORM. The implementation uses an *adapter
pattern*: all data-access functions transparently route to PostgreSQL when
`DATABASE_URL` is set, and fall back to the existing `.data/` file-based
storage otherwise. No callers (API routes, provisioning logic) required
changes.

---

## Scope

| Domain               | Data structure            | Migration |
|----------------------|---------------------------|-----------|
| Tenants              | JSON store → `tenants` table | ✅ |
| Provisioning Jobs    | JSON store → `jobs` table (JSONB details) | ✅ |
| Deployments          | JSON store → `deployments` table | ✅ |
| Reports              | JSON store → `reports` table | ✅ |
| Audit Events         | JSONL file → `audit_events` table | ✅ |
| Notification Config  | JSON file → `notification_config` table (singleton) | ✅ |

---

## Architecture Decisions

### ORM: Prisma 7

- Prisma was chosen over Drizzle for its mature TypeScript support, built-in
  migration tooling (`prisma migrate`), and strong community ecosystem.
- Schema is defined in `prisma/schema.prisma`.
- Generated client is emitted to `generated/prisma/` (gitignored).

### Adapter Pattern (no-op fallback)

```
DATABASE_URL set?
  ├─ YES → Prisma client → PostgreSQL
  └─ NO  → File-based .data/ store (original implementation)
```

The `isDatabaseEnabled()` helper in `lib/db/client.ts` is the single
decision point. All adapters guard on this function. Dynamic `import()`
ensures Prisma code is never loaded when the DB is not configured, which
keeps the test suite and development environments that lack PostgreSQL
working without any environment variables.

### Job Details: JSONB

Provisioning job `details` is a deeply nested structure (preflight, plan,
command results, rollback info, logs). Rather than normalising this into
separate tables, it is stored as `JSONB`. This matches the existing shape
and avoids premature schema rigidity while enabling efficient indexed queries
if needed in the future.

### Audit Events: Structured columns + JSONB details

Each audit event is stored as a proper row with indexed columns for
`tenantId`, `timestamp`, `outcome`, and `action`. The optional `details`
field is JSONB. Filtering happens at the DB level rather than in application
memory, which is more efficient at scale.

### Notification Config: Singleton row

A single row with `id = 'default'` holds the notification config as JSONB.
Upsert semantics ensure idempotent writes. This avoids a separate KV store
for a low-write, high-read config blob.

---

## Files Created / Modified

### New files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Prisma schema (all models & enums) |
| `prisma/migrations/001_initial_schema.sql` | Raw SQL migration for manual / CI apply |
| `prisma.config.ts` | Prisma config (generated, patched) |
| `lib/db/client.ts` | Prisma singleton + `isDatabaseEnabled()` |
| `lib/db/data-store-db.ts` | DB implementation for tenants/jobs/deployments/reports |
| `lib/db/audit-db.ts` | DB implementation for audit events |
| `lib/db/notification-config-db.ts` | DB implementation for notification config |
| `scripts/db-migrate.ts` | Migration helper script with optional seed |

### Modified files

| File | Change |
|------|--------|
| `lib/data-store.ts` | Added DB routing adapter; file impl retained |
| `lib/audit.ts` | Added DB routing for `appendAuditEvent` / `listAuditEvents` |
| `lib/notification-config.ts` | Added DB routing for read/write |
| `package.json` | Added `db:generate`, `db:migrate`, `db:migrate:seed`, `db:studio` scripts |

---

## Schema Design Notes

### Enums

PostgreSQL enums are used for `TenantStatus`, `TenantSize`, `AuthMode`,
`JobStatus`, `DeploymentEnv`, `DeploymentStatus`, `AuditOutcome`, `ActorType`.

**Note on `AuthMode`:** TypeScript uses `'Local User'` (with space). PostgreSQL
enum cannot contain spaces, so the DB value is `LocalUser`. The adapter layer
translates between the two representations transparently.

### Job ↔ Tenant relation

The `Job.tenantName` field is nullable so that jobs survive tenant deletion
(`onDelete: SetNull`). This preserves audit history for deprovisioned tenants.

---

## Migration Guide

### First-time setup (with PostgreSQL)

```bash
# 1. Set connection string
export DATABASE_URL="postgresql://user:pass@host:5432/gmz_cloud"

# 2. Generate Prisma client
npm run db:generate

# 3. Apply migrations
npm run db:migrate

# 4. (Optional) seed demo data
npm run db:migrate:seed
```

### Migrate existing .data/ content

If you have existing `.data/store.json` and `.data/audit-events.jsonl` data
and want to migrate to PostgreSQL, use the `--seed` flag which inserts the
default demo dataset. For production data migration, write a one-off script
that reads the file store and calls the DB adapter functions.

### Without PostgreSQL (file fallback)

No changes required. When `DATABASE_URL` is not set, the webapp behaves
exactly as before.

---

## Test Results

```
# tests 33
# pass  33
# fail  0
```

All 33 existing tests pass without modification. Tests run without
`DATABASE_URL`, exercising the file-based fallback path.

---

## Security Considerations

- `DATABASE_URL` must be treated as a secret. It is excluded from `.gitignore`.
- Prisma parameterises all queries; no raw SQL interpolation is used in application code.
- JSONB `details` fields store only operational metadata (no PII beyond what was previously in files).
- The `audit_events.details` column should be covered by a future RLS policy if multi-tenant DB isolation is required.

---

## Risks & Follow-up

| Risk | Mitigation |
|------|-----------|
| `generated/prisma` not committed | CI must run `npm run db:generate` before build |
| DB schema drift | Use `prisma migrate deploy` in CI, not `push` |
| Singleton notification config | Suitable for current single-operator model; revisit if multi-operator |
| JSONB `details` growth | Add size limit / archival strategy for large job logs |
| Circular import (audit-db → audit) | Type-only import; no runtime cycle |

---

## Acceptance Criteria Check

| Criterion | Status |
|-----------|--------|
| PostgreSQL via Prisma ORM | ✅ |
| Tenants table | ✅ |
| Audit events table | ✅ |
| Notification config table | ✅ |
| Provisioning jobs table | ✅ |
| Migration scripts | ✅ `prisma/migrations/001_initial_schema.sql` |
| `.data/` fallback when no `DATABASE_URL` | ✅ |
| All tests pass | ✅ 33/33 |
| BMAD review artifact | ✅ This document |
