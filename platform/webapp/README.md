# GMZ Cloud Business Apps — Webapp MVP

Next.js + TypeScript + Tailwind MVP scaffold for tenant operations.

## Included

- App Router structure
- Dashboard with live tenant/job stats loaded from API
- Customers/Tenants list loaded from API
- Tenant creation wizard (7-step flow) posting to API with catalog-based app selection and auth-mode specific payload
- Management VM Setup Wizard with dry-run plan generation
- Deployments page (API-driven)
- Reports page (API-driven + CSV export)
- Jobs page (API-driven + quick create form)
- Job detail page at `/jobs/[id]` with related tenant context
- Admin Security page at `/admin/security` (auth health + token-risk alerts + configurable Teams/Email alert channels + severity-based routing + recipient groups + routing preview + server-side audit filters + CSV export)
- Lightweight local JSON persistence (`.data/store.json`)
- API routes under `app/api/*` with local data-flow behavior

## Run locally

```bash
cd platform/webapp
npm install
npm run dev
```

Open: `http://localhost:3000`

## API endpoints

- `GET /api/tenants`
- `POST /api/tenants` → creates tenant and automatically queues provisioning job
- `GET /api/tenants/:id/traefik-config` → admin-only; returns Traefik dynamic config YAML for a tenant (Content-Type: text/yaml)
- `GET /api/tenants/:id/ansible-inventory` → admin-only; returns Ansible INI inventory for a tenant (host, vlan_id, vm_ip, tenant_slug)
- `GET /api/jobs`
- `POST /api/jobs` → creates a job in local JSON store
- `GET /api/deployments`
- `GET /api/reports`
- `GET /api/reports.csv` → downloads reports as CSV
- `POST /api/setup/plan` → generates a dry-run setup plan (checks, commands, masked credentials)
- `POST /api/provision/tenant` → creates a provisioning job, returns OpenTofu + Ansible command plan, and supports guarded execution
- `GET /api/audit/events` → returns internal audit events from local JSONL store (sanitized) with server-side filters: `limit`, `outcome`, `actionContains`, `operationContains`, `since`
- `GET /api/audit/events.csv` → admin-only CSV export for audit events; supports same filters as JSON endpoint
- `GET /api/auth/health` → admin-only auth posture summary (mode + safe trusted-token health counts: total/active/expired/expiringSoon + warningDays + dev role switch state)
- `GET /api/auth/alerts` → admin-only actionable token-risk alerts from auth health (`critical|warning|info`, recommendation text, no secrets)
- `POST /api/auth/rotation/plan` → admin-only safe rotation checklist with overlap/cutover guidance and current auth health summary (no token secrets)
- `POST /api/auth/rotation/simulate` → admin-only metadata-only impact simulation (`tokenId`, `userId`, `role`, `expiresAt`), returns expired/expiringSoon/active counts and priority actions; rejects secret-like fields (`token`, `password`, `secret`) with `400`
- `GET /api/alerts/config` → admin-only read current alert channel config with secrets masked
- `POST /api/alerts/config` → admin-only update persistent alert channel config (Teams + Email SMTP)
- `POST /api/alerts/test` → admin-only send test alert to selected configured channels
- `POST /api/auth/alerts/dispatch` → admin-only dispatch current auth alerts to configured channels, returning per-channel status + per-alert routing decisions
- `POST /api/alerts/preview-routing` → admin-only dry-run preview of computed routing matrix (no sends); uses provided alerts payload or current auth alerts when omitted

## Auth modes + RBAC (current MVP)

`lib/auth-context.ts` supports three modes:

- `WEBAPP_AUTH_MODE=trusted-bearer` (**default** — recommended for all environments)
  - Requires `Authorization: Bearer <token>`
  - Requires `Authorization: Bearer <token>`
  - Token is validated against `WEBAPP_TRUSTED_TOKENS_JSON`
  - Example:
    - `WEBAPP_TRUSTED_TOKENS_JSON=[{"token":"ops-admin-token","userId":"ops-admin","role":"admin","tokenId":"ops-admin-2026","expiresAt":"2026-12-31T23:59:59.000Z"}]`
  - Supported trusted token fields:
    - `token` (required)
    - `userId` (required)
    - `role` (required)
    - `tokenId` (optional identifier for rotation tracking)
    - `expiresAt` (optional ISO timestamp; expired tokens are rejected)
  - Backward compatible: entries without `expiresAt` remain valid.
  - In this mode, `x-user-id` / `x-user-role` are ignored.
  - Missing/invalid/expired bearer token on protected endpoints returns `401`.
  - Optional token-rotation warning window for `/api/auth/health`:
    - `WEBAPP_TRUSTED_TOKEN_EXPIRY_WARNING_DAYS` (default: `14`)

