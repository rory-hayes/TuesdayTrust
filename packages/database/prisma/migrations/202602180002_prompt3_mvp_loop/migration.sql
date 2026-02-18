-- CreateEnum
CREATE TYPE "AnswerDraftStatus" AS ENUM (
  'DRAFT',
  'READY',
  'NEEDS_REVIEW',
  'APPROVED',
  'REJECTED',
  'INSUFFICIENT_EVIDENCE'
);

-- CreateEnum
CREATE TYPE "ApprovalEventType" AS ENUM (
  'APPROVED',
  'REJECTED',
  'EDITED'
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
  "generatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnswerDraft_pkey" PRIMARY KEY ("id")
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

-- AlterTable
ALTER TABLE "GapItem" ADD COLUMN "suggestedMissingArtifact" TEXT;

-- Backfill cleanup before NOT NULL conversion
DELETE FROM "GapItem"
WHERE "clientWorkspaceId" IS NULL
   OR "projectId" IS NULL
   OR "questionItemId" IS NULL;

-- AlterTable
ALTER TABLE "GapItem" DROP COLUMN "title";
ALTER TABLE "GapItem" ALTER COLUMN "clientWorkspaceId" SET NOT NULL;
ALTER TABLE "GapItem" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "GapItem" ALTER COLUMN "questionItemId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "GapItem" DROP CONSTRAINT IF EXISTS "GapItem_clientWorkspaceId_fkey";
ALTER TABLE "GapItem" DROP CONSTRAINT IF EXISTS "GapItem_projectId_fkey";
ALTER TABLE "GapItem" DROP CONSTRAINT IF EXISTS "GapItem_questionItemId_fkey";

-- AddForeignKey
ALTER TABLE "AnswerDraft"
  ADD CONSTRAINT "AnswerDraft_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnswerDraft"
  ADD CONSTRAINT "AnswerDraft_clientWorkspaceId_fkey"
  FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnswerDraft"
  ADD CONSTRAINT "AnswerDraft_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnswerDraft"
  ADD CONSTRAINT "AnswerDraft_questionItemId_fkey"
  FOREIGN KEY ("questionItemId") REFERENCES "QuestionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalEvent"
  ADD CONSTRAINT "ApprovalEvent_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalEvent"
  ADD CONSTRAINT "ApprovalEvent_clientWorkspaceId_fkey"
  FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalEvent"
  ADD CONSTRAINT "ApprovalEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalEvent"
  ADD CONSTRAINT "ApprovalEvent_questionItemId_fkey"
  FOREIGN KEY ("questionItemId") REFERENCES "QuestionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalEvent"
  ADD CONSTRAINT "ApprovalEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GapItem"
  ADD CONSTRAINT "GapItem_clientWorkspaceId_fkey"
  FOREIGN KEY ("clientWorkspaceId") REFERENCES "ClientWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GapItem"
  ADD CONSTRAINT "GapItem_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "QuestionnaireProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GapItem"
  ADD CONSTRAINT "GapItem_questionItemId_fkey"
  FOREIGN KEY ("questionItemId") REFERENCES "QuestionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "AnswerDraft_questionItemId_key" ON "AnswerDraft"("questionItemId");
CREATE INDEX "AnswerDraft_orgId_idx" ON "AnswerDraft"("orgId");
CREATE INDEX "AnswerDraft_clientWorkspaceId_idx" ON "AnswerDraft"("clientWorkspaceId");
CREATE INDEX "AnswerDraft_projectId_idx" ON "AnswerDraft"("projectId");
CREATE INDEX "AnswerDraft_status_idx" ON "AnswerDraft"("status");

CREATE INDEX "ApprovalEvent_orgId_idx" ON "ApprovalEvent"("orgId");
CREATE INDEX "ApprovalEvent_clientWorkspaceId_idx" ON "ApprovalEvent"("clientWorkspaceId");
CREATE INDEX "ApprovalEvent_projectId_idx" ON "ApprovalEvent"("projectId");
CREATE INDEX "ApprovalEvent_questionItemId_idx" ON "ApprovalEvent"("questionItemId");

CREATE UNIQUE INDEX "GapItem_projectId_questionItemId_reason_key"
  ON "GapItem"("projectId", "questionItemId", "reason");
