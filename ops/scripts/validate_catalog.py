#!/usr/bin/env python3
"""Catalog CI Validator for catalog/apps/.

Validates every app manifest against:
  1. Required file presence (app.yaml, compose.template.yml, vars.schema.json)
  2. app.yaml required fields and structural correctness
  3. Host pattern policy (<service>.{tenant}.irongeeks.eu)
  4. vars.schema.json completeness ($schema, additionalProperties, required/properties
     for certified-reference apps)
  5. healthchecks.yaml presence for non-draft apps
  6. Stub/placeholder compose.template.yml detection for non-draft apps

Exit codes:
  0 – all checks passed
  1 – one or more validation errors
  2 – infrastructure error (bad path, no apps found)

Field-level error format:
  [ERROR] <app>: <field/file> – <message>
  [WARN]  <app>: <field/file> – <message>
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[2]
CATALOG_APPS = ROOT / "catalog" / "apps"

REQUIRED_FILES = ["app.yaml", "compose.template.yml", "vars.schema.json"]

REQUIRED_APP_KEYS = [
    "id",
    "name",
    "version",
    "status",
    "requires",
    "supportsBranding",
    "supportsSSO",
    "exposes",
]

VALID_STATUSES = {"draft", "approved", "certified-reference", "deprecated"}

# Apps that require a healthchecks.yaml (all non-draft statuses + explicit list)
STATUSES_REQUIRING_HEALTHCHECKS = {"approved", "certified-reference"}

# Host pattern: <slug>.{tenant}.irongeeks.eu
HOST_PATTERN_RE = re.compile(r"^[a-z0-9][a-z0-9-]*\.\{tenant\}\.irongeeks\.eu$")

# Compose stub detection: file whose non-comment, non-blank lines are all TODO/placeholder
STUB_PATTERNS = re.compile(r"^\s*(#.*|TODO.*|FIXME.*|PLACEHOLDER.*)?\s*$", re.IGNORECASE)

# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

Severity = Literal["ERROR", "WARN"]


@dataclass
class Diagnostic:
    severity: Severity
    app: str
    field: str
    message: str

    def __str__(self) -> str:
        return f"[{self.severity}] {self.app}: {self.field} – {self.message}"


@dataclass
class ValidationResult:
    app: str
    diagnostics: list[Diagnostic] = field(default_factory=list)

    def error(self, fld: str, msg: str) -> None:
        self.diagnostics.append(Diagnostic("ERROR", self.app, fld, msg))

    def warn(self, fld: str, msg: str) -> None:
        self.diagnostics.append(Diagnostic("WARN", self.app, fld, msg))

    @property
    def has_errors(self) -> bool:
        return any(d.severity == "ERROR" for d in self.diagnostics)


# ---------------------------------------------------------------------------
# YAML helpers (stdlib only – no PyYAML dependency)
# ---------------------------------------------------------------------------

def top_level_yaml_keys(text: str) -> set[str]:
    """Return all top-level mapping keys in a simple YAML document."""
    keys: set[str] = set()
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line[0] in (" ", "\t", "-"):
            continue
        m = re.match(r"^([A-Za-z0-9_][A-Za-z0-9_-]*)\s*:", line)
        if m:
            keys.add(m.group(1))
    return keys


def yaml_scalar(text: str, key: str) -> str | None:
    """Return the scalar value of a top-level key, or None."""
    for line in text.splitlines():
        m = re.match(rf"^{re.escape(key)}\s*:\s*(.+)", line)
        if m:
            return m.group(1).strip().strip("'\"")
    return None


def parse_exposes(text: str) -> tuple[list[dict[str, object]], list[str]]:
    """Parse the `exposes` block into a list of dicts; returns (items, parse_errors)."""
    exposes: list[dict[str, object]] = []
    parse_errors: list[str] = []

    lines = text.splitlines()
    i = 0
    in_exposes = False
    current: dict[str, object] | None = None

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not in_exposes:
            if re.match(r"^exposes\s*:\s*$", stripped):
                in_exposes = True
            i += 1
            continue

        # End of exposes block when we hit a non-indented, non-list key
        if stripped and not line.startswith((" ", "\t", "-")):
            break

        if not stripped or stripped.startswith("#"):
            i += 1
            continue

        item_start = re.match(r"^\s*-\s+([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$", line)
        if item_start:
            if current is not None:
                exposes.append(current)
            current = {item_start.group(1): item_start.group(2).strip().strip("'\"")}
            i += 1
            continue

        item_field = re.match(r"^\s+([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$", line)
        if item_field and current is not None:
            current[item_field.group(1)] = item_field.group(2).strip().strip("'\"")
            i += 1
            continue

        parse_errors.append(f"unparseable exposes line: '{line.rstrip()}'")
        i += 1

    if current is not None:
        exposes.append(current)

    return exposes, parse_errors


def is_stub_compose(text: str) -> bool:
    """Return True if the compose template is essentially a TODO stub."""
    for line in text.splitlines():
        if not STUB_PATTERNS.match(line):
            return False
    return True


# ---------------------------------------------------------------------------
# Per-app validation
# ---------------------------------------------------------------------------

def validate_required_files(app_dir: Path, result: ValidationResult, status: str) -> None:
    for fname in REQUIRED_FILES:
        if not (app_dir / fname).is_file():
            result.error(fname, f"required file is missing")

    # healthchecks.yaml required for non-draft statuses
    if status in STATUSES_REQUIRING_HEALTHCHECKS:
        if not (app_dir / "healthchecks.yaml").is_file():
            result.error(
                "healthchecks.yaml",
                f"required for apps with status '{status}' but file is absent",
            )


def validate_app_yaml(app_dir: Path, result: ValidationResult) -> str:
    """Validate app.yaml; returns the parsed status string (or 'unknown')."""
    app_yaml_path = app_dir / "app.yaml"
    if not app_yaml_path.is_file():
        return "unknown"

    text = app_yaml_path.read_text(encoding="utf-8")
    keys = top_level_yaml_keys(text)

    # Required keys
    for key in REQUIRED_APP_KEYS:
        if key not in keys:
            result.error("app.yaml", f"missing required field '{key}'")

    # Status value
    status = yaml_scalar(text, "status") or "unknown"
    if status not in VALID_STATUSES:
        result.error(
            "app.yaml",
            f"field 'status' has invalid value '{status}'; "
            f"allowed: {', '.join(sorted(VALID_STATUSES))}",
        )

    # id must be kebab-case and match directory name
    app_id = yaml_scalar(text, "id")
    if app_id is not None:
        if not re.match(r"^[a-z0-9][a-z0-9-]*$", app_id):
            result.error("app.yaml", f"field 'id' must be kebab-case, got '{app_id}'")
        if app_id != app_dir.name:
            result.error(
                "app.yaml",
                f"field 'id' ('{app_id}') must match directory name ('{app_dir.name}')",
            )

    # exposes block
    if "exposes" in keys:
        exposes, parse_errors = parse_exposes(text)
        for pe in parse_errors:
            result.warn("app.yaml/exposes", pe)

        if not exposes:
            result.error("app.yaml", "field 'exposes' must contain at least one entry")

        for idx, expose in enumerate(exposes, start=1):
            prefix = f"app.yaml/exposes[{idx}]"

            service = expose.get("service")
            if not isinstance(service, str) or not service:
                result.error(prefix, "missing or empty 'service'")
            elif not re.match(r"^[a-z0-9][a-z0-9-]*$", service):
                result.error(prefix, f"'service' must be kebab-case, got '{service}'")

            port_raw = expose.get("port")
            try:
                port = int(str(port_raw))
                if port < 1 or port > 65535:
                    raise ValueError
            except (TypeError, ValueError):
                result.error(prefix, f"'port' must be an integer 1–65535, got '{port_raw}'")

            host_pattern = expose.get("hostPattern")
            if not isinstance(host_pattern, str) or not HOST_PATTERN_RE.match(host_pattern):
                result.error(
                    prefix,
                    f"'hostPattern' must match '<service>.{{tenant}}.irongeeks.eu', "
                    f"got '{host_pattern}'",
                )
            elif isinstance(service, str) and service:
                # First label of hostPattern must equal service slug
                first_label = host_pattern.split(".")[0]
                if first_label != service:
                    result.error(
                        prefix,
                        f"'hostPattern' first label ('{first_label}') "
                        f"must equal 'service' ('{service}')",
                    )

    return status


def validate_vars_schema(app_dir: Path, result: ValidationResult, status: str) -> None:
    schema_path = app_dir / "vars.schema.json"
    if not schema_path.is_file():
        return  # already flagged by validate_required_files

    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        result.error("vars.schema.json", f"invalid JSON: {exc}")
        return

    if not isinstance(schema, dict):
        result.error("vars.schema.json", "root must be a JSON object")
        return

    # $schema must be present
    if "$schema" not in schema:
        result.error("vars.schema.json", "missing '$schema' declaration")

    # type: object
    if schema.get("type") != "object":
        result.error("vars.schema.json", "root 'type' must be 'object'")

    # additionalProperties: false
    if schema.get("additionalProperties") is not False:
        result.error(
            "vars.schema.json",
            "'additionalProperties' must be false for catalog hygiene",
        )

    # For certified-reference apps: properties must be non-trivial and required must be set
    if status == "certified-reference":
        props = schema.get("properties", {})
        if not isinstance(props, dict) or len(props) == 0:
            result.error(
                "vars.schema.json",
                "certified-reference app must define at least one property in 'properties'",
            )

        required = schema.get("required", [])
        if not isinstance(required, list) or len(required) == 0:
            result.error(
                "vars.schema.json",
                "certified-reference app must declare at least one 'required' variable",
            )

        # Each required key must exist in properties
        if isinstance(props, dict) and isinstance(required, list):
            for req_key in required:
                if req_key not in props:
                    result.error(
                        "vars.schema.json",
                        f"'required' entry '{req_key}' has no corresponding entry in 'properties'",
                    )


def validate_compose_template(app_dir: Path, result: ValidationResult, status: str) -> None:
    compose_path = app_dir / "compose.template.yml"
    if not compose_path.is_file():
        return  # already flagged

    text = compose_path.read_text(encoding="utf-8")

    if is_stub_compose(text):
        if status in STATUSES_REQUIRING_HEALTHCHECKS:
            result.error(
                "compose.template.yml",
                f"file is a TODO stub; real compose definition required for status '{status}'",
            )
        else:
            result.warn(
                "compose.template.yml",
                "file is a TODO stub (acceptable for draft apps, but should be completed)",
            )
        return

    # Non-stub: check that at least one 'services:' key exists
    if "services:" not in text:
        result.warn(
            "compose.template.yml",
            "no 'services:' block found; compose template may be incomplete",
        )

    # Check for hardcoded tenant-specific domains (anti-pattern)
    hardcoded_domain = re.search(r"[a-z0-9-]+\.[a-z0-9-]+\.irongeeks\.eu", text)
    if hardcoded_domain:
        result.warn(
            "compose.template.yml",
            f"possible hardcoded domain detected ('{hardcoded_domain.group()}'); "
            "use ${VAR} placeholders instead",
        )


def validate_healthchecks(app_dir: Path, result: ValidationResult) -> None:
    hc_path = app_dir / "healthchecks.yaml"
    if not hc_path.is_file():
        return  # absence already flagged if required

    text = hc_path.read_text(encoding="utf-8")
    keys = top_level_yaml_keys(text)

    if "checks" not in keys:
        result.error("healthchecks.yaml", "missing top-level 'checks' key")
        return

    # Count checks entries naively
    check_entries = [l for l in text.splitlines() if re.match(r"\s*-\s+id\s*:", l)]
    if not check_entries:
        result.error("healthchecks.yaml", "'checks' list appears empty – add at least one check")


def validate_app_dir(app_dir: Path) -> ValidationResult:
    result = ValidationResult(app=app_dir.name)

    # First pass: get status (needed for tier checks)
    app_yaml_path = app_dir / "app.yaml"
    if app_yaml_path.is_file():
        text = app_yaml_path.read_text(encoding="utf-8")
        status_raw = yaml_scalar(text, "status") or "unknown"
        status = status_raw if status_raw in VALID_STATUSES else "unknown"
    else:
        status = "unknown"

    validate_required_files(app_dir, result, status)
    status = validate_app_yaml(app_dir, result)  # may update status after full parse
    validate_vars_schema(app_dir, result, status)
    validate_compose_template(app_dir, result, status)
    validate_healthchecks(app_dir, result)

    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    if not CATALOG_APPS.is_dir():
        print(f"[FATAL] catalog path not found: {CATALOG_APPS}", file=sys.stderr)
        return 2

    app_dirs = sorted([p for p in CATALOG_APPS.iterdir() if p.is_dir()])
    if not app_dirs:
        print(f"[FATAL] no app directories found under {CATALOG_APPS}", file=sys.stderr)
        return 2

    results = [validate_app_dir(d) for d in app_dirs]

    has_errors = any(r.has_errors for r in results)
    has_diags = any(r.diagnostics for r in results)

    if has_diags:
        for r in results:
            for d in r.diagnostics:
                print(d)

    if has_errors:
        error_count = sum(
            sum(1 for d in r.diagnostics if d.severity == "ERROR") for r in results
        )
        warn_count = sum(
            sum(1 for d in r.diagnostics if d.severity == "WARN") for r in results
        )
        print(
            f"\nCatalog validation FAILED: {error_count} error(s), {warn_count} warning(s) "
            f"across {len(app_dirs)} app(s).",
            file=sys.stderr,
        )
        return 1

    warn_count = sum(len(r.diagnostics) for r in results)
    if warn_count:
        print(
            f"\nCatalog validation PASSED with {warn_count} warning(s) "
            f"({len(app_dirs)} apps checked)."
        )
    else:
        print(f"Catalog validation OK ({len(app_dirs)} apps checked).")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
