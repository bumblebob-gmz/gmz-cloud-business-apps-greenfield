# GMZ Cloud Business Apps — Code Quality Audit 2026

**Datum:** 10. März 2026  
**Auditor:** Senior TypeScript/Next.js Engineer (Subagent)  
**Projektpfad:** `platform/webapp/`  
**Next.js:** 14.2.5 | **TypeScript:** 5.5.3 (strict: true) | **Prisma:** 7.4.2  

---

## 1. Executive Summary

Das Projekt ist strukturell solide und zeigt deutliche Reife in Sicherheits- und Audit-Mechanismen: konsequente Auth-Guards, vollständige Audit-Trails, CSP/HSTS-Header und ein gut durchdachtes Phasenmodell für Provisioning. Kritisch sind jedoch drei Befunde: (1) ein Data-Race im dateibasierten Store, der Datenverlust bei Concurrent Requests verursacht; (2) die `dbCreateTenant`-Funktion ignoriert das admin-übergebene `ipAddress`-Feld stillschweigend, was die Policy-Override-Funktionalität im PostgreSQL-Modus bricht; und (3) die Documenso-Route wandelt `string[]` in `Record<string,unknown>[]` um, was immer fehlschlägt. Die Testsuite ist überraschend umfangreich für ein MVP, deckt aber API-Routen und Datenbankschicht gar nicht ab. Das Frontend hat keinerlei Error-Boundaries, und das Schema-Design speichert Zeitstempel als Locale-Strings statt ISO 8601, was jede zeitbasierte Filterung verhindert.

---

## 2. Architektur-Bewertung

### Stärken

- **Dual-Backend-Adapter-Pattern** (`data-store.ts`): Saubere Trennung über `isDatabaseEnabled()`, Public API identisch für Datei- und DB-Modus — callers müssen nichts wissen.
- **Vollständige Audit-Trails**: Jede schreibende Operation emittiert `AuditEvent` mit `correlationId`, Actor, Outcome. Validierung per `validateAuditEnvelope()` mit Schema-Check.
- **Security-First Headers**: `next.config.mjs` liefert CSP, HSTS (2 Jahre), X-Frame-Options, Permissions-Policy — ungewöhnlich gut für ein MVP.
- **Phase-based Provisioning Engine**: Klares 5-Phasen-Modell mit per-Phase Audit-Events, Dry-Run-Modus, Rollback-Hooks.
- **Rollback-Hook Command Hardening** (SEC-009): Allowlist-Pattern verhindert Shell-Injection, `execFile` statt `exec`.
- **Rate-Limiting Middleware** (SEC-004): Konsistent auf kritischen Endpoints.
- **Strict TypeScript**: `"strict": true` in `tsconfig.json`, kein `allowJs`.

### Schwächen

- **Kein Job-Queue-System**: Background-Provisioning via `setImmediate` ist nicht resistent gegen Prozess-Crashes.
- **In-Memory Rate-Limiter**: Funktioniert nicht horizontal skaliert; keine Redis-Abstraktionsschicht.
- **File-Store ohne Locking**: Concurrent writes können Daten überschreiben.
- **Schema-Desyncs**: `AuthMode.LocalUser` im Prisma-Schema vs. `'Local User'` in TypeScript — Konvertierung manuell verwaltet in `authModeToDb()`.
- **Keine Pagination**: Alle List-Endpoints geben unbeschränkte Ergebnismengen zurück.
- **Kein Error-Boundary im Frontend**: Komplette Seiten können zu Blank-Screens werden.

---

## 3. Kritische Befunde

---

### 🔴 [CRITICAL-001] `dbCreateTenant` ignoriert admin-übergebenes `ipAddress`

**Datei:** `platform/webapp/lib/db/data-store-db.ts:88`

**Problem:**
```typescript
// data-store-db.ts:82-95
db.tenant.create({
  data: {
    // ...
    ipAddress: `10.${input.vlan}.10.100`,  // ← HARDCODED! ignoriert input.ipAddress
    // ...
  }
})
```
Der File-Store-Pfad macht es richtig:
```typescript
// data-store.ts:186
ipAddress: input.ipAddress ?? `10.${input.vlan}.10.100`,  // ← korrekt
```

**Auswirkung:** Die Admin-Override-Funktion (`policyOverride: true` + `ipAddress`) funktioniert im PostgreSQL-Modus nicht. Die Route `POST /api/tenants` berechnet `resolvedIp` korrekt und übergibt es — es wird stillschweigend verworfen. Audit-Log dokumentiert eine IP-Adresse, die niemals gespeichert wird.

