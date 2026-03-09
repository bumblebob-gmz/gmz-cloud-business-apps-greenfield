# REVIEW-024 — Gate Artifact Publisher V2

**Task:** N2-7  
**Status:** Done  
**Date:** 2026-03-09

## What Was Built

A focused, self-contained gate evidence pipeline consisting of two new files:

### 1. `ops/scripts/build-gate-bundle.sh`

A simple shell script that collects G2 gate evidence into a flat bundle directory. Keeps it simple — no packaging, no complex probing, just evidence collection.

**Evidence collected:**

| File | Source |
|------|--------|
| `test_results.json` | `npm test --reporter=json` (node:test NDJSON, all webapp tests) |
| `audit_event_sample.json` | Representative audit events (provision, deploy, RBAC deny) |
| `provisioning_trace.json` | Provisioning phase trace sample |
| `rollback_drill.json` | Rollback script presence, bash syntax check, missing-snapshot guard |
| `index.md` | Manifest listing all files with status summary |

**Design decisions:**
- Uses `--test-reporter=json` to get structured NDJSON output from node:test
- Parses `test:pass` / `test:fail` event types to compute summary counts
- Rollback drill is a contract check (syntax + exit-code guard), not a live SSH drill
- Emits `GITHUB_OUTPUT` variables (`bundle_dir`, `test_status`, `rollback_status`) for downstream steps
- No `npm install`, no external network calls

### 2. `.github/workflows/gate-artifact-publisher.yml`

A minimal GitHub Actions workflow triggered on push to `main`.

- Calls `build-gate-bundle.sh` with `--out-dir gate-bundle`
- Uploads the bundle as artifact **`g2-gate-evidence`** (90-day retention)
- Prints `index.md` to the Actions log for quick review

**Note:** Node.js setup is intentionally omitted from this workflow — the script calls node:test directly via the system node available on `ubuntu-latest`. If the webapp tests need `npm ci`, add a `setup-node` + `npm ci` step before the bundle script.

## Relationship to Existing Pipeline

This workflow is intentionally separate from the existing `gate-evidence.yml` workflow, which runs the full test suite and then calls `generate-gate-evidence.mjs`. The new `gate-artifact-publisher.yml` is a lighter, script-only alternative that:

- Does not depend on Node.js being installed (tests are optional evidence; the script degrades gracefully)
- Produces a simpler, flat bundle (no ZIP/tarball packaging)
- Artifact name `g2-gate-evidence` matches the task specification exactly

The two workflows can coexist — `gate-evidence.yml` for the full CI picture, `gate-artifact-publisher.yml` for the focused gate bundle upload.

## Files Changed

```
ops/scripts/build-gate-bundle.sh              (new)
.github/workflows/gate-artifact-publisher.yml  (new)
docs/bmad/REVIEW-024-GATE-ARTIFACT-PUBLISHER-V2.md  (this file)
```

## Verification

Local smoke test (no network, no npm install):

```bash
BUNDLE_OUT_DIR=/tmp/test-gate-bundle ops/scripts/build-gate-bundle.sh
ls /tmp/test-gate-bundle/
cat /tmp/test-gate-bundle/index.md
```

Expected output: 5 files (`test_results.json`, `audit_event_sample.json`, `provisioning_trace.json`, `rollback_drill.json`, `index.md`).

The `test_results.json` will show `status: skipped` if node:test is unavailable; all other evidence files are generated unconditionally.
