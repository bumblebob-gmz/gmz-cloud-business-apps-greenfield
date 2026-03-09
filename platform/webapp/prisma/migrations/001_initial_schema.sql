-- GMZ Cloud Business Apps - Initial PostgreSQL Schema Migration
-- Run via: psql $DATABASE_URL -f prisma/migrations/001_initial_schema.sql
-- Or via Prisma: npx prisma migrate deploy

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "TenantStatus" AS ENUM ('Active', 'Provisioning', 'Paused');
CREATE TYPE "TenantSize" AS ENUM ('S', 'M', 'L', 'XL');
CREATE TYPE "AuthMode" AS ENUM ('EntraID', 'LDAP', 'LocalUser');
CREATE TYPE "JobStatus" AS ENUM ('Queued', 'Running', 'Success', 'Failed', 'DryRun');
CREATE TYPE "DeploymentEnv" AS ENUM ('Staging', 'Production');
CREATE TYPE "DeploymentStatus" AS ENUM ('Healthy', 'Warning', 'Failed');
CREATE TYPE "AuditOutcome" AS ENUM ('success', 'failure', 'denied');
CREATE TYPE "ActorType" AS ENUM ('user', 'service');

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------

CREATE TABLE "tenants" (
  "id"                TEXT          NOT NULL,
  "name"              TEXT          NOT NULL UNIQUE,
  "customer"          TEXT          NOT NULL,
  "region"            TEXT          NOT NULL,
  "status"            "TenantStatus" NOT NULL DEFAULT 'Provisioning',
  "size"              "TenantSize"  NOT NULL,
  "vlan"              INTEGER       NOT NULL,
  "ipAddress"         TEXT          NOT NULL,

  -- Auth config
  "authMode"          "AuthMode",
  "entraTenantId"     TEXT,
  "ldapUrl"           TEXT,
  "localAdminEmail"   TEXT,

  -- Provisioning config
  "apps"              TEXT[]        NOT NULL DEFAULT '{}',
  "maintenanceWindow" TEXT,
  "contactEmail"      TEXT,

  "createdAt"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

CREATE TABLE "jobs" (
  "id"            TEXT        NOT NULL,
  "tenantName"    TEXT,
  "task"          TEXT        NOT NULL,
  "status"        "JobStatus" NOT NULL DEFAULT 'Queued',
  "startedAt"     TEXT        NOT NULL,
  "updatedAt"     TEXT,
  "correlationId" TEXT,
  "details"       JSONB,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jobs_tenantName_fkey"
    FOREIGN KEY ("tenantName") REFERENCES "tenants" ("name")
    ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Deployments
-- ---------------------------------------------------------------------------

CREATE TABLE "deployments" (
  "id"        TEXT               NOT NULL,
  "tenant"    TEXT               NOT NULL,
  "version"   TEXT               NOT NULL,
  "env"       "DeploymentEnv"    NOT NULL,
  "status"    "DeploymentStatus" NOT NULL DEFAULT 'Healthy',
  "updatedAt" TEXT               NOT NULL,
  "createdAt" TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

CREATE TABLE "reports" (
  "id"          TEXT        NOT NULL,
  "title"       TEXT        NOT NULL,
  "owner"       TEXT        NOT NULL,
  "period"      TEXT        NOT NULL,
  "generatedAt" TEXT        NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Audit Events
-- ---------------------------------------------------------------------------

CREATE TABLE "audit_events" (
  "id"              TEXT          NOT NULL,
  "eventId"         TEXT          NOT NULL UNIQUE,
  "timestamp"       TIMESTAMPTZ   NOT NULL,
  "correlationId"   TEXT          NOT NULL,
  "tenantId"        TEXT          NOT NULL,
  "action"          TEXT          NOT NULL,
  "resource"        TEXT          NOT NULL,
  "outcome"         "AuditOutcome" NOT NULL,

  -- Actor
  "actorType"       "ActorType"   NOT NULL,
  "actorId"         TEXT          NOT NULL,
  "actorRole"       TEXT,

  -- Source
  "sourceService"   TEXT          NOT NULL,
  "sourceOperation" TEXT          NOT NULL,
  "sourceIp"        TEXT,

  "details"         JSONB,
  "createdAt"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_events_tenantId_idx"  ON "audit_events" ("tenantId");
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events" ("timestamp");
CREATE INDEX "audit_events_outcome_idx"   ON "audit_events" ("outcome");
CREATE INDEX "audit_events_action_idx"    ON "audit_events" ("action");

-- ---------------------------------------------------------------------------
-- Notification Config (singleton)
-- ---------------------------------------------------------------------------

CREATE TABLE "notification_config" (
  "id"        TEXT        NOT NULL DEFAULT 'default',
  "config"    JSONB       NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "notification_config_pkey" PRIMARY KEY ("id")
);

-- Seed default notification config row
INSERT INTO "notification_config" ("id", "config")
VALUES ('default', '{}')
ON CONFLICT ("id") DO NOTHING;
