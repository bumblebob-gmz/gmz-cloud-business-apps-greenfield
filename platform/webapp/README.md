# GMZ Cloud Business Apps — Webapp MVP

Next.js + TypeScript + Tailwind MVP scaffold for tenant operations.

## Included

- App Router structure
- Dashboard with live tenant/job stats loaded from API
- Customers/Tenants list loaded from API
- Tenant creation wizard (7-step flow) posting to API
- Management VM Setup Wizard with dry-run plan generation
- Deployments page (API-driven)
- Reports page (API-driven + CSV export)
- Jobs page (API-driven + quick create form)
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

## Data persistence behavior

- Data is stored in `.data/store.json` (auto-created on first request)
- Initial seed records are written once if the data file does not exist
- No external database required
- New tenant creations immediately show up on Dashboard and Customers pages