**Fix:**
```typescript
ipAddress: input.ipAddress ?? `10.${input.vlan}.10.100`,
```

---

### 🔴 [CRITICAL-002] File-Store Race Condition bei Concurrent Requests

**Datei:** `platform/webapp/lib/data-store.ts:90–96` (readStore/writeStore Pattern)

**Problem:**
```typescript
async function readStore(): Promise<DataShape> {
  await ensureStore();
  const raw = await readFile(DATA_FILE, 'utf8');   // ← read
  return JSON.parse(raw) as DataShape;
}

async function writeStore(data: DataShape) {
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');  // ← overwrite
}
```
Zwischen `readFile` und `writeFile` kann ein zweiter Request dieselbe veraltete Datei lesen und mit seinen Änderungen schreiben — der erste Schreibvorgang geht verloren. Bei gleichzeitigem Provisioning zweier Tenants kann ein Job-Record komplett verschwinden.

**Auswirkung:** Datenverlust im File-Store-Modus. Schwer zu reproduzieren in Entwicklung, aber real in Last-Szenarien.

**Fix:** File-basiertes Locking via `proper-lockfile` oder Umsteigen auf SQLite mit WAL-Modus für den Dev-Store:
```typescript
import { lock } from 'proper-lockfile';

async function withStoreLock<T>(fn: (data: DataShape) => Promise<{ data: DataShape; result: T }>): Promise<T> {
  const release = await lock(DATA_FILE, { retries: 3 });
  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    const { data: updated, result } = await fn(JSON.parse(raw));
    await writeFile(DATA_FILE, JSON.stringify(updated, null, 2), 'utf8');
    return result;
  } finally {
    await release();
  }
}
```

---

### 🔴 [CRITICAL-003] Background-Provisioning via `setImmediate` nicht crash-resistent

**Datei:** `platform/webapp/app/api/provision/tenant/route.ts:265–270`

**Problem:**
```typescript
// Zeile 265-270
setImmediate(() => {
  runProvisioningInBackground(job.id, tenant.id, correlationId, actor, dryRun).catch((err) => {
    console.error('[provision-background] setImmediate catch for job', job.id, err);
  });
});

return NextResponse.json({ jobId: job.id, correlationId }, { status: 202 });
```
Wenn der Next.js-Prozess nach der `202`-Antwort (z. B. durch Deployment, OOM, SIGTERM) neu startet, laufen Jobs ewig als `Queued` oder `DryRun` ohne Recovery-Mechanismus. Der Caller pollt `GET /api/jobs/:id` und erhält für immer denselben Zustand.

**Auswirkung:** Zombie-Jobs bei jedem Deployment. Keine Möglichkeit, unterbrochene Provisioning-Läufe zu erkennen oder neu zu starten.

**Fix (kurzfristig):** Startup-Scan für stuck jobs:
```typescript
// In app startup (instrumentation.ts oder similar):
async function recoverStuckJobs() {
  const jobs = await listJobs();
  const stuck = jobs.filter(j => 
    (j.status === 'Queued' || j.status === 'Running') &&
    Date.now() - Date.parse(j.startedAt) > 5 * 60_000
  );
  for (const job of stuck) {
    await updateJob(job.id, { 
      status: 'Failed', 
      details: { error: 'Job interrupted by process restart' }
    });
  }
}
```
**Fix (langfristig):** Jobqueue (BullMQ + Redis) oder Postgres-basiertes SKIP LOCKED Pattern.

---

### 🟠 [HIGH-001] Bearer-Token roh als Rate-Limit-Key gespeichert

**Datei:** `platform/webapp/lib/rate-limiter.ts:67–70`

**Problem:**
```typescript
export function getClientKey(request: Request): string {
  const authHeader = request.headers.get('authorization')?.trim();
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (token) return `bearer:${token}`;  // ← vollständiger Token in-memory
  }
  // ...
}
```
Der vollständige Bearer-Token wird als Map-Key im `stores`-Map gespeichert und bleibt dort für die Dauer des Sliding-Window (60s). Bei Heap-Dump, Memory-Profiling oder einem Server-Side-Request-Forgery-Angriff sind alle aktiven Tokens exponiert.

**Auswirkung:** Credentials-Leakage aus Prozess-Speicher.

**Fix:** Token hashen statt roh zu speichern:
```typescript
import { createHash } from 'node:crypto';

function hashKey(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

if (token) return `bearer:${hashKey(token)}`;
```

---

### 🟠 [HIGH-002] X-Forwarded-For ohne Validierung — Rate-Limit-Bypass

