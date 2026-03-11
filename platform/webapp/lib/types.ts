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

// ---------------------------------------------------------------------------
// Provisioning job phases
// ---------------------------------------------------------------------------

/** The five ordered phases of a tenant provisioning job. */
export type JobPhase = 'vm_create' | 'network_config' | 'os_bootstrap' | 'app_deploy' | 'health_verify';

/** Lifecycle status of a single provisioning phase. */
export type JobPhaseStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'planned';

/** Full trace record for one phase within a provisioning job. */
export type JobPhaseTrace = {
  phase: JobPhase;
  status: JobPhaseStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  auditEventId?: string;
  logs: JobLogEntry[];
  error?: string;
};

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
    commandAttempts?: {
      command: string;
      step: string;
      attempt: number;
      maxAttempts: number;
      exitCode: number;
      snippet: string;
      at: string;
      backoffMs?: number;
    }[];
    retriesConfigured?: number;
    rollback?: {
      attempted: boolean;
      command?: string;
      exitCode?: number;
      ok?: boolean;
      snippet?: string;
      at?: string;
      reason?: string;
    };
    logs?: JobLogEntry[];
    outputSummary?: string;
    error?: string;
    /** Phase-level trace for E2E provisioning jobs. */
    phases?: JobPhaseTrace[];
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
  /**
   * Admin-only: when true, policy constraint violations (e.g. non-standard VLAN/IP)
   * are permitted but MUST be audit-logged explicitly by the route handler.
   * Ignored for non-Admin roles.
   */
  policyOverride?: boolean;
  /**
   * Optional explicit IP address (for Admin override scenarios).
   * When provided and policyOverride is true, the value is stored as-is
   * and logged. Otherwise it must satisfy 10.<VLAN>.10.100.
   */
  ipAddress?: string;
};

export type CreateJobInput = {
  tenant: string;       // display name (used in file-store + UI)
  tenantId?: string;    // UUID FK — used by DB store (schema.prisma Job.tenantId)
  task: string;
  status?: JobStatus;
  correlationId?: string;
  details?: Job['details'];
};

export type CreateDeploymentInput = {
  tenant: string;
  version: string;
  env: DeploymentEnv;
  status?: DeploymentStatus;
};

export type UpdateDeploymentPatch = {
  status?: DeploymentStatus;
  updatedAt?: string;
};
