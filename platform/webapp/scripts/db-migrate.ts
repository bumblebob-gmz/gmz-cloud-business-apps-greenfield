#!/usr/bin/env node
/**
 * Database migration helper script.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node --experimental-strip-types scripts/db-migrate.ts
 *
 * What it does:
 *   1. Runs `prisma migrate deploy` to apply pending migrations.
 *   2. Optionally seeds the database with demo data when --seed flag is passed.
 *
 * In production, prefer running `npx prisma migrate deploy` directly via CI.
 */

import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const shouldSeed = args.includes('--seed');

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL is not set. Skipping migration.');
  process.exit(0);
}

console.log('🗄️   Running Prisma migrations...');

try {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env }
  });
  console.log('✅  Migrations applied.');
} catch (error) {
  console.error('❌  Migration failed:', error);
  process.exit(1);
}

if (shouldSeed) {
  console.log('🌱  Seeding database with demo data...');

  const { PrismaClient } = await import('../generated/prisma/index.js');
  const db = new PrismaClient();

  try {
    await db.$transaction([
      db.tenant.upsert({
        where: { name: 'Atlas Retail EU' },
        create: {
          id: 'tn-001',
          name: 'Atlas Retail EU',
          customer: 'Atlas Group',
          region: 'eu-central-1',
          status: 'Active',
          size: 'M',
          vlan: 120,
          ipAddress: '10.120.10.100'
        },
        update: {}
      }),
      db.tenant.upsert({
        where: { name: 'Kite Logistics' },
        create: {
          id: 'tn-002',
          name: 'Kite Logistics',
          customer: 'Kite GmbH',
          region: 'eu-west-1',
          status: 'Provisioning',
          size: 'L',
          vlan: 130,
          ipAddress: '10.130.10.100'
        },
        update: {}
      }),
      db.tenant.upsert({
        where: { name: 'Northwind Pharma' },
        create: {
          id: 'tn-003',
          name: 'Northwind Pharma',
          customer: 'Northwind AG',
          region: 'eu-central-1',
          status: 'Paused',
          size: 'S',
          vlan: 115,
          ipAddress: '10.115.10.100'
        },
        update: {}
      })
    ]);

    await db.deployment.createMany({
      skipDuplicates: true,
      data: [
        { id: 'dep-711', tenant: 'Atlas Retail EU',  version: 'v1.6.2',    env: 'Production', status: 'Healthy', updatedAt: 'Today 09:41'      },
        { id: 'dep-712', tenant: 'Kite Logistics',   version: 'v1.7.0-rc1', env: 'Staging',    status: 'Warning', updatedAt: 'Today 10:02'      },
        { id: 'dep-713', tenant: 'Northwind Pharma', version: 'v1.5.8',    env: 'Production', status: 'Healthy', updatedAt: 'Yesterday 23:18'   }
      ]
    });

    await db.report.createMany({
      skipDuplicates: true,
      data: [
        { id: 'rep-100', title: 'Tenant Uptime',   owner: 'Platform Ops', period: 'Last 7 days',    generatedAt: '08:00' },
        { id: 'rep-101', title: 'Deployment Drift', owner: 'Release Team', period: 'Current month',  generatedAt: '08:15' },
        { id: 'rep-102', title: 'Access Audit',     owner: 'Security',     period: 'Quarterly',       generatedAt: '09:05' }
      ]
    });

    console.log('✅  Seed data inserted.');
  } finally {
    await db.$disconnect();
  }
}

console.log('🎉  Done.');
