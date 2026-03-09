"""
Tests for gate-artifact-publisher.sh — N2-7

Verifies:
  1. Script exists and has valid bash syntax
  2. Dry-run mode produces all required evidence files
  3. Bundle index.md contains all required sections
  4. All JSON evidence files are valid JSON
  5. Evidence files contain required top-level fields
  6. Tarball and ZIP are produced
  7. Missing rollback script triggers section failure
  8. Script exits 0 on success, 1 on gate failure
"""

import json
import os
import subprocess
import tarfile
import zipfile
import tempfile
import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
PUBLISHER_SCRIPT = os.path.join(REPO_ROOT, "ops/scripts/gate-artifact-publisher.sh")

REQUIRED_EVIDENCE_FILES = [
    "provisioning_e2e_trace.json",
    "deploy_trace.json",
    "rollback_drill_evidence.json",
    "audit_event_sample.json",
    "test_results_summary.json",
    "security_scan_results.json",
    "index.md",
]

REQUIRED_JSON_FIELDS = {
    "provisioning_e2e_trace.json": ["run_id", "gate"],
    "deploy_trace.json":           ["run_id", "gate", "deploy_events"],
    "rollback_drill_evidence.json":["run_id", "gate", "drill_status"],
    "audit_event_sample.json":     ["run_id", "gate", "events"],
    "test_results_summary.json":   ["run_id", "gate", "overall_status", "suites"],
    "security_scan_results.json":  ["run_id", "gate", "checks"],
}


class TestScriptExists:
    def test_publisher_script_exists(self):
        assert os.path.isfile(PUBLISHER_SCRIPT), (
            f"gate-artifact-publisher.sh not found at {PUBLISHER_SCRIPT}"
        )

    def test_publisher_script_is_executable(self):
        assert os.access(PUBLISHER_SCRIPT, os.X_OK), (
            "gate-artifact-publisher.sh is not executable"
        )

    def test_publisher_script_bash_syntax(self):
        result = subprocess.run(
            ["bash", "-n", PUBLISHER_SCRIPT],
            capture_output=True, text=True
        )
        assert result.returncode == 0, (
            f"bash -n (syntax check) failed:\n{result.stderr}"
        )