**Datei:** `platform/webapp/lib/rate-limiter.ts:74–76`

**Problem:**
```typescript
const xff = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
if (xff) return `ip:${xff}`;
```
Ein Angreifer kann `X-Forwarded-For: 1.2.3.4` bei jedem Request frei wählen und damit Rate-Limiting komplett umgehen, solange kein Bearer-Token vorhanden ist (z. B. vor Authentication, oder wenn Auth über andere Mechanismen läuft).

**Auswirkung:** Rate-Limiting für unauthentifizierte Requests wirkungslos.

**Fix:** Nur vertrauenswürdige Proxy-IPs akzeptieren, oder auf `CF-Connecting-IP` / `True-Client-IP` umstellen wenn hinter Cloudflare. Minimalfix: Header-Wert auf IPv4/IPv6-Format validieren:
```typescript
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;
const xff = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
if (xff && (IPV4_RE.test(xff) || IPV6_RE.test(xff))) return `ip:${xff}`;
```

---

### 🟠 [HIGH-003] Documenso-Route: `string[]` wird als `Record<string,unknown>[]` gecastet — immer `not_installed`

**Datei:** `platform/webapp/app/api/tenants/[id]/documenso/route.ts:20–24`

**Problem:**
```typescript
// tenant.apps ist string[] (z.B. ["authentik", "documenso"])
const apps: Record<string, unknown>[] = Array.isArray((tenant as Record<string, unknown>).apps)
  ? ((tenant as Record<string, unknown>).apps as Record<string, unknown>[])
  : [];

const documensoApp = apps.find((a) => a.name === 'documenso');
// ↑ apps ist z.B. ["authentik", "documenso"] — strings haben kein .name-Property
// documensoApp ist IMMER undefined
const status = documensoApp ? 'provisioned' : 'not_installed';
// status ist IMMER 'not_installed'
```

**Auswirkung:** Die Documenso-API gibt immer `{ status: 'not_installed', url: null }` zurück, selbst wenn der Tenant `documenso` in seiner App-Liste hat. Das Feature ist vollständig kaputt.

**Fix:**
```typescript
const hasDocumenso = Array.isArray(tenant.apps) && tenant.apps.includes('documenso');
const status = hasDocumenso ? 'provisioned' : 'not_installed';
const domain = `sign.${tenant.name.toLowerCase().replace(/\s+/g, '-')}.irongeeks.eu`;
```

---

### 🟠 [HIGH-004] Fehlende VLAN-Uniqueness-Constraint im Prisma-Schema

**Datei:** `platform/webapp/prisma/schema.prisma:42–48`

**Problem:**
```prisma
model Tenant {
  id        String @id
  name      String @unique
  vlan      Int      // ← kein @@unique constraint
  ipAddress String   // ← kein @@unique constraint
  // ...
}
```
Die IP-Adresse wird aus der VLAN-ID deterministisch berechnet: `10.<VLAN>.10.100`. Ohne Uniqueness-Constraint können zwei Tenants dieselbe VLAN-ID bekommen und identische IPs erhalten.

**Auswirkung:** Netzwerk-Kollisionen bei der Provisionierung. Ansible schreibt beide Tenants auf dieselbe IP.

**Fix:**
```prisma
model Tenant {
  // ...
  @@unique([vlan])
  @@unique([ipAddress])
}
```

---

### 🟠 [HIGH-005] `nowClock()` speichert Locale-formatierte Zeit statt ISO 8601

**Datei:** `platform/webapp/lib/data-store.ts:120` und `platform/webapp/lib/db/data-store-db.ts:11`

**Problem:**
```typescript
function nowClock() {
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  // → gibt "14:22" zurück, nicht "2026-03-10T14:22:00.000Z"
}

// Wird für startedAt/updatedAt verwendet:
const job: Job = {
  startedAt: nowClock(),  // → "14:22"
  updatedAt: nowClock()   // → "14:22"
};
```
Auch in der Prisma-Schema-Definition:
```prisma
startedAt  String   // "kept as clock string for UI compatibility"
updatedAt  String?
```

**Auswirkung:** 
- `startedAt: "14:22"` kann nicht zwischen Tagen unterscheiden.
- Kein Date-Sort möglich (string sort "14:22" > "09:00" aber nicht tagübergreifend).
- `Date.parse("14:22")` gibt `NaN` zurück — `enforceAuditCap` und Phase-Duration-Berechnungen im Engine versagen bereits korrekt, aber für Job-Zeitstempel ist das ungültig.
- Timezone-abhängig: `de-DE` Locale auf UTC-Servern produziert CET-Zeiten.