RBAC policy:

- Protected read endpoints require at least `readonly`:
  - `GET /api/tenants`, `GET /api/jobs`, `GET /api/deployments`
  - `GET /api/reports`, `GET /api/reports.csv`, `GET /api/provision/preflight`
- Protected write endpoints require at least `technician`.
- `GET /api/audit/events` requires `admin`.
- `GET /api/audit/events.csv` requires `admin`.
- `GET /api/auth/health` requires `admin`.
- `GET /api/auth/alerts` requires `admin`.
- `POST /api/auth/rotation/plan` requires `admin`.
- `POST /api/auth/rotation/simulate` requires `admin`.
- `GET /api/alerts/config` requires `admin`.
- `POST /api/alerts/config` requires `admin`.
- `POST /api/alerts/test` requires `admin`.
- `POST /api/alerts/preview-routing` requires `admin`.
- `POST /api/auth/alerts/dispatch` requires `admin`.
- `GET /api/tenants/:id/traefik-config` requires `admin`.
- Auth denials (`401`/`403`) emit an audit event (`auth.guard.denied`) with operation, required/effective role, and auth mode.
- RBAC denials return `403` with role + requiredRole in JSON body.

Developer-only role tooling:

- Sidebar **Dev role** switch and client-side header injection are only active if:
  - `NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH=true`
- Default is disabled (`false`) for production safety.
- Local development flow with dev-header mode (⚠️ insecure — local only):
  1. Set `NODE_ENV=development`
  2. Set `WEBAPP_ENABLE_DEV_AUTH=true`
  3. Set `WEBAPP_AUTH_MODE=dev-header`
  4. Optionally set `NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH=true`
- **`WEBAPP_AUTH_MODE=dev-header`** (⚠️ DEVELOPMENT ONLY — NEVER IN PRODUCTION)
  - Trusts client-supplied `x-user-id` / `x-user-role` headers — no real authentication.
  - Only activated when **both** `NODE_ENV=development` **and** `WEBAPP_ENABLE_DEV_AUTH=true` are set.
  - Falls back to `trusted-bearer` automatically in all other cases.
  - The startup guard `assertAuthModeSafe()` throws if `dev-header` is active in production.

## Operator flow notes

- Tenant wizard apps are now app catalog IDs:
  - `authentik` (always selected/required)
  - `nextcloud`, `it-tools`, `paperless-ngx`, `vaultwarden`, `bookstack`, `joplin`, `libretranslate`, `ollama`, `openwebui`, `searxng`, `snipe-it`, `wiki-js`
- Authentication step now matches operator requirement:
  - `EntraID` → sends `authConfig.entraTenantId`
  - `LDAP` → sends `authConfig.ldapUrl`
  - `Local User` → sends `authConfig.localAdminEmail`
- Tenant create API validates required auth fields and requires `authentik` in `apps`
- Job IDs are clickable from dashboard and jobs table, opening `/jobs/[id]`
- Job detail page resolves local job + tenant context from `.data/store.json`

## Provision tenant endpoint

`POST /api/provision/tenant`

Request body:

```json
{
  "tenantId": "tn-001",
  "dryRun": true
}
```

Behavior:

- `dryRun` defaults to `true` (safe by default)
- Always creates a job entry in `.data/store.json` with a `correlationId`
- Returns concrete OpenTofu + Ansible commands and resolved vars (size → CPU/RAM/disk, VLAN/IP rule `10.<vlan>.10.100`, tenant slug)
- If `dryRun=false` and execution is disabled, endpoint returns `403`
- To allow real command execution, set:

```bash
PROVISION_EXECUTION_ENABLED=true
```

When execution is enabled, commands run sequentially via child process and summarized output is stored in job details.

### Secrets ingestion policy (provisioning)

- Execution mode accepts infrastructure secrets **only** from environment variables.
- Request payloads containing secret-like keys (e.g. `token`, `password`, `secret`) are rejected with `400`.
- API responses expose only secret presence flags (e.g. `executionSecrets`) and never raw env secret values.

### Retry + rollback controls

Optional environment variables for production-hardening:

- `PROVISION_COMMAND_MAX_RETRIES` (default: `1`)  
  Number of retries for `tofu plan`, `tofu apply`, and `ansible-playbook` steps. Uses exponential backoff (`2s`, `4s`, ...).
- `PROVISION_ROLLBACK_HOOK_CMD` (default: unset)  
  If a failure happens after `tofu apply` succeeded, this command is executed once as rollback hook. If unset, rollback is skipped safely.

Job details at `/jobs/[id]` include per-attempt timeline, retry metadata, and rollback outcome.

