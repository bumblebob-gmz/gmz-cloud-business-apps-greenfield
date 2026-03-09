# REVIEW-019-CATALOG-CI-VALIDATOR

## Goal

Implement a Catalog CI Validator that validates every app manifest in `catalog/apps/`
for structural correctness, policy compliance, and completeness — blocking broken
manifests from being merged via GitHub Actions.

## Scope

- `ops/scripts/validate_catalog.py` — enhanced validator (Python 3.11+, stdlib only)
- `ops/tests/test_validate_catalog.py` — 36-test pytest suite (self-contained)
- `.github/workflows/catalog-validator.yml` — updated CI workflow
- `catalog/apps/` — 13 app manifests (no catalog changes required; all pass)

## Architecture Decisions

### Stdlib-only validator

No PyYAML or jsonschema dependency. The validator uses regex-based YAML parsing
sufficient for the constrained, well-known shape of catalog manifests. This avoids
dependency pinning drift and keeps CI setup minimal (only `pytest` installed).

### Tiered validation policy

Three severity tiers based on `status` field:

| Status              | Required files | healthchecks.yaml | Real compose | Non-trivial schema |
|---------------------|---------------|------------------|--------------|-------------------|
| `draft`             | ✓             | —                | WARN only    | —                 |
| `approved`          | ✓             | **ERROR**        | **ERROR**    | —                 |
| `certified-reference` | ✓           | **ERROR**        | **ERROR**    | **ERROR**         |
| `deprecated`        | ✓             | —                | WARN only    | —                 |

### Field-level error output format

```
[ERROR] <app>: <field/path> – <message>
[WARN]  <app>: <field/path> – <message>
```

Example output for a broken manifest:
```
[ERROR] myapp: app.yaml – missing required field 'exposes'
[ERROR] myapp: app.yaml/exposes[1] – 'hostPattern' must match '<service>.{tenant}.irongeeks.eu', got 'myapp.example.com'
[ERROR] myapp: vars.schema.json – 'additionalProperties' must be false for catalog hygiene
[WARN]  myapp: compose.template.yml – file is a TODO stub (acceptable for draft apps, but should be completed)
```

Exit code is `1` (non-zero) whenever any ERROR is emitted.

### Validation checks implemented

1. **Required file presence** — `app.yaml`, `compose.template.yml`, `vars.schema.json`
2. **healthchecks.yaml presence** — required for `approved` and `certified-reference` apps
3. **app.yaml required fields** — `id`, `name`, `version`, `status`, `requires`, `supportsBranding`, `supportsSSO`, `exposes`
4. **app.yaml semantics**:
   - `status` must be one of `{draft, approved, certified-reference, deprecated}`
   - `id` must be kebab-case and match directory name
   - `exposes` must have ≥1 entry with `service`, `port` (1–65535), and `hostPattern`
5. **Host pattern policy** — `hostPattern` must match `<service>.{tenant}.irongeeks.eu`; first label must equal `service`
6. **vars.schema.json completeness**:
   - Must have `$schema` declaration
   - Root `type` must be `object`
   - `additionalProperties` must be `false`
   - For `certified-reference`: `properties` must be non-empty, `required` must be non-empty, every `required` key must exist in `properties`
7. **Stub compose detection** — files containing only TODO/comment/blank lines are flagged (WARN for draft, ERROR for non-draft)
8. **healthchecks.yaml validation** — must have top-level `checks` key with ≥1 entry

### Test suite design

36 pytest tests in `ops/tests/test_validate_catalog.py`:
- Fully self-contained (builds temp directories, no dependency on live catalog data)
- Covers all validation checks with positive (pass) and negative (fail) cases
- Includes one integration smoke test against the real catalog

## Outcomes

| Metric | Value |
|--------|-------|
| Validator LOC | ~290 |
| Test count | 36 |
| Test pass rate | 36/36 (100%) |
| Catalog apps checked | 13 |
| Current catalog errors | 0 |
| Current catalog warnings | 11 (draft apps with TODO compose stubs) |
| CI pipeline | passes on push/PR touching `catalog/**` or validator files |

## Catalog Status (2026-03-09)

All 13 apps pass validation (no ERRORs). 11 draft apps emit WARN for TODO compose stubs —
these are tracked work in progress and do not block merge.

Apps with full compliance (no warnings):
- `authentik` — certified-reference ✓
- `nextcloud` — certified-reference ✓

Apps with healthchecks beyond requirement (draft + healthchecks.yaml present):
- `bookstack`, `paperless-ngx`, `vaultwarden`

Apps with TODO compose stubs (draft, warnings only):
- `bookstack`, `it-tools`, `joplin`, `libretranslate`, `ollama`, `openwebui`,
  `paperless-ngx`, `searxng`, `snipe-it`, `vaultwarden`, `wiki-js`

## GitHub Actions Integration

The workflow `.github/workflows/catalog-validator.yml` triggers on:
- Push or PR touching `catalog/**`, `ops/scripts/validate_catalog.py`,
  `ops/tests/test_validate_catalog.py`, or the workflow file itself

Steps:
1. Checkout
2. Setup Python 3.11
3. Install pytest
4. **Run validator unit tests** (`pytest -v --tb=short`) — blocks merge on test failure
5. **Run catalog validator** — blocks merge on any ERROR in live catalog

## Next Steps

- Promote `bookstack`, `paperless-ngx`, `vaultwarden` to `approved` status and add real compose templates
- Add `jsonschema` validation of `vars.schema.json` values against a meta-schema for deeper property constraint checks
- Extend host pattern policy check to also verify `service` label consistency across `compose.template.yml` labels when compose is non-stub
- Consider adding a `catalog lint --fix` subcommand to auto-scaffold missing files
