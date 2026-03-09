/**
 * opentofu-auth.test.mjs
 *
 * Static-analysis integration tests for the OpenTofu Proxmox auth configuration.
 * Verifies that:
 *   - No username/password auth variables exist in the provider configuration
 *   - proxmox_api_token is declared as sensitive = true
 *   - The provider block uses api_token, not username/password
 *   - The rights matrix is documented in main.tf
 *   - No accidental credential leaks in tfvars.example
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TOFU_ROOT = join(
  process.cwd(),
  "../../infra/opentofu"
);
const PROD_ENV = join(TOFU_ROOT, "environments/prod");
const MODULE_VM = join(TOFU_ROOT, "modules/tenant-vm");

function readTF(dir, file) {
  const p = join(dir, file);
  assert.ok(existsSync(p), `Expected file not found: ${p}`);
  return readFileSync(p, "utf8");
}

// ---------------------------------------------------------------------------
// Auth hardening: variables.tf
// ---------------------------------------------------------------------------
describe("OpenTofu auth variables (environments/prod/variables.tf)", () => {
  const vars = readTF(PROD_ENV, "variables.tf");

  it("declares proxmox_api_token as sensitive", () => {
    // Extract the proxmox_api_token block
    const tokenBlock = vars.match(
      /variable\s+"proxmox_api_token"\s*\{[^}]+\}/s
    )?.[0];
    assert.ok(tokenBlock, "proxmox_api_token variable block not found");
    assert.match(
      tokenBlock,
      /sensitive\s*=\s*true/,
      "proxmox_api_token must have sensitive = true"
    );
  });

  it("does NOT declare proxmox_username", () => {
    assert.doesNotMatch(
      vars,
      /variable\s+"proxmox_username"/,
      "proxmox_username must not exist — only API token auth is supported"
    );
  });

  it("does NOT declare proxmox_password", () => {
    assert.doesNotMatch(
      vars,
      /variable\s+"proxmox_password"/,
      "proxmox_password must not exist — only API token auth is supported"
    );
  });

  it("has a format validation on proxmox_api_token", () => {
    const tokenBlock = vars.match(
      /variable\s+"proxmox_api_token"\s*\{[^}]*validation[^}]*\{[^}]+\}[^}]+\}/s
    )?.[0];
    assert.ok(
      tokenBlock,
      "proxmox_api_token should have a validation block for token format"
    );
  });

  it("has a URL scheme validation on proxmox_endpoint", () => {
    const endpointBlock = vars.match(
      /variable\s+"proxmox_endpoint"\s*\{[^}]*validation[^}]*\{[^}]+\}[^}]+\}/s
    )?.[0];
    assert.ok(
      endpointBlock,
      "proxmox_endpoint should have a validation block for https:// scheme"
    );
  });
});

// ---------------------------------------------------------------------------
// Provider block: main.tf
// ---------------------------------------------------------------------------
describe("OpenTofu provider block (environments/prod/main.tf)", () => {
  const main = readTF(PROD_ENV, "main.tf");

  it("provider uses api_token, not username/password", () => {
    // Extract the provider "proxmox" block
    const providerBlock = main.match(
      /provider\s+"proxmox"\s*\{[^}]+\}/s
    )?.[0];
    assert.ok(providerBlock, "provider 'proxmox' block not found in main.tf");

    assert.match(
      providerBlock,
      /api_token\s*=/,
      "provider block must configure api_token"
    );
    assert.doesNotMatch(
      providerBlock,
      /username\s*=/,
      "provider block must NOT configure username"
    );
    assert.doesNotMatch(
      providerBlock,
      /password\s*=/,
      "provider block must NOT configure password"
    );
  });

  it("documents the rights matrix in a comment", () => {
    assert.match(
      main,
      /rights matrix/i,
      "main.tf should document the required Proxmox rights matrix"
    );
    assert.match(
      main,
      /VM\.Allocate/,
      "rights matrix comment must include VM.Allocate"
    );
    assert.match(
      main,
      /Datastore\.AllocateSpace/,
      "rights matrix comment must include Datastore.AllocateSpace"
    );
  });

  it("explicitly notes username/password are NOT configured", () => {
    assert.match(
      main,
      /username.*NOT|NOT.*username/i,
      "main.tf should explicitly document that username/password are not used"
    );
  });
});

// ---------------------------------------------------------------------------
// tfvars.example: no plain secrets
// ---------------------------------------------------------------------------
describe("terraform.tfvars.example safety checks", () => {
  const example = readTF(PROD_ENV, "terraform.tfvars.example");

  it("does NOT contain a real-looking API token secret", () => {
    // The example should use a placeholder like CHANGE_ME
    assert.doesNotMatch(
      example,
      /proxmox_api_token\s*=\s*"[^"]{20,}(?<!CHANGE_ME)"/,
      "tfvars.example must use a CHANGE_ME placeholder, not a real secret"
    );
  });

  it("does NOT declare proxmox_username or proxmox_password", () => {
    assert.doesNotMatch(example, /proxmox_username/);
    assert.doesNotMatch(example, /proxmox_password/);
  });

  it("uses api_token format placeholder", () => {
    assert.match(
      example,
      /proxmox_api_token/,
      "example must show how to set proxmox_api_token"
    );
  });
});

// ---------------------------------------------------------------------------
// Module: tenant-vm variables
// ---------------------------------------------------------------------------
describe("OpenTofu module tenant-vm variables", () => {
  const vars = readTF(MODULE_VM, "variables.tf");

  it("does NOT expose any auth variables (module is auth-agnostic)", () => {
    assert.doesNotMatch(vars, /proxmox_api_token/);
    assert.doesNotMatch(vars, /proxmox_username/);
    assert.doesNotMatch(vars, /proxmox_password/);
  });
});

// ---------------------------------------------------------------------------
// Rights matrix documentation: tests directory exists
// ---------------------------------------------------------------------------
describe("OpenTofu test suite structure", () => {
  it("tftest.hcl files exist for auth tests", () => {
    const testsDir = join(TOFU_ROOT, "tests");
    assert.ok(existsSync(testsDir), "infra/opentofu/tests/ directory must exist");
    const files = readdirSync(testsDir);
    const tfTests = files.filter((f) => f.endsWith(".tftest.hcl"));
    assert.ok(
      tfTests.length >= 2,
      `Expected at least 2 .tftest.hcl files, found: ${tfTests.join(", ")}`
    );
    assert.ok(
      tfTests.some((f) => f.includes("auth")),
      "An auth-focused .tftest.hcl must exist"
    );
    assert.ok(
      tfTests.some((f) => f.includes("rights")),
      "A rights-matrix .tftest.hcl must exist"
    );
  });
});