**Fix:**
```typescript
function nowIso(): string {
  return new Date().toISOString();
}
```
Prisma-Schema:
```prisma
startedAt  DateTime @default(now())
updatedAt  DateTime? @updatedAt
```

---

### 🟡 [MEDIUM-001] Keine Pagination auf List-Endpoints

**Dateien:** `platform/webapp/lib/db/data-store-db.ts:49`, `platform/webapp/app/api/tenants/route.ts:10–12`

**Problem:**
```typescript
export async function dbListTenants(): Promise<Tenant[]> {
  const db = getDbClient();
  const rows = await db.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  // ↑ kein take/skip — lädt ALLE Tenants
  return rows.map((r) => dbTenantToTenant(r as unknown as Record<string, unknown>));
}
```
Identisch für `dbListJobs()`, `dbListDeployments()`, `dbListReports()`.

**Auswirkung:** Bei 1000+ Tenants oder Jobs: hohe Datenbanklatenz, erhöhter Speicherverbrauch, langsame API-Antworten. `listAuditEvents` hat bereits `limit`, aber die Business-Daten haben keines.

**Fix:**
```typescript
export async function dbListJobs(opts?: { limit?: number; offset?: number }): Promise<Job[]> {
  const db = getDbClient();
  return db.job.findMany({
    orderBy: { createdAt: 'desc' },
    take: opts?.limit ?? 100,
    skip: opts?.offset ?? 0
  });
}
```

---

### 🟡 [MEDIUM-002] `request.json()` ohne Fehlerbehandlung in `POST /api/jobs`

**Datei:** `platform/webapp/app/api/jobs/route.ts:16`

**Problem:**
```typescript
export async function POST(request: Request) {
  const authz = await requireProtectedOperation(request, 'POST /api/jobs');
  if (!authz.ok) return authz.response;

  const body = (await request.json()) as Partial<CreateJobInput>;  // ← kein .catch()!
```
Wenn der Client einen invaliden JSON-Body schickt (z.B. leer, oder `Content-Type: text/plain`), wirft `request.json()` eine Exception, die nicht gefangen wird — Next.js liefert einen unformattierten 500-Fehler ohne `correlationId`.

Im Vergleich macht `POST /api/provision/tenant` es korrekt:
```typescript
const body = (await request.json().catch(() => ({}))) as ProvisionRequest;
```

**Auswirkung:** Inkonsistentes Fehler-Format; kein strukturierter Error-Response.

**Fix:**
```typescript
const body = (await request.json().catch(() => ({}))) as Partial<CreateJobInput>;
```

---

### 🟡 [MEDIUM-003] Fehlende DB-Indizes auf `jobs`-Tabelle

**Datei:** `platform/webapp/prisma/schema.prisma:63–82`

**Problem:**
```prisma
model Job {
  id            String    @id
  tenantName    String?
  status        JobStatus @default(Queued)  // kein Index
  correlationId String?                      // kein Index
  // ...
  tenant Tenant? @relation(fields: [tenantName], references: [name])
  // ↑ FK-Index auf tenantName? Prisma erstellt keinen automatisch für optionale Relations!
}
```
Die Audit-Events haben korrekte Indizes:
```prisma
@@index([tenantId])
@@index([timestamp])
@@index([outcome])
@@index([action])
```
Jobs haben keinen.

**Auswirkung:** `WHERE status = 'Running'` und `WHERE correlationId = '...'` führen zu Full-Table-Scans. Bei wachsender Job-History wird das Provisioning-Dashboard spürbar langsamer.

**Fix:**
```prisma
model Job {
  // ...
  @@index([status])
  @@index([correlationId])
  @@index([tenantName])
}
```

---

### 🟡 [MEDIUM-004] `PrismaClient` mit `require()` initialisiert

**Datei:** `platform/webapp/lib/db/client.ts:28`

**Problem:**
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

export function getDbClient() {
  if (!_client) {
    const { PrismaClient } = require('../../generated/prisma') as typeof import('../../generated/prisma');
    _client = new PrismaClient({ ... });
  }
  return _client!;
}
```
`require()` ist CommonJS in einem ESM-Codebase (`"module": "esnext"` in tsconfig). Der `eslint-disable` Kommentar ist ein Signal, dass hier etwas nicht stimmt. `_client` ist `any`, was alle Typsicherheit für DB-Queries verliert.

**Auswirkung:** `_client!` hat den Typ `any` — kein TypeScript-Feedback bei falschen Query-Strukturen.

**Fix:**
```typescript
import type { PrismaClient } from '../../generated/prisma';

let _client: PrismaClient | null = null;

