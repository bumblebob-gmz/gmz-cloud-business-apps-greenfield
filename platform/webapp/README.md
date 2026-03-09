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
- Admin Security page at `/admin/security` (auth health + token-risk alerts + configurable Teams/Email alert channels + server-side audit filters + CSV export)
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
- `POST /api/auth/alerts/dispatch` → admin-only dispatch current auth alerts to configured channels, returning per-channel status

## Auth modes + RBAC (current MVP)

`lib/auth-context.ts` supports two modes:

- `WEBAPP_AUTH_MODE=dev-header` (default, development-friendly)
  - Request headers (optional):
    - `x-user-id` (default: `dev-user`)
    - `x-user-role` (`admin` | `technician` | `readonly`, default: `technician`)
- `WEBAPP_AUTH_MODE=trusted-bearer` (safer for deployed environments)
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
- `POST /api/auth/alerts/dispatch` requires `admin`.
- Auth denials (`401`/`403`) emit an audit event (`auth.guard.denied`) with operation, required/effective role, and auth mode.
- RBAC denials return `403` with role + requiredRole in JSON body.

Developer-only role tooling:

- Sidebar **Dev role** switch and client-side header injection are only active if:
  - `NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH=true`
- Default is disabled (`false`) for production safety.
- Local development flow:
  1. Set `NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH=true`
  2. Keep `WEBAPP_AUTH_MODE=dev-header` (or unset)

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

## Data persistence behavior

- Data is stored in `.data/store.json` (auto-created on first request)
- Initial seed records are written once if the data file does not exist
- No external database required
- New tenant creations immediately show up on Dashboard and Customers pages
