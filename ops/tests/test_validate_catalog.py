"""Tests for ops/scripts/validate_catalog.py

Tests are self-contained: each test builds a minimal temporary catalog
directory structure so they do not depend on real catalog data.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest
import sys

# Make the validate_catalog module importable from the scripts directory
SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import validate_catalog as vc  # noqa: E402

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

MINIMAL_APP_YAML = textwrap.dedent("""\
    id: test-app
    name: Test App
    version: 1.0.0
    status: draft
    requires: []
    supportsBranding: false
    supportsSSO: false
    exposes:
      - service: test-app
        port: 8080
        hostPattern: test-app.{tenant}.irongeeks.eu
""")

CERTIFIED_APP_YAML = textwrap.dedent("""\
    id: test-app
    name: Test App
    version: 1.0.0
    status: certified-reference
    requires: []
    supportsBranding: true
    supportsSSO: true
    exposes:
      - service: test-app
        port: 8080
        hostPattern: test-app.{tenant}.irongeeks.eu
""")

MINIMAL_SCHEMA = json.dumps({
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {},
    "additionalProperties": False,
})

CERTIFIED_SCHEMA = json.dumps({
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": False,
    "required": ["APP_HOST"],
    "properties": {
        "APP_HOST": {
            "type": "string",
            "pattern": "^test-app\\.[a-z0-9-]+\\.irongeeks\\.eu$",
        }
    },
})

MINIMAL_COMPOSE = textwrap.dedent("""\
    services:
      app:
        image: myapp:latest
        environment:
          APP_HOST: ${APP_HOST}
""")

STUB_COMPOSE = "# TODO: compose template for tenant deployment\n"

MINIMAL_HEALTHCHECKS = textwrap.dedent("""\
    checks:
      - id: app-health
        type: http
        target: https://test-app.{tenant}.irongeeks.eu/health
        expectedStatus: 200
        intervalSeconds: 30
        timeoutSeconds: 5
