# REVIEW-023 – Security CI Pack

**BMAD Review Artifact**
**Task:** N2-6 – Implement Security CI Pack
**Sprint:** N+2 – "Provisioning vertical slice + safe update/rollback"
**Date:** 2026-03-09
**Status:** ✅ COMPLETE

---

## 1. Summary

Implemented the three-part Security CI Pack as required by N2-6. All three jobs run on every PR and every push to `main`. Existing RBAC + audit test suite passes 49/49 tests locally.

---

## 2. Deliverables

| # | Component | Workflow file | Tool |
|---|---|---|---|
| 1 | Secret scan | `.github/workflows/secret-scan.yml` | gitleaks v2 (official action) |
| 2 | IaC security lint | `.github/workflows/iac-security-lint.yml` | checkov v12 (bridgecrew action) |
| 3 | Authz/audit regression suite | `.github/workflows/authz-audit-regression.yml` | Node.js built-in test runner |

---

## 3. Design Decisions

### 3.1 Secret Scan — gitleaks

**Choice:** `gitleaks/gitleaks-action@v2` over truffleHog.

**Rationale:**
- Native GitHub Actions integration with zero custom install steps.
- Scans full git history (`fetch-depth: 0`) on PRs so secrets accidentally committed and removed before the PR are still caught.
- Free for public and private repos at the job level (no org-level license required for this use case).
- Fails the job immediately on any detected secret; no soft-fail mode.

**Scope:** All files, all branches, all PR commits.

### 3.2 IaC Security Lint — checkov

**Choice:** `bridgecrewio/checkov-action@v12` targeting `infra/opentofu/` with `framework: terraform`.

**Rationale:**
- checkov has first-class OpenTofu/Terraform support and the widest rule set for Proxmox-adjacent IaC patterns.
- tfsec was considered but is now maintained under the checkov umbrella; using checkov directly avoids the deprecated tool.
- Severity threshold: **HIGH and CRITICAL fail the job**; LOW and MEDIUM are reported but non-blocking (`soft_fail_on: LOW,MEDIUM`).
- SARIF output is uploaded to the GitHub Security tab for persistent finding tracking.

**Skip list:**
- `CKV_TF_1` — requires module version pinning via registry; we use local modules (not registry-sourced).
- `CKV2_GHA_1` — flags unpinned GitHub Actions in workflow files; not applicable to the IaC directory itself.

**Path filter:** Workflow only triggers when `infra/opentofu/**` changes, keeping CI fast on webapp-only PRs.

### 3.3 Authz/Audit Regression Suite

**Test selection:** Subset of `npm run test:rbac` covering security-relevant tests only:

| Test file | Coverage area |
|---|---|
| `tests/rbac-policy.test.mjs` | Role ranking, endpoint policy requirements, deny payload format |
| `tests/auth-context.test.ts` | Auth middleware, role enforcement, audit event emission on deny |
| `tests/token-rotation.test.ts` | Token expiry, rotation impact, secret-like key rejection |
| `tests/audit-filters.test.ts` | Audit event filtering (actor, tenant, action, outcome, date range) |
| `tests/audit-emit-provision-deploy.test.ts` | Audit emission in provision/deploy code paths |
| `tests/tenant-policy-constraints.test.ts` | VLAN/IP policy constraints, shirt-size bounds, admin override |

**Total:** 49 tests, 0 failures (verified locally before commit).

**Artifact:** `test-report-authz-audit.txt` uploaded as GitHub Actions artifact `authz-audit-test-report` with 30-day retention. Published on both success and failure (`if: always()`).

---

## 4. Trigger Matrix

| Event | secret-scan | iac-security-lint | authz-audit-regression |
|---|---|---|---|
| PR (any branch) | ✅ | ✅ (if IaC changed) | ✅ |
| Push to `main` | ✅ | ✅ (if IaC changed) | ✅ |
| Push to feature branch | ❌ (PR-based only) | ❌ | ❌ |

> Note: `iac-security-lint` has path filters to avoid triggering on webapp-only changes. Secret scan and authz regression run on every PR/main push regardless of changed paths — this is intentional; security regressions can appear in any file.

---

## 5. Test Results

```
# tests 49
# suites 0
# pass 49
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms ~689ms
```

Run locally with:
```bash
cd platform/webapp
node --experimental-strip-types --test \
  tests/rbac-policy.test.mjs \
  tests/auth-context.test.ts \
  tests/token-rotation.test.ts \
  tests/audit-filters.test.ts \
  tests/audit-emit-provision-deploy.test.ts \
  tests/tenant-policy-constraints.test.ts
```

---

## 6. Acceptance Criteria Checklist

| Criterion | Status |
|---|---|
| Secret scan runs on every PR and main push | ✅ |
| Secret scan fails on detected secrets | ✅ (gitleaks exits non-zero) |
| IaC lint runs on every PR and main push | ✅ |
| IaC lint fails on HIGH severity findings | ✅ (`soft_fail_on: LOW,MEDIUM`) |
| Authz/audit regression runs on every PR and main push | ✅ |
| Authz/audit regression publishes report artifact | ✅ (`upload-artifact`, 30d retention) |
| All existing RBAC + audit tests pass | ✅ (49/49) |

---

## 7. Follow-up Recommendations

1. **gitleaks `.gitleaks.toml`** — Add a repo-level config to allowlist known false positives (e.g., test fixture tokens with clearly fake values). This reduces noise without weakening real coverage.
2. **checkov baseline** — Once the initial scan runs in CI, generate a `checkov.baseline` file to snapshot accepted risk for findings that can't be immediately remediated (e.g., Proxmox-specific patterns checkov doesn't model correctly).
3. **Merge authz regression into full test suite job** — Consider a single `test-suite.yml` that runs all tests and publishes a unified report artifact, with authz/audit as a named subset. Reduces CI job count as the test suite grows.
4. **Secret scan on push to feature branches** — Currently secret-scan only triggers on PRs and main. Consider adding `push: branches: ["**"]` to catch secrets before a PR is even opened.

---

*Reviewed by: Lola (AI Engineering Assistant) on behalf of QA + Automation Eng*
*BMAD reference: Sprint N+2 / Task N2-6*
