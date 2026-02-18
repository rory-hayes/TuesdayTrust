-- Create enums
CREATE TYPE "JobRunType" AS ENUM (
  'KB_INDEX',
  'PROJECT_PARSE',
  'ANSWER_GENERATE',
  'EXPORT_XLSX',
  'RETENTION_PURGE'
);

CREATE TYPE "JobRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED'
);

-- Org hardening defaults
ALTER TABLE "Org"
  ADD COLUMN "retentionDays" INTEGER NOT NULL DEFAULT 90;

-- KBDocument progress and idempotency fields
ALTER TABLE "KBDocument"
  ADD COLUMN "indexVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "indexProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "indexJobStatus" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN "errorJson" JSONB;

-- QuestionnaireProject progress and export metadata
ALTER TABLE "QuestionnaireProject"
  ADD COLUMN "parseProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "parseJobStatus" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN "generationProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "generationJobStatus" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN "exportProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "exportJobStatus" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN "exportVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastKbVersionHash" TEXT,
  ADD COLUMN "errorJson" JSONB;

-- ProjectFile deterministic export metadata
ALTER TABLE "ProjectFile"
  ADD COLUMN "exportVersion" INTEGER,
  ADD COLUMN "sourceKbVersionHash" TEXT,
  ADD COLUMN "generatedAt" TIMESTAMP(3),
  ADD COLUMN "encryptionMeta" JSONB;

-- AnswerDraft idempotency metadata
ALTER TABLE "AnswerDraft"
  ADD COLUMN "sourceKbVersionHash" TEXT,
  ADD COLUMN "generationFingerprint" TEXT;

-- Usage accounting
CREATE TABLE "OpenAIUsageEvent" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "clientWorkspaceId" TEXT,
  "projectId" TEXT,
  "model" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "costEstimateUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpenAIUsageEvent_pkey" PRIMARY KEY ("id")
);

-- Job tracking
CREATE TABLE "JobRun" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "clientWorkspaceId" TEXT,
  "projectId" TEXT,
  "jobType" "JobRunType" NOT NULL,
  "status" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" TEXT NOT NULL,
  "queueJobId" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorJson" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "OpenAIUsageEvent"
  ADD CONSTRAINT "OpenAIUsageEvent_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpenAIUsageEvent"
  ADD CONSTRAINT "OpenAIUsageEvent_clientWorkspaceId_fkey"
  FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OpenAIUsageEvent"
  ADD CONSTRAINT "OpenAIUsageEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JobRun"
  ADD CONSTRAINT "JobRun_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobRun"
  ADD CONSTRAINT "JobRun_clientWorkspaceId_fkey"
  FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JobRun"
  ADD CONSTRAINT "JobRun_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "OpenAIUsageEvent_orgId_idx" ON "OpenAIUsageEvent"("orgId");
CREATE INDEX "OpenAIUsageEvent_clientWorkspaceId_idx" ON "OpenAIUsageEvent"("clientWorkspaceId");
CREATE INDEX "OpenAIUsageEvent_projectId_idx" ON "OpenAIUsageEvent"("projectId");
CREATE INDEX "OpenAIUsageEvent_createdAt_idx" ON "OpenAIUsageEvent"("createdAt");

CREATE UNIQUE INDEX "JobRun_idempotencyKey_key" ON "JobRun"("idempotencyKey");
CREATE INDEX "JobRun_orgId_idx" ON "JobRun"("orgId");
CREATE INDEX "JobRun_clientWorkspaceId_idx" ON "JobRun"("clientWorkspaceId");
CREATE INDEX "JobRun_projectId_idx" ON "JobRun"("projectId");
CREATE INDEX "JobRun_jobType_idx" ON "JobRun"("jobType");
CREATE INDEX "JobRun_status_idx" ON "JobRun"("status");
