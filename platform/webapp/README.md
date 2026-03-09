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

### Retry + rollback controls

Optional environment variables for production-hardening:

- `PROVISION_COMMAND_MAX_RETRIES` (default: `1`)  
  Number of retries for `tofu plan`, `tofu apply`, and `ansible-playbook` steps. Uses exponential backoff (`2s`, `4s`, ...).
- `PROVISION_ROLLBACK_HOOK_CMD` (default: unset)  
  If a failure happens after `tofu apply` succeeded, this command is executed once as rollback hook. If unset, rollback is skipped safely.

Job details at `/jobs/[id]` include per-attempt timeline, retry metadata, and rollback outcome.

## Data persistence behavior

- Data is stored in `.data/store.json` (auto-created on first request)
- Initial seed records are written once if the data file does not exist
- No external database required
- New tenant creations immediately show up on Dashboard and Customers pages
