import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { JobLogEntry, ProvisionPlan, ProvisionPreflight, Tenant, TenantSize } from '@/lib/types';

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

  if (cwd.endsWith(path.join('platform', 'webapp'))) {
    return parentRoot;
  }

  return directRoot;
}

function asBool(value: string | undefined) {
  return value === 'true';
}

function hasValue(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function toRetryCount(value: string | undefined, fallback = 1) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, 5);
}

function stepSupportsRetry(command: string) {
  const normalized = command.trim();
  return (
    normalized.includes('tofu ') && (normalized.includes(' plan ') || normalized.includes(' apply '))
  ) || normalized.startsWith('ansible-playbook ');
}

function getStepName(command: string) {
  if (command.includes('tofu ') && command.includes(' init ')) return 'tofu-init';
  if (command.includes('tofu ') && command.includes(' plan ')) return 'tofu-plan';
  if (command.includes('tofu ') && command.includes(' apply ')) return 'tofu-apply';
  if (command.startsWith('ansible-playbook ')) return command.includes('deploy-apps.yml') ? 'ansible-deploy' : 'ansible-bootstrap';
  return 'command';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getProvisionPreflight(): ProvisionPreflight {
  const required = {
    PROVISION_PROXMOX_ENDPOINT: hasValue(process.env.PROVISION_PROXMOX_ENDPOINT),
    PROVISION_PROXMOX_API_TOKEN: hasValue(process.env.PROVISION_PROXMOX_API_TOKEN),
    PROVISION_DEFAULT_SSH_PUBLIC_KEY: hasValue(process.env.PROVISION_DEFAULT_SSH_PUBLIC_KEY)
  };

  const optionalDefaults = {
    PROVISION_DEFAULT_NODE: hasValue(process.env.PROVISION_DEFAULT_NODE),
    PROVISION_DEFAULT_STORAGE: hasValue(process.env.PROVISION_DEFAULT_STORAGE),
    PROVISION_DEFAULT_TENANT_PROFILE: hasValue(process.env.PROVISION_DEFAULT_TENANT_PROFILE),
    PROVISION_DEBIAN_TEMPLATE_ID: hasValue(process.env.PROVISION_DEBIAN_TEMPLATE_ID)
  };

  const executionEnabled = asBool(process.env.PROVISION_EXECUTION_ENABLED);
  const missingForExecution = Object.entries(required)
    .filter(([, present]) => !present)
    .map(([name]) => name);

  return {
    ready: executionEnabled && missingForExecution.length === 0,
    executionEnabled,
    required,
    optionalDefaults,
    missingForExecution
  };
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
  const tenantProfile = process.env.PROVISION_DEFAULT_TENANT_PROFILE?.trim();
  const nodeName = process.env.PROVISION_DEFAULT_NODE?.trim();
  const storage = process.env.PROVISION_DEFAULT_STORAGE?.trim();
  const sshPublicKey = process.env.PROVISION_DEFAULT_SSH_PUBLIC_KEY ?? '<SET_SSH_PUBLIC_KEY>';
  const proxmoxEndpoint = process.env.PROVISION_PROXMOX_ENDPOINT ?? 'https://proxmox.local:8006/api2/json';
  const proxmoxApiToken = process.env.PROVISION_PROXMOX_API_TOKEN ?? 'CHANGE_ME';

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
    nodeName,
    storage,
    sshPublicKeyConfigured: sshPublicKey !== '<SET_SSH_PUBLIC_KEY>'
  };

  const repoRoot = resolveRepoRoot();
  const tofuDir = path.join(repoRoot, 'infra/opentofu/environments/prod');
  const ansibleBootstrap = path.join(repoRoot, 'automation/ansible/playbooks/bootstrap-tenant.yml');
  const ansibleDeploy = path.join(repoRoot, 'automation/ansible/playbooks/deploy-apps.yml');

  const tfVars = [
    `proxmox_endpoint = ${toHclString(proxmoxEndpoint)}`,
    `proxmox_api_token = ${toHclString(proxmoxApiToken)}`,
    `tenant_name = ${toHclString(vars.tenantSlug)}`,
    `vm_id = ${vars.vmId}`,
    `vlan_id = ${vars.vlan}`,
    `cores = ${vars.cpu}`,
    `memory_mb = ${vars.memoryMb}`,
    `disk_gb = ${vars.diskGb}`,
    `debian_template_id = ${vars.debianTemplateId}`,
    `ssh_public_key = ${toHclString(sshPublicKey)}`
  ];

  if (tenantProfile) {
    tfVars.push(`tenant_profile = ${toHclString(tenantProfile)}`);
  } else if (nodeName && storage) {
    tfVars.push(`node_name = ${toHclString(nodeName)}`);
    tfVars.push(`storage = ${toHclString(storage)}`);
  }

  const commands = [
    `tofu -chdir='${tofuDir}' init -input=false`,
    `tofu -chdir='${tofuDir}' plan -input=false -var-file='<TFVARS_PATH>'`,
    `tofu -chdir='${tofuDir}' apply -input=false -auto-approve -var-file='<TFVARS_PATH>'`,
    `ansible-playbook -i '<INVENTORY_PATH>' '${ansibleBootstrap}'`,
    `ansible-playbook -i '<INVENTORY_PATH>' '${ansibleDeploy}'`
  ];

  return { vars, commands, generatedFiles: { tfvarsPath: '', inventoryPath: '', workDir: '' } };
}