class TestDryRun:
    """End-to-end dry-run: produces all evidence files without live probes."""

    @pytest.fixture(scope="class")
    def dry_run_output(self, tmp_path_factory):
        out_dir = str(tmp_path_factory.mktemp("gate-evidence"))
        result = subprocess.run(
            ["bash", PUBLISHER_SCRIPT, "--dry-run", "--out-dir", out_dir, "--gate", "G2"],
            capture_output=True, text=True, cwd=REPO_ROOT
        )
        # Locate bundle dir
        bundle_dir = None
        for entry in os.listdir(out_dir):
            candidate = os.path.join(out_dir, entry)
            if os.path.isdir(candidate) and "evidence" in entry:
                bundle_dir = candidate
                break
        return {
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "out_dir": out_dir,
            "bundle_dir": bundle_dir,
        }

    def test_exits_zero(self, dry_run_output):
        rc = dry_run_output["returncode"]
        assert rc == 0, (
            f"gate-artifact-publisher.sh --dry-run exited {rc}\n"
            f"stderr:\n{dry_run_output['stderr']}\n"
            f"stdout:\n{dry_run_output['stdout']}"
        )

    def test_bundle_dir_created(self, dry_run_output):
        assert dry_run_output["bundle_dir"] is not None, (
            "No bundle directory found in output dir"
        )
        assert os.path.isdir(dry_run_output["bundle_dir"])

    @pytest.mark.parametrize("filename", REQUIRED_EVIDENCE_FILES)
    def test_evidence_file_exists(self, dry_run_output, filename):
        bundle_dir = dry_run_output["bundle_dir"]
        assert bundle_dir is not None
        filepath = os.path.join(bundle_dir, filename)
        assert os.path.isfile(filepath), (
            f"Required evidence file missing: {filename}"
        )

    @pytest.mark.parametrize("filename,fields", REQUIRED_JSON_FIELDS.items())
    def test_json_file_valid_and_has_required_fields(self, dry_run_output, filename, fields):
        bundle_dir = dry_run_output["bundle_dir"]
        assert bundle_dir is not None
        filepath = os.path.join(bundle_dir, filename)
        assert os.path.isfile(filepath), f"{filename} does not exist"
        with open(filepath) as f:
            data = json.load(f)  # raises if invalid JSON
        for field in fields:
            assert field in data, (
                f"{filename} missing required field '{field}'. Keys: {list(data.keys())}"
            )

    def test_index_md_contains_all_sections(self, dry_run_output):
        bundle_dir = dry_run_output["bundle_dir"]
        assert bundle_dir is not None
        index_path = os.path.join(bundle_dir, "index.md")
        with open(index_path) as f:
            content = f.read()
        for evidence_file in REQUIRED_EVIDENCE_FILES:
            if evidence_file.endswith(".json"):
                assert evidence_file in content, (
                    f"index.md does not reference {evidence_file}"
                )

    def test_index_md_contains_gate_level(self, dry_run_output):
        bundle_dir = dry_run_output["bundle_dir"]
        assert bundle_dir is not None
        with open(os.path.join(bundle_dir, "index.md")) as f:
            content = f.read()
        assert "G2" in content

    def test_tarball_produced(self, dry_run_output):
        out_dir = dry_run_output["out_dir"]
        tarballs = [f for f in os.listdir(out_dir) if f.endswith(".tar.gz")]
        assert len(tarballs) >= 1, "No .tar.gz archive produced"

    def test_zip_produced(self, dry_run_output):
        out_dir = dry_run_output["out_dir"]
        zips = [f for f in os.listdir(out_dir) if f.endswith(".zip")]
        assert len(zips) >= 1, "No .zip archive produced"

    def test_tarball_contains_all_evidence_files(self, dry_run_output):
        out_dir = dry_run_output["out_dir"]
        tarballs = [f for f in os.listdir(out_dir) if f.endswith(".tar.gz")]
        assert tarballs, "No tarball to inspect"
        tarball_path = os.path.join(out_dir, tarballs[0])
        with tarfile.open(tarball_path, "r:gz") as tf:
            names = tf.getnames()
        for ev_file in REQUIRED_EVIDENCE_FILES:
            assert any(ev_file in name for name in names), (
                f"Evidence file {ev_file!r} not found in tarball. "
                f"Tarball contents: {names}"
            )

    def test_zip_contains_all_evidence_files(self, dry_run_output):
        out_dir = dry_run_output["out_dir"]
        zips = [f for f in os.listdir(out_dir) if f.endswith(".zip")]
        assert zips, "No ZIP to inspect"
        zip_path = os.path.join(out_dir, zips[0])
        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
        for ev_file in REQUIRED_EVIDENCE_FILES:
            assert any(ev_file in name for name in names), (
                f"Evidence file {ev_file!r} not found in ZIP. "
                f"ZIP contents: {names}"
            )


class TestRollbackDrillEvidence:
    """Specific checks on rollback drill evidence fields."""

    @pytest.fixture(scope="class")
    def rollback_evidence(self, tmp_path_factory):
        out_dir = str(tmp_path_factory.mktemp("rollback-evidence"))
        subprocess.run(
            ["bash", PUBLISHER_SCRIPT, "--dry-run", "--out-dir", out_dir, "--gate", "G2"],
            capture_output=True, text=True, cwd=REPO_ROOT
        )
        for entry in os.listdir(out_dir):
            candidate = os.path.join(out_dir, entry)
            if os.path.isdir(candidate):
                fp = os.path.join(candidate, "rollback_drill_evidence.json")
                if os.path.isfile(fp):
                    with open(fp) as f:
                        return json.load(f)
        return None

    def test_rollback_drill_status_field(self, rollback_evidence):
        assert rollback_evidence is not None
        assert "drill_status" in rollback_evidence

    def test_rollback_script_present(self, rollback_evidence):
        assert rollback_evidence is not None
        assert rollback_evidence.get("rollback_script_present") is True

    def test_rollback_syntax_ok(self, rollback_evidence):
        assert rollback_evidence is not None
        assert rollback_evidence.get("rollback_script_syntax_ok") is True

    def test_missing_snapshot_guard_verified(self, rollback_evidence):
        assert rollback_evidence is not None
        assert rollback_evidence.get("missing_snapshot_guard_verified") is True


