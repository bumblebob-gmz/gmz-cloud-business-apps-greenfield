export type TenantStatus = 'Active' | 'Provisioning' | 'Paused';
export type TenantSize = 'S' | 'M' | 'L' | 'XL';

export type Tenant = {
  id: string;
  name: string;
  customer: string;
  region: string;
  status: TenantStatus;
  size: TenantSize;
  vlan: number;
  ipAddress: string;
};

export type JobStatus = 'Queued' | 'Running' | 'Success' | 'Failed';

export type Job = {
  id: string;
  tenant: string;
  task: string;
  status: JobStatus;
  startedAt: string;
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
};

export type CreateJobInput = {
  tenant: string;
  task: string;
  status?: JobStatus;
};
