# REVIEW-025 — Full Codebase Code Review

**Project:** GMZ Cloud Business Apps  
**Date:** 2026-03-09  
**Reviewer:** BMAD Subagent (automated)  
**Scope:** Security · Architecture · Code Quality · Infrastructure · Observability  
**Status:** ✅ Complete

---

## Executive Summary

GMZ Cloud Business Apps is a well-structured SaaS platform management application built on Next.js 14, OpenTofu (Terraform-compatible), Ansible, and a Prometheus/Grafana/Loki monitoring stack. The codebase shows strong engineering discipline — consistent RBAC enforcement, thorough audit logging, good secret hygiene patterns, a growing test suite, and well-documented CI/CD pipelines.

This review identifies **2 Critical**, **7 High**, **12 Medium**, and **8 Low** findings. No findings suggest active exploits or leaked credentials in the repository. The critical items are addressable configuration and architecture gaps rather than fundamental design flaws.

---

## Table of Contents

1. [Security](#1-security)
2. [Architecture](#2-architecture)
3. [Code Quality](#3-code-quality)
4. [Infrastructure](#4-infrastructure)
5. [Observability](#5-observability)
6. [Summary Table](#6-summary-table)
7. [Recommended Priority Actions](#7-recommended-priority-actions)

---

## 1. Security

### 🔴 CRITICAL — SEC-001: Default Auth Mode is `dev-header` (No Real Authentication in Production)

**File:** `platform/webapp/lib/auth-core.ts:64`  
**Finding:** `resolveAuthMode()` defaults to `'dev-header'` when `WEBAPP_AUTH_MODE` is unset. In dev-header mode, the API trusts the `x-user-role` and `x-user-id` HTTP headers sent by the client. Any actor that can reach the API can impersonate any role.

```typescript
const DEFAULT_AUTH_MODE: AuthMode = 'dev-header';  // ← dangerous default
```

`dev-header` is also injected automatically by `DevRoleProvider` on all same-origin API calls when `NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH=true`.

**Risk:** If `WEBAPP_AUTH_MODE` is forgotten in a production deployment, the entire RBAC system is trivially bypassed by setting `x-user-role: admin`.

**Recommendation:**
- Change the default to a safe fallback that rejects all requests (e.g. `'trusted-bearer'`) or throw an explicit startup error when `WEBAPP_AUTH_MODE` is not set in non-development environments.
- Add a startup guard in `resolveAuthMode()`:
  ```typescript
  if (process.env.NODE_ENV === 'production' && !process.env.WEBAPP_AUTH_MODE) {
    throw new Error('WEBAPP_AUTH_MODE must be explicitly set in production');
  }
  ```
- Ensure `NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH` is `false` (or absent) in all non-dev environments and document this as a required production checklist item.

---

### 🔴 CRITICAL — SEC-002: Committed `.env` File Contains a Database API Key

**File:** `platform/webapp/.env`  
**Finding:** A `.env` file is committed to the repository containing a `DATABASE_URL` with an embedded API key:

```
DATABASE_URL="prisma+postgres://localhost:51213/?api_key=eyJkYXRhYmFzZVVybCI6InBvc3Rn..."
```

While this particular key appears to be a local Prisma dev server key (the comment says it "does not contain any sensitive information"), the file is real, tracked by git, and sets a precedent that normalises committed credentials.

**Risk:** Future developers may follow the same pattern and commit real database credentials. The `.gitignore` blocks `.env` at root but not inside subdirectories if the rule is not recursive. The file at `platform/webapp/.env` exists in the repository.

**Recommendation:**
- Remove `platform/webapp/.env` from git history (`git rm --cached` + BFG Repo Cleaner or `git filter-repo`).
- Replace with `platform/webapp/.env.example` (already the expected pattern per `.gitignore`).
- Verify `.gitignore` rule `platform/webapp/.env` (or `**/.env`) blocks it everywhere.
- Add a gitleaks custom rule targeting `DATABASE_URL` with embedded base64 tokens.

---

### 🟠 HIGH — SEC-003: No HTTP Security Headers on the Next.js Application

**File:** `platform/webapp/next.config.mjs`  
**Finding:** `next.config.mjs` only sets `reactStrictMode: true`. There are no HTTP security headers configured:

- No `Content-Security-Policy`
- No `Strict-Transport-Security` (HSTS)
- No `X-Frame-Options`
- No `X-Content-Type-Options`
- No `Referrer-Policy`
- No `Permissions-Policy`

Traefik handles TLS termination but does not add application-level headers either (only the dashboard IP allowlist middleware is configured).

**Risk:** XSS, clickjacking, and information-leakage attacks are possible without these headers.

**Recommendation:** Add a `headers()` function to `next.config.mjs`:
```javascript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; ..." },
    ],
  }];
}
```

---

### 🟠 HIGH — SEC-004: No Rate Limiting on Any API Endpoint

**Files:** All `platform/webapp/app/api/*/route.ts`  
**Finding:** Zero rate-limiting or throttling is applied to any API route. The provisioning endpoint (`POST /api/provision/tenant`) in particular executes shell commands (OpenTofu, Ansible) and is guarded only by RBAC — but in `trusted-bearer` mode a stolen token could trigger repeated provisioning attempts.

**Risk:** DoS via exhausting Proxmox resources or overwhelming the file-based audit log. Brute-force of token space in `trusted-bearer` mode (though timing attacks are partially mitigated by constant-time comparison).

**Recommendation:**
- Add `next-rate-limit` or implement in-process token-bucket middleware.
- At minimum rate-limit the provisioning endpoint (e.g. 5 req/min per token).
- Consider adding a Next.js `middleware.ts` to apply rate-limiting at the edge before route handlers run.

---

### 🟠 HIGH — SEC-005: Vault Renewal and AppRole Integration is a Stub

**File:** `platform/webapp/lib/vault-token.ts:120–152`  
**Finding:** `renewVaultLease()` is a documented stub. The Vault AppRole / Kubernetes auth path is never called. `buildVaultToken()` and `buildOidcToken()` exist but are never wired into `getAuthContextFromRequestAsync()`.

**Impact:** The `AbstractToken` abstraction layer implies production-readiness. If operators configure `WEBAPP_AUTH_MODE=vault` believing it is functional, they will receive no actual token validation — the system's behaviour is undefined.

**Recommendation:**
- Either remove the `vault` source type and `buildVaultToken()` until it is implemented, or add a clear runtime guard that throws `Error('Vault auth mode not yet implemented')`.
- Minimally document in `vault-token.ts` that these are design stubs and that `WEBAPP_AUTH_MODE=vault` is not a valid production value.

---

### 🟠 HIGH — SEC-006: Provisioning Engine Executes Shell Commands Without Sanitization

**File:** `platform/webapp/lib/provisioning.ts:104–130`  
**Finding:** The provisioning plan builder constructs shell commands from tenant data:

```typescript
const tenantSlug = slugify(tenant.name);
// ... used directly in command strings passed to exec()
```

`slugify()` limits output to `[a-z0-9-]` and truncates to 40 chars — this is good. However, `proxmoxEndpoint` and `proxmoxApiToken` come from environment variables and are embedded verbatim into tfvars files via `toHclString()` (JSON-stringified). The actual `tofu apply` and `ansible-playbook` commands are assembled in `provisioning-engine.ts` and executed via Node's `child_process.exec()`, which passes commands to a shell.

**Risk:** If environment variables `PROVISION_PROXMOX_ENDPOINT` or `PROVISION_PROXMOX_API_TOKEN` are compromised (e.g. injected through a misconfigured secret manager), command injection is possible.

**Recommendation:**
- Switch from `exec()` (shell) to `execFile()` (no shell) using argument arrays.
- Validate `PROVISION_PROXMOX_ENDPOINT` format at startup (regex already exists in tfvars, apply it in code too).
- Add integration test that attempts command injection through `tenantName` — verify `slugify()` neutralises it.

---

### 🟠 HIGH — SEC-007: No Next.js Middleware — All Auth is Route-Handler-Only

**Finding:** There is no `middleware.ts`. Authentication is enforced only inside individual route handler functions via `requireProtectedOperation()`. This means:

1. A developer adding a new route can accidentally omit the auth guard.
2. Static assets under `/api/` paths could be served unauthenticated if routes are misconfigured.
3. There is no centralised place to apply CSRF protection, correlation ID injection, or request logging.

**Recommendation:**
- Add `middleware.ts` at `platform/webapp/` to enforce authentication for all `/api/` routes at the Next.js edge layer.
- Implement CSRF protection for state-mutating endpoints (relevant when `dev-header` or cookie-based auth is in use).
- Use middleware to inject `X-Correlation-ID` headers for all requests.

---

### 🟡 MEDIUM — SEC-008: SMTP Password Stored in Plain Text in `.data/notification-config.json`

**File:** `platform/webapp/lib/notification-config.ts`  
**Finding:** `writeNotificationConfig()` persists the full notification config (including `smtpPass` and Teams `webhookUrl`) to `.data/notification-config.json` in plain text. The masking in `maskNotificationConfig()` is only applied to API responses — it is not applied to storage.

**Recommendation:**
- Encrypt sensitive fields at rest using `crypto.createCipheriv` with a key from an environment variable.
- Alternatively, store only references to secrets manager entries (not the secrets themselves).
- When using the PostgreSQL backend, use Prisma-level field encryption or store in a separate secrets table with tighter ACL.

---

### 🟡 MEDIUM — SEC-009: `PROVISION_ROLLBACK_HOOK_CMD` Allows Arbitrary Command Execution

**File:** `platform/webapp/app/api/provision/tenant/route.ts:200–210`  
**Finding:** `PROVISION_ROLLBACK_HOOK_CMD` is an environment variable whose value is passed directly to `runRollbackHook()` → `exec(command)`. There are no restrictions on what this command can be.

**Risk:** If an attacker can control this environment variable (e.g., via container env var injection), they can achieve arbitrary command execution on the server.

**Recommendation:**
- Validate `PROVISION_ROLLBACK_HOOK_CMD` at startup: must be a known safe path or allowlisted command pattern.
- Consider replacing with a fixed rollback script path and pass parameters as verified arguments, not a free-form command string.

---

## 2. Architecture

### 🟠 HIGH — ARCH-001: Dual Storage Backend Creates Split-Brain Risk

**Files:** `platform/webapp/lib/data-store.ts`, `platform/webapp/lib/db/client.ts`  
**Finding:** The application supports two mutually exclusive storage backends: a file-based JSON store (`.data/store.json`) and PostgreSQL via Prisma. The switch is runtime-controlled by `DATABASE_URL`.

Problems:
- No migration path from file-store data to PostgreSQL.
- Seed data is only applied in file-store mode; PostgreSQL starts empty unless `--seed` is passed to `db-migrate.ts`.
- If `DATABASE_URL` is set but Prisma client is not generated (`prisma generate` not run), the app silently fails at runtime rather than failing at startup.
- The `isDatabaseEnabled()` check is duplicated across many files — any module can bypass it.

**Recommendation:**
- Add a startup health check that verifies the configured backend is reachable and the schema is current.
- Centralise the "which backend" decision to a single data-access layer (repository pattern).
- Document the migration procedure from file-store to PostgreSQL in `README.md`.

---

### 🟠 HIGH — ARCH-002: RBAC Policy is a Plain JavaScript Object, Not Type-Safe

**File:** `platform/webapp/lib/rbac-policy.js`  
**Finding:** `RBAC_POLICY` is defined in a `.js` file (not `.ts`), uses JSDoc for types, and is referenced from TypeScript via `.js` imports. This means:

- `keyof typeof RBAC_POLICY` type narrowing works, but adding a new route requires manual policy entry — there is no compile-time enforcement.
- New API routes that are not in `RBAC_POLICY` will cause `getRequiredRoleForOperation()` to return `undefined`, and `hasMinimumRole(role, undefined)` will compute `ROLE_RANK[undefined] = undefined >= ROLE_RANK[role]` → `NaN >= N` → `false` (access denied) — this is a _safe_ failure, but it is silent and confusing.

**Recommendation:**
- Convert `rbac-policy.js` to `rbac-policy.ts`.
- Add a TypeScript type-check that all `RBAC_POLICY` keys match the actual registered route operation strings (could use a const assertion + exhaustiveness check).
- Add a unit test that verifies every API route file has a corresponding `RBAC_POLICY` entry.

---

### 🟡 MEDIUM — ARCH-003: File-Based Audit Log Has No Rotation or Size Limits

**File:** `platform/webapp/lib/audit.ts`  
**Finding:** Audit events are appended to `.data/audit.json` (file-store mode) or to the PostgreSQL `AuditEvent` table (DB mode). The file-store path has no rotation, compression, or size-cap logic. In active use, `audit.json` will grow without bound.

**Recommendation:**
- Add a max-entries cap (e.g. 100,000 records) with a rolling trim in `appendAuditEvent()`.
- Or implement log rotation using a date-stamped file per day.
- Add a CI test that verifies `listAuditEvents()` with filters returns bounded results.

---

### 🟡 MEDIUM — ARCH-004: Provisioning Engine Runs Synchronously in the API Request

**File:** `platform/webapp/lib/provisioning-engine.ts`  
**Finding:** The provisioning endpoint (`POST /api/provision/tenant`) blocks the HTTP response while running `tofu init`, `tofu plan`, `tofu apply`, and `ansible-playbook` sequentially. These steps can take minutes.

**Risk:** HTTP request timeout (Next.js default is 30s on Vercel, configurable on self-hosted). The client receives no progress updates during execution.

**Recommendation:**
- Move provisioning execution to a proper background job queue (BullMQ, or a simple DB-backed polling model already partially implemented via the `Job` table).
- The API should return `202 Accepted` with a `jobId` and provide a polling endpoint (`GET /api/jobs/:id`).
- The job table already exists — this is an incremental change.

---

### 🟡 MEDIUM — ARCH-005: No CORS Policy Defined

**Finding:** There are no CORS headers on any API route and no `middleware.ts` defining CORS behavior. The application is Next.js and same-origin by default, but:

- If the API is ever accessed from a different domain (e.g., a separate frontend, CLI, or mobile app), CORS errors will surface with no clear fix.
- The dev-header auth mode is particularly dangerous in a permissive CORS scenario.

**Recommendation:**
- Add explicit `Access-Control-Allow-Origin` headers in `middleware.ts` or `next.config.mjs`.
- Define an allowlist of trusted origins and reject others.

---

### 🟡 MEDIUM — ARCH-006: Health-Check Probe Uses Plain HTTP

**File:** `platform/webapp/lib/provisioning-engine.ts:421,449`  
**Finding:** The post-provisioning health verification probes the new tenant VM over plain HTTP:
```typescript
const healthUrl = `http://${ctx.plan.vars.ipAddress}:80/health`;
```

In a production multi-tenant environment, this is a MITM risk — a compromised VLAN could return a spoofed healthy response.

**Recommendation:**
- Use HTTPS health checks once Traefik is deployed on the tenant VM.
- Add certificate verification or at minimum a shared HMAC challenge/response to prevent spoofing.
- Make the health check URL scheme configurable via an environment variable (`PROVISION_HEALTH_CHECK_SCHEME`).

---

## 3. Code Quality

### 🟡 MEDIUM — CQ-001: Broad `catch {}` Blocks Swallow Errors Silently

**Files:** Multiple route handlers  
**Example:** `platform/webapp/app/api/tenants/route.ts:189`:
```typescript
} catch {
  await appendAuditEvent(...);
  return NextResponse.json({ error: 'Failed to create tenant.', correlationId }, { status: 500 });
}
```

The original error is not logged anywhere. Operators see "Failed to create tenant" with no actionable detail. The error is not included in the audit event's `details` field either.

**Recommendation:**
- Log the caught error to `console.error()` or a structured logger before responding.
- Include the error message (safely sanitised) in the audit event `details`.
- Consider a shared error handler utility that normalises error responses and ensures the error is always logged.

---

### 🟡 MEDIUM — CQ-002: No Request Body Validation Library (Manual Validation Only)

**Files:** All API route handlers  
**Finding:** Input validation is entirely manual (`if (!body.name || !body.customer || ...)`) with no schema validation library. This leads to:
- Incomplete validation (e.g., `body.name` could be a whitespace-only string).
- No validation of nested objects beyond specific auth-mode fields.
- No coercion or sanitisation of unexpected fields.

**Recommendation:**
- Adopt Zod for request body validation (already in the ecosystem of Next.js projects).
- Define schemas alongside types in a `lib/schemas/` directory.
- Replace manual checks with `schema.safeParse(body)` — the existing TypeScript types make this a smooth migration.

---

### 🟡 MEDIUM — CQ-003: `next: 14.2.5` — Outdated, Known CVEs

**File:** `platform/webapp/package.json`  
**Finding:** `next@14.2.5` was released in mid-2024. By March 2026, multiple patch releases have been published. Next.js 14 itself is approaching end-of-life as Next.js 15 is stable.

**Recommendation:**
- Run `npm audit` and upgrade to the latest Next.js 14 patch release at minimum.
- Evaluate Next.js 15 migration (App Router API differences are minimal for this project's use case).
- Pin the `nightly-updates.yml` workflow to also check for security advisories (`npm audit --audit-level=high`).

---

### 🟡 MEDIUM — CQ-004: `prisma@7.4.2` with `prisma-client` Generator (Non-Standard)

**File:** `platform/webapp/package.json`, `platform/webapp/prisma/schema.prisma`  
**Finding:** The schema uses `provider = "prisma-client"` (Prisma 6+ provider name) but `@prisma/client@7.4.2` and `prisma@7.4.2` are listed as dependencies — Prisma 7 does not exist as of late 2025. This suggests the version string may be incorrect or ahead of current stable.

**Recommendation:**
- Verify the correct Prisma version that supports `provider = "prisma-client"` generator.
- Pin to a verified stable release and validate with `npx prisma validate`.
- Add `db:validate` to the CI gate-evidence workflow to catch schema drift early.

---

### 🟢 LOW — CQ-005: `rbac-policy.js` is `.js` in a `.ts` Project

**File:** `platform/webapp/lib/rbac-policy.js`  
**Finding:** This is a `.js` file with JSDoc comments in an otherwise fully TypeScript project. It is imported with a `.js` extension from TypeScript files, which works with `"moduleResolution": "node16"` but is unusual and makes refactoring harder.

**Recommendation:** Convert to `rbac-policy.ts`. The JSDoc types already mirror the TypeScript types exactly.

---

### 🟢 LOW — CQ-006: `provisioning.ts:187` Duplicates API Token in tfvars

**File:** `platform/webapp/lib/provisioning.ts:110,187`  
**Finding:** `PROVISION_PROXMOX_API_TOKEN` is written into the generated `terraform.tfvars` file. This file is created in a temp work directory (`/tmp/...`) and is not committed, but it means the token is written to disk in plain text during provisioning.

**Recommendation:**
- Use Terraform environment variables (`TF_VAR_proxmox_api_token`) instead of writing the secret to a file.
- This avoids secret material touching the filesystem and simplifies the `materializeProvisionFiles()` function.

---

### 🟢 LOW — CQ-007: Dead Export `requireOperationRole` (Sync Version) Alongside Async Version

**File:** `platform/webapp/lib/auth-context.ts`  
**Finding:** `requireOperationRole()` (synchronous) and `requireProtectedOperation()` (async with audit) both exist. All route handlers use the async version. The sync version appears to be unused in production routes.

**Recommendation:** Search for all usages. If `requireOperationRole` is only used in tests, move it to a test utility. Remove from production exports.

---

### 🟢 LOW — CQ-008: Test Coverage Gaps

**Finding:** The test suite covers RBAC, auth context, token rotation, audit filters, provisioning size-map, and Traefik config. However:
- No tests for `provisioning.ts` command construction (command injection surface).
- No tests for `data-store.ts` PostgreSQL paths (requires a real DB or mock).
- No end-to-end tests for the provisioning API route flow (the `provisioning-e2e.test.ts` file exists but exercises `provisioning.ts` in isolation, not the API route).
- No tests for the `vault-token.ts` renewal stub state machine.

**Recommendation:**
- Add a test for `slugify()` edge cases including injection attempts.
- Add mock-based tests for PostgreSQL data-store paths using `jest.mock` or a PGlite in-memory backend.
- Add a route-level integration test for `POST /api/provision/tenant` using a test HTTP server.

---

## 4. Infrastructure

### 🟡 MEDIUM — INFRA-001: No Alertmanager — Prometheus Monitoring Has No Alert Routing

**Files:** `infra/monitoring/docker-compose.yml`, `infra/monitoring/prometheus/prometheus.yml`  
**Finding:** The monitoring stack deploys Prometheus, Grafana, Loki, and Promtail — but no Alertmanager. Prometheus has no `rule_files` or `alerting` configuration block. This means:
- No alerting rules are evaluated.
- No PagerDuty, Slack, email, or Teams routing for infrastructure alerts.
- The application has a sophisticated auth-alert dispatch system (Teams/email) but the infrastructure monitoring layer has zero alerting.

**Recommendation:**
- Add Alertmanager to `docker-compose.yml`.
- Add at minimum 3 Prometheus alert rules: high CPU, high memory, node_exporter target down.
- Wire Alertmanager → Teams webhook (consistent with the application's notification config approach).
- Add `rule_files` and `alerting` blocks to `prometheus.yml`.

---

### 🟡 MEDIUM — INFRA-002: Grafana Admin Password is `admin`/`admin` in Docker Compose

**File:** `infra/monitoring/docker-compose.yml:17-18`  
**Finding:**
```yaml
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=admin
```

These are the default Grafana credentials hardcoded in the compose file. While Grafana prompts for a password change on first login, this is not enforced programmatically and is a common misconfiguration.

**Recommendation:**
- Replace with references to Docker secrets or environment variable substitution: `${GRAFANA_ADMIN_PASSWORD}`.
- Add to deployment checklist: Grafana password must be changed before production exposure.
- Consider using `GF_SECURITY_DISABLE_INITIAL_ADMIN_CREATION=true` and provisioning the admin user via the Grafana API with a strong random password at deploy time.

---

### 🟡 MEDIUM — INFRA-003: Promtail Only Scrapes `/var/log/syslog` — Application Logs Not Collected

**File:** `infra/monitoring/promtail/config.yml`  
**Finding:** Promtail is configured to scrape only `/var/log/syslog`. The Next.js application's stdout/stderr logs are not collected. Audit events are stored in `.data/audit.json` (file-store mode) or PostgreSQL — neither is shipped to Loki.

**Recommendation:**
- Add Promtail scrape config for the Next.js container stdout:
  ```yaml
  - job_name: webapp
    static_configs:
      - targets: [localhost]
        labels:
          job: webapp
          __path__: /var/log/containers/webapp*.log
  ```
- Add a dedicated scrape job for audit events (either a file tail or a Loki push from the audit module).
- Consider adding `/api/monitoring/status` response data to a Prometheus custom metrics endpoint.

---

### 🟡 MEDIUM — INFRA-004: OpenTofu State Has No Remote Backend Configured

**Files:** `infra/opentofu/environments/prod/main.tf`, `infra/opentofu/environments/lab/main.tf`  
**Finding:** Neither environment configures a `terraform { backend {} }` block. OpenTofu defaults to local state (`terraform.tfstate`). The provisioning engine materialises files in a temp directory — local state created there is ephemeral and lost after the process exits.

**Risk:**
- State drift: if provisioning runs twice for the same tenant, OpenTofu will treat it as a fresh apply with no existing state, potentially creating duplicate VMs.
- No state locking: concurrent provisioning runs for different tenants share no lock, but sequential re-runs could corrupt state.

**Recommendation:**
- Configure a remote backend (S3-compatible, e.g. MinIO on the management VM, or Terraform Cloud).
- Use the tenant slug/job ID as the state key prefix to isolate per-tenant state.
- Add state backend configuration as a required checklist item before enabling `PROVISION_EXECUTION_ENABLED=true`.

---

### 🟢 LOW — INFRA-005: `docker-compose.yml` Uses `:latest` Image Tags

**File:** `infra/monitoring/docker-compose.yml`  
**Finding:** All four monitoring images use `:latest` tags (`prom/prometheus:latest`, `grafana/grafana:latest`, `grafana/loki:latest`, `grafana/promtail:latest`). This makes builds non-reproducible.

**Recommendation:** Pin all image versions (e.g., `prom/prometheus:v2.51.0`). Update via Dependabot or a monthly pinning review.

---

### 🟢 LOW — INFRA-006: Ansible `common-hardening` Role Missing Key Hardening Steps

**File:** `automation/ansible/roles/common-hardening/tasks/main.yml`  
**Finding:** The hardening role does useful things (disables root SSH, enables UFW, installs unattended-upgrades) but is missing:
- No `PasswordAuthentication no` SSH setting (only `PermitRootLogin no`).
- No `AllowUsers` or `AllowGroups` restriction for SSH.
- No `fail2ban` for SSH brute-force protection.
- UFW allows SSH but does not deny all other inbound by default (`ufw default deny incoming`).

**Recommendation:** Extend the role with the missing hardening steps. See CIS Benchmark Level 1 for Debian as a reference.

---

## 5. Observability

### 🟡 MEDIUM — OBS-001: No Custom Prometheus Metrics From the Application

**Finding:** The application has no Prometheus metrics instrumentation. The monitoring stack can observe system-level metrics (CPU, memory, disk via node_exporter) but cannot observe:
- Provisioning job queue depth or duration.
- API request counts and latencies.
- Authentication failure rates.
- Audit event volume by type.

**Recommendation:**
- Add a `/api/metrics` endpoint (or a Prometheus push-gateway integration) exposing:
  - `gmz_provisioning_jobs_total{status}` counter
  - `gmz_provisioning_duration_seconds` histogram
  - `gmz_auth_failures_total{reason}` counter
  - `gmz_audit_events_total{action,outcome}` counter
- Wire this endpoint into `prometheus.yml` as a scrape target.

---

### 🟢 LOW — OBS-002: Audit Events Lack Structured Log Output

**File:** `platform/webapp/lib/audit.ts`  
**Finding:** Audit events are persisted to JSON files or PostgreSQL, but are not written to stdout/stderr in a structured format (e.g. JSON lines). This means they are not automatically captured by Promtail or a log aggregator unless the Loki integration reads the `.data/audit.json` file directly.

**Recommendation:**
- Add `console.log(JSON.stringify(event))` in `appendAuditEvent()` when a structured logging env var is set (e.g. `AUDIT_LOG_STDOUT=true`).
- This enables Promtail to collect audit events from container stdout with no additional infrastructure.

---

### 🟢 LOW — OBS-003: No SLO/SLA Definition or Dashboard

**Finding:** No Grafana dashboard exists for SLO tracking (availability, error rate, latency). The monitoring stack ships a Grafana instance with provisioned datasources but no dashboards for the application layer.

**Recommendation:**
- Add a Grafana dashboard JSON in `infra/monitoring/grafana/dashboards/` for:
  - Provisioning success rate over time.
  - Auth failure rate.
  - API error rate by route.
  - Tenant count by status.

---

## 6. Summary Table

| ID | Severity | Area | Title |
|----|----------|------|-------|
| SEC-001 | 🔴 Critical | Security | Default auth mode is `dev-header` — trivial bypass in misconfigured prod |
| SEC-002 | 🔴 Critical | Security | Committed `.env` with database API key |
| SEC-003 | 🟠 High | Security | No HTTP security headers (CSP, HSTS, X-Frame-Options) |
| SEC-004 | 🟠 High | Security | No rate limiting on any API endpoint |
| SEC-005 | 🟠 High | Security | Vault renewal and AppRole integration is non-functional stub |
| SEC-006 | 🟠 High | Security | Provisioning uses `exec()` (shell) — potential command injection |
| SEC-007 | 🟠 High | Security | No Next.js middleware — all auth is per-route, no centralized enforcement |
| SEC-008 | 🟡 Medium | Security | SMTP password stored in plaintext in `.data/notification-config.json` |
| SEC-009 | 🟡 Medium | Security | `PROVISION_ROLLBACK_HOOK_CMD` enables arbitrary command execution |
| ARCH-001 | 🟠 High | Architecture | Dual storage backend creates split-brain risk |
| ARCH-002 | 🟠 High | Architecture | RBAC policy is a `.js` file, not type-safe |
| ARCH-003 | 🟡 Medium | Architecture | File-based audit log has no rotation or size limit |
| ARCH-004 | 🟡 Medium | Architecture | Provisioning blocks the HTTP request (no async job dispatch) |
| ARCH-005 | 🟡 Medium | Architecture | No CORS policy defined |
| ARCH-006 | 🟡 Medium | Architecture | Health check probe uses plain HTTP |
| CQ-001 | 🟡 Medium | Code Quality | `catch {}` blocks swallow errors without logging |
| CQ-002 | 🟡 Medium | Code Quality | No schema validation library — fully manual input validation |
| CQ-003 | 🟡 Medium | Code Quality | `next@14.2.5` — outdated, check for CVEs |
| CQ-004 | 🟡 Medium | Code Quality | Prisma version string inconsistency (`@7.4.2`) |
| CQ-005 | 🟢 Low | Code Quality | `rbac-policy.js` is `.js` in a TypeScript project |
| CQ-006 | 🟢 Low | Code Quality | API token written to tfvars file on disk |
| CQ-007 | 🟢 Low | Code Quality | Possibly dead `requireOperationRole` sync export |
| CQ-008 | 🟢 Low | Code Quality | Test coverage gaps in provisioning and PostgreSQL paths |
| INFRA-001 | 🟡 Medium | Infrastructure | No Alertmanager — Prometheus has no alert routing |
| INFRA-002 | 🟡 Medium | Infrastructure | Grafana `admin`/`admin` hardcoded password |
| INFRA-003 | 🟡 Medium | Infrastructure | Promtail only scrapes syslog — app logs not collected |
| INFRA-004 | 🟡 Medium | Infrastructure | No remote OpenTofu state backend — local state is ephemeral |
| INFRA-005 | 🟢 Low | Infrastructure | Docker Compose uses `:latest` image tags |
| INFRA-006 | 🟢 Low | Infrastructure | `common-hardening` role missing key SSH/UFW hardening steps |
| OBS-001 | 🟡 Medium | Observability | No custom Prometheus metrics from the application |
| OBS-002 | 🟢 Low | Observability | Audit events not written to stdout (not captured by Promtail) |
| OBS-003 | 🟢 Low | Observability | No SLO dashboard in Grafana |

**Totals:** 🔴 2 Critical · 🟠 7 High · 🟡 12 Medium · 🟢 8 Low

---

## 7. Recommended Priority Actions

### Immediate (before any production deployment)

1. **SEC-001** — Set `WEBAPP_AUTH_MODE` explicitly in all environments; add startup guard to prevent `dev-header` in production.
2. **SEC-002** — Remove `platform/webapp/.env` from git history; replace with `.env.example`.
3. **SEC-003** — Add HTTP security headers in `next.config.mjs`.
4. **INFRA-002** — Replace hardcoded Grafana `admin`/`admin` with a secret reference.

### Short Term (current sprint)

5. **SEC-004** — Add rate limiting to `/api/provision/tenant` and auth endpoints.
6. **SEC-006** — Switch provisioning `exec()` → `execFile()` with arg arrays.
7. **ARCH-001** — Add startup backend health check; document file→Postgres migration path.
8. **INFRA-001** — Add Alertmanager + basic alert rules to monitoring stack.
9. **INFRA-004** — Configure remote OpenTofu state backend before enabling live provisioning.

### Medium Term (next 1–2 sprints)

10. **SEC-005** — Stub-guard vault auth mode or implement it; clarify production-readiness.
11. **ARCH-002** — Convert `rbac-policy.js` to `.ts` with exhaustiveness checks.
12. **ARCH-004** — Decouple provisioning execution from the request lifecycle using the existing Job table.
13. **SEC-007** — Add `middleware.ts` for centralized auth enforcement and request logging.
14. **CQ-002** — Introduce Zod for request body validation across all API routes.
15. **OBS-001** — Add custom Prometheus metrics endpoint for provisioning and auth.
16. **INFRA-003** — Configure Promtail to collect webapp container logs.

---

*This review was produced by automated BMAD analysis. All findings reference specific files and line numbers verified against the repository at commit time. Findings should be triaged by the platform team and tracked as backlog items.*
