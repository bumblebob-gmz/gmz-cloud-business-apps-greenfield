/**
 * Data store adapter.
 *
 * Routes to PostgreSQL (via Prisma) when DATABASE_URL is configured,
 * otherwise falls back to .data/ file-based JSON storage.
 *
 * No callers need to change – the public API is identical.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDatabaseEnabled } from './db/client.ts';
import type { CreateDeploymentInput, CreateJobInput, CreateTenantInput, DataShape, Deployment, Job, JobStatus, Report, Tenant, TenantStatus, UpdateDeploymentPatch } from '@/lib/types';

// ---------------------------------------------------------------------------
// File-based fallback (original implementation)
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const seedData: DataShape = {
  tenants: [
    {
      id: 'tn-001',
      name: 'Atlas Retail EU',
      customer: 'Atlas Group',
      region: 'eu-central-1',
      status: 'Active',
      size: 'M',
      vlan: 120,
      ipAddress: '10.120.10.100'
    },
    {
      id: 'tn-002',
      name: 'Kite Logistics',
      customer: 'Kite GmbH',
      region: 'eu-west-1',
      status: 'Provisioning',
      size: 'L',
      vlan: 130,
      ipAddress: '10.130.10.100'
    },
    {
      id: 'tn-003',
      name: 'Northwind Pharma',
      customer: 'Northwind AG',
      region: 'eu-central-1',
      status: 'Paused',
      size: 'S',
      vlan: 115,
      ipAddress: '10.115.10.100'
    }
  ],
  jobs: [
    { id: 'job-3891', tenant: 'Atlas Retail EU', task: 'Backup Snapshot', status: 'Success', startedAt: '10:22' },
    { id: 'job-3892', tenant: 'Kite Logistics', task: 'Provision Connector', status: 'Running', startedAt: '10:28' },
    { id: 'job-3893', tenant: 'Northwind Pharma', task: 'Patch Window', status: 'Queued', startedAt: '10:35' }
  ],
  deployments: [
    {
      id: 'dep-711',
      tenant: 'Atlas Retail EU',
      version: 'v1.6.2',
      env: 'Production',
      status: 'Healthy',
      updatedAt: 'Today 09:41'
    },
    {
      id: 'dep-712',
      tenant: 'Kite Logistics',
      version: 'v1.7.0-rc1',
      env: 'Staging',
      status: 'Warning',
      updatedAt: 'Today 10:02'
    },
    {
      id: 'dep-713',
      tenant: 'Northwind Pharma',
      version: 'v1.5.8',
      env: 'Production',
      status: 'Healthy',
      updatedAt: 'Yesterday 23:18'
    }
  ],
  reports: [
    { id: 'rep-100', title: 'Tenant Uptime', owner: 'Platform Ops', period: 'Last 7 days', generatedAt: '08:00' },
    { id: 'rep-101', title: 'Deployment Drift', owner: 'Release Team', period: 'Current month', generatedAt: '08:15' },
    { id: 'rep-102', title: 'Access Audit', owner: 'Security', period: 'Quarterly', generatedAt: '09:05' }
  ]
};

let fileStoreInitialized = false;

async function ensureStore() {
  if (fileStoreInitialized) return;

  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(DATA_FILE, 'utf8');
  } catch {
    await writeFile(DATA_FILE, JSON.stringify(seedData, null, 2), 'utf8');
  }

  fileStoreInitialized = true;
}

async function readStore(): Promise<DataShape> {
  await ensureStore();
  const raw = await readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw) as DataShape;
}

async function writeStore(data: DataShape) {
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// File-based implementations
// ---------------------------------------------------------------------------

async function fileListTenants(): Promise<Tenant[]> {
  const data = await readStore();
  return data.tenants;
}

async function fileGetTenantById(id: string): Promise<Tenant | null> {
  const data = await readStore();
  return data.tenants.find((t) => t.id === id) ?? null;
}

async function fileGetTenantByName(name: string): Promise<Tenant | null> {
  const data = await readStore();
  return data.tenants.find((t) => t.name === name) ?? null;
}

async function fileListJobs(): Promise<Job[]> {
  const data = await readStore();
  return data.jobs;
}

async function fileGetJobById(id: string): Promise<Job | null> {
  const data = await readStore();
  return data.jobs.find((j) => j.id === id) ?? null;
}

async function fileListDeployments(): Promise<Deployment[]> {
  const data = await readStore();
  return data.deployments;
}

async function fileCreateDeployment(input: CreateDeploymentInput): Promise<Deployment> {
  const data = await readStore();
  const deployment: Deployment = {
    id: `dep-${randomUUID().slice(0, 8)}`,
    tenant: input.tenant,
    version: input.version,
    env: input.env,
    status: input.status ?? 'Healthy',
    updatedAt: nowIso()
  };
  data.deployments.unshift(deployment);
  await writeStore(data);
  return deployment;
}

async function fileUpdateDeployment(id: string, patch: UpdateDeploymentPatch): Promise<Deployment | null> {
  const data = await readStore();
  const index = data.deployments.findIndex((d) => d.id === id);
  if (index < 0) return null;
  const current = data.deployments[index];
  const next: Deployment = {
    ...current,
    status: patch.status ?? current.status,
    updatedAt: patch.updatedAt ?? nowIso()
  };
  data.deployments[index] = next;
  await writeStore(data);
  return next;
}

async function fileListReports(): Promise<Report[]> {
  const data = await readStore();
  return data.reports;
}

async function fileCreateJob(input: CreateJobInput): Promise<Job> {
  const data = await readStore();
  const job: Job = {
    id: `job-${randomUUID().slice(0, 8)}`,
    tenant: input.tenant,
    task: input.task,
    status: input.status ?? 'Queued',
    correlationId: input.correlationId,
    details: input.details,
    startedAt: nowIso(),
    updatedAt: nowIso()
  };

  data.jobs.unshift(job);
  await writeStore(data);
  return job;
}

async function fileUpdateJob(
  id: string,
  patch: Partial<Pick<Job, 'status' | 'details' | 'updatedAt'>>
): Promise<Job | null> {
  const data = await readStore();
  const index = data.jobs.findIndex((j) => j.id === id);
  if (index < 0) return null;

  const current = data.jobs[index];
  const next: Job = {
    ...current,
    ...patch,
    details: patch.details ? { ...current.details, ...patch.details } : current.details,
    updatedAt: patch.updatedAt ?? nowIso()
  };

  data.jobs[index] = next;
  await writeStore(data);
  return next;
}

async function fileUpdateTenant(id: string, patch: { status?: TenantStatus }): Promise<Tenant | null> {
  const data = await readStore();
  const index = data.tenants.findIndex((t) => t.id === id);
  if (index < 0) return null;

  const current = data.tenants[index];
  const next: Tenant = { ...current, ...patch };
  data.tenants[index] = next;
  await writeStore(data);
  return next;
}

async function fileCreateTenant(input: CreateTenantInput): Promise<{ tenant: Tenant; job: Job }> {
  const data = await readStore();

  const tenant: Tenant = {
    id: `tn-${randomUUID().slice(0, 8)}`,
    name: input.name,
    customer: input.customer,
    region: input.region,
    status: 'Provisioning',
    size: input.size,
    vlan: input.vlan,
    // Use caller-supplied ipAddress (already policy-validated or admin-overridden upstream)
    // Fall back to the computed policy address when not provided.
    ipAddress: input.ipAddress ?? `10.${input.vlan}.10.100`,
    authMode: input.authMode,
    authConfig: input.authConfig,
    apps: input.apps,
    maintenanceWindow: input.maintenanceWindow,
    contactEmail: input.contactEmail
  };

  const job: Job = {
    id: `job-${randomUUID().slice(0, 8)}`,
    tenant: tenant.name,
    task: 'Provision Tenant Environment',
    status: 'Queued',
    startedAt: nowIso(),
    updatedAt: nowIso()
  };

  data.tenants.unshift(tenant);
  data.jobs.unshift(job);

  await writeStore(data);
  return { tenant, job };
}

// ---------------------------------------------------------------------------
// Public API - routes based on DATABASE_URL
// ---------------------------------------------------------------------------

export async function listTenants(): Promise<Tenant[]> {
  if (isDatabaseEnabled()) {
    const { dbListTenants } = await import('./db/data-store-db.ts');
    return dbListTenants();
  }
  return fileListTenants();
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  if (isDatabaseEnabled()) {
    const { dbGetTenantById } = await import('./db/data-store-db.ts');
    return dbGetTenantById(id);
  }
  return fileGetTenantById(id);
}

export async function getTenantByName(name: string): Promise<Tenant | null> {
  if (isDatabaseEnabled()) {
    const { dbGetTenantByName } = await import('./db/data-store-db.ts');
    return dbGetTenantByName(name);
  }
  return fileGetTenantByName(name);
}

export async function listJobs(): Promise<Job[]> {
  if (isDatabaseEnabled()) {
    const { dbListJobs } = await import('./db/data-store-db.ts');
    return dbListJobs();
  }
  return fileListJobs();
}

export async function getJobById(id: string): Promise<Job | null> {
  if (isDatabaseEnabled()) {
    const { dbGetJobById } = await import('./db/data-store-db.ts');
    return dbGetJobById(id);
  }
  return fileGetJobById(id);
}

export async function listDeployments(): Promise<Deployment[]> {
  if (isDatabaseEnabled()) {
    const { dbListDeployments } = await import('./db/data-store-db.ts');
    return dbListDeployments();
  }
  return fileListDeployments();
}

export async function listReports(): Promise<Report[]> {
  if (isDatabaseEnabled()) {
    const { dbListReports } = await import('./db/data-store-db.ts');
    return dbListReports();
  }
  return fileListReports();
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  if (isDatabaseEnabled()) {
    const { dbCreateJob } = await import('./db/data-store-db.ts');
    return dbCreateJob(input);
  }
  return fileCreateJob(input);
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<Job, 'status' | 'details' | 'updatedAt'>>
): Promise<Job | null> {
  if (isDatabaseEnabled()) {
    const { dbUpdateJob } = await import('./db/data-store-db.ts');
    return dbUpdateJob(id, patch);
  }
  return fileUpdateJob(id, patch);
}

export async function createTenant(input: CreateTenantInput): Promise<{ tenant: Tenant; job: Job }> {
  if (isDatabaseEnabled()) {
    const { dbCreateTenant } = await import('./db/data-store-db.ts');
    return dbCreateTenant(input);
  }
  return fileCreateTenant(input);
}

export async function createDeployment(input: CreateDeploymentInput): Promise<Deployment> {
  if (isDatabaseEnabled()) {
    const { dbCreateDeployment } = await import('./db/data-store-db.ts');
    return dbCreateDeployment(input);
  }
  return fileCreateDeployment(input);
}

export async function updateTenant(id: string, patch: { status?: TenantStatus }): Promise<Tenant | null> {
  if (isDatabaseEnabled()) {
    const { dbUpdateTenant } = await import('./db/data-store-db.ts');
    return dbUpdateTenant(id, patch);
  }
  return fileUpdateTenant(id, patch);
}

export async function updateDeployment(id: string, patch: UpdateDeploymentPatch): Promise<Deployment | null> {
  if (isDatabaseEnabled()) {
    const { dbUpdateDeployment } = await import('./db/data-store-db.ts');
    return dbUpdateDeployment(id, patch);
  }
  return fileUpdateDeployment(id, patch);
}
