# REVIEW-022 – Gate Evidence Template Automation

- **Task:** N1-9 (Sprint N+1)
- **Priority:** P1
- **Status:** ✅ IMPLEMENTED
- **Date:** 2026-03-09
- **Author:** Automation QA Agent
- **Dependencies:** N1-4 (Audit event envelope), N1-6 (Catalog CI validator)

---

## 1. Objective

Implement automated gate evidence bundle generation as CI artifact on every push to `main`. The bundle provides reproducible, objective evidence for G1/G2 gate decisions without manual artifact gathering.

**DoD (from sprint backlog):** CI publishes artifact bundle on main branch containing test report, audit sample events, provisioning job trace, and executive summary.

---

## 2. What Was Built

### 2.1 Evidence Generator Script

**File:** `ops/scripts/generate-gate-evidence.mjs`

A standalone Node.js ESM script that:

1. Runs the full Node.js test suite (`platform/webapp/tests/`) with TAP reporter and parses results into structured JSON
2. Runs the Python catalog validator test suite (`ops/tests/`) and captures pass/fail counts
3. Generates **7 representative audit event samples** in JSONL format covering:
   - `provision.preflight.checked` – system readiness
   - `tenant.provision.requested` – admin-initiated provision
   - `tenant.provision.execution_started` – engine phase start
   - `tenant.provision.success` – happy path completion
   - `deploy.start` / `deploy.success` – deployment lifecycle
   - `rbac.access.denied` – RBAC boundary enforcement (negative case)
4. Generates a **5-phase provisioning job trace** (`vm_create → network_config → os_bootstrap → app_deploy → health_verify`) with per-step log entries, timestamps, and durations
5. Renders an **HTML test report** from the parsed TAP output
6. Writes a **`gate-evidence-summary.md`** executive summary with gate assessment table

The script is invocable standalone for local evidence generation:
```bash
node ops/scripts/generate-gate-evidence.mjs [--out <dir>]
```

Environment variables `GITHUB_SHA`, `GITHUB_REF_NAME`, `GITHUB_RUN_ID` are incorporated when set (CI context).

### 2.2 GitHub Actions Workflow

**File:** `.github/workflows/gate-evidence.yml`

Trigger: `push` to `main` branch only.

Two-job structure:

| Job | Name | Purpose |
|---|---|---|
| `test` | Run Tests | Executes Node.js + Python test suites; exposes pass/fail outputs |
| `gate-evidence` | Publish Gate Evidence Bundle | Runs `generate-gate-evidence.mjs`; uploads bundle artifact; always runs (even on test failure) |

Key design decisions:
- **`needs: test` + `if: always()`** – evidence is generated even when tests fail so failure evidence is captured
- **`retention-days: 90`** – bundle is stored for 3 months, covering sprint review cycles
- **Artifact name includes SHA** (`gate-evidence-<sha>`) for traceability
- **`if-no-files-found: error`** – CI fails if bundle generation silently produces nothing

### 2.3 Bundle Structure

```
gate-evidence-bundle/
├── test-report.json          # Structured: {summary, tests[], commit, branch, runId}
├── test-report.html          # Human-readable with pass/fail coloring
├── audit-sample-events.jsonl # 7 audit events (one per line, valid JSON each)
├── provisioning-trace.json   # Full 5-phase job trace with logs
└── gate-evidence-summary.md  # Executive summary + gate assessment table
```

---

## 3. Test Results

All existing tests pass after implementation:

| Suite | Tests | Passed | Failed |
|---|---|---|---|
| Node.js (webapp) | 80 | 80 | 0 |
| Python (ops/catalog validator) | 36 | 36 | 0 |
| **Total** | **116** | **116** | **0** |

No new tests were introduced by this task (N1-9 is automation infrastructure, not business logic). The evidence generator is verified by dry-run locally producing all 5 expected files with valid content.

---

## 4. Acceptance Criteria Verification

| Criterion | Status | Evidence |
|---|---|---|
| CI publishes artifact bundle on main branch push | ✅ | `gate-evidence.yml` workflow with `upload-artifact@v4` |
| Bundle contains test report (JSON) | ✅ | `test-report.json` (TAP parsed, structured) |
| Bundle contains test report (HTML) | ✅ | `test-report.html` (color-coded, self-contained) |
| Bundle contains audit sample events (JSONL) | ✅ | `audit-sample-events.jsonl` (7 events, line-delimited) |
| Bundle contains provisioning job trace sample | ✅ | `provisioning-trace.json` (5 phases, per-step logs) |
| Bundle contains gate-evidence-summary.md | ✅ | Present; includes gate assessment table |
| Bundle uploadable as GitHub Actions artifact | ✅ | `actions/upload-artifact@v4`; `if-no-files-found: error` guard |
| Post-test job (not pre-test) | ✅ | `needs: test` dependency in workflow |
| Works standalone for local use | ✅ | `node ops/scripts/generate-gate-evidence.mjs` |

---

## 5. Design Notes

### Why `if: always()` on gate-evidence job?

Gate evidence is most valuable *when things go wrong*. If `if: always()` were omitted, a test failure would suppress the artifact, defeating the purpose of objective gate evidence. The bundle captures failure state so reviewers can inspect it during sprint retrospectives.

### Why TAP → JSON instead of native `--test-reporter=json`?

Node.js v22's native JSON reporter outputs NDJSON event stream, not a summary object. The TAP parser in the script produces a compact, stable JSON schema that is easier to render in HTML and parse in downstream tooling. Both approaches are functionally equivalent; TAP is more portable.

### Audit event samples vs. live audit log

The samples in `audit-sample-events.jsonl` are **synthetic reference events** that conform to the `AuditEvent` schema validated in `audit-emit-provision-deploy.test.ts`. They do not require a running database or file-backed audit store, making the CI bundle generation hermetic and reproducible.

For G2 evidence generation (Task N2-7), real audit events from a provisioning e2e run should supplement or replace these samples.

### Provisioning trace sample

The trace in `provisioning-trace.json` is a synthetic reference trace conforming to the `JobPhaseTrace[]` shape in `lib/types.ts`. It represents a realistic successful provisioning run (~6 min total). For G2, this should be replaced by a captured trace from `N2-1` vertical slice execution.

---

## 6. Follow-Up Items

| Item | Priority | Sprint |
|---|---|---|
| Replace synthetic audit samples with captured events from N2-1 e2e run | P1 | N+2 |
| Add OpenTofu test (`infra/opentofu/tests/`) results to bundle | P1 | N+2 |
| Gate artifact publisher v2 (N2-7): include rollback drill evidence | P1 | N+2 |
| Add `--fail-fast` mode for local development speed | P2 | N+2 |
| Consider SARIF format for security CI pack integration (N2-6) | P2 | N+2 |

---

## 7. Files Changed

| File | Change |
|---|---|
| `ops/scripts/generate-gate-evidence.mjs` | **New** – Evidence bundle generator script |
| `.github/workflows/gate-evidence.yml` | **New** – GitHub Actions workflow (main branch only) |
| `docs/bmad/REVIEW-022-GATE-EVIDENCE-AUTOMATION.md` | **New** – This review document |

---

*Closes Task N1-9. Gate evidence bundle will be available as CI artifact `gate-evidence-<sha>` after next push to `main`.*
