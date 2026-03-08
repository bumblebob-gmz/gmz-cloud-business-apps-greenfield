# GMZ Cloud Business Apps — Webapp MVP

Next.js + TypeScript + Tailwind MVP scaffold for tenant operations.

## Included

- App Router structure
- Dashboard with tenant stats + mock jobs table
- Customers/Tenants list
- Tenant creation wizard (7-step flow)
- Deployments page
- Reports page
- Local mock data (`lib/mock-data.ts`)
- Mock API routes under `app/api/*`

## Run locally

```bash
cd platform/webapp
npm install
npm run dev
```

Open: `http://localhost:3000`

## API endpoints

- `GET /api/tenants`
- `GET /api/jobs`
- `GET /api/deployments`
- `GET /api/reports`

All endpoints return local mock JSON for MVP development.