export async function materializeProvisionFiles(jobId: string, plan: ProvisionPlan) {
  const webappRoot = process.cwd();
  const workDir = path.join(webappRoot, '.data/provisioning', jobId);
  await mkdir(workDir, { recursive: true });

  const tfvarsPath = path.join(workDir, 'tenant.auto.tfvars');
  const inventoryPath = path.join(workDir, 'tenant.ini');

  const tfvarsLines = [
    `tenant_name = ${toHclString(plan.vars.tenantSlug)}`,
    `vm_id = ${plan.vars.vmId}`,
    `vlan_id = ${plan.vars.vlan}`,
    `cores = ${plan.vars.cpu}`,
    `memory_mb = ${plan.vars.memoryMb}`,
    `disk_gb = ${plan.vars.diskGb}`,
    `debian_template_id = ${plan.vars.debianTemplateId}`,
    `ssh_public_key = ${toHclString(process.env.PROVISION_DEFAULT_SSH_PUBLIC_KEY ?? '<SET_SSH_PUBLIC_KEY>')}`,
    `proxmox_endpoint = ${toHclString(process.env.PROVISION_PROXMOX_ENDPOINT ?? 'https://proxmox.local:8006/api2/json')}`,
    `proxmox_api_token = ${toHclString(process.env.PROVISION_PROXMOX_API_TOKEN ?? 'CHANGE_ME')}`
  ];

  if (plan.vars.tenantProfile) {
    tfvarsLines.push(`tenant_profile = ${toHclString(plan.vars.tenantProfile)}`);
  } else if (plan.vars.nodeName && plan.vars.storage) {
    tfvarsLines.push(`node_name = ${toHclString(plan.vars.nodeName)}`);
    tfvarsLines.push(`storage = ${toHclString(plan.vars.storage)}`);
  }

  const inventory = [
    '[tenant]',
    `${plan.vars.tenantSlug} ansible_host=${plan.vars.ipAddress} ansible_user=debian`,
    '',
    '[tenant:vars]',
    'ansible_python_interpreter=/usr/bin/python3'
  ].join('\n');

  await writeFile(tfvarsPath, `${tfvarsLines.join('\n')}\n`, 'utf8');
  await writeFile(inventoryPath, `${inventory}\n`, 'utf8');

  return { workDir, tfvarsPath, inventoryPath };
}

