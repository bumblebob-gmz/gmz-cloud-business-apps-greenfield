#!/usr/bin/env python3
"""Catalog validator for app metadata quality checks."""

from pathlib import Path
import re

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
CERTIFIED_REFERENCE_APPS = {"authentik", "nextcloud"}
HOST_PATTERN_RE = re.compile(r"^[a-z0-9-]+\.\{tenant\}\.irongeeks\.eu$")


def top_level_yaml_keys(text: str) -> set[str]:
    keys = set()
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith((" ", "\t", "-")):
            continue
        m = re.match(r"^([A-Za-z0-9_-]+)\s*:\s*", line)
        if m:
            keys.add(m.group(1))
    return keys


def parse_simple_app_yaml(text: str) -> tuple[list[str], list[dict[str, object]], list[str]]:
    """Parse `requires` and `exposes` from our constrained app.yaml shape."""
    requires: list[str] = []
    exposes: list[dict[str, object]] = []
    parse_errors: list[str] = []

    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            i += 1
            continue

        if re.match(r"^requires\s*:\s*\[\s*\]\s*$", stripped):
            i += 1
            continue

        m_req_inline = re.match(r"^requires\s*:\s*\[(.*)\]\s*$", stripped)
        if m_req_inline:
            raw = m_req_inline.group(1).strip()
            if raw:
                requires.extend([p.strip().strip("'\"") for p in raw.split(",") if p.strip()])
            i += 1
            continue

        if re.match(r"^requires\s*:\s*$", stripped):
            i += 1
            while i < len(lines):
                entry = lines[i]
                if not entry.strip() or entry.lstrip().startswith("#"):
                    i += 1
                    continue
                if re.match(r"^\s*-[ \t]+", entry):
                    req_val = re.sub(r"^\s*-[ \t]+", "", entry).strip().strip("'\"")
                    if req_val:
                        requires.append(req_val)
                    i += 1
                    continue
                break
            continue

        if re.match(r"^exposes\s*:\s*$", stripped):
            i += 1
            current: dict[str, object] | None = None
            while i < len(lines):
                entry = lines[i]
                entry_stripped = entry.strip()
                if not entry_stripped or entry_stripped.startswith("#"):
                    i += 1
                    continue

                # New top-level key reached.
                if not entry.startswith((" ", "\t", "-")):
                    break

                item_start = re.match(r"^\s*-[ \t]+([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$", entry)
                if item_start:
                    if current is not None:
                        exposes.append(current)
                    current = {item_start.group(1): item_start.group(2).strip().strip("'\"")}
                    i += 1
                    continue

                item_field = re.match(r"^\s+([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$", entry)
                if item_field and current is not None:
                    current[item_field.group(1)] = item_field.group(2).strip().strip("'\"")
                    i += 1
                    continue

                parse_errors.append(f"could not parse exposes line: '{entry.rstrip()}'")
                i += 1

            if current is not None:
                exposes.append(current)
            continue

        i += 1

    return requires, exposes, parse_errors


def validate_app_dir(app_dir: Path) -> list[str]:
    errors: list[str] = []

    for req in REQUIRED_FILES:
        if not (app_dir / req).is_file():
            errors.append(f"{app_dir.name}: missing required file '{req}'")

    if app_dir.name in CERTIFIED_REFERENCE_APPS and not (app_dir / "healthchecks.yaml").is_file():
        errors.append(f"{app_dir.name}: missing required file 'healthchecks.yaml' for certified reference app")

    app_yaml = app_dir / "app.yaml"
    if app_yaml.is_file():
        text = app_yaml.read_text(encoding="utf-8")
        keys = top_level_yaml_keys(text)
        missing_keys = [k for k in REQUIRED_APP_KEYS if k not in keys]
        for key in missing_keys:
            errors.append(f"{app_dir.name}: app.yaml missing required key '{key}'")

        requires, exposes, parse_errors = parse_simple_app_yaml(text)
        for parse_error in parse_errors:
            errors.append(f"{app_dir.name}: {parse_error}")

        if "requires" in keys and not isinstance(requires, list):
            errors.append(f"{app_dir.name}: requires must be a list of app IDs")

        if "exposes" in keys:
            if not exposes:
                errors.append(f"{app_dir.name}: exposes must contain at least one entry")
            for idx, expose in enumerate(exposes, start=1):
                service = expose.get("service")
                if not isinstance(service, str) or not service:
                    errors.append(f"{app_dir.name}: exposes[{idx}] missing non-empty 'service'")

                port_raw = expose.get("port")
                try:
                    port = int(str(port_raw))
                    if port < 1 or port > 65535:
                        raise ValueError
                except (TypeError, ValueError):
                    errors.append(f"{app_dir.name}: exposes[{idx}] has invalid 'port' (must be 1-65535 integer)")

                host_pattern = expose.get("hostPattern")
                if not isinstance(host_pattern, str) or not HOST_PATTERN_RE.match(host_pattern):
                    errors.append(
                        f"{app_dir.name}: exposes[{idx}] hostPattern must match '<service>.{{tenant}}.irongeeks.eu'"
                    )

    return errors


def main() -> int:
    if not CATALOG_APPS.is_dir():
        print(f"ERROR: catalog path not found: {CATALOG_APPS}")
        return 2

    app_dirs = sorted([p for p in CATALOG_APPS.iterdir() if p.is_dir()])
    if not app_dirs:
        print("ERROR: no app directories found under catalog/apps")
        return 2

    all_errors: list[str] = []
    for app_dir in app_dirs:
        all_errors.extend(validate_app_dir(app_dir))

    if all_errors:
        print("Catalog validation FAILED:\n")
        for err in all_errors:
            print(f" - {err}")
        return 1

    print(f"Catalog validation OK ({len(app_dirs)} apps checked).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
