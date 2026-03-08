import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CreateJobInput, CreateTenantInput, DataShape, Job, Report, Tenant } from '@/lib/types';

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

let initialized = false;

async function ensureStore() {
  if (initialized) return;

  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(DATA_FILE, 'utf8');
  } catch {
    await writeFile(DATA_FILE, JSON.stringify(seedData, null, 2), 'utf8');
  }

  initialized = true;
}

async function readStore(): Promise<DataShape> {
  await ensureStore();
  const raw = await readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw) as DataShape;
}

async function writeStore(data: DataShape) {
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function listTenants(): Promise<Tenant[]> {
  const data = await readStore();
  return data.tenants;
}

export async function listJobs(): Promise<Job[]> {
  const data = await readStore();
  return data.jobs;
}

export async function listDeployments() {
  const data = await readStore();
  return data.deployments;
}

export async function listReports(): Promise<Report[]> {
  const data = await readStore();
  return data.reports;
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const data = await readStore();
  const job: Job = {
    id: `job-${randomUUID().slice(0, 8)}`,
    tenant: input.tenant,
    task: input.task,
    status: input.status ?? 'Queued',
    startedAt: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  };

  data.jobs.unshift(job);
  await writeStore(data);
  return job;
}

export async function createTenant(input: CreateTenantInput): Promise<{ tenant: Tenant; job: Job }> {
  const data = await readStore();

  const tenant: Tenant = {
    id: `tn-${randomUUID().slice(0, 8)}`,
    name: input.name,
    customer: input.customer,
    region: input.region,
    status: 'Provisioning',
    size: input.size,
    vlan: input.vlan,
    ipAddress: `10.${input.vlan}.10.100`
  };

  const job: Job = {
    id: `job-${randomUUID().slice(0, 8)}`,
    tenant: tenant.name,
    task: 'Provision Tenant Environment',
    status: 'Queued',
    startedAt: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  };

  data.tenants.unshift(tenant);
  data.jobs.unshift(job);

  await writeStore(data);

  return { tenant, job };
}