### Audit events

- Audit events are appended to `.data/audit-events.jsonl` as JSONL.
- Envelope shape is validated at runtime against the documented contract fields in `docs/audit/audit-event.schema.json` (best-effort, no external validator dependency).
- Provisioning and tenant-create APIs emit request/success/failure lifecycle events with `correlationId` propagation.

## Traefik config renderer

`GET /api/tenants/:id/traefik-config` (admin-only)

Returns a Traefik dynamic configuration YAML for the given tenant.

- Derives the backend IP from `10.<vlanId>.10.100`
- Generates one HTTP router + service per app in the tenant's `apps[]`
- Default subdomain: `<app>.<tenantSlug>.irongeeks.eu`
- TLS: `certResolver: letsencrypt`, entrypoint: `websecure`
- Response: `Content-Type: text/yaml`

Default port mapping (`lib/traefik-config.ts → APP_PORT_MAP`):

| App | Port |
|---|---|
| authentik | 9000 |
| nextcloud | 80 |
| it-tools | 80 |
| paperless-ngx | 80 |
| vaultwarden | 80 |
| bookstack | 80 |
| joplin | 22300 |
| libretranslate | 5000 |
| ollama | 11434 |
| openwebui | 8080 |
| searxng | 8080 |
| snipe-it | 80 |
| wiki-js | 3000 |

Errors:
- `404` if tenant not found
- `400` if tenant has no `vlan` set

## Data persistence behavior

- Data is stored in `.data/store.json` (auto-created on first request)
- Initial seed records are written once if the data file does not exist
- No external database required
- New tenant creations immediately show up on Dashboard and Customers pages

## Storage backends

The webapp supports two storage backends selected at runtime via `DATABASE_URL`:

| Backend | Trigger | Notes |
|---|---|---|
| File (default) | `DATABASE_URL` not set | JSON stored in `.data/store.json` + `.data/audit-events.jsonl` |
| PostgreSQL | `DATABASE_URL=postgresql://…` | Full Prisma ORM; requires applied migrations |

A startup health check (`instrumentation.ts`) verifies whichever backend is active at boot time, failing fast before serving any traffic if the backend is unreachable or the schema is out of date.

### Validating the database schema

```bash
# Check schema is valid + report pending migrations
npm run db:validate

# Generate Prisma client after schema changes
npm run db:generate

# Apply all pending migrations
npm run db:migrate
```

## Migrating from file storage to PostgreSQL

Follow these steps to move from `.data/` file storage to a PostgreSQL database.

### 1. Provision a PostgreSQL instance

Use any PostgreSQL 14+ provider (self-hosted, RDS, Supabase, Neon, etc.).

```bash
# Example — local Docker for testing
docker run -d \
  --name gmz-pg \
  -e POSTGRES_USER=gmz \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=gmz_cloud \
  -p 5432:5432 \
  postgres:16-alpine
```

### 2. Set environment variables

```bash
export DATABASE_URL="postgresql://gmz:secret@localhost:5432/gmz_cloud"
```

Add this to your `.env.local` (never commit to version control).

### 3. Apply migrations

```bash
cd platform/webapp
npm run db:migrate
```

This runs `prisma migrate deploy` (or the custom `scripts/db-migrate.ts` wrapper) which creates all tables in the target database.

Verify everything looks correct:

```bash
npm run db:validate
```

### 4. Seed initial data (optional)

To pre-populate the database with the same seed records used by the file backend:

```bash
npm run db:migrate:seed
```

### 5. Migrate existing file data (manual)

If you have production data in `.data/store.json` and `.data/audit-events.jsonl` that you want to preserve:

1. Export file data as JSON:
   ```bash
   cat .data/store.json | jq .
   cat .data/audit-events.jsonl
   ```

2. Transform and insert each entity via the Prisma Studio UI or a custom migration script:
   ```bash
   npm run db:studio
   ```
   Open `http://localhost:5555` and insert records into `tenants`, `jobs`, `deployments`, `reports`, and `audit_events`.

3. Verify row counts match your file data before switching traffic.

### 6. Switch traffic to PostgreSQL

Restart the application with `DATABASE_URL` set. The startup health check will:
- Connect to PostgreSQL
- Confirm all schema tables exist
- Log `[startup:health-check] backend=postgresql ok`

If any table is missing the app will refuse to start and print a clear error message.

### 7. Back up the old files

```bash
tar -czf .data-backup-$(date +%Y%m%d).tar.gz .data/
```

Keep the backup until you've confirmed the PostgreSQL deployment is stable.

### Rollback

To revert to file storage: unset `DATABASE_URL` and restart.  
The `.data/` files are untouched by the PostgreSQL migration.
