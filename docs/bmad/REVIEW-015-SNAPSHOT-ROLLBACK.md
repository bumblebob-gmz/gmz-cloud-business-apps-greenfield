# REVIEW-015-SNAPSHOT-ROLLBACK

## Goal

Wire Snapshot and Health-gated Rollback into the nightly-updates GitHub Actions
CI workflow. Before each update a snapshot of tenant container state is captured.
After the update a health check gates promotion. If the gate fails, an automated
rollback restores the pre-update state from the snapshot.

---

## Architecture Decisions

### 1. Five-stage linear pipeline with conditional rollback

The workflow is structured as five sequential jobs:

```
snapshot → update → healthcheck → [rollback?] → report
```

- **snapshot** always runs first and uploads an artifact, guaranteeing a recovery
  point exists before any mutation occurs.
- **update** runs the existing Ansible `nightly-updates.yml` playbook. It is
  skipped in `dry_run` mode but the rest of the pipeline still executes, enabling
  smoke-test validation without touching live containers.
- **healthcheck** uses `if: always()` conditioned on snapshot success, so it runs
  even when the update job is skipped (dry-run) or fails.
- **rollback** is conditional: `if: needs.healthcheck.outputs.healthy == 'false'`.
  It never runs on a healthy outcome, keeping the common path clean.
- **report** always runs and writes a markdown job summary table.

### 2. Shell scripts in `ops/scripts/` — single responsibility

| Script | Responsibility |
|---|---|
| `tenant-snapshot.sh` | SSH to host, collect `docker ps` JSON, write manifest |
| `tenant-healthcheck.sh` | SSH to host, check Docker daemon + running container count |
| `tenant-rollback.sh` | Read snapshot manifest, pull images, restart compose stack |

Scripts are self-contained bash, re-usable outside CI (e.g. during a manual
incident response), and emit structured log lines to stderr.

### 3. PROVISION_ROLLBACK_HOOK_CMD composability

The existing `PROVISION_ROLLBACK_HOOK_CMD` infrastructure (used by the web app
provisioning API in `lib/provisioning.ts`) is honoured as an *optional* secondary
rollback step. After `tenant-rollback.sh` completes its snapshot-based restore,
the workflow evaluates the GitHub secret `PROVISION_ROLLBACK_HOOK_CMD` and, if
set, `eval`s it. This preserves backwards compatibility for operators who already
configured that hook for the provisioning path.

### 4. Ansible playbook separation of concerns

The playbook (`automation/ansible/playbooks/nightly-updates.yml`) is updated to
default `post_update_healthcheck_enabled=false` and `rollback_enabled=false`,
because health-gating and rollback are now the CI workflow's responsibility. The
vars remain overridable for direct invocation outside CI.

### 5. Snapshot as GitHub Actions artifact

The snapshot JSON file is uploaded as an artifact named `pre-update-snapshot`
with 7-day retention. The rollback job downloads this artifact using
`actions/download-artifact@v4`, guaranteeing the snapshot survives even if the
runner that created it is recycled between jobs.

---

## Files Changed / Created

| File | Action |
|---|---|
| `.github/workflows/nightly-updates.yml` | **Created** — 5-stage CI pipeline |
| `ops/scripts/tenant-snapshot.sh` | **Created** — pre-update snapshot script |
| `ops/scripts/tenant-healthcheck.sh` | **Created** — post-update health gate script |
| `ops/scripts/tenant-rollback.sh` | **Created** — snapshot-based rollback script |
| `automation/ansible/playbooks/nightly-updates.yml` | **Updated** — default CI-managed flags, clarified comments |
| `docs/bmad/REVIEW-015-SNAPSHOT-ROLLBACK.md` | **Created** — this document |

---

## Required GitHub Secrets

| Secret | Required | Description |
|---|---|---|
| `TENANT_SSH_PRIVATE_KEY` | ✅ | SSH key for connecting to tenant hosts |
| `PROVISION_ROLLBACK_HOOK_CMD` | Optional | Extra rollback hook (e.g. OpenTofu destroy-and-reprovision) |

---

## Rollback Strategy

```
Health check FAILS
        │
        ▼
Download pre-update-snapshot artifact
        │
        ▼
tenant-rollback.sh:
  1. Pull exact image versions from snapshot JSON
  2. docker compose down --remove-orphans
  3. docker compose up -d
  4. Verify container count ≥ snapshot count
        │
        ▼
PROVISION_ROLLBACK_HOOK_CMD (if set)
        │
        ▼
Post-rollback health check
  PASS → pipeline annotated with warning (rolled back)
  FAIL → pipeline annotated with error (manual intervention needed)
```

---

## Dry-Run Mode

When `dry_run=true` (manual dispatch input):

- Snapshot is taken ✅
- Update (Ansible) is **skipped**
- Health check runs against the *current* state ✅
- Rollback is skipped (nothing changed) ✅
- Report summarises the smoke-test outcome ✅

This allows safe pre-flight validation of the pipeline itself.

---

## Outcomes

- **CI workflow:** `.github/workflows/nightly-updates.yml` — fully gated pipeline
- **Scripts:** Three self-contained ops scripts covering snapshot, health check, rollback
- **Ansible playbook:** Clarified defaults; CI-managed flags decoupled from direct-invocation flags
- **PROVISION_ROLLBACK_HOOK_CMD:** Composable — honoured after snapshot-based rollback
- **Tests:** All 33 existing tests pass (`npm run test:rbac`) — no regressions

## Next Steps

- Add per-app HTTP health checks from `catalog/apps/*/healthchecks.yaml` into
  `tenant-healthcheck.sh` for application-layer validation beyond Docker daemon.
- Extend the workflow to loop over all tenant hosts in inventory (currently
  single-host per run; multi-tenant parallelism is a matrix job expansion).
- Integrate Grafana/Alertmanager notification on rollback events via
  existing alert-dispatch infrastructure.
