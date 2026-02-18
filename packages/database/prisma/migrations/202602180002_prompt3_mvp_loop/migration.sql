-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'CONSULTANT', 'REVIEWER');

-- CreateEnum
CREATE TYPE "KBDocumentStatus" AS ENUM ('UPLOADED', 'INDEXING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionnaireProjectStatus" AS ENUM ('DRAFT', 'MAPPED', 'PARSED', 'READY');

-- CreateEnum
CREATE TYPE "QuestionItemStatus" AS ENUM ('NEW', 'READY_FOR_ANSWER');

-- CreateEnum
CREATE TYPE "AnswerDraftStatus" AS ENUM ('DRAFT', 'READY', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'INSUFFICIENT_EVIDENCE');

-- CreateEnum
CREATE TYPE "ProjectFileKind" AS ENUM ('ORIGINAL_XLSX', 'EXPORT_XLSX');

-- CreateEnum
CREATE TYPE "GapStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ApprovalEventType" AS ENUM ('APPROVED', 'REJECTED', 'EDITED');

-- CreateEnum
CREATE TYPE "JobRunType" AS ENUM ('KB_INDEX', 'PROJECT_PARSE', 'ANSWER_GENERATE', 'EXPORT_XLSX', 'RETENTION_PURGE');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CONSULTANT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientWorkspace" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "primaryDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KBDocument" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "filename" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPathname" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "KBDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "indexVersion" INTEGER NOT NULL DEFAULT 1,
    "indexProgress" INTEGER NOT NULL DEFAULT 0,
    "indexJobStatus" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
    "errorJson" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KBDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KBChunk" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT NOT NULL,
    "kbDocumentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "citationDoc" TEXT,
    "citationPage" INTEGER,
    "citationParagraph" INTEGER,
    "citationSection" TEXT,
    "citationSheet" TEXT,
    "citationCell" TEXT,
    "embedding" vector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KBChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireProject" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "status" "QuestionnaireProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "parseProgress" INTEGER NOT NULL DEFAULT 0,
    "parseJobStatus" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
    "generationProgress" INTEGER NOT NULL DEFAULT 0,
    "generationJobStatus" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
    "exportProgress" INTEGER NOT NULL DEFAULT 0,
    "exportJobStatus" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
    "exportVersion" INTEGER NOT NULL DEFAULT 0,
    "lastKbVersionHash" TEXT,
    "errorJson" JSONB,
    "filename" TEXT NOT NULL,
    "originalBlobUrl" TEXT NOT NULL,
    "originalBlobPathname" TEXT,
    "sheetName" TEXT,
    "mappings" JSONB,
    "parseError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionnaireProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "kind" "ProjectFileKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPathname" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "exportVersion" INTEGER,
    "sourceKbVersionHash" TEXT,
    "generatedAt" TIMESTAMP(3),
    "encryptionMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "answerCellRef" TEXT,
    "evidenceCellRef" TEXT,
    "status" "QuestionItemStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerDraft" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "questionItemId" TEXT NOT NULL,
    "status" "AnswerDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "answerText" TEXT,
    "citationsJson" JSONB,
    "confidence" DOUBLE PRECISION,
    "sourceKbVersionHash" TEXT,
    "generationFingerprint" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT,
    "projectId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "questionItemId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" "ApprovalEventType" NOT NULL,
    "fromStatus" "AnswerDraftStatus",
    "toStatus" "AnswerDraftStatus",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GapItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "questionItemId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suggestedMissingArtifact" TEXT,
    "status" "GapStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GapItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "Org_slug_key" ON "Org"("slug");

-- CreateIndex
CREATE INDEX "User_orgId_idx" ON "User"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "User_orgId_email_key" ON "User"("orgId", "email");

-- CreateIndex
CREATE INDEX "ClientWorkspace_orgId_idx" ON "ClientWorkspace"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientWorkspace_orgId_slug_key" ON "ClientWorkspace"("orgId", "slug");

-- CreateIndex
CREATE INDEX "KBDocument_orgId_idx" ON "KBDocument"("orgId");

-- CreateIndex
CREATE INDEX "KBDocument_clientWorkspaceId_idx" ON "KBDocument"("clientWorkspaceId");

-- CreateIndex
CREATE INDEX "KBChunk_orgId_idx" ON "KBChunk"("orgId");

-- CreateIndex
CREATE INDEX "KBChunk_clientWorkspaceId_idx" ON "KBChunk"("clientWorkspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "KBChunk_kbDocumentId_chunkIndex_key" ON "KBChunk"("kbDocumentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "QuestionnaireProject_orgId_idx" ON "QuestionnaireProject"("orgId");

-- CreateIndex
CREATE INDEX "QuestionnaireProject_clientWorkspaceId_idx" ON "QuestionnaireProject"("clientWorkspaceId");

-- CreateIndex
CREATE INDEX "ProjectFile_orgId_idx" ON "ProjectFile"("orgId");

-- CreateIndex
CREATE INDEX "ProjectFile_clientWorkspaceId_idx" ON "ProjectFile"("clientWorkspaceId");

-- CreateIndex
CREATE INDEX "ProjectFile_projectId_idx" ON "ProjectFile"("projectId");

-- CreateIndex
CREATE INDEX "QuestionItem_orgId_idx" ON "QuestionItem"("orgId");

-- CreateIndex
CREATE INDEX "QuestionItem_clientWorkspaceId_idx" ON "QuestionItem"("clientWorkspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionItem_projectId_rowIndex_key" ON "QuestionItem"("projectId", "rowIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerDraft_questionItemId_key" ON "AnswerDraft"("questionItemId");

-- CreateIndex
CREATE INDEX "AnswerDraft_orgId_idx" ON "AnswerDraft"("orgId");

-- CreateIndex
CREATE INDEX "AnswerDraft_clientWorkspaceId_idx" ON "AnswerDraft"("clientWorkspaceId");

-- CreateIndex
CREATE INDEX "AnswerDraft_projectId_idx" ON "AnswerDraft"("projectId");

-- CreateIndex
CREATE INDEX "AnswerDraft_status_idx" ON "AnswerDraft"("status");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_idx" ON "AuditLog"("orgId");

-- CreateIndex
CREATE INDEX "AuditLog_clientWorkspaceId_idx" ON "AuditLog"("clientWorkspaceId");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_idx" ON "AuditLog"("projectId");

-- CreateIndex
CREATE INDEX "ApprovalEvent_orgId_idx" ON "ApprovalEvent"("orgId");

-- CreateIndex
CREATE INDEX "ApprovalEvent_clientWorkspaceId_idx" ON "ApprovalEvent"("clientWorkspaceId");

-- CreateIndex
CREATE INDEX "ApprovalEvent_projectId_idx" ON "ApprovalEvent"("projectId");

-- CreateIndex
CREATE INDEX "ApprovalEvent_questionItemId_idx" ON "ApprovalEvent"("questionItemId");

-- CreateIndex
CREATE INDEX "GapItem_orgId_idx" ON "GapItem"("orgId");

-- CreateIndex
CREATE INDEX "GapItem_clientWorkspaceId_idx" ON "GapItem"("clientWorkspaceId");

-- CreateIndex
CREATE INDEX "GapItem_projectId_idx" ON "GapItem"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "GapItem_projectId_questionItemId_reason_key" ON "GapItem"("projectId", "questionItemId", "reason");

-- CreateIndex
CREATE INDEX "OpenAIUsageEvent_orgId_idx" ON "OpenAIUsageEvent"("orgId");

-- CreateIndex
CREATE INDEX "OpenAIUsageEvent_clientWorkspaceId_idx" ON "OpenAIUsageEvent"("clientWorkspaceId");

-- CreateIndex
CREATE INDEX "OpenAIUsageEvent_projectId_idx" ON "OpenAIUsageEvent"("projectId");

-- CreateIndex
CREATE INDEX "OpenAIUsageEvent_createdAt_idx" ON "OpenAIUsageEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_idempotencyKey_key" ON "JobRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JobRun_orgId_idx" ON "JobRun"("orgId");

-- CreateIndex
CREATE INDEX "JobRun_clientWorkspaceId_idx" ON "JobRun"("clientWorkspaceId");

-- CreateIndex
CREATE INDEX "JobRun_projectId_idx" ON "JobRun"("projectId");

-- CreateIndex
CREATE INDEX "JobRun_jobType_idx" ON "JobRun"("jobType");

-- CreateIndex
CREATE INDEX "JobRun_status_idx" ON "JobRun"("status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientWorkspace" ADD CONSTRAINT "ClientWorkspace_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientWorkspace" ADD CONSTRAINT "ClientWorkspace_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KBDocument" ADD CONSTRAINT "KBDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KBDocument" ADD CONSTRAINT "KBDocument_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KBDocument" ADD CONSTRAINT "KBDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KBChunk" ADD CONSTRAINT "KBChunk_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KBChunk" ADD CONSTRAINT "KBChunk_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KBChunk" ADD CONSTRAINT "KBChunk_kbDocumentId_fkey" FOREIGN KEY ("kbDocumentId") REFERENCES "KBDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireProject" ADD CONSTRAINT "QuestionnaireProject_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireProject" ADD CONSTRAINT "QuestionnaireProject_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireProject" ADD CONSTRAINT "QuestionnaireProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionItem" ADD CONSTRAINT "QuestionItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionItem" ADD CONSTRAINT "QuestionItem_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionItem" ADD CONSTRAINT "QuestionItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerDraft" ADD CONSTRAINT "AnswerDraft_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerDraft" ADD CONSTRAINT "AnswerDraft_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerDraft" ADD CONSTRAINT "AnswerDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerDraft" ADD CONSTRAINT "AnswerDraft_questionItemId_fkey" FOREIGN KEY ("questionItemId") REFERENCES "QuestionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_questionItemId_fkey" FOREIGN KEY ("questionItemId") REFERENCES "QuestionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapItem" ADD CONSTRAINT "GapItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapItem" ADD CONSTRAINT "GapItem_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapItem" ADD CONSTRAINT "GapItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapItem" ADD CONSTRAINT "GapItem_questionItemId_fkey" FOREIGN KEY ("questionItemId") REFERENCES "QuestionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenAIUsageEvent" ADD CONSTRAINT "OpenAIUsageEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenAIUsageEvent" ADD CONSTRAINT "OpenAIUsageEvent_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenAIUsageEvent" ADD CONSTRAINT "OpenAIUsageEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