export function getDbClient(): PrismaClient {
  if (!_client) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient: PC } = require('../../generated/prisma') as { PrismaClient: typeof import('../../generated/prisma').PrismaClient };
    _client = new PC({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
  }
  return _client;
}
```
Oder noch besser: `instrumentation.ts` für Singleton-Initialisierung nutzen.

---

### 🟡 [MEDIUM-005] Kein Audit-Event für `GET /api/tenants` und `GET /api/jobs`

**Dateien:** `platform/webapp/app/api/tenants/route.ts:8–12`, `platform/webapp/app/api/jobs/route.ts:7–11`

**Problem:**
```typescript
export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/tenants');
  if (!authz.ok) return authz.response;

  const items = await listTenants();
  return NextResponse.json({ items });
  // ← kein appendAuditEvent!
}
```
Alle Schreiboperationen emittieren Audit-Events. Lesende Massenabfragen (alle Tenants, alle Jobs) nicht. Im Gegensatz dazu: `GET /api/alerts/config` und `GET /api/tenants/[id]/documenso` loggeln Lesezugriffe korrekt.

**Auswirkung:** Kompromittierte Credentials, die Tenant-Listen exfiltrieren, hinterlassen keine Spur.

**Fix:**
```typescript
export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/tenants');
  if (!authz.ok) return authz.response;

  const correlationId = getCorrelationIdFromRequest(request);
  await appendAuditEvent(buildAuditEvent({
    correlationId,
    actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
    tenantId: 'system',
    action: 'tenant.list.accessed',
    resource: 'tenant',
    outcome: 'success',
    source: { service: 'webapp', operation: 'GET /api/tenants' }
  }));

  const items = await listTenants();
  return NextResponse.json({ items });
}
```

---

### 🟡 [MEDIUM-006] Fehlende Input-Validierung: `name`, `customer`, `region` sind Free-Form

**Datei:** `platform/webapp/app/api/tenants/route.ts:50–65`

**Problem:**
Das `POST /api/tenants`-Handler validiert:
- ✅ `size` (Enum-Check)  
- ✅ `authMode` (Enum-Check)  
- ✅ `vlan` (Integer, 2–4094)  
- ❌ `name` — keine Länge, kein Format, kein Uniqueness-Check vor DB-Insert
- ❌ `customer` — beliebiger String
- ❌ `region` — beliebiger String (kein Enum)
- ❌ `contactEmail` — kein E-Mail-Format-Check

`name` hat `@unique` im Prisma-Schema, aber der Fehler wird generic gefangen:
```typescript
} catch {
  // Zeile ~180
  return NextResponse.json({ error: 'Failed to create tenant.', correlationId }, { status: 500 });
}
```
Ein Duplikat-`name`-Fehler wird als 500 statt 409 Conflict zurückgegeben.

**Fix:**
```typescript
// Vor dem DB-Insert:
if (!/^[a-zA-Z0-9 _-]{3,80}$/.test(body.name)) {
  return NextResponse.json({ error: 'Tenant name must be 3-80 alphanumeric characters.' }, { status: 400 });
}
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRe.test(body.contactEmail)) {
  return NextResponse.json({ error: 'Invalid contactEmail format.' }, { status: 400 });
}