""")


def make_app_dir(
    tmp_path: Path,
    *,
    app_yaml: str | None = MINIMAL_APP_YAML,
    schema: str | None = MINIMAL_SCHEMA,
    compose: str | None = MINIMAL_COMPOSE,
    healthchecks: str | None = None,
    app_name: str = "test-app",
) -> Path:
    """Create a minimal app directory under tmp_path."""
    d = tmp_path / app_name
    d.mkdir()
    if app_yaml is not None:
        (d / "app.yaml").write_text(app_yaml.replace("test-app", app_name).replace("test_app", app_name))
    if schema is not None:
        (d / "vars.schema.json").write_text(schema)
    if compose is not None:
        (d / "compose.template.yml").write_text(compose)
    if healthchecks is not None:
        (d / "healthchecks.yaml").write_text(healthchecks)
    return d


# ---------------------------------------------------------------------------
# Tests: required file presence
# ---------------------------------------------------------------------------

class TestRequiredFiles:
    def test_missing_app_yaml_is_error(self, tmp_path):
        d = make_app_dir(tmp_path, app_yaml=None)
        result = vc.validate_app_dir(d)
        assert result.has_errors
        fields = [di.field for di in result.diagnostics if di.severity == "ERROR"]
        assert "app.yaml" in fields

    def test_missing_compose_is_error(self, tmp_path):
        d = make_app_dir(tmp_path, compose=None)
        result = vc.validate_app_dir(d)
        assert result.has_errors
        fields = [di.field for di in result.diagnostics if di.severity == "ERROR"]
        assert "compose.template.yml" in fields

    def test_missing_schema_is_error(self, tmp_path):
        d = make_app_dir(tmp_path, schema=None)
        result = vc.validate_app_dir(d)
        assert result.has_errors
        fields = [di.field for di in result.diagnostics if di.severity == "ERROR"]
        assert "vars.schema.json" in fields

    def test_all_files_present_draft_ok(self, tmp_path):
        d = make_app_dir(tmp_path)
        result = vc.validate_app_dir(d)
        assert not result.has_errors

    def test_certified_without_healthchecks_is_error(self, tmp_path):
        d = make_app_dir(tmp_path, app_yaml=CERTIFIED_APP_YAML, schema=CERTIFIED_SCHEMA)
        result = vc.validate_app_dir(d)
        assert result.has_errors
        error_fields = [di.field for di in result.diagnostics if di.severity == "ERROR"]
        assert "healthchecks.yaml" in error_fields

    def test_certified_with_healthchecks_no_file_error(self, tmp_path):
        d = make_app_dir(
            tmp_path,
            app_yaml=CERTIFIED_APP_YAML,
            schema=CERTIFIED_SCHEMA,
            healthchecks=MINIMAL_HEALTHCHECKS,
        )
        result = vc.validate_app_dir(d)
        # Should have no errors (may have warnings)
        assert not result.has_errors


# ---------------------------------------------------------------------------
# Tests: app.yaml field validation
# ---------------------------------------------------------------------------

class TestAppYaml:
    def test_missing_required_key_is_error(self, tmp_path):
        bad_yaml = MINIMAL_APP_YAML.replace("supportsSSO: false\n", "")
        d = make_app_dir(tmp_path, app_yaml=bad_yaml)
        result = vc.validate_app_dir(d)
        assert result.has_errors
        msgs = [di.message for di in result.diagnostics if di.severity == "ERROR"]
        assert any("supportsSSO" in m for m in msgs)

    def test_invalid_status_is_error(self, tmp_path):
        bad_yaml = MINIMAL_APP_YAML.replace("status: draft", "status: in-progress")
        d = make_app_dir(tmp_path, app_yaml=bad_yaml)
        result = vc.validate_app_dir(d)
        assert result.has_errors
        msgs = [di.message for di in result.diagnostics if di.severity == "ERROR"]
        assert any("in-progress" in m for m in msgs)

    def test_id_directory_mismatch_is_error(self, tmp_path):
        d = tmp_path / "other-name"
        d.mkdir()
        (d / "app.yaml").write_text(MINIMAL_APP_YAML)  # id: test-app, dir: other-name
        (d / "vars.schema.json").write_text(MINIMAL_SCHEMA)
        (d / "compose.template.yml").write_text(MINIMAL_COMPOSE)
        result = vc.validate_app_dir(d)
        assert result.has_errors
        msgs = " ".join(di.message for di in result.diagnostics if di.severity == "ERROR")
        assert "other-name" in msgs or "test-app" in msgs

    def test_no_exposes_entries_is_error(self, tmp_path):
        bad_yaml = textwrap.dedent("""\
            id: test-app
            name: Test App
            version: 1.0.0
            status: draft
            requires: []
            supportsBranding: false
            supportsSSO: false
            exposes:
        """)
        d = make_app_dir(tmp_path, app_yaml=bad_yaml)
        result = vc.validate_app_dir(d)
        assert result.has_errors


# ---------------------------------------------------------------------------
# Tests: host pattern policy
# ---------------------------------------------------------------------------

class TestHostPattern:
    def test_valid_host_pattern_passes(self, tmp_path):
        d = make_app_dir(tmp_path)
        result = vc.validate_app_dir(d)
        # No host-pattern errors
        hp_errors = [
            di for di in result.diagnostics
            if di.severity == "ERROR" and "hostPattern" in di.field
        ]
        assert hp_errors == []

    def test_invalid_host_pattern_no_tenant_placeholder(self, tmp_path):
        bad_yaml = MINIMAL_APP_YAML.replace(
            "hostPattern: test-app.{tenant}.irongeeks.eu",
            "hostPattern: test-app.irongeeks.eu",
        )
        d = make_app_dir(tmp_path, app_yaml=bad_yaml)
        result = vc.validate_app_dir(d)
        assert result.has_errors
        # hostPattern errors appear in the message (field is 'app.yaml/exposes[N]')
        hp_errors = [
            di for di in result.diagnostics
            if di.severity == "ERROR" and "hostPattern" in di.message
        ]
        assert hp_errors

    def test_invalid_host_pattern_wrong_domain(self, tmp_path):
        bad_yaml = MINIMAL_APP_YAML.replace(
            "hostPattern: test-app.{tenant}.irongeeks.eu",
            "hostPattern: test-app.{tenant}.example.com",
        )
        d = make_app_dir(tmp_path, app_yaml=bad_yaml)
        result = vc.validate_app_dir(d)
        assert result.has_errors

    def test_service_hostpattern_mismatch_is_error(self, tmp_path):
        bad_yaml = MINIMAL_APP_YAML.replace(
            "hostPattern: test-app.{tenant}.irongeeks.eu",
            "hostPattern: other-name.{tenant}.irongeeks.eu",
        )
        d = make_app_dir(tmp_path, app_yaml=bad_yaml)
        result = vc.validate_app_dir(d)
        assert result.has_errors
        msgs = " ".join(di.message for di in result.diagnostics if di.severity == "ERROR")
        assert "other-name" in msgs or "service" in msgs

    def test_invalid_port_is_error(self, tmp_path):
        bad_yaml = MINIMAL_APP_YAML.replace("port: 8080", "port: 99999")
        d = make_app_dir(tmp_path, app_yaml=bad_yaml)
        result = vc.validate_app_dir(d)
        assert result.has_errors

    def test_port_zero_is_error(self, tmp_path):
        bad_yaml = MINIMAL_APP_YAML.replace("port: 8080", "port: 0")
        d = make_app_dir(tmp_path, app_yaml=bad_yaml)
        result = vc.validate_app_dir(d)
        assert result.has_errors


# ---------------------------------------------------------------------------
# Tests: vars.schema.json completeness
# ---------------------------------------------------------------------------

class TestVarsSchema:
    def test_missing_dollar_schema_is_error(self, tmp_path):
        schema = json.dumps({
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        })
        d = make_app_dir(tmp_path, schema=schema)
        result = vc.validate_app_dir(d)
        assert result.has_errors
        msgs = " ".join(di.message for di in result.diagnostics if di.severity == "ERROR")
        assert "$schema" in msgs

    def test_missing_additional_properties_false_is_error(self, tmp_path):
        schema = json.dumps({
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object",
            "properties": {},
        })
        d = make_app_dir(tmp_path, schema=schema)
        result = vc.validate_app_dir(d)
        assert result.has_errors

    def test_invalid_json_schema_is_error(self, tmp_path):
        d = make_app_dir(tmp_path, schema="not valid json {{{")
        result = vc.validate_app_dir(d)
        assert result.has_errors

    def test_certified_empty_properties_is_error(self, tmp_path):
        schema = json.dumps({
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object",
            "additionalProperties": False,
            "required": [],
            "properties": {},
        })
        d = make_app_dir(
            tmp_path,
            app_yaml=CERTIFIED_APP_YAML,
            schema=schema,
            healthchecks=MINIMAL_HEALTHCHECKS,
        )
        result = vc.validate_app_dir(d)
        assert result.has_errors

    def test_certified_missing_required_is_error(self, tmp_path):
        schema = json.dumps({
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "APP_HOST": {"type": "string"},
            },
        })
        d = make_app_dir(
            tmp_path,
            app_yaml=CERTIFIED_APP_YAML,
            schema=schema,
            healthchecks=MINIMAL_HEALTHCHECKS,
        )
        result = vc.validate_app_dir(d)
        assert result.has_errors

    def test_required_key_not_in_properties_is_error(self, tmp_path):
        schema = json.dumps({
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object",
            "additionalProperties": False,
            "required": ["MISSING_KEY"],
            "properties": {
                "APP_HOST": {"type": "string"},
            },
        })
        d = make_app_dir(
            tmp_path,
            app_yaml=CERTIFIED_APP_YAML,
            schema=schema,
            healthchecks=MINIMAL_HEALTHCHECKS,
        )
        result = vc.validate_app_dir(d)
        assert result.has_errors
        msgs = " ".join(di.message for di in result.diagnostics if di.severity == "ERROR")
        assert "MISSING_KEY" in msgs

    def test_valid_certified_schema_passes(self, tmp_path):
        d = make_app_dir(
            tmp_path,
            app_yaml=CERTIFIED_APP_YAML,
            schema=CERTIFIED_SCHEMA,
            healthchecks=MINIMAL_HEALTHCHECKS,
        )
        result = vc.validate_app_dir(d)
        assert not result.has_errors


# ---------------------------------------------------------------------------
# Tests: compose.template.yml stub detection
# ---------------------------------------------------------------------------

class TestComposeTemplate:
    def test_stub_compose_draft_is_warning_not_error(self, tmp_path):
        d = make_app_dir(tmp_path, compose=STUB_COMPOSE)
        result = vc.validate_app_dir(d)
        assert not result.has_errors
        warn_fields = [di.field for di in result.diagnostics if di.severity == "WARN"]
        assert "compose.template.yml" in warn_fields

    def test_stub_compose_certified_is_error(self, tmp_path):
        d = make_app_dir(
            tmp_path,
            app_yaml=CERTIFIED_APP_YAML,
            schema=CERTIFIED_SCHEMA,
            compose=STUB_COMPOSE,
            healthchecks=MINIMAL_HEALTHCHECKS,
        )
        result = vc.validate_app_dir(d)
        assert result.has_errors
        error_fields = [di.field for di in result.diagnostics if di.severity == "ERROR"]
        assert "compose.template.yml" in error_fields

    def test_real_compose_passes(self, tmp_path):
        d = make_app_dir(tmp_path, compose=MINIMAL_COMPOSE)
        result = vc.validate_app_dir(d)
        assert not result.has_errors


# ---------------------------------------------------------------------------
# Tests: healthchecks.yaml validation
# ---------------------------------------------------------------------------

class TestHealthchecks:
    def test_valid_healthchecks_passes(self, tmp_path):
        d = make_app_dir(tmp_path, healthchecks=MINIMAL_HEALTHCHECKS)
        result = vc.validate_app_dir(d)
        assert not result.has_errors

    def test_healthchecks_missing_checks_key_is_error(self, tmp_path):
        bad_hc = "something: else\n"
        d = make_app_dir(tmp_path, healthchecks=bad_hc)
        result = vc.validate_app_dir(d)
        assert result.has_errors

    def test_healthchecks_empty_checks_is_error(self, tmp_path):
        empty_hc = "checks: []\n"
        d = make_app_dir(tmp_path, healthchecks=empty_hc)
        result = vc.validate_app_dir(d)
        assert result.has_errors


# ---------------------------------------------------------------------------
# Tests: field-level error output and exit codes
# ---------------------------------------------------------------------------

class TestOutputAndExitCodes:
    def test_diagnostics_have_app_name(self, tmp_path):
        d = make_app_dir(tmp_path, app_yaml=None, app_name="myapp")
        result = vc.validate_app_dir(d)
        assert result.app == "myapp"
        for diag in result.diagnostics:
            assert diag.app == "myapp"

    def test_diagnostic_str_format(self, tmp_path):
        d = make_app_dir(tmp_path, app_yaml=None)
        result = vc.validate_app_dir(d)
        for diag in result.diagnostics:
            s = str(diag)
            assert s.startswith("[ERROR]") or s.startswith("[WARN]")
            assert "test-app" in s
            assert " – " in s

    def test_is_stub_compose_detects_todo(self):
        assert vc.is_stub_compose("# TODO: compose template\n") is True
        assert vc.is_stub_compose("# TODO: compose template\n\n") is True
        assert vc.is_stub_compose("") is True

    def test_is_stub_compose_does_not_flag_real_compose(self):
        assert vc.is_stub_compose(MINIMAL_COMPOSE) is False

    def test_host_pattern_re_valid(self):
        valid = [
            "nextcloud.{tenant}.irongeeks.eu",
            "wiki-js.{tenant}.irongeeks.eu",
            "it-tools.{tenant}.irongeeks.eu",
        ]
        for hp in valid:
            assert vc.HOST_PATTERN_RE.match(hp), f"should match: {hp}"

    def test_host_pattern_re_invalid(self):
        invalid = [
            "nextcloud.irongeeks.eu",
            "nextcloud.{tenant}.example.com",
            "NEXTCLOUD.{tenant}.irongeeks.eu",
            "{tenant}.nextcloud.irongeeks.eu",
        ]
        for hp in invalid:
            assert not vc.HOST_PATTERN_RE.match(hp), f"should not match: {hp}"


# ---------------------------------------------------------------------------
# Integration: run against actual catalog (smoke test)
# ---------------------------------------------------------------------------

class TestRealCatalog:
    def test_real_catalog_passes_validation(self):
        """The real catalog must pass validation (no ERRORs) with the current policy."""
        catalog_apps = Path(__file__).resolve().parents[2] / "catalog" / "apps"
        if not catalog_apps.is_dir():
            pytest.skip("catalog/apps not found")

        app_dirs = sorted([p for p in catalog_apps.iterdir() if p.is_dir()])
        assert app_dirs, "no app directories found"

        all_results = [vc.validate_app_dir(d) for d in app_dirs]
        errors = [
            str(diag)
            for r in all_results
            for diag in r.diagnostics
            if diag.severity == "ERROR"
        ]
        assert errors == [], "Real catalog has validation errors:\n" + "\n".join(errors)
