#!/usr/bin/env python3
"""Minimal catalog validator for Sprint N+1 (B2 MVP)."""

from pathlib import Path
import re
import sys

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


def validate_app_dir(app_dir: Path) -> list[str]:
    errors: list[str] = []

    for req in REQUIRED_FILES:
        if not (app_dir / req).is_file():
            errors.append(f"{app_dir.name}: missing required file '{req}'")

    app_yaml = app_dir / "app.yaml"
    if app_yaml.is_file():
        keys = top_level_yaml_keys(app_yaml.read_text(encoding="utf-8"))
        missing_keys = [k for k in REQUIRED_APP_KEYS if k not in keys]
        for key in missing_keys:
            errors.append(f"{app_dir.name}: app.yaml missing required key '{key}'")

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