// Im catch-Block:
} catch (err) {
  if (err instanceof Error && err.message.includes('Unique constraint')) {
    return NextResponse.json({ error: 'Tenant name already exists.' }, { status: 409 });
  }
  // ...
}
```

---

### 🟢 [LOW-001] Keine Error-Boundaries im Frontend

**Dateien:** `platform/webapp/app/layout.tsx`, `platform/webapp/components/page-shell.tsx`

**Problem:**
```typescript
// layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DevRoleProvider />
        {children}   {/* ← kein Error-Boundary */}
      </body>
    </html>
  );
}
```
Keine `ErrorBoundary`-Komponente auf App- oder Page-Ebene. Jeder unbehandelte Render-Fehler (z.B. `tenant.name.toLowerCase()` auf `undefined`) führt zu einem Blank-Screen.

**Fix:**
```tsx
// components/error-boundary.tsx
'use client';
import { Component, ReactNode } from 'react';

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false };
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="rounded-xl bg-rose-50 p-6 text-rose-800">
          <h2>Something went wrong</h2>
          <pre className="text-xs">{this.state.error?.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
```

---

### 🟢 [LOW-002] Multi-Step-Form ohne Per-Step-Validierung

**Datei:** `platform/webapp/app/tenants/new/page.tsx:75–110`

**Problem:**
```typescript
// Zeile 111 (Next-Button)
<button type="button" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>
  Next
</button>
```
Kein `validate()`-Aufruf vor Schritt-Wechsel. Nutzer können mit leerem `tenantName` bis zur "Review"-Seite navigieren und erst beim Submit einen Fehler bekommen. `contactEmail` wird ohne E-Mail-Format-Check akzeptiert.

**Fix:** Per-Step-Validierungsfunktion vor `setStep`:
```typescript
function validateCurrentStep(): string | null {
  if (step === 0) {
    if (!form.tenantName.trim()) return 'Tenant Name is required.';
    if (!form.customerName.trim()) return 'Customer Name is required.';
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(form.contactEmail)) return 'Valid contact email required.';
  }
  if (step === 2) {
    const v = Number(form.vlan);
    if (!Number.isInteger(v) || v < 2 || v > 4094) return 'VLAN must be 2–4094.';
  }
  return null;
}
```

---

### 🟢 [LOW-003] Navigation zeigt Admin-Routen für alle Rollen

**Datei:** `platform/webapp/components/navigation.tsx:6–11`

**Problem:**
```typescript
const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/customers', label: 'Customers' },
  { href: '/tenants/new', label: 'New Tenant' },
  // ...
  { href: '/admin/security', label: 'Admin Security' }  // ← immer sichtbar
];
```
`/admin/security` ist für alle Benutzer in der Navigation sichtbar. Die API-Endpoints sind korrekt durch `requireProtectedOperation` geschützt, aber die UI-Route leakt Information über die Existenz dieser Seite.

**Fix:**
```typescript
const allNavItems = [
  { href: '/', label: 'Dashboard', role: undefined },
  // ...
  { href: '/admin/security', label: 'Admin Security', role: 'admin' as const },
];

// In der Navigation-Komponente (mit DevRole-Context):
const navItems = allNavItems.filter(item => !item.role || currentRole === item.role);
```

---

## 4. Code-Duplikation

### DUP-001: `nowClock()` in zwei Dateien identisch definiert

**Dateien:** `platform/webapp/lib/data-store.ts:120` und `platform/webapp/lib/db/data-store-db.ts:11`

```typescript
// Exakt gleich in beiden Dateien:
function nowClock() {
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
```

**Fix:** In `lib/types.ts` oder `lib/utils.ts` extrahieren und importieren. (Besser: durch `nowIso()` ersetzen — siehe MEDIUM-005.)

---

### DUP-002: `buildAuditEvent` + `appendAuditEvent` Boilerplate in jedem Route-Handler

Jeder Route-Handler wiederholt dasselbe 12-Zeilen-Pattern:
```typescript
await appendAuditEvent(
  buildAuditEvent({
    correlationId,
    actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
    tenantId: body.name?.trim() || 'unknown',
    action: 'tenant.create.requested',
    resource: 'tenant',
    outcome: 'success',
    source: { service: 'webapp', operation: 'POST /api/tenants' },
    details: { dryRun: false }
  })
);
```
Dieses Pattern tritt 6× in `POST /api/tenants`, 8× in `POST /api/provision/tenant`, und 3× in `POST /api/alerts/config` auf.

**Fix:** Helper-Factory:
```typescript
// lib/audit.ts
export function makeAuditLogger(
  base: Pick<AuditEvent, 'correlationId' | 'actor' | 'source'>
) {
  return (event: Omit<AuditEvent, 'eventId' | 'timestamp' | 'correlationId' | 'actor' | 'source'>) =>
    appendAuditEvent(buildAuditEvent({ ...base, ...event }));
}

// Usage in route:
const log = makeAuditLogger({ correlationId, actor, source: { service: 'webapp', operation: 'POST /api/tenants' } });
await log({ tenantId: body.name ?? 'unknown', action: 'tenant.create.requested', resource: 'tenant', outcome: 'success' });
```

---

### DUP-003: Tenant-Slug-Berechnung in drei Dateien

```typescript
// Dieselbe Logik in:
// app/api/tenants/[id]/ansible-inventory/route.ts:20-26
// app/api/tenants/[id]/traefik-config/route.ts:24-29  
// lib/provisioning.ts (indirekt über tenant.name)

const tenantSlug = tenant.name
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);
```

**Fix:** Utility-Funktion in `lib/types.ts` oder `lib/utils.ts`:
```typescript
export function toTenantSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
```

---

### DUP-004: `as unknown as Record<string, unknown>` durchgehend in `data-store-db.ts`

```typescript
// Zeilen 49, 55, 60, 71, 76, 172, 184, 230, 279...
return rows.map((r) => dbTenantToTenant(r as unknown as Record<string, unknown>));
```
Dieser Cast existiert, weil `dbTenantToTenant` `Record<string, unknown>` statt den Prisma-generierten Typen akzeptiert.

**Fix:** Prisma-Typen direkt verwenden:
```typescript
import type { Tenant as PrismaTenant } from '../../generated/prisma';