export async function runProvisionCommands(commands: string[]): Promise<{
  logs: JobLogEntry[];
  outputSummary: string;
  commandResults: { command: string; exitCode: number; snippet: string }[];
  commandAttempts: {
    command: string;
    step: string;
    attempt: number;
    maxAttempts: number;
    exitCode: number;
    snippet: string;
    at: string;
    backoffMs?: number;
  }[];
  retriesConfigured: number;
  failedCommand?: string;
  failedStep?: string;
  applySucceeded: boolean;
}> {
  const logs: JobLogEntry[] = [];
  const commandResults: { command: string; exitCode: number; snippet: string }[] = [];
  const commandAttempts: {
    command: string;
    step: string;
    attempt: number;
    maxAttempts: number;
    exitCode: number;
    snippet: string;
    at: string;
    backoffMs?: number;
  }[] = [];

  const retriesConfigured = toRetryCount(process.env.PROVISION_COMMAND_MAX_RETRIES, 1);
  let applySucceeded = false;

  for (const command of commands) {
    const step = getStepName(command);
    const supportsRetry = stepSupportsRetry(command);
    const maxAttempts = supportsRetry ? retriesConfigured + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        logs.push({
          at: new Date().toISOString(),
          level: 'info',
          message: `Running (${step}): ${command}${maxAttempts > 1 ? ` [attempt ${attempt}/${maxAttempts}]` : ''}`
        });

        const { stdout, stderr } = await exec(command, { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        const snippet = out ? summarizeText(out) : 'Command completed with no output.';

        commandAttempts.push({
          command,
          step,
          attempt,
          maxAttempts,
          exitCode: 0,
          snippet,
          at: new Date().toISOString()
        });

        logs.push({ at: new Date().toISOString(), level: 'info', message: snippet });
        commandResults.push({ command, exitCode: 0, snippet });

        if (step === 'tofu-apply') {
          applySucceeded = true;
        }

        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Command failed';
        const snippet = summarizeText(message);
        const lastAttempt = attempt === maxAttempts;

        const entry: {
          command: string;
          step: string;
          attempt: number;
          maxAttempts: number;
          exitCode: number;
          snippet: string;
          at: string;
          backoffMs?: number;
        } = {
          command,
          step,
          attempt,
          maxAttempts,
          exitCode: 1,
          snippet,
          at: new Date().toISOString()
        };

        if (!lastAttempt) {
          const backoffMs = 2000 * 2 ** (attempt - 1);
          entry.backoffMs = backoffMs;
          logs.push({
            at: new Date().toISOString(),
            level: 'warn',
            message: `${step} failed on attempt ${attempt}/${maxAttempts}; retrying in ${Math.round(backoffMs / 1000)}s. ${snippet}`
          });
          commandAttempts.push(entry);
          await sleep(backoffMs);
          continue;
        }

        logs.push({ at: new Date().toISOString(), level: 'error', message: snippet });
        commandAttempts.push(entry);
        commandResults.push({ command, exitCode: 1, snippet });
        return {
          logs,
          commandResults,
          commandAttempts,
          retriesConfigured,
          failedCommand: command,
          failedStep: step,
          applySucceeded,
          outputSummary: summarizeLogs(logs)
        };
      }
    }
  }

  return {
    logs,
    commandResults,
    commandAttempts,
    retriesConfigured,
    applySucceeded,
    outputSummary: summarizeLogs(logs)
  };
}

export async function runRollbackHook(command: string): Promise<{
  ok: boolean;
  command: string;
  exitCode: number;
  snippet: string;
  at: string;
}> {
  const at = new Date().toISOString();
  try {
    const { stdout, stderr } = await exec(command, { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
    const out = [stdout, stderr].filter(Boolean).join('\n').trim();
    return {
      ok: true,
      command,
      exitCode: 0,
      snippet: out ? summarizeText(out) : 'Rollback hook completed with no output.',
      at
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rollback hook failed';
    return {
      ok: false,
      command,
      exitCode: 1,
      snippet: summarizeText(message),
      at
    };
  }
}

function toHclString(value: string) {
  return JSON.stringify(value);
}

function summarizeText(text: string, max = 240) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function summarizeLogs(logs: JobLogEntry[]) {
  return logs.slice(-6).map((line) => `[${line.level}] ${line.message}`).join(' | ');
}
