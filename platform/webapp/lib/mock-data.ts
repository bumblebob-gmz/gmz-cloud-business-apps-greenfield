export type Tenant = {
  id: string;
  name: string;
  customer: string;
  region: string;
  status: 'Active' | 'Provisioning' | 'Paused';
  size: 'S' | 'M' | 'L' | 'XL';
  vlan: number;
  ipRange: string;
};

export type Job = {
  id: string;
  tenant: string;
  task: string;
  status: 'Queued' | 'Running' | 'Success' | 'Failed';
  startedAt: string;
};

export type Deployment = {
  id: string;
  tenant: string;
  version: string;
  env: 'Staging' | 'Production';
  status: 'Healthy' | 'Warning' | 'Failed';
  updatedAt: string;
};

export type Report = {
  id: string;
  title: string;
  owner: string;
  period: string;
  generatedAt: string;
};

export const tenants: Tenant[] = [
  {
    id: 'tn-001',
    name: 'Atlas Retail EU',
    customer: 'Atlas Group',
    region: 'eu-central-1',
    status: 'Active',
    size: 'M',
    vlan: 120,
    ipRange: '10.12.20.0/24'
  },
  {
    id: 'tn-002',
    name: 'Kite Logistics',
    customer: 'Kite GmbH',
    region: 'eu-west-1',
    status: 'Provisioning',
    size: 'L',
    vlan: 130,
    ipRange: '10.13.40.0/24'
  },
  {
    id: 'tn-003',
    name: 'Northwind Pharma',
    customer: 'Northwind AG',
    region: 'eu-central-1',
    status: 'Paused',
    size: 'S',
    vlan: 115,
    ipRange: '10.11.30.0/24'
  }
];

export const jobs: Job[] = [
  { id: 'job-3891', tenant: 'Atlas Retail EU', task: 'Backup Snapshot', status: 'Success', startedAt: '10:22' },
  { id: 'job-3892', tenant: 'Kite Logistics', task: 'Provision Connector', status: 'Running', startedAt: '10:28' },
  { id: 'job-3893', tenant: 'Northwind Pharma', task: 'Patch Window', status: 'Queued', startedAt: '10:35' }
];

export const deployments: Deployment[] = [
  { id: 'dep-711', tenant: 'Atlas Retail EU', version: 'v1.6.2', env: 'Production', status: 'Healthy', updatedAt: 'Today 09:41' },
  { id: 'dep-712', tenant: 'Kite Logistics', version: 'v1.7.0-rc1', env: 'Staging', status: 'Warning', updatedAt: 'Today 10:02' },
  { id: 'dep-713', tenant: 'Northwind Pharma', version: 'v1.5.8', env: 'Production', status: 'Healthy', updatedAt: 'Yesterday 23:18' }
];

export const reports: Report[] = [
  { id: 'rep-100', title: 'Tenant Uptime', owner: 'Platform Ops', period: 'Last 7 days', generatedAt: '08:00' },
  { id: 'rep-101', title: 'Deployment Drift', owner: 'Release Team', period: 'Current month', generatedAt: '08:15' },
  { id: 'rep-102', title: 'Access Audit', owner: 'Security', period: 'Quarterly', generatedAt: '09:05' }
];
