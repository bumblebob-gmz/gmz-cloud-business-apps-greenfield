/**
 * PostgreSQL implementation of the data store.
 * Used when DATABASE_URL is configured.
 */

import { randomUUID } from 'node:crypto';
import { getDbClient } from './client.ts';
import type { CreateJobInput, CreateTenantInput, Deployment, Job, Report, Tenant } from '../types.ts';

// Prisma enum values map to TypeScript string literals
function nowClock() {
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

function dbTenantToTenant(row: Record<string, unknown>): Tenant {
  return {
    id: row.id as string,
    name: row.name as string,
    customer: row.customer as string,
    region: row.region as string,
    status: row.status as Tenant['status'],
    size: row.size as Tenant['size'],
    vlan: row.vlan as number,
    ipAddress: row.ipAddress as string,
    authMode: row.authMode
      ? (row.authMode as string).replace('LocalUser', 'Local User') as Tenant['authMode']
      : undefined,
    authConfig:
      row.entraTenantId || row.ldapUrl || row.localAdminEmail
        ? {
            entraTenantId: row.entraTenantId as string | undefined,
            ldapUrl: row.ldapUrl as string | undefined,
            localAdminEmail: row.localAdminEmail as string | undefined
          }
        : undefined,
    apps: (row.apps as string[]) ?? [],
    maintenanceWindow: (row.maintenanceWindow as string) ?? undefined,
    contactEmail: (row.contactEmail as string) ?? undefined
  };
}

function authModeToDb(authMode: string | undefined): string | undefined {
  if (!authMode) return undefined;
  return authMode === 'Local User' ? 'LocalUser' : authMode;
}

export async function dbListTenants(): Promise<Tenant[]> {
  const db = getDbClient();
  const rows = await db.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map((r) => dbTenantToTenant(r as unknown as Record<string, unknown>));
}

export async function dbGetTenantById(id: string): Promise<Tenant | null> {
  const db = getDbClient();
  const row = await db.tenant.findUnique({ where: { id } });
  if (!row) return null;
  return dbTenantToTenant(row as unknown as Record<string, unknown>);
}

export async function dbGetTenantByName(name: string): Promise<Tenant | null> {
  const db = getDbClient();
  const row = await db.tenant.findUnique({ where: { name } });
  if (!row) return null;
  return dbTenantToTenant(row as unknown as Record<string, unknown>);
}

export async function dbCreateTenant(input: CreateTenantInput): Promise<{ tenant: Tenant; job: Job }> {
  const db = getDbClient();

  const tenantId = `tn-${randomUUID().slice(0, 8)}`;
  const jobId = `job-${randomUUID().slice(0, 8)}`;
  const clock = nowClock();

  const [tenantRow, jobRow] = await db.$transaction([
    db.tenant.create({
      data: {
        id: tenantId,
        name: input.name,
        customer: input.customer,
        region: input.region,
        status: 'Provisioning',
        size: input.size,
        vlan: input.vlan,
        ipAddress: `10.${input.vlan}.10.100`,
        authMode: authModeToDb(input.authMode) as string | undefined,
        entraTenantId: input.authConfig?.entraTenantId,
        ldapUrl: input.authConfig?.ldapUrl,
        localAdminEmail: input.authConfig?.localAdminEmail,
        apps: input.apps ?? [],
        maintenanceWindow: input.maintenanceWindow,
        contactEmail: input.contactEmail
      }
    }),
    db.job.create({
      data: {
        id: jobId,
        tenantName: input.name,
        task: 'Provision Tenant Environment',
        status: 'Queued',
        startedAt: clock,
        updatedAt: clock
      }
    })
  ]);

  return {
    tenant: dbTenantToTenant(tenantRow as unknown as Record<string, unknown>),
    job: dbJobToJob(jobRow as unknown as Record<string, unknown>)
  };
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

function dbJobToJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    tenant: (row.tenantName as string) ?? '',
    task: row.task as string,
    status: row.status as Job['status'],
    startedAt: row.startedAt as string,
    updatedAt: (row.updatedAt as string) ?? undefined,
    correlationId: (row.correlationId as string) ?? undefined,
    details: (row.details as Job['details']) ?? undefined
  };
}

export async function dbListJobs(): Promise<Job[]> {
  const db = getDbClient();
  const rows = await db.job.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map((r) => dbJobToJob(r as unknown as Record<string, unknown>));
}

export async function dbGetJobById(id: string): Promise<Job | null> {
  const db = getDbClient();
  const row = await db.job.findUnique({ where: { id } });
  if (!row) return null;
  return dbJobToJob(row as unknown as Record<string, unknown>);
}

export async function dbCreateJob(input: CreateJobInput): Promise<Job> {
  const db = getDbClient();
  const clock = nowClock();

  const row = await db.job.create({
    data: {
      id: `job-${randomUUID().slice(0, 8)}`,
      tenantName: input.tenant,
      task: input.task,
      status: input.status ?? 'Queued',
      startedAt: clock,
      updatedAt: clock,
      correlationId: input.correlationId,
      details: input.details ? (input.details as object) : undefined
    }
  });

  return dbJobToJob(row as unknown as Record<string, unknown>);
}

export async function dbUpdateJob(
  id: string,
  patch: Partial<Pick<Job, 'status' | 'details' | 'updatedAt'>>
): Promise<Job | null> {
  const db = getDbClient();

  const current = await db.job.findUnique({ where: { id } });
  if (!current) return null;

  const currentDetails = (current.details ?? {}) as Record<string, unknown>;
  const patchDetails = patch.details ? { ...currentDetails, ...patch.details } : currentDetails;

  const row = await db.job.update({
    where: { id },
    data: {
      status: patch.status,
      details: Object.keys(patchDetails).length > 0 ? patchDetails : undefined,
      updatedAt: patch.updatedAt ?? nowClock()
    }
  });

  return dbJobToJob(row as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Deployments
// ---------------------------------------------------------------------------

function dbDeploymentToDeployment(row: Record<string, unknown>): Deployment {
  return {
    id: row.id as string,
    tenant: row.tenant as string,
    version: row.version as string,
    env: row.env as Deployment['env'],
    status: row.status as Deployment['status'],
    updatedAt: row.updatedAt as string
  };
}

export async function dbListDeployments(): Promise<Deployment[]> {
  const db = getDbClient();
  const rows = await db.deployment.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map((r) => dbDeploymentToDeployment(r as unknown as Record<string, unknown>));
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function dbReportToReport(row: Record<string, unknown>): Report {
  return {
    id: row.id as string,
    title: row.title as string,
    owner: row.owner as string,
    period: row.period as string,
    generatedAt: row.generatedAt as string
  };
}

export async function dbListReports(): Promise<Report[]> {
  const db = getDbClient();
  const rows = await db.report.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map((r) => dbReportToReport(r as unknown as Record<string, unknown>));
}
