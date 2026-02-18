import {
  Prisma,
  type AnswerDraftStatus,
  ClientWorkspace,
  type PrismaClient,
  QuestionnaireProject,
  QuestionItem,
  QuestionItemStatus
} from '@evidenceq/database';
import type {
  AnswerGenerateJobPayload,
  ExportXlsxJobPayload,
  GenerateAnswersMode,
  KBIndexJobPayload,
  ProjectParseJobPayload
} from '@evidenceq/shared';

import type { FastifyInstance, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';

import { handleAuthzError, requireClientAccess, requireOrgAdmin, requireOrgMember, requireProjectAccess } from '../lib/authz';
import { blobUrlToPathname } from '../lib/blob';
import { buildExportIdempotencyKey, isActiveJobStatus } from '../lib/idempotency';
import { toSlug } from '../lib/slug';
import { captureApiEvent } from '../lib/telemetry';
import { parseQuestionsFromWorkbook, parseWorkbookPreview, type MappingPayload } from '../lib/xlsx';

type QuestionWithAnswer = QuestionItem & {
  answerDraft: {
    id: string;
    status: AnswerDraftStatus;
    answerText: string | null;
    citationsJson: Prisma.JsonValue | null;
    confidence: number | null;
    generatedAt: Date | null;
    updatedAt: Date;
  } | null;
};

type CitationInput = {
  kbChunkId: string;
  quote: string;
  docName?: string;
  locator?: string;
  sourceFileId?: string;
};

type CitationRecord = {
  kbChunkId: string;
  quote: string;
  docName: string;
  locator: string;
  sourceFileId?: string;
};

const INSUFFICIENT_EVIDENCE_REASON = 'INSUFFICIENT_EVIDENCE';
const DEFAULT_ORG_OPENAI_BUDGET_USD = Number(process.env.ORG_OPENAI_BUDGET_USD ?? 50);
const BILLING_PERIOD_DAYS = Number(process.env.OPENAI_BILLING_PERIOD_DAYS ?? 30);
type JobRunType = 'KB_INDEX' | 'PROJECT_PARSE' | 'ANSWER_GENERATE' | 'EXPORT_XLSX' | 'RETENTION_PURGE';
type JobRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function fail(reply: FastifyReply, code: number, error: string) {
  reply.code(code);
  return { error };
}

function toBlobLocator(blobPathname?: string | null, blobUrl?: string | null): string {
  if (blobPathname && blobPathname.trim()) {
    return blobPathname;
  }

  if (!blobUrl) {
    return '';
  }

  return blobUrlToPathname(blobUrl);
}

function normalizeIncomingBlobPathname(blobPathname?: string | null, blobUrl?: string | null): string {
  if (blobUrl && blobUrl.trim()) {
    return blobUrlToPathname(blobUrl.trim());
  }

  if (blobPathname && blobPathname.trim()) {
    return blobPathname.trim();
  }

  return '';
}

function toSafeDocument(document: {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  chunkCount?: number;
  indexProgress?: number;
  indexJobStatus?: string;
}) {
  return {
    id: document.id,
    filename: document.filename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    failureReason: document.failureReason,
    indexProgress: document.indexProgress ?? null,
    indexJobStatus: document.indexJobStatus ?? null,
    chunkCount: document.chunkCount ?? 0,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

function toSafeProject(project: QuestionnaireProject & { questionCount?: number; answerCount?: number; gapCount?: number }) {
  return {
    id: project.id,
    orgId: project.orgId,
    clientWorkspaceId: project.clientWorkspaceId,
    name: project.name,
    status: project.status,
    filename: project.filename,
    sheetName: project.sheetName,
    mappings: project.mappings,
    parseError: project.parseError,
    parseProgress: project.parseProgress,
    parseJobStatus: project.parseJobStatus,
    generationProgress: project.generationProgress,
    generationJobStatus: project.generationJobStatus,
    exportProgress: project.exportProgress,
    exportJobStatus: project.exportJobStatus,
    exportVersion: project.exportVersion,
    errorJson: project.errorJson,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    questionCount: project.questionCount ?? 0,
    answerCount: project.answerCount ?? 0,
    gapCount: project.gapCount ?? 0
  };
}

function hashKbVersion(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

async function getKbVersionHash(prisma: PrismaClient, orgId: string, clientWorkspaceId: string): Promise<string> {
  const docs = await prisma.kBDocument.findMany({
    where: {
      orgId,
      clientWorkspaceId,
      status: 'READY'
    },
    select: {
      id: true,
      updatedAt: true,
      indexVersion: true
    },
    orderBy: {
      id: 'asc'
    }
  });

  if (docs.length === 0) {
    return 'no-kb-docs';
  }

  return hashKbVersion(
    docs.map((doc) => `${doc.id}:${doc.indexVersion}:${doc.updatedAt.toISOString()}`)
  );
}

async function currentOpenAICostUsd(prisma: PrismaClient, orgId: string): Promise<number> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const result = await prisma.openAIUsageEvent.aggregate({
    where: {
      orgId,
      createdAt: {
        gte: periodStart
      }
    },
    _sum: {
      costEstimateUsd: true
    }
  });

  return result._sum.costEstimateUsd ?? 0;
}

async function isOpenAIBudgetExceeded(prisma: PrismaClient, orgId: string): Promise<{
  exceeded: boolean;
  budgetUsd: number;
  currentSpendUsd: number;
}> {
  const budgetUsd = Number.isFinite(DEFAULT_ORG_OPENAI_BUDGET_USD)
    ? DEFAULT_ORG_OPENAI_BUDGET_USD
    : 50;
  const currentSpendUsd = await currentOpenAICostUsd(prisma, orgId);

  return {
    exceeded: currentSpendUsd >= budgetUsd,
    budgetUsd,
    currentSpendUsd
  };
}

async function trackJobRun(
  prisma: PrismaClient,
  input: {
    orgId: string;
    clientWorkspaceId?: string | null;
    projectId?: string | null;
    jobType: JobRunType;
    idempotencyKey: string;
    queueJobId?: string | null;
    status?: JobRunStatus;
    progress?: number;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return prisma.jobRun.upsert({
    where: {
      idempotencyKey: input.idempotencyKey
    },
    create: {
      orgId: input.orgId,
      clientWorkspaceId: input.clientWorkspaceId ?? null,
      projectId: input.projectId ?? null,
      jobType: input.jobType,
      idempotencyKey: input.idempotencyKey,
      queueJobId: input.queueJobId ?? null,
      status: input.status ?? 'QUEUED',
      progress: input.progress ?? 0,
      metadata: input.metadata ?? Prisma.JsonNull
    },
    update: {
      queueJobId: input.queueJobId ?? null,
      status: input.status ?? 'QUEUED',
      progress: input.progress ?? 0,
      metadata: input.metadata ?? Prisma.JsonNull,
      errorJson: Prisma.JsonNull,
      completedAt: null
    }
  });
}

async function getClientOrReply(
  app: FastifyInstance,
  orgId: string,
  clientId: string,
  reply: FastifyReply
): Promise<ClientWorkspace | null> {
  try {
    return await requireClientAccess(app.services.prisma, orgId, clientId);
  } catch (error) {
    if (handleAuthzError(reply, error)) {
      return null;
    }

    throw error;
  }
}

async function getProjectOrReply(
  app: FastifyInstance,
  orgId: string,
  projectId: string,
  reply: FastifyReply
): Promise<QuestionnaireProject | null> {
  try {
    return await requireProjectAccess(app.services.prisma, orgId, projectId);
  } catch (error) {
    if (handleAuthzError(reply, error)) {
      return null;
    }

    throw error;
  }
}

async function getQuestionOrReply(
  app: FastifyInstance,
  orgId: string,
  questionId: string,
  reply: FastifyReply
): Promise<
  | (QuestionItem & {
      project: QuestionnaireProject;
      answerDraft: {
        id: string;
        status: AnswerDraftStatus;
        answerText: string | null;
        citationsJson: Prisma.JsonValue | null;
        confidence: number | null;
        generatedAt: Date | null;
      } | null;
    })
  | null
> {
  const question = await app.services.prisma.questionItem.findFirst({
    where: {
      id: questionId,
      orgId
    },
    include: {
      project: true,
      answerDraft: {
        select: {
          id: true,
          status: true,
          answerText: true,
          citationsJson: true,
          confidence: true,
          generatedAt: true
        }
      }
    }
  });

  if (!question) {
    await fail(reply, 404, 'Question not found');
    return null;
  }

  return question;
}

async function getUniqueClientSlug(prisma: PrismaClient, orgId: string, name: string): Promise<string> {
  const base = toSlug(name) || 'client';

  const collisions = await prisma.clientWorkspace.count({
    where: {
      orgId,
      slug: {
        startsWith: base
      }
    }
  });

  return collisions === 0 ? base : `${base}-${collisions + 1}`;
}

function isXlsxFilename(filename: string): boolean {
  return filename.trim().toLowerCase().endsWith('.xlsx');
}

function isQuestionStatus(value: string): value is QuestionItemStatus {
  return value === 'NEW' || value === 'READY_FOR_ANSWER';
}

function isAnswerDraftStatus(value: string): value is AnswerDraftStatus {
  return (
    value === 'DRAFT' ||
    value === 'READY' ||
    value === 'NEEDS_REVIEW' ||
    value === 'APPROVED' ||
    value === 'REJECTED' ||
    value === 'INSUFFICIENT_EVIDENCE'
  );
}

function isGenerateMode(value: string): value is GenerateAnswersMode {
  return value === 'ALL' || value === 'UNANSWERED';
}

function parseCitationsJson(input: unknown): CitationInput[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const row = entry as {
        kbChunkId?: unknown;
        quote?: unknown;
        docName?: unknown;
        locator?: unknown;
        sourceFileId?: unknown;
      };

      const kbChunkId = String(row.kbChunkId ?? '').trim();
      const quote = String(row.quote ?? '').trim();
      const docName = String(row.docName ?? '').trim();
      const locator = String(row.locator ?? '').trim();
      const sourceFileId = String(row.sourceFileId ?? '').trim();

      if (!kbChunkId || !quote) {
        return null;
      }

      return {
        kbChunkId,
        quote,
        ...(docName ? { docName } : {}),
        ...(locator ? { locator } : {}),
        ...(sourceFileId ? { sourceFileId } : {})
      };
    })
    .filter((entry): entry is CitationInput => Boolean(entry));
}

function buildLocatorFromChunk(chunk: {
  chunkIndex: number;
  citationPage: number | null;
  citationParagraph: number | null;
  citationSection: string | null;
  citationSheet: string | null;
  citationCell: string | null;
}): string {
  if (chunk.citationPage) {
    return `p.${chunk.citationPage}`;
  }

  if (chunk.citationParagraph) {
    return `para ${chunk.citationParagraph}`;
  }

  if (chunk.citationSection) {
    return chunk.citationSection;
  }

  if (chunk.citationSheet && chunk.citationCell) {
    return `${chunk.citationSheet}!${chunk.citationCell}`;
  }

  return `chunk ${chunk.chunkIndex}`;
}

async function validateCitations(
  prisma: PrismaClient,
  params: {
    orgId: string;
    clientWorkspaceId: string;
    citations: CitationInput[];
  }
): Promise<{
  valid: CitationRecord[];
  invalidCount: number;
}> {
  if (params.citations.length === 0) {
    return {
      valid: [],
      invalidCount: 0
    };
  }

  const uniqueChunkIds = [...new Set(params.citations.map((citation) => citation.kbChunkId))];

  const chunks = await prisma.kBChunk.findMany({
    where: {
      orgId: params.orgId,
      clientWorkspaceId: params.clientWorkspaceId,
      id: {
        in: uniqueChunkIds
      }
    },
    select: {
      id: true,
      text: true,
      chunkIndex: true,
      citationDoc: true,
      citationPage: true,
      citationParagraph: true,
      citationSection: true,
      citationSheet: true,
      citationCell: true,
      kbDocument: {
        select: {
          id: true
        }
      }
    }
  });

  const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const valid: CitationRecord[] = [];
  let invalidCount = 0;

  for (const citation of params.citations) {
    const chunk = chunkMap.get(citation.kbChunkId);

    if (!chunk) {
      invalidCount += 1;
      continue;
    }

    const quote = citation.quote.trim();

    if (!quote || !chunk.text.includes(quote)) {
      invalidCount += 1;
      continue;
    }

    valid.push({
      kbChunkId: chunk.id,
      quote,
      docName: chunk.citationDoc ?? citation.docName ?? 'KB Document',
      locator: citation.locator ?? buildLocatorFromChunk(chunk),
      ...(chunk.kbDocument.id || citation.sourceFileId
        ? {
            sourceFileId: chunk.kbDocument.id || citation.sourceFileId
          }
        : {})
    });
  }

  return {
    valid,
    invalidCount
  };
}

function summarizeQuestionStatuses(questions: QuestionWithAnswer[]) {
  const byAnswerStatus: Record<AnswerDraftStatus, number> = {
    DRAFT: 0,
    READY: 0,
    NEEDS_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    INSUFFICIENT_EVIDENCE: 0
  };
  let unanswered = 0;

  for (const question of questions) {
    if (!question.answerDraft) {
      unanswered += 1;
      continue;
    }

    const status = question.answerDraft.status;
    byAnswerStatus[status] = (byAnswerStatus[status] ?? 0) + 1;
  }

  return {
    total: questions.length,
    unanswered,
    byAnswerStatus
  };
}

export async function registerV1Routes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    try {
      await requireOrgMember(app.services.prisma, request.auth.userId, request.auth.orgId);
    } catch (error) {
      if (handleAuthzError(reply, error)) {
        return reply.send({ error: (error as Error).message });
      }

      throw error;
    }
  });

  app.post('/v1/clients', async (request, reply) => {
    const body = request.body as { name?: string; primaryDomain?: string };
    const name = body.name?.trim();

    if (!name) {
      return fail(reply, 400, 'name is required');
    }

    const slug = await getUniqueClientSlug(app.services.prisma, request.auth.orgId, name);

    const client = await app.services.prisma.clientWorkspace.create({
      data: {
        orgId: request.auth.orgId,
        createdById: request.auth.userId,
        name,
        slug,
        primaryDomain: body.primaryDomain?.trim() || null
      }
    });

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: client.id,
        actorUserId: request.auth.userId,
        action: 'client_workspace_created',
        metadata: {
          name: client.name
        }
      }
    });

    void captureApiEvent({
      event: 'client_created',
      distinctId: request.auth.userId,
      orgId: request.auth.orgId,
      properties: {
        clientWorkspaceId: client.id
      }
    });

    return client;
  });

  app.get('/v1/clients', async (request) => {
    const clients = await app.services.prisma.clientWorkspace.findMany({
      where: { orgId: request.auth.orgId },
      include: {
        _count: {
          select: {
            kbDocuments: true,
            projects: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return clients.map((client) => ({
      ...client,
      counts: {
        kbDocuments: client._count.kbDocuments,
        projects: client._count.projects
      }
    }));
  });

  app.get('/v1/account', async (request, reply) => {
    const member = await requireOrgMember(app.services.prisma, request.auth.userId, request.auth.orgId);
    const org = await app.services.prisma.org.findUnique({
      where: {
        id: request.auth.orgId
      },
      select: {
        id: true,
        name: true,
        slug: true,
        retentionDays: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!org) {
      return fail(reply, 404, 'Organization not found');
    }

    return {
      org,
      member
    };
  });

  app.patch('/v1/account/retention', async (request, reply) => {
    const body = request.body as { retentionDays?: number };
    const retentionDays = Number(body.retentionDays);

    if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
      return fail(reply, 400, 'retentionDays must be between 1 and 3650');
    }

    try {
      await requireOrgAdmin(app.services.prisma, request.auth.userId, request.auth.orgId);
    } catch (error) {
      if (handleAuthzError(reply, error)) {
        return { error: (error as Error).message };
      }

      throw error;
    }

    const org = await app.services.prisma.org.update({
      where: {
        id: request.auth.orgId
      },
      data: {
        retentionDays
      }
    });

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        actorUserId: request.auth.userId,
        action: 'org_retention_updated',
        metadata: {
          retentionDays
        }
      }
    });

    return {
      org
    };
  });

  app.post('/v1/account/run-retention-purge', async (request, reply) => {
    const body = request.body as { dryRun?: boolean };

    try {
      await requireOrgAdmin(app.services.prisma, request.auth.userId, request.auth.orgId);
    } catch (error) {
      if (handleAuthzError(reply, error)) {
        return { error: (error as Error).message };
      }

      throw error;
    }

    const idempotencyKey = `retention-purge:${request.auth.orgId}:${new Date().toISOString().slice(0, 10)}`;
    const job = await app.services.queues.retentionPurge.add(
      idempotencyKey,
      {
        orgId: request.auth.orgId,
        dryRun: Boolean(body.dryRun)
      },
      {
        jobId: idempotencyKey
      }
    );

    await trackJobRun(app.services.prisma, {
      orgId: request.auth.orgId,
      jobType: 'RETENTION_PURGE',
      idempotencyKey,
      queueJobId: String(job.id),
      status: 'QUEUED',
      progress: 0,
      metadata: {
        dryRun: Boolean(body.dryRun),
        source: 'manual'
      }
    });

    return {
      queued: true,
      jobId: job.id
    };
  });

  app.get('/v1/clients/:clientId', async (request, reply) => {
    const { clientId } = request.params as { clientId: string };

    const client = await getClientOrReply(app, request.auth.orgId, clientId, reply);

    if (!client) {
      return;
    }

    const [kbDocuments, projects] = await Promise.all([
      app.services.prisma.kBDocument.count({
        where: {
          orgId: request.auth.orgId,
          clientWorkspaceId: clientId
        }
      }),
      app.services.prisma.questionnaireProject.count({
        where: {
          orgId: request.auth.orgId,
          clientWorkspaceId: clientId
        }
      })
    ]);

    return {
      ...client,
      counts: {
        kbDocuments,
        projects
      }
    };
  });

  app.delete('/v1/clients/:clientId', async (request, reply) => {
    const { clientId } = request.params as { clientId: string };

    try {
      await requireOrgAdmin(app.services.prisma, request.auth.userId, request.auth.orgId);
    } catch (error) {
      if (handleAuthzError(reply, error)) {
        return { error: (error as Error).message };
      }

      throw error;
    }

    const client = await getClientOrReply(app, request.auth.orgId, clientId, reply);

    if (!client) {
      return;
    }

    const [kbDocs, projectFiles] = await Promise.all([
      app.services.prisma.kBDocument.findMany({
        where: {
          orgId: request.auth.orgId,
          clientWorkspaceId: client.id
        },
        select: {
          id: true,
          blobPathname: true,
          blobUrl: true
        }
      }),
      app.services.prisma.projectFile.findMany({
        where: {
          orgId: request.auth.orgId,
          clientWorkspaceId: client.id
        },
        select: {
          id: true,
          blobPathname: true,
          blobUrl: true
        }
      })
    ]);

    const blobLocators = [
      ...kbDocs.map((item) => toBlobLocator(item.blobPathname, item.blobUrl)),
      ...projectFiles.map((item) => toBlobLocator(item.blobPathname, item.blobUrl))
    ].filter(Boolean);

    for (const locator of blobLocators) {
      try {
        await app.services.storage.deleteObject(locator);
      } catch (error) {
        request.log.warn({ error, locator }, 'failed to delete blob during client removal');
      }
    }

    await app.services.prisma.clientWorkspace.delete({
      where: {
        id: client.id
      }
    });

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: client.id,
        actorUserId: request.auth.userId,
        action: 'client_workspace_deleted',
        metadata: {
          deletedBlobCount: blobLocators.length
        }
      }
    });

    return {
      ok: true,
      deletedBlobCount: blobLocators.length
    };
  });

  app.post('/v1/clients/:clientId/kb/documents', async (request, reply) => {
    const { clientId } = request.params as { clientId: string };
    const body = request.body as {
      blobPathname?: string;
      blobUrl?: string;
      filename?: string;
      mimeType?: string;
      sizeBytes?: number;
    };

    const client = await getClientOrReply(app, request.auth.orgId, clientId, reply);

    if (!client) {
      return;
    }

    const blobPathname = normalizeIncomingBlobPathname(body.blobPathname, body.blobUrl);

    if (!blobPathname || !body.filename || !body.mimeType || !Number.isFinite(body.sizeBytes)) {
      return fail(reply, 400, 'blobPathname (or blobUrl), filename, mimeType, sizeBytes are required');
    }

    const document = await app.services.prisma.kBDocument.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: client.id,
        uploadedById: request.auth.userId,
        filename: body.filename,
        blobUrl: blobPathname,
        blobPathname,
        mimeType: body.mimeType,
        sizeBytes: Number(body.sizeBytes),
        status: 'UPLOADED',
        indexVersion: 1,
        indexProgress: 0,
        indexJobStatus: 'QUEUED',
        failureReason: null,
        errorJson: Prisma.JsonNull
      }
    });

    const payload: KBIndexJobPayload = {
      orgId: request.auth.orgId,
      clientId: client.id,
      kbDocumentId: document.id,
      indexVersion: document.indexVersion
    };

    const idempotencyKey = `kb-index:${document.id}:v${document.indexVersion}`;
    const job = await app.services.queues.kbIndex.add(idempotencyKey, payload, {
      jobId: idempotencyKey
    });

    await trackJobRun(app.services.prisma, {
      orgId: request.auth.orgId,
      clientWorkspaceId: client.id,
      jobType: 'KB_INDEX',
      idempotencyKey,
      queueJobId: String(job.id),
      status: 'QUEUED',
      progress: 0,
      metadata: {
        kbDocumentId: document.id,
        indexVersion: document.indexVersion
      }
    });

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: client.id,
        actorUserId: request.auth.userId,
        action: 'kb_document_registered',
        metadata: {
          kbDocumentId: document.id,
          filename: document.filename
        }
      }
    });

    void captureApiEvent({
      event: 'kb_uploaded',
      distinctId: request.auth.userId,
      orgId: request.auth.orgId,
      properties: {
        clientWorkspaceId: client.id,
        kbDocumentId: document.id,
        mimeType: document.mimeType
      }
    });

    return toSafeDocument({
      ...document,
      chunkCount: 0
    });
  });

  app.get('/v1/clients/:clientId/kb/documents', async (request, reply) => {
    const { clientId } = request.params as { clientId: string };

    const client = await getClientOrReply(app, request.auth.orgId, clientId, reply);

    if (!client) {
      return;
    }

    const documents = await app.services.prisma.kBDocument.findMany({
      where: {
        orgId: request.auth.orgId,
        clientWorkspaceId: client.id
      },
      include: {
        _count: {
          select: {
            chunks: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return documents.map((document) => ({
      ...toSafeDocument({
        ...document,
        chunkCount: document._count.chunks
      })
    }));
  });

  app.delete('/v1/clients/:clientId/kb/documents/:documentId', async (request, reply) => {
    try {
      await requireOrgAdmin(app.services.prisma, request.auth.userId, request.auth.orgId);
    } catch (error) {
      if (handleAuthzError(reply, error)) {
        return { error: (error as Error).message };
      }

      throw error;
    }

    const { clientId, documentId } = request.params as {
      clientId: string;
      documentId: string;
    };

    const client = await getClientOrReply(app, request.auth.orgId, clientId, reply);

    if (!client) {
      return;
    }

    const document = await app.services.prisma.kBDocument.findFirst({
      where: {
        id: documentId,
        orgId: request.auth.orgId,
        clientWorkspaceId: client.id
      }
    });

    if (!document) {
      return fail(reply, 404, 'Document not found');
    }

    await app.services.prisma.kBDocument.delete({
      where: {
        id: document.id
      }
    });

    const blobLocator = toBlobLocator(document.blobPathname, document.blobUrl);

    if (blobLocator) {
      try {
        await app.services.storage.deleteObject(blobLocator);
      } catch (error) {
        request.log.warn({ error, documentId: document.id }, 'failed to delete blob object');
      }
    }

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: client.id,
        actorUserId: request.auth.userId,
        action: 'kb_document_deleted',
        metadata: {
          kbDocumentId: document.id
        }
      }
    });

    return {
      ok: true
    };
  });

  app.post('/v1/clients/:clientId/projects', async (request, reply) => {
    const { clientId } = request.params as { clientId: string };
    const body = request.body as {
      name?: string;
      blobPathname?: string;
      blobUrl?: string;
      filename?: string;
      mimeType?: string;
      sizeBytes?: number;
    };

    const client = await getClientOrReply(app, request.auth.orgId, clientId, reply);

    if (!client) {
      return;
    }

    const name = body.name?.trim();

    const blobPathname = normalizeIncomingBlobPathname(body.blobPathname, body.blobUrl);

    if (!name || !blobPathname || !body.filename || !isXlsxFilename(body.filename)) {
      return fail(reply, 400, 'name, blobPathname (or blobUrl), and .xlsx filename are required');
    }

    const project = await app.services.prisma.questionnaireProject.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: client.id,
        createdById: request.auth.userId,
        name,
        filename: body.filename,
        originalBlobUrl: blobPathname,
        originalBlobPathname: blobPathname,
        status: 'DRAFT',
        parseJobStatus: 'QUEUED',
        parseProgress: 0,
        generationJobStatus: 'QUEUED',
        generationProgress: 0,
        exportJobStatus: 'QUEUED',
        exportProgress: 0,
        exportVersion: 0,
        errorJson: Prisma.JsonNull,
        files: {
          create: {
            orgId: request.auth.orgId,
            clientWorkspaceId: client.id,
            uploadedById: request.auth.userId,
            kind: 'ORIGINAL_XLSX',
            filename: body.filename,
            blobUrl: blobPathname,
            blobPathname,
            mimeType:
              body.mimeType ??
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: Number.isFinite(body.sizeBytes) ? Number(body.sizeBytes) : null,
            generatedAt: new Date()
          }
        }
      }
    });

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: client.id,
        projectId: project.id,
        actorUserId: request.auth.userId,
        action: 'questionnaire_project_created',
        metadata: {
          projectId: project.id,
          filename: project.filename
        }
      }
    });

    void captureApiEvent({
      event: 'project_created',
      distinctId: request.auth.userId,
      orgId: request.auth.orgId,
      properties: {
        clientWorkspaceId: client.id,
        projectId: project.id
      }
    });

    return toSafeProject(project);
  });

  app.get('/v1/clients/:clientId/projects', async (request, reply) => {
    const { clientId } = request.params as { clientId: string };

    const client = await getClientOrReply(app, request.auth.orgId, clientId, reply);

    if (!client) {
      return;
    }

    const projects = await app.services.prisma.questionnaireProject.findMany({
      where: {
        orgId: request.auth.orgId,
        clientWorkspaceId: client.id
      },
      include: {
        _count: {
          select: {
            questionItems: true,
            answerDrafts: true,
            gapItems: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return projects.map((project) => ({
      ...toSafeProject({
        ...project,
        questionCount: project._count.questionItems,
        answerCount: project._count.answerDrafts,
        gapCount: project._count.gapItems
      })
    }));
  });

  app.get('/v1/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const query = request.query as {
      sheetName?: string;
    };

    const project = await getProjectOrReply(app, request.auth.orgId, projectId, reply);

    if (!project) {
      return;
    }

    const [questionPreview, answerCounts] = await Promise.all([
      app.services.prisma.questionItem.findMany({
        where: {
          orgId: request.auth.orgId,
          projectId: project.id
        },
        include: {
          answerDraft: {
            select: {
              status: true
            }
          }
        },
        take: 10,
        orderBy: {
          rowIndex: 'asc'
        }
      }),
      app.services.prisma.answerDraft.groupBy({
        by: ['status'],
        where: {
          orgId: request.auth.orgId,
          projectId: project.id
        },
        _count: {
          _all: true
        }
      })
    ]);

    let preview: ReturnType<typeof parseWorkbookPreview> | null = null;
    let previewError: string | null = null;

    try {
      const stream = await app.services.storage.getObjectStream(
        toBlobLocator(project.originalBlobPathname, project.originalBlobUrl)
      );
      const workbookBuffer = await streamToBuffer(stream);
      preview = parseWorkbookPreview(workbookBuffer, query.sheetName ?? project.sheetName ?? undefined);
    } catch (error) {
      previewError = error instanceof Error ? error.message : 'Failed to load workbook preview';
      request.log.warn({ error }, 'workbook preview parsing failed');
    }

    const latestJobs = await app.services.prisma.jobRun.findMany({
      where: {
        orgId: request.auth.orgId,
        projectId: project.id
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 10
    });

    return {
      project: toSafeProject(project),
      preview,
      previewError,
      questionPreview,
      answerCounts: answerCounts.reduce<Record<string, number>>((accumulator, row) => {
        accumulator[row.status] = row._count._all;
        return accumulator;
      }, {}),
      jobs: latestJobs
    };
  });

  app.post('/v1/projects/:projectId/map-columns', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as MappingPayload;

    const project = await getProjectOrReply(app, request.auth.orgId, projectId, reply);

    if (!project) {
      return;
    }

    if (
      !body.sheetName ||
      !body.questionCol ||
      !body.answerCol ||
      !body.evidenceCol ||
      !Number.isFinite(body.headerRowIndex)
    ) {
      return fail(reply, 400, 'sheetName, headerRowIndex, questionCol, answerCol, evidenceCol are required');
    }

    const stream = await app.services.storage.getObjectStream(
      toBlobLocator(project.originalBlobPathname, project.originalBlobUrl)
    );
    const workbookBuffer = await streamToBuffer(stream);
    const parsedQuestions = parseQuestionsFromWorkbook(workbookBuffer, body);

    if (parsedQuestions.length === 0) {
      return fail(reply, 400, 'No question rows found for the provided mapping');
    }

    await app.services.prisma.questionnaireProject.update({
      where: {
        id: project.id
      },
      data: {
        mappings: body,
        sheetName: body.sheetName,
        parseError: null,
        status: parsedQuestions.length > 200 ? 'MAPPED' : 'PARSED',
        parseJobStatus: parsedQuestions.length > 200 ? 'QUEUED' : 'SUCCEEDED',
        parseProgress: parsedQuestions.length > 200 ? 0 : 100,
        errorJson: Prisma.JsonNull
      }
    });

    await app.services.prisma.questionItem.deleteMany({
      where: {
        orgId: request.auth.orgId,
        projectId: project.id
      }
    });

    if (parsedQuestions.length > 200) {
      const payload: ProjectParseJobPayload = {
        orgId: request.auth.orgId,
        projectId: project.id,
        parseVersion: Date.now()
      };

      const idempotencyKey = `project-parse:${project.id}:${body.sheetName}:${body.headerRowIndex}:${body.questionCol}:${body.answerCol}:${body.evidenceCol}`;
      const job = await app.services.queues.projectParse.add(idempotencyKey, payload, {
        jobId: idempotencyKey
      });

      await trackJobRun(app.services.prisma, {
        orgId: request.auth.orgId,
        clientWorkspaceId: project.clientWorkspaceId,
        projectId: project.id,
        jobType: 'PROJECT_PARSE',
        idempotencyKey,
        queueJobId: String(job.id),
        status: 'QUEUED',
        progress: 0,
        metadata: {
          sheetName: body.sheetName
        }
      });

      void captureApiEvent({
        event: 'project_mapped',
        distinctId: request.auth.userId,
        orgId: request.auth.orgId,
        properties: {
          projectId: project.id,
          questionCount: parsedQuestions.length,
          queued: true
        }
      });

      return {
        queued: true,
        parsedInApi: false,
        questionCount: parsedQuestions.length,
        status: 'MAPPED'
      };
    }

    await app.services.prisma.questionItem.createMany({
      data: parsedQuestions.map((item) => ({
        orgId: request.auth.orgId,
        clientWorkspaceId: project.clientWorkspaceId,
        projectId: project.id,
        rowIndex: item.rowIndex,
        questionText: item.questionText,
        answerCellRef: item.answerCellRef,
        evidenceCellRef: item.evidenceCellRef,
        status: 'READY_FOR_ANSWER'
      }))
    });

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: project.clientWorkspaceId,
        projectId: project.id,
        actorUserId: request.auth.userId,
        action: 'project_columns_mapped',
        metadata: {
          mappings: body,
          questionCount: parsedQuestions.length
        }
      }
    });

    void captureApiEvent({
      event: 'project_mapped',
      distinctId: request.auth.userId,
      orgId: request.auth.orgId,
      properties: {
        projectId: project.id,
        questionCount: parsedQuestions.length
      }
    });

    return {
      queued: false,
      parsedInApi: true,
      questionCount: parsedQuestions.length,
      status: 'PARSED'
    };
  });

  app.post('/v1/projects/:projectId/generate-answers', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      questionIds?: string[];
      mode?: GenerateAnswersMode;
    };

    const project = await getProjectOrReply(app, request.auth.orgId, projectId, reply);

    if (!project) {
      return;
    }

    const mode = body.mode ?? 'UNANSWERED';

    if (!isGenerateMode(mode)) {
      return fail(reply, 400, 'mode must be ALL or UNANSWERED');
    }

    const budgetCheck = await isOpenAIBudgetExceeded(app.services.prisma, request.auth.orgId);

    if (budgetCheck.exceeded) {
      return fail(
        reply,
        429,
        `OpenAI budget exceeded for this org (${budgetCheck.currentSpendUsd.toFixed(2)} / ${budgetCheck.budgetUsd.toFixed(2)} USD)`
      );
    }

    const candidateQuestions = await app.services.prisma.questionItem.findMany({
      where: {
        orgId: request.auth.orgId,
        projectId: project.id,
        ...(Array.isArray(body.questionIds) && body.questionIds.length > 0
          ? {
              id: {
                in: [...new Set(body.questionIds.map((id) => String(id).trim()).filter(Boolean))]
              }
            }
          : {})
      },
      include: {
        answerDraft: {
          select: {
            status: true
          }
        }
      },
      orderBy: {
        rowIndex: 'asc'
      }
    });

    if (Array.isArray(body.questionIds) && body.questionIds.length > 0 && candidateQuestions.length === 0) {
      return fail(reply, 400, 'One or more questionIds do not belong to this project');
    }

    const questionIds = candidateQuestions
      .filter((question) => mode === 'ALL' || question.answerDraft?.status !== 'APPROVED')
      .map((question) => question.id);

    if (questionIds.length === 0) {
      return {
        queued: false,
        mode,
        questionCount: 0
      };
    }

    const kbVersionHash = await getKbVersionHash(
      app.services.prisma,
      request.auth.orgId,
      project.clientWorkspaceId
    );

    await app.services.prisma.questionnaireProject.update({
      where: {
        id: project.id
      },
      data: {
        generationJobStatus: 'RUNNING',
        generationProgress: 0,
        errorJson: Prisma.JsonNull,
        lastKbVersionHash: kbVersionHash
      }
    });

    const jobs = [];

    for (const questionId of questionIds) {
      const payload: AnswerGenerateJobPayload = {
        orgId: request.auth.orgId,
        clientId: project.clientWorkspaceId,
        projectId: project.id,
        questionId,
        questionIds: [questionId],
        kbVersionHash,
        mode
      };

      const idempotencyKey = `answer-generate:${project.id}:${questionId}:${kbVersionHash}`;
      const job = await app.services.queues.answerGenerate.add(idempotencyKey, payload, {
        jobId: idempotencyKey
      });
      jobs.push(job);

      await trackJobRun(app.services.prisma, {
        orgId: request.auth.orgId,
        clientWorkspaceId: project.clientWorkspaceId,
        projectId: project.id,
        jobType: 'ANSWER_GENERATE',
        idempotencyKey,
        queueJobId: String(job.id),
        status: 'QUEUED',
        progress: 0,
        metadata: {
          questionId,
          mode,
          kbVersionHash
        }
      });
    }

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: project.clientWorkspaceId,
        projectId: project.id,
        actorUserId: request.auth.userId,
        action: 'project_answer_generation_enqueued',
        metadata: {
          mode,
          questionCount: questionIds.length,
          kbVersionHash
        }
      }
    });

    void captureApiEvent({
      event: 'answers_generated',
      distinctId: request.auth.userId,
      orgId: request.auth.orgId,
      properties: {
        projectId: project.id,
        questionCount: questionIds.length,
        mode
      }
    });

    return {
      queued: true,
      jobCount: jobs.length,
      mode,
      questionCount: questionIds.length,
      kbVersionHash
    };
  });

  app.get('/v1/projects/:projectId/questions', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const query = request.query as {
      status?: string;
    };

    const project = await getProjectOrReply(app, request.auth.orgId, projectId, reply);

    if (!project) {
      return;
    }

    const questions = (await app.services.prisma.questionItem.findMany({
      where: {
        orgId: request.auth.orgId,
        projectId: project.id
      },
      include: {
        answerDraft: {
          select: {
            id: true,
            status: true,
            answerText: true,
            citationsJson: true,
            confidence: true,
            generatedAt: true,
            updatedAt: true
          }
        }
      },
      orderBy: {
        rowIndex: 'asc'
      }
    })) as QuestionWithAnswer[];

    let filtered = questions;

    if (query.status) {
      const status = query.status.toUpperCase();

      if (!isQuestionStatus(status) && !isAnswerDraftStatus(status)) {
        return fail(reply, 400, 'Invalid status filter');
      }

      filtered = questions.filter((question) => {
        if (isQuestionStatus(status)) {
          return question.status === status;
        }

        return question.answerDraft?.status === status;
      });
    }

    return {
      projectStatus: project.status,
      counts: summarizeQuestionStatuses(questions),
      total: filtered.length,
      questions: filtered
    };
  });

  app.get('/v1/questions/:questionId', async (request, reply) => {
    const { questionId } = request.params as { questionId: string };

    const question = await getQuestionOrReply(app, request.auth.orgId, questionId, reply);

    if (!question) {
      return;
    }

    const citations = parseCitationsJson(question.answerDraft?.citationsJson ?? []);

    return {
      question: {
        id: question.id,
        orgId: question.orgId,
        clientWorkspaceId: question.clientWorkspaceId,
        projectId: question.projectId,
        rowIndex: question.rowIndex,
        questionText: question.questionText,
        answerCellRef: question.answerCellRef,
        evidenceCellRef: question.evidenceCellRef,
        status: question.status
      },
      answerDraft: question.answerDraft
        ? {
            ...question.answerDraft,
            citationsJson: citations
          }
        : null
    };
  });

  app.post('/v1/questions/:questionId/edit', async (request, reply) => {
    const { questionId } = request.params as { questionId: string };
    const body = request.body as {
      answerText?: string;
      citationsJson?: unknown;
    };

    const question = await getQuestionOrReply(app, request.auth.orgId, questionId, reply);

    if (!question) {
      return;
    }

    const citationsInput = parseCitationsJson(body.citationsJson);
    const validation = await validateCitations(app.services.prisma, {
      orgId: request.auth.orgId,
      clientWorkspaceId: question.clientWorkspaceId,
      citations: citationsInput
    });

    const answerText = body.answerText?.trim() || null;

    let nextStatus: AnswerDraftStatus = 'DRAFT';

    if (validation.valid.length > 0 && validation.invalidCount === 0) {
      nextStatus = 'READY';
    } else if (answerText || citationsInput.length > 0) {
      nextStatus = 'NEEDS_REVIEW';
    }

    const previousStatus = question.answerDraft?.status;

    const draft = await app.services.prisma.answerDraft.upsert({
      where: {
        questionItemId: question.id
      },
      create: {
        orgId: request.auth.orgId,
        clientWorkspaceId: question.clientWorkspaceId,
        projectId: question.projectId,
        questionItemId: question.id,
        status: nextStatus,
        answerText,
        citationsJson: validation.valid,
        generatedAt: new Date()
      },
      update: {
        status: nextStatus,
        answerText,
        citationsJson: validation.valid,
        generatedAt: new Date()
      }
    });

    if (nextStatus === 'READY') {
      await app.services.prisma.gapItem.updateMany({
        where: {
          orgId: request.auth.orgId,
          projectId: question.projectId,
          questionItemId: question.id,
          reason: INSUFFICIENT_EVIDENCE_REASON,
          status: 'OPEN'
        },
        data: {
          status: 'RESOLVED'
        }
      });
    }

    await app.services.prisma.approvalEvent.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: question.clientWorkspaceId,
        projectId: question.projectId,
        questionItemId: question.id,
        actorUserId: request.auth.userId,
        eventType: 'EDITED',
        fromStatus: previousStatus ?? null,
        toStatus: draft.status,
        metadata: {
          invalidCitationCount: validation.invalidCount
        }
      }
    });

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: question.clientWorkspaceId,
        projectId: question.projectId,
        actorUserId: request.auth.userId,
        action: 'answer_draft_edited',
        metadata: {
          questionItemId: question.id,
          fromStatus: previousStatus ?? null,
          toStatus: draft.status,
          citationCount: validation.valid.length,
          invalidCitationCount: validation.invalidCount
        }
      }
    });

    return {
      questionId: question.id,
      answerDraft: {
        ...draft,
        citationsJson: validation.valid
      }
    };
  });

  app.post('/v1/questions/:questionId/approve', async (request, reply) => {
    const { questionId } = request.params as { questionId: string };

    const question = await getQuestionOrReply(app, request.auth.orgId, questionId, reply);

    if (!question) {
      return;
    }

    if (!question.answerDraft) {
      return fail(reply, 400, 'Question has no answer draft to approve');
    }

    const citationsInput = parseCitationsJson(question.answerDraft.citationsJson ?? []);
    const validation = await validateCitations(app.services.prisma, {
      orgId: request.auth.orgId,
      clientWorkspaceId: question.clientWorkspaceId,
      citations: citationsInput
    });

    if (validation.valid.length === 0 || validation.invalidCount > 0) {
      return fail(reply, 400, 'Cannot approve answer without at least one valid citation');
    }

    const previousStatus = question.answerDraft.status;

    const draft = await app.services.prisma.answerDraft.update({
      where: {
        questionItemId: question.id
      },
      data: {
        status: 'APPROVED',
        citationsJson: validation.valid
      }
    });

    await app.services.prisma.gapItem.updateMany({
      where: {
        orgId: request.auth.orgId,
        projectId: question.projectId,
        questionItemId: question.id,
        reason: INSUFFICIENT_EVIDENCE_REASON,
        status: 'OPEN'
      },
      data: {
        status: 'RESOLVED'
      }
    });

    await app.services.prisma.approvalEvent.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: question.clientWorkspaceId,
        projectId: question.projectId,
        questionItemId: question.id,
        actorUserId: request.auth.userId,
        eventType: 'APPROVED',
        fromStatus: previousStatus,
        toStatus: draft.status,
        metadata: {
          citationCount: validation.valid.length
        }
      }
    });

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: question.clientWorkspaceId,
        projectId: question.projectId,
        actorUserId: request.auth.userId,
        action: 'answer_draft_approved',
        metadata: {
          questionItemId: question.id,
          fromStatus: previousStatus,
          toStatus: draft.status,
          citationCount: validation.valid.length
        }
      }
    });

    return {
      questionId: question.id,
      answerDraft: {
        ...draft,
        citationsJson: validation.valid
      }
    };
  });

  app.post('/v1/questions/:questionId/reject', async (request, reply) => {
    const { questionId } = request.params as { questionId: string };

    const question = await getQuestionOrReply(app, request.auth.orgId, questionId, reply);

    if (!question) {
      return;
    }

    const previousStatus = question.answerDraft?.status ?? null;

    const draft = await app.services.prisma.answerDraft.upsert({
      where: {
        questionItemId: question.id
      },
      create: {
        orgId: request.auth.orgId,
        clientWorkspaceId: question.clientWorkspaceId,
        projectId: question.projectId,
        questionItemId: question.id,
        status: 'REJECTED',
        answerText: question.answerDraft?.answerText ?? null,
        citationsJson: parseCitationsJson(question.answerDraft?.citationsJson ?? []),
        generatedAt: new Date()
      },
      update: {
        status: 'REJECTED'
      }
    });

    await app.services.prisma.approvalEvent.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: question.clientWorkspaceId,
        projectId: question.projectId,
        questionItemId: question.id,
        actorUserId: request.auth.userId,
        eventType: 'REJECTED',
        fromStatus: previousStatus,
        toStatus: draft.status,
        metadata: {}
      }
    });

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: question.clientWorkspaceId,
        projectId: question.projectId,
        actorUserId: request.auth.userId,
        action: 'answer_draft_rejected',
        metadata: {
          questionItemId: question.id,
          fromStatus: previousStatus,
          toStatus: draft.status
        }
      }
    });

    return {
      questionId: question.id,
      answerDraft: draft
    };
  });

  app.post('/v1/projects/:projectId/approve-all-ready', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const project = await getProjectOrReply(app, request.auth.orgId, projectId, reply);

    if (!project) {
      return;
    }

    const candidates = await app.services.prisma.questionItem.findMany({
      where: {
        orgId: request.auth.orgId,
        projectId: project.id,
        answerDraft: {
          is: {
            status: 'READY'
          }
        }
      },
      include: {
        answerDraft: {
          select: {
            status: true,
            citationsJson: true
          }
        }
      }
    });

    let approved = 0;
    let skipped = 0;

    for (const question of candidates) {
      const citationsInput = parseCitationsJson(question.answerDraft?.citationsJson ?? []);
      const validation = await validateCitations(app.services.prisma, {
        orgId: request.auth.orgId,
        clientWorkspaceId: question.clientWorkspaceId,
        citations: citationsInput
      });

      if (validation.valid.length === 0 || validation.invalidCount > 0) {
        skipped += 1;
        continue;
      }

      await app.services.prisma.answerDraft.update({
        where: {
          questionItemId: question.id
        },
        data: {
          status: 'APPROVED',
          citationsJson: validation.valid
        }
      });

      await app.services.prisma.approvalEvent.create({
        data: {
          orgId: request.auth.orgId,
          clientWorkspaceId: question.clientWorkspaceId,
          projectId: project.id,
          questionItemId: question.id,
          actorUserId: request.auth.userId,
          eventType: 'APPROVED',
          fromStatus: 'READY',
          toStatus: 'APPROVED',
          metadata: {
            source: 'approve-all-ready',
            citationCount: validation.valid.length
          }
        }
      });

      approved += 1;
    }

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: project.clientWorkspaceId,
        projectId: project.id,
        actorUserId: request.auth.userId,
        action: 'project_approve_all_ready',
        metadata: {
          approved,
          skipped
        }
      }
    });

    return {
      approved,
      skipped
    };
  });

  app.post('/v1/projects/:projectId/export-xlsx', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const project = await getProjectOrReply(app, request.auth.orgId, projectId, reply);

    if (!project) {
      return;
    }

    const kbVersionHash = await getKbVersionHash(
      app.services.prisma,
      request.auth.orgId,
      project.clientWorkspaceId
    );
    const nextExportVersion = project.exportVersion + 1;
    const idempotencyKey = buildExportIdempotencyKey(project.id, nextExportVersion, kbVersionHash);
    const payload: ExportXlsxJobPayload = {
      orgId: request.auth.orgId,
      projectId: project.id,
      exportVersion: nextExportVersion,
      kbVersionHash
    };

    const existingRun = await app.services.prisma.jobRun.findUnique({
      where: {
        idempotencyKey
      }
    });

    if (existingRun && isActiveJobStatus(existingRun.status)) {
      return {
        queued: true,
        jobId: existingRun.queueJobId ?? null,
        exportVersion: nextExportVersion
      };
    }

    const job = await app.services.queues.exportXlsx.add(idempotencyKey, payload, {
      jobId: idempotencyKey
    });

    await app.services.prisma.questionnaireProject.update({
      where: {
        id: project.id
      },
      data: {
        exportJobStatus: 'RUNNING',
        exportProgress: 0,
        errorJson: Prisma.JsonNull,
        exportVersion: nextExportVersion,
        lastKbVersionHash: kbVersionHash
      }
    });

    await trackJobRun(app.services.prisma, {
      orgId: request.auth.orgId,
      clientWorkspaceId: project.clientWorkspaceId,
      projectId: project.id,
      jobType: 'EXPORT_XLSX',
      idempotencyKey,
      queueJobId: String(job.id),
      status: 'QUEUED',
      progress: 0,
      metadata: {
        exportVersion: nextExportVersion,
        kbVersionHash
      }
    });

    await app.services.prisma.auditLog.create({
      data: {
        orgId: request.auth.orgId,
        clientWorkspaceId: project.clientWorkspaceId,
        projectId: project.id,
        actorUserId: request.auth.userId,
        action: 'project_export_enqueued',
        metadata: {
          queueJobId: job.id,
          exportVersion: nextExportVersion,
          kbVersionHash
        }
      }
    });

    void captureApiEvent({
      event: 'export_created',
      distinctId: request.auth.userId,
      orgId: request.auth.orgId,
      properties: {
        projectId: project.id,
        exportVersion: nextExportVersion
      }
    });

    return {
      queued: true,
      jobId: job.id,
      exportVersion: nextExportVersion
    };
  });

  app.get('/v1/projects/:projectId/exports', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const project = await getProjectOrReply(app, request.auth.orgId, projectId, reply);

    if (!project) {
      return;
    }

    const files = await app.services.prisma.projectFile.findMany({
      where: {
        orgId: request.auth.orgId,
        projectId: project.id,
        kind: 'EXPORT_XLSX'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return {
      total: files.length,
      exports: files.map((file) => ({
        id: file.id,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        createdAt: file.createdAt,
        generatedAt: file.generatedAt,
        exportVersion: file.exportVersion,
        sourceKbVersionHash: file.sourceKbVersionHash
      }))
    };
  });

  app.get('/v1/projects/:projectId/jobs', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const project = await getProjectOrReply(app, request.auth.orgId, projectId, reply);

    if (!project) {
      return;
    }

    const jobs = await app.services.prisma.jobRun.findMany({
      where: {
        orgId: request.auth.orgId,
        projectId: project.id
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 50
    });

    return {
      projectId: project.id,
      projectProgress: {
        parseJobStatus: project.parseJobStatus,
        parseProgress: project.parseProgress,
        generationJobStatus: project.generationJobStatus,
        generationProgress: project.generationProgress,
        exportJobStatus: project.exportJobStatus,
        exportProgress: project.exportProgress
      },
      jobs
    };
  });

  app.get('/v1/files/:fileId/download', async (request, reply) => {
    const { fileId } = request.params as { fileId: string };

    const [projectFile, kbDocument] = await Promise.all([
      app.services.prisma.projectFile.findFirst({
        where: {
          id: fileId,
          orgId: request.auth.orgId
        }
      }),
      app.services.prisma.kBDocument.findFirst({
        where: {
          id: fileId,
          orgId: request.auth.orgId
        }
      })
    ]);

    const file = projectFile
      ? {
          filename: projectFile.filename,
          mimeType: projectFile.mimeType,
          locator: toBlobLocator(projectFile.blobPathname, projectFile.blobUrl)
        }
      : kbDocument
        ? {
            filename: kbDocument.filename,
            mimeType: kbDocument.mimeType,
            locator: toBlobLocator(kbDocument.blobPathname, kbDocument.blobUrl)
          }
        : null;

    if (!file || !file.locator) {
      return fail(reply, 404, 'File not found');
    }

    const stream = await app.services.storage.getObjectStream(file.locator);
    reply.header('content-type', file.mimeType || 'application/octet-stream');
    reply.header('content-disposition', `attachment; filename="${file.filename.replace(/"/g, '')}"`);

    return reply.send(stream);
  });

  app.get('/v1/projects/:projectId/gaps', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const project = await getProjectOrReply(app, request.auth.orgId, projectId, reply);

    if (!project) {
      return;
    }

    const gaps = await app.services.prisma.gapItem.findMany({
      where: {
        orgId: request.auth.orgId,
        projectId: project.id
      },
      include: {
        questionItem: {
          select: {
            rowIndex: true,
            questionText: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return {
      total: gaps.length,
      gaps
    };
  });
}