function dbTenantToTenant(row: PrismaTenant): Tenant {
  return {
    id: row.id,
    name: row.name,
    // ... typisiert, kein Cast nötig
  };
}
```

---

## 5. Fehlende Tests

Die Testsuite hat 19 Dateien und deckt Kernlogik gut ab. Folgende Bereiche fehlen vollständig:

| # | Bereich | Fehlt | Risiko |
|---|---------|-------|--------|
| T-01 | API-Routen | Kein einziger HTTP-Level-Test (fetch-basiert) | 🔴 Hoch |
| T-02 | `data-store.ts` (File-Mode) | Race Condition, `fileCreateTenant`, `fileUpdateJob` | 🔴 Hoch |
| T-03 | `data-store-db.ts` | Alle DB-Funktionen ungetestet (kein Mock/Integration) | 🔴 Hoch |
| T-04 | `provisioning-engine.ts` | `executeVmCreate` Retry-Logik, `executeHealthVerify` Timeout-Verhalten | 🟠 Mittel |
| T-05 | Admin Policy-Override Flow | `policyOverride=true` + `ipAddress` korrekt gespeichert? | 🟠 Mittel |
| T-06 | Concurrent Provisioning | Zwei simultane Jobs für denselben Tenant | 🟠 Mittel |
| T-07 | `provisioning.ts` `materializeProvisionFiles` | Datei-Erstellung, Pfade | 🟡 Niedrig |
| T-08 | Frontend-Komponenten | Keine React-Tests (keine Testing Library) | 🟡 Niedrig |
| T-09 | `buildAuditEvent` `details` Redact | Sensitive Keys (`password`, `apiKey`) im Details-Objekt | 🟡 Niedrig |
| T-10 | Job-Recovery nach Prozess-Restart | Stuck-Jobs-Detection | 🟠 Mittel |

**Besonders kritisch (T-01):** Es gibt keinen einzigen Test, der `POST /api/tenants` aufruft und validiert, dass der HTTP-Response-Code, die Validierung und Audit-Events korrekt zusammenspielen. Die gesamte Route-Handler-Logik (z.B. die policyOverride-Auditierung) ist ohne HTTP-Tests ungetestet.

**Empfohlener Quickstart:**
```typescript
// tests/api-tenants.test.ts
import { POST } from '../app/api/tenants/route';
import { NextRequest } from 'next/server';

test('POST /api/tenants rejects missing authMode', async () => {
  const req = new NextRequest('http://localhost/api/tenants', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test', customer: 'c', region: 'eu-central-1', 
                           size: 'M', vlan: 100, contactEmail: 'a@b.de', maintenanceWindow: 'Sun' })
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error.includes('authMode'));
});
```

---

## 6. Datenbank-Analyse

### Schema-Bewertung

| Tabelle | Problem | Severity |
|---------|---------|----------|
| `tenants` | Kein `@@unique([vlan])` — IP-Kollision möglich | 🔴 |
| `jobs` | `startedAt String` statt `DateTime` — kein Date-Sort | 🟠 |
| `jobs` | Keine Indizes auf `status`, `correlationId`, `tenantName` | 🟡 |
| `deployments` | `updatedAt String` statt `DateTime` | 🟠 |
| `reports` | `generatedAt String` statt `DateTime` | 🟡 |
| `audit_events` | Kein Partitionierungs-/Archivierungsplan für Wachstum | 🟡 |
| `notification_config` | Singleton-Pattern (`@id @default("default")`) — funktioniert, aber unflexibel bei Multi-Config | 🟢 |

### N+1-Analyse

Kein N+1-Problem gefunden — alle Queries sind Flat-Selects ohne verschachtelte Relations in Loops. Die `Job`-Relation auf `Tenant` nutzt `tenant` nur in `dbCreateTenant`, wo ein `$transaction` beide atomisch anlegt (korrekt).

### Migration-Vollständigkeit

`001_initial_schema.sql` und `schema.prisma` sind synchron. Die Migration enthält korrekte `CREATE INDEX`-Statements für `audit_events`, aber fehlt für `jobs`:
```sql
-- Fehlt in 001_initial_schema.sql:
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_correlation_id ON jobs(correlation_id);
CREATE INDEX idx_jobs_tenant_name ON jobs(tenant_name);
```

---

## 7. TypeScript-Qualität

### Positive Befunde
- `"strict": true` konsequent durchgehalten
- Gute Nutzung von `unknown` in Eingabe-Validierung (`validateAuditEnvelope`)
- Discriminated Unions korrekt genutzt (`RateLimitResult: { allowed: true } | { allowed: false; retryAfterSeconds: number }`)
- Type-Guards (`isRecord()`) vorhanden
- Keine `any` in Kernbusiness-Logik (außer `client.ts`)

### Problematische Patterns

#### TS-001: `as unknown as Record<string, unknown>` — Prisma-Typ-Erasure

**Datei:** `lib/db/data-store-db.ts:49,55,60,71,76,...`

```typescript
// Jedes Prisma-Result wird zu Record<string,unknown> downgecastet:
return rows.map((r) => dbTenantToTenant(r as unknown as Record<string, unknown>));