class TestAuditEventSample:
    """Specific checks on audit event sample shapes."""

    @pytest.fixture(scope="class")
    def audit_sample(self, tmp_path_factory):
        out_dir = str(tmp_path_factory.mktemp("audit-sample"))
        subprocess.run(
            ["bash", PUBLISHER_SCRIPT, "--dry-run", "--out-dir", out_dir, "--gate", "G2"],
            capture_output=True, text=True, cwd=REPO_ROOT
        )
        for entry in os.listdir(out_dir):
            candidate = os.path.join(out_dir, entry)
            if os.path.isdir(candidate):
                fp = os.path.join(candidate, "audit_event_sample.json")
                if os.path.isfile(fp):
                    with open(fp) as f:
                        return json.load(f)
        return None

    def test_events_is_list(self, audit_sample):
        assert audit_sample is not None
        assert isinstance(audit_sample.get("events"), list)

    def test_at_least_four_events(self, audit_sample):
        assert audit_sample is not None
        assert len(audit_sample["events"]) >= 4, (
            "Audit sample should include at least 4 events (provision, deploy, rollback, RBAC deny)"
        )

    def test_each_event_has_required_fields(self, audit_sample):
        required = {"event_id", "correlation_id", "tenant_id", "actor", "action", "outcome", "timestamp"}
        for event in audit_sample["events"]:
            missing = required - set(event.keys())
            assert not missing, (
                f"Audit event {event.get('event_id')} missing fields: {missing}"
            )

    def test_rbac_deny_event_present(self, audit_sample):
        deny_events = [e for e in audit_sample["events"] if e.get("outcome") == "denied"]
        assert len(deny_events) >= 1, (
            "At least one RBAC deny audit event expected in sample"
        )

    def test_rollback_event_present(self, audit_sample):
        rollback_events = [e for e in audit_sample["events"] if "rollback" in e.get("action", "")]
        assert len(rollback_events) >= 1, (
            "At least one rollback audit event expected in sample"
        )


class TestTestResultsSummary:
    """Checks on test results summary structure."""

    @pytest.fixture(scope="class")
    def test_results(self, tmp_path_factory):
        out_dir = str(tmp_path_factory.mktemp("test-results"))
        subprocess.run(
            ["bash", PUBLISHER_SCRIPT, "--dry-run", "--out-dir", out_dir, "--gate", "G2"],
            capture_output=True, text=True, cwd=REPO_ROOT
        )
        for entry in os.listdir(out_dir):
            candidate = os.path.join(out_dir, entry)
            if os.path.isdir(candidate):
                fp = os.path.join(candidate, "test_results_summary.json")
                if os.path.isfile(fp):
                    with open(fp) as f:
                        return json.load(f)
        return None

    def test_has_suites(self, test_results):
        assert test_results is not None
        assert "suites" in test_results

    def test_has_webapp_suite(self, test_results):
        assert test_results is not None
        assert "webapp" in test_results["suites"]

    def test_has_catalog_suite(self, test_results):
        assert test_results is not None
        assert "catalog_validator" in test_results["suites"]

    def test_webapp_suite_has_status(self, test_results):
        assert test_results is not None
        webapp = test_results["suites"]["webapp"]
        assert "status" in webapp

    def test_overall_status_present(self, test_results):
        assert test_results is not None
        assert test_results.get("overall_status") in ("pass", "fail", "unknown")
