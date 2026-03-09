export type TenantStatus = 'Active' | 'Provisioning' | 'Paused';
export type TenantSize = 'S' | 'M' | 'L' | 'XL';

export type AuthMode = 'EntraID' | 'LDAP' | 'Local User';

export type Tenant = {
  id: string;
  name: string;
  customer: string;
  region: string;
  status: TenantStatus;
  size: TenantSize;
  vlan: number;
  ipAddress: string;
  authMode?: AuthMode;
  authConfig?: {
    entraTenantId?: string;
    ldapUrl?: string;
    localAdminEmail?: string;
  };
  apps?: string[];
  maintenanceWindow?: string;
  contactEmail?: string;
};

export type JobStatus = 'Queued' | 'Running' | 'Success' | 'Failed' | 'DryRun';

export type JobLogEntry = {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
};

export type ProvisionPreflight = {
  ready: boolean;
  executionEnabled: boolean;
  required: Record<string, boolean>;
  optionalDefaults: Record<string, boolean>;
  missingForExecution: string[];
};

export type ProvisionPlan = {
  vars: {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    customer: string;
    region: string;
    size: TenantSize;
    cpu: number;
    ramGb: number;
    memoryMb: number;
    diskGb: number;
    vlan: number;
    vmId: number;
    ipAddress: string;
    debianTemplateId: number;
    tenantProfile?: string;
    nodeName?: string;
    storage?: string;
    sshPublicKeyConfigured: boolean;
  };
  commands: string[];
  generatedFiles?: {
    tfvarsPath: string;
    inventoryPath: string;
    workDir: string;
  };
};

export type Job = {
  id: string;
  tenant: string;
  task: string;
  status: JobStatus;
  startedAt: string;
  updatedAt?: string;
  correlationId?: string;
  details?: {
    dryRun?: boolean;
    preflight?: ProvisionPreflight;
    plan?: ProvisionPlan;
    generatedFiles?: { tfvarsPath: string; inventoryPath: string; workDir: string };
    commandResults?: { command: string; exitCode: number; snippet: string }[];
    logs?: JobLogEntry[];
    outputSummary?: string;
    error?: string;
  };
};

export type DeploymentEnv = 'Staging' | 'Production';
export type DeploymentStatus = 'Healthy' | 'Warning' | 'Failed';

export type Deployment = {
  id: string;
  tenant: string;
  version: string;
  env: DeploymentEnv;
  status: DeploymentStatus;
  updatedAt: string;
};

export type Report = {
  id: string;
  title: string;
  owner: string;
  period: string;
  generatedAt: string;
};

export type DataShape = {
  tenants: Tenant[];
  jobs: Job[];
  deployments: Deployment[];
  reports: Report[];
};

export type CreateTenantInput = {
  name: string;
  customer: string;
  region: string;
  size: TenantSize;
  vlan: number;
  authMode: AuthMode;
  authConfig: {
    entraTenantId?: string;
    ldapUrl?: string;
    localAdminEmail?: string;
  };
  apps: string[];
  maintenanceWindow: string;
  contactEmail: string;
};

export type CreateJobInput = {
  tenant: string;
  task: string;
  status?: JobStatus;
  correlationId?: string;
  details?: Job['details'];
};