// dbTenantToTenant akzeptiert Record<string,unknown>:
function dbTenantToTenant(row: Record<string, unknown>): Tenant {
  return {
    id: row.id as string,     // ← kein compile-time check
    name: row.name as string, // ← TypeScript sieht das nicht
  };
}
```
Wenn Prisma-Schema sich ändert (Spalte umbenannt), gibt es keinen TypeScript-Fehler — erst Runtime-Crash.

#### TS-002: `_client: any` in `client.ts`

```typescript
let _client: any = null;
// ...
return _client!;
```
Der gesamte Prisma-Client verliert seinen Typ.

#### TS-003: `body as Record<string, unknown>` Casting in Documenso-Route

```typescript
const apps: Record<string, unknown>[] = Array.isArray((tenant as Record<string, unknown>).apps)
  ? ((tenant as Record<string, unknown>).apps as Record<string, unknown>[])
  : [];
```
`tenant` ist bereits als `Tenant` getypt (`tenant.apps: string[] | undefined`) — der Cast ist nicht nur falsch, sondern auch unnötig.

---

## 8. Empfehlungen (priorisiert)

### Priorität 1 — Sofort (Korrektheit/Datenverlust)

1. **CRITICAL-001 fixen**: `dbCreateTenant` muss `input.ipAddress` honorieren.
2. **CRITICAL-003 beheben**: Stuck-Job-Recovery-Scan beim App-Start implementieren.
3. **HIGH-003 fixen**: Documenso-Route `string[]`-Cast korrigieren.
4. **HIGH-004 fixen**: `@@unique([vlan])` zum Prisma-Schema hinzufügen + Migration generieren.

### Priorität 2 — Kurzfristig (Sicherheit/Datenqualität)

5. **HIGH-001/HIGH-002 fixen**: Bearer-Token hashen, X-Forwarded-For validieren.
6. **HIGH-005 + MEDIUM-001**: `nowClock()` durch `nowIso()` ersetzen, DB-Schema auf `DateTime` migrieren.
7. **MEDIUM-001**: Pagination auf alle List-Endpoints.
8. **MEDIUM-006**: `name`-Validierung und Email-Format-Check; Prisma-Duplicate-Key-Fehler als 409 zurückgeben.

### Priorität 3 — Mittelfristig (Code-Qualität/Tests)

9. **TS-001/TS-002**: Prisma-Typen direkt verwenden statt `as unknown as Record<string,unknown>`.
10. **T-01**: HTTP-Level-Tests für alle API-Routen (Next.js `NextRequest`-basiert).
11. **DUP-002**: `makeAuditLogger`-Helper extrahieren.
12. **DUP-003**: `toTenantSlug` in shared utils.
13. **DUP-001**: `nowClock()` deduplizieren (und durch ISO 8601 ersetzen).

### Priorität 4 — Langfristig (Architektur)

14. **CRITICAL-003 (langfristig)**: BullMQ oder Postgres-SKIP-LOCKED Job-Queue für Background-Provisioning.
15. **CRITICAL-002**: File-Store Locking oder SQLite-Migration für Dev-Mode.
16. **LOW-001**: Error-Boundaries auf App- und Page-Ebene.
17. **LOW-003**: RBAC-basiertes Nav-Filtering.
18. **AuditLog-Archivierung**: Partitionierungs-Strategie für `audit_events` (z.B. monatliche Partitionen via `pg_partman`).

---

*Audit durchgeführt am 10.03.2026. Alle Zitate beziehen sich auf den aktuellen Stand des `platform/webapp/`-Verzeichnisses. Befunde in diesem Bericht sind nach tatsächlichem Code verifiziert, nicht generisch.*
