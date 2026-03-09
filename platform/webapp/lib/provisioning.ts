import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { JobLogEntry, ProvisionPlan, Tenant, TenantSize } from '@/lib/types';

const exec = promisify(execCb);

const SIZE_MAP: Record<TenantSize, { cpu: number; ramGb: number; diskGb: number }> = {
  S: { cpu: 2, ramGb: 4, diskGb: 60 },
  M: { cpu: 4, ramGb: 8, diskGb: 120 },
  L: { cpu: 8, ramGb: 16, diskGb: 240 },
  XL: { cpu: 12, ramGb: 32, diskGb: 480 }
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function resolveRepoRoot() {
  const cwd = process.cwd();
  const directRoot = path.resolve(cwd);
  const parentRoot = path.resolve(cwd, '../..');

  // When running inside platform/webapp, repo root is ../..
  if (cwd.endsWith(path.join('platform', 'webapp'))) {
    return parentRoot;
  }

  // Fallback for running from repo root in development tools.
  return directRoot;
}

export function createCorrelationId() {
  return randomUUID();
}

export function buildProvisionPlan(tenant: Tenant): ProvisionPlan {
  const shape = SIZE_MAP[tenant.size];
  const tenantSlug = slugify(tenant.name);
  const ipAddress = `10.${tenant.vlan}.10.100`;
  const memoryMb = shape.ramGb * 1024;
  const vmId = 20000 + tenant.vlan;
  const debianTemplateId = Number(process.env.PROVISION_DEBIAN_TEMPLATE_ID ?? 9000);
  const tenantProfile = process.env.PROVISION_DEFAULT_TENANT_PROFILE ?? 'pve01-lvmthin';
  const sshPublicKey = process.env.PROVISION_DEFAULT_SSH_PUBLIC_KEY ?? '<SET_SSH_PUBLIC_KEY>';

  const vars = {
    tenantId: tenant.id,
    tenantSlug,
    tenantName: tenant.name,
    customer: tenant.customer,
    region: tenant.region,
    size: tenant.size,
    cpu: shape.cpu,
    ramGb: shape.ramGb,
    memoryMb,
    diskGb: shape.diskGb,
    vlan: tenant.vlan,
    vmId,
    ipAddress,
    debianTemplateId,
    tenantProfile,
    sshPublicKeyConfigured: sshPublicKey !== '<SET_SSH_PUBLIC_KEY>'
  };

  const repoRoot = resolveRepoRoot();
  const tofuDir = path.join(repoRoot, 'infra/opentofu/environments/prod');
  const ansibleInventory = path.join(repoRoot, 'automation/ansible/inventory/tenant.ini');
  const ansibleBootstrap = path.join(repoRoot, 'automation/ansible/playbooks/bootstrap-tenant.yml');
  const ansibleDeploy = path.join(repoRoot, 'automation/ansible/playbooks/deploy-apps.yml');

  const tfVars = [
    `tenant_name=${vars.tenantSlug}`,
    `vm_id=${vars.vmId}`,
    `vlan_id=${vars.vlan}`,
    `cores=${vars.cpu}`,
    `memory_mb=${vars.memoryMb}`,
    `disk_gb=${vars.diskGb}`,
    `debian_template_id=${vars.debianTemplateId}`,
    `tenant_profile=${vars.tenantProfile}`,
    `ssh_public_key=${sshPublicKey}`
  ];

  const commands = [
    `tofu -chdir='${tofuDir}' init -input=false`,
    `tofu -chdir='${tofuDir}' plan -input=false ${tfVars.map((value) => `-var '${value}'`).join(' ')}`,
    `ansible-playbook -i '${ansibleInventory}' '${ansibleBootstrap}'`,
    `ansible-playbook -i '${ansibleInventory}' '${ansibleDeploy}'`
  ];

  return { vars, commands };
}

export async function runProvisionCommands(commands: string[]): Promise<{
  logs: JobLogEntry[];
  outputSummary: string;
  failedCommand?: string;
}> {
  const logs: JobLogEntry[] = [];

  for (const command of commands) {
    try {
      logs.push({ at: new Date().toISOString(), level: 'info', message: `Running: ${command}` });
      const { stdout, stderr } = await exec(command, { cwd: process.cwd(), maxBuffer: 1024 * 1024 });

      const out = [stdout, stderr].filter(Boolean).join('\n').trim();
      logs.push({
        at: new Date().toISOString(),
        level: 'info',
        message: out ? summarizeText(out) : 'Command completed with no output.'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Command failed';
      logs.push({ at: new Date().toISOString(), level: 'error', message: summarizeText(message) });
      return {
        logs,
        failedCommand: command,
        outputSummary: summarizeLogs(logs)
      };
    }
  }

  return {
    logs,
    outputSummary: summarizeLogs(logs)
  };
}

function summarizeText(text: string, max = 240) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function summarizeLogs(logs: JobLogEntry[]) {
  return logs.slice(-6).map((line) => `[${line.level}] ${line.message}`).join(' | ');
}
