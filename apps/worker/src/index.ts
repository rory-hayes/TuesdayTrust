import { createPrismaClient, Prisma } from '@evidenceq/database';
import type {
  AnswerGenerateJobPayload,
  ExportXlsxJobPayload,
  KBIndexJobPayload,
  ProjectParseJobPayload,
  RetentionPurgeJobPayload
} from '@evidenceq/shared';
import { createStorageAdapter } from '@evidenceq/storage';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import pino from 'pino';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { read, utils, write } from 'xlsx';

import { buildChunkLocator, type CitationInput, type CitationRecord, type RetrievedChunk, validateGeneratedCitations } from './lib/citations';
import { formatEvidenceLines, isDuplicateExportVersion, sanitizeExcelCell } from './lib/export-safety';
import { captureWorkerEvent, captureWorkerException, closeWorkerTelemetry, initWorkerTelemetry } from './lib/telemetry';
import { queueNames } from './queues';

type ExtractedChunk = {
  chunkIndex: number;
  text: string;
  citationPage?: number;
  citationParagraph?: number;
  citationSection?: string;
};

type RetrievedChunkWithEmbedding = RetrievedChunk & {
  embeddingText?: string | null;
};

type GenerationResponse = {
  status: 'ANSWERED' | 'INSUFFICIENT_EVIDENCE';
  answer: string;
  citations: CitationInput[];
  suggested_missing_artifact: string | null;
};

type JobRunType = 'KB_INDEX' | 'PROJECT_PARSE' | 'ANSWER_GENERATE' | 'EXPORT_XLSX' | 'RETENTION_PURGE';
type JobRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

const INSUFFICIENT_EVIDENCE_REASON = 'INSUFFICIENT_EVIDENCE';
const ORG_OPENAI_BUDGET_USD = Number(process.env.ORG_OPENAI_BUDGET_USD ?? 50);
const ORG_OPENAI_CONCURRENCY_LIMIT = Math.max(1, Number(process.env.ORG_OPENAI_CONCURRENCY_LIMIT ?? 2));
const BILLING_PERIOD_DAYS = Number(process.env.OPENAI_BILLING_PERIOD_DAYS ?? 30);
const RETENTION_PURGE_INTERVAL_MINUTES = Math.max(60, Number(process.env.RETENTION_PURGE_INTERVAL_MINUTES ?? 1440));
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: null
});

function toBlobLocator(pathname?: string | null, fallback?: string | null): string {
  if (pathname && pathname.trim()) {
    return pathname;
  }

  if (!fallback) {
    return '';
  }

  return fallback;
}

function hashText(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function estimateUsdCost(model: string, inputTokens: number, outputTokens = 0): number {
  const normalizedModel = model.toLowerCase();

  const pricing = normalizedModel.includes('text-embedding-3-small')
    ? { input: 0.00002, output: 0 }
    : normalizedModel.includes('text-embedding-3-large')
      ? { input: 0.00013, output: 0 }
      : normalizedModel.includes('gpt-4o-mini')
        ? { input: 0.00015, output: 0.0006 }
        : { input: 0.0005, output: 0.0015 };

  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

async function updateJobRun(
  prisma: ReturnType<typeof createPrismaClient>,
  params: {
    orgId: string;
    clientWorkspaceId?: string | null;
    projectId?: string | null;
    jobType: JobRunType;
    idempotencyKey: string;
    queueJobId?: string | null;
    status: JobRunStatus;
    progress: number;
    attempts?: number;
    metadata?: Prisma.InputJsonValue;
    errorJson?: Prisma.InputJsonValue;
  }
) {
  const updateData: Prisma.JobRunUpdateInput = {
    queueJobId: params.queueJobId ?? null,
    status: params.status,
    progress: params.progress,
    metadata: params.metadata ?? Prisma.JsonNull,
    errorJson: params.errorJson ?? Prisma.JsonNull,
    ...(params.status === 'SUCCEEDED' || params.status === 'FAILED'
      ? {
          completedAt: new Date()
        }
      : {
          completedAt: null
        })
  };

  if (params.attempts !== undefined) {
    updateData.attempts = params.attempts;
  }

  return prisma.jobRun.upsert({
    where: {
      idempotencyKey: params.idempotencyKey
    },
    create: {
      orgId: params.orgId,
      clientWorkspaceId: params.clientWorkspaceId ?? null,
      projectId: params.projectId ?? null,
      jobType: params.jobType,
      idempotencyKey: params.idempotencyKey,
      queueJobId: params.queueJobId ?? null,
      status: params.status,
      progress: params.progress,
      attempts: params.attempts ?? 0,
      metadata: params.metadata ?? Prisma.JsonNull,
      errorJson: params.errorJson ?? Prisma.JsonNull,
      completedAt: params.status === 'SUCCEEDED' || params.status === 'FAILED' ? new Date() : null
    },
    update: updateData
  });
}

async function currentOpenAICostUsd(prisma: ReturnType<typeof createPrismaClient>, orgId: string): Promise<number> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const usage = await prisma.openAIUsageEvent.aggregate({
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

  return usage._sum.costEstimateUsd ?? 0;
}

async function recordOpenAIUsage(
  prisma: ReturnType<typeof createPrismaClient>,
  params: {
    orgId: string;
    clientWorkspaceId?: string | null;
    projectId?: string | null;
    model: string;
    inputTokens: number;
    outputTokens?: number;
    metadata?: Prisma.InputJsonValue;
  }
) {
  const outputTokens = params.outputTokens ?? 0;
  const costEstimateUsd = estimateUsdCost(params.model, params.inputTokens, outputTokens);

  await prisma.openAIUsageEvent.create({
    data: {
      orgId: params.orgId,
      clientWorkspaceId: params.clientWorkspaceId ?? null,
      projectId: params.projectId ?? null,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens,
      costEstimateUsd,
      metadata: params.metadata ?? Prisma.JsonNull
    }
  });

  return costEstimateUsd;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = [];

  for await (const part of stream) {
    parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
  }

  return Buffer.concat(parts);
}

function chunkText(text: string, size = 1000, overlap = 150): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return [];
  }

  if (normalized.length <= size) {
    return [normalized];
  }

  const chunks: string[] = [];
  const step = Math.max(1, size - overlap);

  for (let start = 0; start < normalized.length; start += step) {
    const section = normalized.slice(start, start + size).trim();

    if (section) {
      chunks.push(section);
    }

    if (start + size >= normalized.length) {
      break;
    }
  }

  return chunks;
}

async function extractPdfChunks(buffer: Buffer): Promise<ExtractedChunk[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const docTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false
  });
  const document = await docTask.promise;
  const chunks: ExtractedChunk[] = [];
  let chunkIndex = 0;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = (content.items as Array<{ str?: string }>).map((item) => item.str ?? '').join(' ');

    for (const piece of chunkText(text)) {
      chunks.push({
        chunkIndex,
        text: piece,
        citationPage: pageNumber
      });
      chunkIndex += 1;
    }
  }

  return chunks;
}

async function extractDocxChunks(buffer: Buffer): Promise<ExtractedChunk[]> {
  const extracted = await mammoth.extractRawText({ buffer });
  const paragraphs = extracted.value
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: ExtractedChunk[] = [];
  let chunkIndex = 0;

  paragraphs.forEach((paragraph, paragraphOffset) => {
    const paragraphIndex = paragraphOffset + 1;

    for (const piece of chunkText(paragraph)) {
      chunks.push({
        chunkIndex,
        text: piece,
        citationParagraph: paragraphIndex,
        citationSection: `paragraph:${paragraphIndex}`
      });
      chunkIndex += 1;
    }
  });

  return chunks;
}

function extractTextChunks(buffer: Buffer): ExtractedChunk[] {
  const text = buffer.toString('utf8');

  return chunkText(text).map((chunk, chunkIndex) => ({
    chunkIndex,
    text: chunk,
    citationSection: `chunk:${chunkIndex}`
  }));
}

async function extractDocumentChunks(mimeType: string, buffer: Buffer): Promise<ExtractedChunk[]> {
  if (mimeType === 'application/pdf') {
    return extractPdfChunks(buffer);
  }

  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    return extractDocxChunks(buffer);
  }

  if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'application/json') {
    return extractTextChunks(buffer);
  }

  throw new Error(`Unsupported KB document type: ${mimeType}`);
}

async function createEmbeddings(
  openai: OpenAI,
  model: string,
  texts: string[],
  batchSize = 50
): Promise<number[][]> {
  const output: number[][] = [];

  for (let cursor = 0; cursor < texts.length; cursor += batchSize) {
    const batch = texts.slice(cursor, cursor + batchSize);

    const response = await openai.embeddings.create({
      model,
      input: batch
    });

    response.data.forEach((entry) => {
      output.push(entry.embedding);
    });
  }

  return output;
}

function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

function parseVectorLiteral(value: string): number[] {
  const trimmed = value.trim();

  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [];
  }

  return trimmed
    .slice(1, -1)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return -1;
  }

  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let index = 0; index < a.length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    aMagnitude += av * av;
    bMagnitude += bv * bv;
  }

  if (aMagnitude === 0 || bMagnitude === 0) {
    return -1;
  }

  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

function normalizeMapping(input: Prisma.JsonValue | null): {
  sheetName: string;
  headerRowIndex: number;
  questionCol: string;
  answerCol: string;
  evidenceCol: string;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Project mapping is missing');
  }

  const sheetName = String(input.sheetName ?? '').trim();
  const headerRowIndex = Number(input.headerRowIndex ?? 1);
  const questionCol = String(input.questionCol ?? '').trim();
  const answerCol = String(input.answerCol ?? '').trim();
  const evidenceCol = String(input.evidenceCol ?? '').trim();

  if (!sheetName || !questionCol || !answerCol || !evidenceCol || !Number.isFinite(headerRowIndex)) {
    throw new Error('Project mapping is invalid');
  }

  return {
    sheetName,
    headerRowIndex,
    questionCol,
    answerCol,
    evidenceCol
  };
}

function normalizeColumn(column: string): number {
  const label = column.trim().toUpperCase();

  if (!/^[A-Z]+$/.test(label)) {
    throw new Error(`Invalid column label: ${column}`);
  }

  let index = 0;

  for (const char of label) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }

  return index - 1;
}

function parseProjectQuestionsFromBuffer(
  workbookBuffer: Buffer,
  mapping: ReturnType<typeof normalizeMapping>
): Array<{ rowIndex: number; questionText: string; answerCellRef: string; evidenceCellRef: string }> {
  const workbook = read(workbookBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets[mapping.sheetName];

  if (!sheet) {
    throw new Error(`Sheet not found: ${mapping.sheetName}`);
  }

  const rows = utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false
  }) as unknown[][];

  const questionColIndex = normalizeColumn(mapping.questionCol);
  const answerColIndex = normalizeColumn(mapping.answerCol);
  const evidenceColIndex = normalizeColumn(mapping.evidenceCol);
  const headerIndex = Math.max(1, mapping.headerRowIndex);

  const results: Array<{ rowIndex: number; questionText: string; answerCellRef: string; evidenceCellRef: string }> = [];

  for (let rowCursor = headerIndex; rowCursor < rows.length; rowCursor += 1) {
    const row = rows[rowCursor] ?? [];
    const questionText = String(row[questionColIndex] ?? '').trim();

    if (!questionText) {
      continue;
    }

    results.push({
      rowIndex: rowCursor + 1,
      questionText,
      answerCellRef: utils.encode_cell({ c: answerColIndex, r: rowCursor }),
      evidenceCellRef: utils.encode_cell({ c: evidenceColIndex, r: rowCursor })
    });
  }

  return results;
}

function parseCitationsJson(input: Prisma.JsonValue | null | undefined): CitationRecord[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const record = entry as {
        kbChunkId?: unknown;
        docName?: unknown;
        locator?: unknown;
        quote?: unknown;
        sourceFileId?: unknown;
      };

      const kbChunkId = String(record.kbChunkId ?? '').trim();
      const quote = String(record.quote ?? '').trim();
      const docName = String(record.docName ?? '').trim();
      const locator = String(record.locator ?? '').trim();
      const sourceFileId = String(record.sourceFileId ?? '').trim();

      if (!kbChunkId || !quote) {
        return null;
      }

      return {
        kbChunkId,
        quote,
        docName: docName || 'KB Document',
        locator: locator || 'chunk',
        ...(sourceFileId ? { sourceFileId } : {})
      };
    })
    .filter((entry): entry is CitationRecord => Boolean(entry));
}

function parseGenerationResponse(input: string | null | undefined): GenerationResponse {
  if (!input) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer: '',
      citations: [],
      suggested_missing_artifact: null
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer: '',
      citations: [],
      suggested_missing_artifact: null
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer: '',
      citations: [],
      suggested_missing_artifact: null
    };
  }

  const row = parsed as {
    status?: unknown;
    answer?: unknown;
    citations?: unknown;
    suggested_missing_artifact?: unknown;
  };

  const status = row.status === 'ANSWERED' ? 'ANSWERED' : 'INSUFFICIENT_EVIDENCE';
  const answer = String(row.answer ?? '').trim();

  const citations = Array.isArray(row.citations)
    ? row.citations
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const citation = entry as {
            kbChunkId?: unknown;
            quote?: unknown;
          };

          const kbChunkId = String(citation.kbChunkId ?? '').trim();
          const quote = String(citation.quote ?? '').trim();

          if (!kbChunkId || !quote) {
            return null;
          }

          return {
            kbChunkId,
            quote
          };
        })
        .filter((entry): entry is CitationInput => Boolean(entry))
    : [];

  const suggestedMissingArtifact =
    row.suggested_missing_artifact === null || row.suggested_missing_artifact === undefined
      ? null
      : String(row.suggested_missing_artifact).trim() || null;

  return {
    status,
    answer,
    citations,
    suggested_missing_artifact: suggestedMissingArtifact
  };
}

async function retrieveTopChunks(
  prisma: ReturnType<typeof createPrismaClient>,
  params: {
    orgId: string;
    clientId: string;
    queryEmbedding: number[];
    topK: number;
  }
): Promise<RetrievedChunk[]> {
  const vectorLiteral = toVectorLiteral(params.queryEmbedding);

  try {
    return await prisma.$queryRawUnsafe<RetrievedChunk[]>(
      `SELECT
        "KBChunk"."id" AS "id",
        "KBChunk"."text" AS "text",
        "KBChunk"."chunkIndex" AS "chunkIndex",
        "KBChunk"."citationDoc" AS "citationDoc",
        "KBChunk"."citationPage" AS "citationPage",
        "KBChunk"."citationParagraph" AS "citationParagraph",
        "KBChunk"."citationSection" AS "citationSection",
        "KBChunk"."citationSheet" AS "citationSheet",
        "KBChunk"."citationCell" AS "citationCell",
        "KBChunk"."kbDocumentId" AS "kbDocumentId"
      FROM "KBChunk"
      INNER JOIN "KBDocument" ON "KBDocument"."id" = "KBChunk"."kbDocumentId"
      WHERE "KBChunk"."orgId" = $1
        AND "KBChunk"."clientWorkspaceId" = $2
        AND "KBChunk"."embedding" IS NOT NULL
      ORDER BY "KBChunk"."embedding" <-> $3::vector
      LIMIT $4`,
      params.orgId,
      params.clientId,
      vectorLiteral,
      params.topK
    );
  } catch {
    const rows = await prisma.$queryRawUnsafe<RetrievedChunkWithEmbedding[]>(
      `SELECT
        "KBChunk"."id",
        "KBChunk"."text",
        "KBChunk"."chunkIndex",
        "KBChunk"."citationDoc",
        "KBChunk"."citationPage",
        "KBChunk"."citationParagraph",
        "KBChunk"."citationSection",
        "KBChunk"."citationSheet",
        "KBChunk"."citationCell",
        "KBChunk"."kbDocumentId" AS "kbDocumentId",
        "KBChunk"."embedding"::text AS "embeddingText"
      FROM "KBChunk"
      INNER JOIN "KBDocument" ON "KBDocument"."id" = "KBChunk"."kbDocumentId"
      WHERE "KBChunk"."orgId" = $1
        AND "KBChunk"."clientWorkspaceId" = $2
        AND "KBChunk"."embedding" IS NOT NULL
      LIMIT 5000`,
      params.orgId,
      params.clientId
    );

    const scored = rows
      .map((row) => ({
        row,
        score: cosineSimilarity(params.queryEmbedding, parseVectorLiteral(row.embeddingText ?? ''))
      }))
      .filter((entry) => Number.isFinite(entry.score) && entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, params.topK)
      .map((entry) => entry.row);

    return scored;
  }
}

async function upsertGap(
  prisma: ReturnType<typeof createPrismaClient>,
  params: {
    orgId: string;
    clientWorkspaceId: string;
    projectId: string;
    questionItemId: string;
    suggestedMissingArtifact?: string | null;
  }
): Promise<void> {
  await prisma.gapItem.upsert({
    where: {
      projectId_questionItemId_reason: {
        projectId: params.projectId,
        questionItemId: params.questionItemId,
        reason: INSUFFICIENT_EVIDENCE_REASON
      }
    },
    create: {
      orgId: params.orgId,
      clientWorkspaceId: params.clientWorkspaceId,
      projectId: params.projectId,
      questionItemId: params.questionItemId,
      reason: INSUFFICIENT_EVIDENCE_REASON,
      status: 'OPEN',
      suggestedMissingArtifact: params.suggestedMissingArtifact ?? null
    },
    update: {
      status: 'OPEN',
      suggestedMissingArtifact: params.suggestedMissingArtifact ?? null
    }
  });
}

async function resolveGap(
  prisma: ReturnType<typeof createPrismaClient>,
  params: {
    orgId: string;
    projectId: string;
    questionItemId: string;
  }
): Promise<void> {
  await prisma.gapItem.updateMany({
    where: {
      orgId: params.orgId,
      projectId: params.projectId,
      questionItemId: params.questionItemId,
      reason: INSUFFICIENT_EVIDENCE_REASON,
      status: 'OPEN'
    },
    data: {
      status: 'RESOLVED'
    }
  });
}

function shouldSkipGeneration(status: string | null | undefined, mode: 'ALL' | 'UNANSWERED'): boolean {
  if (status === 'APPROVED') {
    return true;
  }

  if (mode === 'ALL') {
    return false;
  }

  return status === 'READY' || status === 'NEEDS_REVIEW';
}

async function processKbIndexJob(
  payload: KBIndexJobPayload,
  deps: {
    openai: OpenAI | null;
    embeddingModel: string;
    storage: ReturnType<typeof createStorageAdapter>;
    prisma: ReturnType<typeof createPrismaClient>;
    job?: Job<KBIndexJobPayload>;
  }
): Promise<void> {
  const { prisma, storage, openai, embeddingModel, job } = deps;
  const idempotencyKey =
    payload.indexVersion !== undefined
      ? `kb-index:${payload.kbDocumentId}:v${payload.indexVersion}`
      : `kb-index:${payload.kbDocumentId}`;

  const document = await prisma.kBDocument.findFirst({
    where: {
      id: payload.kbDocumentId,
      orgId: payload.orgId,
      clientWorkspaceId: payload.clientId
    }
  });

  if (!document) {
    throw new Error('KB document not found');
  }

  if (payload.indexVersion !== undefined && document.indexVersion !== payload.indexVersion) {
    logger.info(
      {
        jobId: job?.id,
        kbDocumentId: document.id,
        payloadVersion: payload.indexVersion,
        currentVersion: document.indexVersion
      },
      'skipping outdated kb-index job'
    );
    return;
  }

  await updateJobRun(prisma, {
    orgId: payload.orgId,
    clientWorkspaceId: payload.clientId,
    jobType: 'KB_INDEX',
    idempotencyKey,
    queueJobId: String(job?.id ?? idempotencyKey),
    status: 'RUNNING',
    progress: 5,
    attempts: (job?.attemptsMade ?? 0) + 1,
    metadata: {
      kbDocumentId: document.id,
      indexVersion: document.indexVersion
    }
  });

  await prisma.kBDocument.update({
    where: { id: document.id },
    data: {
      status: 'INDEXING',
      indexJobStatus: 'RUNNING',
      indexProgress: 5,
      failureReason: null,
      errorJson: Prisma.JsonNull
    }
  });

  try {
    const fileStream = await storage.getObjectStream(
      toBlobLocator(document.blobPathname, document.blobUrl)
    );
    const fileBuffer = await streamToBuffer(fileStream);
    const extractedChunks = await extractDocumentChunks(document.mimeType, fileBuffer);
    await prisma.kBDocument.update({
      where: {
        id: document.id
      },
      data: {
        indexProgress: 25
      }
    });

    if (extractedChunks.length === 0) {
      throw new Error('No indexable text extracted from KB document');
    }

    if (!openai) {
      throw new Error('OPENAI_API_KEY is required for KB indexing embeddings');
    }

    const uniqueTextMap = new Map<string, number[]>();
    const textsToEmbed = [...new Set(extractedChunks.map((chunk) => chunk.text))];
    const embeddingsForUniqueTexts = await createEmbeddings(openai, embeddingModel, textsToEmbed);

    textsToEmbed.forEach((text, index) => {
      uniqueTextMap.set(text, embeddingsForUniqueTexts[index] ?? []);
    });

    const embeddings = extractedChunks.map((chunk) => uniqueTextMap.get(chunk.text) ?? []);

    const embeddingUsageTokens = textsToEmbed.reduce((accumulator, text) => accumulator + Math.ceil(text.length / 4), 0);
    await recordOpenAIUsage(prisma, {
      orgId: payload.orgId,
      clientWorkspaceId: payload.clientId,
      model: embeddingModel,
      inputTokens: embeddingUsageTokens,
      metadata: {
        jobType: 'KB_INDEX',
        kbDocumentId: document.id,
        uniqueChunkCount: textsToEmbed.length
      }
    });

    await prisma.kBDocument.update({
      where: {
        id: document.id
      },
      data: {
        indexProgress: 65
      }
    });

    await prisma.kBChunk.deleteMany({
      where: {
        orgId: payload.orgId,
        kbDocumentId: document.id
      }
    });

    const rows = extractedChunks.map((chunk, index) => ({
      id: randomUUID(),
      orgId: payload.orgId,
      clientWorkspaceId: payload.clientId,
      kbDocumentId: document.id,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      citationDoc: document.filename,
      citationPage: chunk.citationPage ?? null,
      citationParagraph: chunk.citationParagraph ?? null,
      citationSection: chunk.citationSection ?? null,
      citationSheet: null,
      citationCell: null,
      embeddingLiteral: toVectorLiteral(embeddings[index] ?? [])
    }));

    await prisma.kBChunk.createMany({
      data: rows.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        clientWorkspaceId: row.clientWorkspaceId,
        kbDocumentId: row.kbDocumentId,
        chunkIndex: row.chunkIndex,
        text: row.text,
        citationDoc: row.citationDoc,
        citationPage: row.citationPage,
        citationParagraph: row.citationParagraph,
        citationSection: row.citationSection,
        citationSheet: row.citationSheet,
        citationCell: row.citationCell
      }))
    });

    for (const row of rows) {
      await prisma.$executeRawUnsafe(
        'UPDATE "KBChunk" SET "embedding" = $1::vector WHERE "id" = $2',
        row.embeddingLiteral,
        row.id
      );
    }

    await prisma.kBDocument.update({
      where: { id: document.id },
      data: {
        status: 'READY',
        indexJobStatus: 'SUCCEEDED',
        indexProgress: 100,
        failureReason: null,
        errorJson: Prisma.JsonNull
      }
    });

    await updateJobRun(prisma, {
      orgId: payload.orgId,
      clientWorkspaceId: payload.clientId,
      jobType: 'KB_INDEX',
      idempotencyKey,
      queueJobId: String(job?.id ?? idempotencyKey),
      status: 'SUCCEEDED',
      progress: 100,
      metadata: {
        kbDocumentId: document.id,
        chunkCount: rows.length
      }
    });

    await prisma.auditLog.create({
      data: {
        orgId: payload.orgId,
        clientWorkspaceId: payload.clientId,
        action: 'kb_document_indexed',
        metadata: {
          kbDocumentId: document.id,
          chunkCount: rows.length
        }
      }
    });

    void captureWorkerEvent({
      event: 'kb_index_ready',
      distinctId: `org:${payload.orgId}`,
      orgId: payload.orgId,
      properties: {
        clientWorkspaceId: payload.clientId,
        kbDocumentId: document.id,
        chunkCount: rows.length
      }
    });
  } catch (error) {
    await prisma.kBDocument.update({
      where: { id: document.id },
      data: {
        status: 'FAILED',
        indexJobStatus: 'FAILED',
        indexProgress: 100,
        failureReason: error instanceof Error ? error.message : 'Indexing failed',
        errorJson: {
          message: error instanceof Error ? error.message : 'Indexing failed'
        }
      }
    });

    await updateJobRun(prisma, {
      orgId: payload.orgId,
      clientWorkspaceId: payload.clientId,
      jobType: 'KB_INDEX',
      idempotencyKey,
      queueJobId: String(job?.id ?? idempotencyKey),
      status: 'FAILED',
      progress: 100,
      errorJson: {
        message: error instanceof Error ? error.message : 'Indexing failed'
      }
    });

    throw error;
  }
}

async function processProjectParseJob(
  payload: ProjectParseJobPayload,
  deps: {
    storage: ReturnType<typeof createStorageAdapter>;
    prisma: ReturnType<typeof createPrismaClient>;
    job?: Job<ProjectParseJobPayload>;
  }
): Promise<void> {
  const { prisma, storage, job } = deps;
  const idempotencyKey = `project-parse:${payload.projectId}`;

  const project = await prisma.questionnaireProject.findFirst({
    where: {
      id: payload.projectId,
      orgId: payload.orgId
    }
  });

  if (!project) {
    throw new Error('Project not found');
  }

  await updateJobRun(prisma, {
    orgId: payload.orgId,
    clientWorkspaceId: project.clientWorkspaceId,
    projectId: project.id,
    jobType: 'PROJECT_PARSE',
    idempotencyKey,
    queueJobId: String(job?.id ?? idempotencyKey),
    status: 'RUNNING',
    progress: 10,
    attempts: (job?.attemptsMade ?? 0) + 1
  });

  await prisma.questionnaireProject.update({
    where: {
      id: project.id
    },
    data: {
      parseJobStatus: 'RUNNING',
      parseProgress: 10,
      errorJson: Prisma.JsonNull
    }
  });

  try {
    const mapping = normalizeMapping(project.mappings);
    const fileStream = await storage.getObjectStream(
      toBlobLocator(project.originalBlobPathname, project.originalBlobUrl)
    );
    const workbookBuffer = await streamToBuffer(fileStream);
    const questions = parseProjectQuestionsFromBuffer(workbookBuffer, mapping);

    await prisma.questionnaireProject.update({
      where: {
        id: project.id
      },
      data: {
        parseProgress: 50
      }
    });

    await prisma.questionItem.deleteMany({
      where: {
        orgId: payload.orgId,
        projectId: project.id
      }
    });

    if (questions.length > 0) {
      await prisma.questionItem.createMany({
        data: questions.map((question) => ({
          orgId: payload.orgId,
          clientWorkspaceId: project.clientWorkspaceId,
          projectId: project.id,
          rowIndex: question.rowIndex,
          questionText: question.questionText,
          answerCellRef: question.answerCellRef,
          evidenceCellRef: question.evidenceCellRef,
          status: 'READY_FOR_ANSWER'
        }))
      });
    }

    await prisma.questionnaireProject.update({
      where: {
        id: project.id
      },
      data: {
        status: 'PARSED',
        parseJobStatus: 'SUCCEEDED',
        parseProgress: 100,
        parseError: null,
        errorJson: Prisma.JsonNull,
        sheetName: mapping.sheetName
      }
    });

    await updateJobRun(prisma, {
      orgId: payload.orgId,
      clientWorkspaceId: project.clientWorkspaceId,
      projectId: project.id,
      jobType: 'PROJECT_PARSE',
      idempotencyKey,
      queueJobId: String(job?.id ?? idempotencyKey),
      status: 'SUCCEEDED',
      progress: 100,
      metadata: {
        questionCount: questions.length
      }
    });

    await prisma.auditLog.create({
      data: {
        orgId: payload.orgId,
        clientWorkspaceId: project.clientWorkspaceId,
        projectId: project.id,
        action: 'project_xlsx_parsed',
        metadata: {
          projectId: project.id,
          questionCount: questions.length
        }
      }
    });

  } catch (error) {
    await prisma.questionnaireProject.update({
      where: { id: project.id },
      data: {
        parseJobStatus: 'FAILED',
        parseProgress: 100,
        status: 'MAPPED',
        parseError: error instanceof Error ? error.message : 'Failed to parse project',
        errorJson: {
          message: error instanceof Error ? error.message : 'Failed to parse project'
        }
      }
    });

    await updateJobRun(prisma, {
      orgId: payload.orgId,
      clientWorkspaceId: project.clientWorkspaceId,
      projectId: project.id,
      jobType: 'PROJECT_PARSE',
      idempotencyKey,
      queueJobId: String(job?.id ?? idempotencyKey),
      status: 'FAILED',
      progress: 100,
      errorJson: {
        message: error instanceof Error ? error.message : 'Failed to parse project'
      }
    });

    throw error;
  }
}

async function processAnswerGenerateJob(
  payload: AnswerGenerateJobPayload,
  deps: {
    prisma: ReturnType<typeof createPrismaClient>;
    openai: OpenAI | null;
    embeddingModel: string;
    answerModel: string;
    redis: Redis;
    job?: Job<AnswerGenerateJobPayload>;
  }
): Promise<void> {
  const { prisma, openai, embeddingModel, answerModel, redis, job } = deps;
  const idempotencyKey =
    String(job?.id) ||
    (payload.questionId
      ? `answer-generate:${payload.projectId}:${payload.questionId}:${payload.kbVersionHash ?? 'na'}`
      : `answer-generate:${payload.projectId}:${payload.kbVersionHash ?? 'na'}`);

  if (!openai) {
    throw new Error('OPENAI_API_KEY is required for answer generation');
  }

  const project = await prisma.questionnaireProject.findFirst({
    where: {
      id: payload.projectId,
      orgId: payload.orgId,
      clientWorkspaceId: payload.clientId
    }
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const mode = payload.mode ?? 'UNANSWERED';
  const concurrencyKey = `openai-concurrency:${payload.orgId}`;
  const currentConcurrency = await redis.incr(concurrencyKey);

  if (currentConcurrency > ORG_OPENAI_CONCURRENCY_LIMIT) {
    await redis.decr(concurrencyKey);
    throw new Error(
      `OpenAI concurrency limit reached for org (${currentConcurrency}/${ORG_OPENAI_CONCURRENCY_LIMIT})`
    );
  }

  await redis.expire(concurrencyKey, 120);

  await updateJobRun(prisma, {
    orgId: payload.orgId,
    clientWorkspaceId: payload.clientId,
    projectId: payload.projectId,
    jobType: 'ANSWER_GENERATE',
    idempotencyKey,
    queueJobId: String(job?.id ?? idempotencyKey),
    status: 'RUNNING',
    progress: 5,
    attempts: (job?.attemptsMade ?? 0) + 1,
    metadata: {
      mode,
      questionId: payload.questionId ?? null,
      kbVersionHash: payload.kbVersionHash ?? null
    }
  });

  await prisma.questionnaireProject.update({
    where: {
      id: project.id
    },
    data: {
      generationJobStatus: 'RUNNING',
      generationProgress: 5,
      errorJson: Prisma.JsonNull,
      ...(payload.kbVersionHash
        ? {
            lastKbVersionHash: payload.kbVersionHash
          }
        : {})
    }
  });

  const questions = await prisma.questionItem.findMany({
    where: {
      orgId: payload.orgId,
      projectId: project.id,
      ...(payload.questionId
        ? {
            id: payload.questionId
          }
        : {}),
      ...(payload.questionIds && payload.questionIds.length > 0
        ? {
            id: {
              in: payload.questionIds
            }
          }
        : {})
    },
    include: {
      answerDraft: {
        select: {
          status: true,
          citationsJson: true,
          generationFingerprint: true
        }
      }
    },
    orderBy: {
      rowIndex: 'asc'
    }
  });

  const total = questions.length;
  let processed = 0;
  const embeddingCache = new Map<string, number[]>();

  try {
    for (const question of questions) {
      if (shouldSkipGeneration(question.answerDraft?.status, mode)) {
        processed += 1;
        continue;
      }

      const budgetSpend = await currentOpenAICostUsd(prisma, payload.orgId);
      if (budgetSpend >= ORG_OPENAI_BUDGET_USD) {
        throw new Error(
          `OpenAI budget exceeded for org (${budgetSpend.toFixed(2)} / ${ORG_OPENAI_BUDGET_USD.toFixed(2)} USD)`
        );
      }

      const generationFingerprint = hashText(
        `${project.id}:${question.id}:${payload.kbVersionHash ?? 'no-kb'}`
      );

      if (
        question.answerDraft?.status === 'APPROVED' &&
        !payload.force
      ) {
        processed += 1;
        continue;
      }

      if (
        !payload.force &&
        question.answerDraft?.generationFingerprint === generationFingerprint &&
        question.answerDraft?.status !== 'REJECTED'
      ) {
        processed += 1;
        continue;
      }

      const embeddingInput = `${question.questionText}\nSheet:${project.sheetName ?? 'Unknown'}`;
      const embeddingKey = hashText(embeddingInput);
      let queryEmbedding = embeddingCache.get(embeddingKey);

      if (!queryEmbedding) {
        const embeddingResponse = await openai.embeddings.create({
          model: embeddingModel,
          input: embeddingInput
        });
        queryEmbedding = embeddingResponse.data[0]?.embedding ?? [];
        embeddingCache.set(embeddingKey, queryEmbedding);

        await recordOpenAIUsage(prisma, {
          orgId: payload.orgId,
          clientWorkspaceId: payload.clientId,
          projectId: project.id,
          model: embeddingModel,
          inputTokens: Math.ceil(embeddingInput.length / 4),
          metadata: {
            jobType: 'ANSWER_GENERATE',
            questionItemId: question.id
          }
        });
      }

      const retrievedChunks = await retrieveTopChunks(prisma, {
        orgId: payload.orgId,
        clientId: payload.clientId,
        queryEmbedding,
        topK: 10
      });

      if (retrievedChunks.length === 0) {
        await prisma.answerDraft.upsert({
          where: {
            questionItemId: question.id
          },
          create: {
            orgId: payload.orgId,
            clientWorkspaceId: payload.clientId,
            projectId: project.id,
            questionItemId: question.id,
            status: 'INSUFFICIENT_EVIDENCE',
            answerText: 'Insufficient evidence',
            citationsJson: [],
            confidence: null,
            sourceKbVersionHash: payload.kbVersionHash ?? null,
            generationFingerprint,
            generatedAt: new Date()
          },
          update: {
            status: 'INSUFFICIENT_EVIDENCE',
            answerText: 'Insufficient evidence',
            citationsJson: [],
            confidence: null,
            sourceKbVersionHash: payload.kbVersionHash ?? null,
            generationFingerprint,
            generatedAt: new Date()
          }
        });

        await upsertGap(prisma, {
          orgId: payload.orgId,
          clientWorkspaceId: payload.clientId,
          projectId: project.id,
          questionItemId: question.id,
          suggestedMissingArtifact: 'Add policy or control evidence covering this question.'
        });

        processed += 1;
        await prisma.questionnaireProject.update({
          where: { id: project.id },
          data: {
            generationProgress: Math.min(99, Math.round((processed / total) * 100))
          }
        });
        continue;
      }

      const promptSources = retrievedChunks
        .map((chunk) => {
          const locator = buildChunkLocator(chunk);
          return [
            `kbChunkId: ${chunk.id}`,
            `doc: ${chunk.citationDoc ?? 'KB Document'}`,
            `locator: ${locator}`,
            `text: ${chunk.text.slice(0, 1400)}`
          ].join('\n');
        })
        .join('\n\n---\n\n');

      const completion = await openai.chat.completions.create({
        model: answerModel,
        temperature: 0,
        response_format: {
          type: 'json_object'
        },
        messages: [
          {
            role: 'system',
            content:
              'You draft security questionnaire answers. Use ONLY the provided KB sources. Never invent facts. Return valid JSON exactly with keys: status, answer, citations, suggested_missing_artifact. status must be ANSWERED or INSUFFICIENT_EVIDENCE. citations entries must include kbChunkId and quote. quote must be copied exactly from source text.'
          },
          {
            role: 'user',
            content: [
              `Question: ${question.questionText}`,
              `Sheet: ${project.sheetName ?? 'Unknown'}`,
              'Sources:',
              promptSources,
              'If evidence is insufficient, return status INSUFFICIENT_EVIDENCE and suggested_missing_artifact.'
            ].join('\n\n')
          }
        ]
      });

      const completionUsage = completion.usage;
      if (completionUsage) {
        await recordOpenAIUsage(prisma, {
          orgId: payload.orgId,
          clientWorkspaceId: payload.clientId,
          projectId: project.id,
          model: answerModel,
          inputTokens: completionUsage.prompt_tokens ?? 0,
          outputTokens: completionUsage.completion_tokens ?? 0,
          metadata: {
            jobType: 'ANSWER_GENERATE',
            questionItemId: question.id
          }
        });
      }

      const parsed = parseGenerationResponse(completion.choices[0]?.message?.content);
      const citationValidation = validateGeneratedCitations(parsed.citations, retrievedChunks);

      let status: 'READY' | 'NEEDS_REVIEW' | 'INSUFFICIENT_EVIDENCE';
      let answerText = parsed.answer || null;

      if (parsed.status === 'INSUFFICIENT_EVIDENCE') {
        status = 'INSUFFICIENT_EVIDENCE';
        answerText = 'Insufficient evidence';
      } else if (citationValidation.valid.length > 0 && citationValidation.invalidCount === 0) {
        status = 'READY';
      } else {
        status = 'NEEDS_REVIEW';
      }

      const draft = await prisma.answerDraft.upsert({
        where: {
          questionItemId: question.id
        },
        create: {
          orgId: payload.orgId,
          clientWorkspaceId: payload.clientId,
          projectId: project.id,
          questionItemId: question.id,
          status,
          answerText,
          citationsJson: citationValidation.valid,
          confidence: null,
          sourceKbVersionHash: payload.kbVersionHash ?? null,
          generationFingerprint,
          generatedAt: new Date()
        },
        update: {
          status,
          answerText,
          citationsJson: citationValidation.valid,
          confidence: null,
          sourceKbVersionHash: payload.kbVersionHash ?? null,
          generationFingerprint,
          generatedAt: new Date()
        }
      });

      if (status === 'INSUFFICIENT_EVIDENCE') {
        await upsertGap(prisma, {
          orgId: payload.orgId,
          clientWorkspaceId: payload.clientId,
          projectId: project.id,
          questionItemId: question.id,
          suggestedMissingArtifact: parsed.suggested_missing_artifact
        });
      } else if (status === 'READY') {
        await resolveGap(prisma, {
          orgId: payload.orgId,
          projectId: project.id,
          questionItemId: question.id
        });
      }

      await prisma.auditLog.create({
        data: {
          orgId: payload.orgId,
          clientWorkspaceId: payload.clientId,
          projectId: project.id,
          action: 'answer_generated',
          metadata: {
            questionItemId: question.id,
            answerDraftId: draft.id,
            status,
            citationCount: citationValidation.valid.length,
            invalidCitationCount: citationValidation.invalidCount,
            sourceChunkCount: retrievedChunks.length,
            kbVersionHash: payload.kbVersionHash ?? null
          }
        }
      });

      processed += 1;
      await prisma.questionnaireProject.update({
        where: { id: project.id },
        data: {
          generationProgress: Math.min(99, Math.round((processed / total) * 100))
        }
      });
    }

    await prisma.questionnaireProject.update({
      where: {
        id: project.id
      },
      data: {
        generationJobStatus: 'SUCCEEDED',
        generationProgress: 100,
        errorJson: Prisma.JsonNull
      }
    });

    await updateJobRun(prisma, {
      orgId: payload.orgId,
      clientWorkspaceId: payload.clientId,
      projectId: payload.projectId,
      jobType: 'ANSWER_GENERATE',
      idempotencyKey,
      queueJobId: String(job?.id ?? idempotencyKey),
      status: 'SUCCEEDED',
      progress: 100,
      metadata: {
        processed,
        total
      }
    });
  } catch (error) {
    await prisma.questionnaireProject.update({
      where: {
        id: project.id
      },
      data: {
        generationJobStatus: 'FAILED',
        generationProgress: 100,
        errorJson: {
          message: error instanceof Error ? error.message : 'Generation failed'
        }
      }
    });

    await updateJobRun(prisma, {
      orgId: payload.orgId,
      clientWorkspaceId: payload.clientId,
      projectId: payload.projectId,
      jobType: 'ANSWER_GENERATE',
      idempotencyKey,
      queueJobId: String(job?.id ?? idempotencyKey),
      status: 'FAILED',
      progress: 100,
      errorJson: {
        message: error instanceof Error ? error.message : 'Generation failed'
      }
    });

    throw error;
  } finally {
    await redis.decr(concurrencyKey);
  }
}

function toSafeFilename(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.xlsx$/i, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'project';
}

function setCellValue(sheet: Record<string, unknown>, cellRef: string, value: string): void {
  const sanitized = sanitizeExcelCell(value);
  utils.sheet_add_aoa(sheet as never, [[sanitized]], { origin: cellRef });
}

async function processExportXlsxJob(
  payload: ExportXlsxJobPayload,
  deps: {
    prisma: ReturnType<typeof createPrismaClient>;
    storage: ReturnType<typeof createStorageAdapter>;
    job?: Job<ExportXlsxJobPayload>;
  }
): Promise<void> {
  const { prisma, storage, job } = deps;
  const idempotencyKey =
    String(job?.id) ||
    `export-xlsx:${payload.projectId}:v${payload.exportVersion ?? 'latest'}:${payload.kbVersionHash ?? 'na'}`;

  const project = await prisma.questionnaireProject.findFirst({
    where: {
      id: payload.projectId,
      orgId: payload.orgId
    }
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const exportVersion = payload.exportVersion ?? project.exportVersion;

  await updateJobRun(prisma, {
    orgId: payload.orgId,
    clientWorkspaceId: project.clientWorkspaceId,
    projectId: project.id,
    jobType: 'EXPORT_XLSX',
    idempotencyKey,
    queueJobId: String(job?.id ?? idempotencyKey),
    status: 'RUNNING',
    progress: 5,
    attempts: (job?.attemptsMade ?? 0) + 1,
    metadata: {
      exportVersion,
      kbVersionHash: payload.kbVersionHash ?? project.lastKbVersionHash ?? null
    }
  });

  await prisma.questionnaireProject.update({
    where: {
      id: project.id
    },
    data: {
      exportJobStatus: 'RUNNING',
      exportProgress: 5,
      errorJson: Prisma.JsonNull
    }
  });

  const existingExport = await prisma.projectFile.findFirst({
    where: {
      orgId: payload.orgId,
      projectId: project.id,
      kind: 'EXPORT_XLSX',
      exportVersion
    }
  });

  if (existingExport && isDuplicateExportVersion(existingExport.exportVersion, exportVersion)) {
    await prisma.questionnaireProject.update({
      where: { id: project.id },
      data: {
        exportJobStatus: 'SUCCEEDED',
        exportProgress: 100
      }
    });

    await updateJobRun(prisma, {
      orgId: payload.orgId,
      clientWorkspaceId: project.clientWorkspaceId,
      projectId: project.id,
      jobType: 'EXPORT_XLSX',
      idempotencyKey,
      queueJobId: String(job?.id ?? idempotencyKey),
      status: 'SUCCEEDED',
      progress: 100,
      metadata: {
        exportVersion,
        deduplicated: true
      }
    });
    return;
  }

  try {
    const mapping = normalizeMapping(project.mappings);
    const answerColumn = normalizeColumn(mapping.answerCol);
    const evidenceColumn = normalizeColumn(mapping.evidenceCol);

    const fileStream = await storage.getObjectStream(
      toBlobLocator(project.originalBlobPathname, project.originalBlobUrl)
    );
    const workbookBuffer = await streamToBuffer(fileStream);
    const workbook = read(workbookBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[mapping.sheetName];

    if (!worksheet) {
      throw new Error(`Sheet not found: ${mapping.sheetName}`);
    }

    await prisma.questionnaireProject.update({
      where: {
        id: project.id
      },
      data: {
        exportProgress: 35
      }
    });

    const questions = await prisma.questionItem.findMany({
      where: {
        orgId: payload.orgId,
        projectId: project.id
      },
      include: {
        answerDraft: {
          select: {
            status: true,
            answerText: true,
            citationsJson: true
          }
        }
      },
      orderBy: {
        rowIndex: 'asc'
      }
    });

    for (const question of questions) {
      const answerCell =
        question.answerCellRef ?? utils.encode_cell({ c: answerColumn, r: Math.max(question.rowIndex - 1, 0) });
      const evidenceCell =
        question.evidenceCellRef ??
        utils.encode_cell({ c: evidenceColumn, r: Math.max(question.rowIndex - 1, 0) });

      const citations = parseCitationsJson(question.answerDraft?.citationsJson ?? null);
      let evidenceText = formatEvidenceLines(citations);

      let answerText = question.answerDraft?.answerText ?? '';

      if (question.answerDraft?.status === 'INSUFFICIENT_EVIDENCE') {
        answerText = 'Insufficient evidence (see gaps)';
        if (!evidenceText) {
          evidenceText = 'Insufficient evidence (see gaps)';
        }
      }

      setCellValue(worksheet as Record<string, unknown>, answerCell, answerText);
      setCellValue(worksheet as Record<string, unknown>, evidenceCell, evidenceText);
    }

    const outputBuffer = write(workbook, {
      type: 'buffer',
      bookType: 'xlsx'
    }) as Buffer;

    await prisma.questionnaireProject.update({
      where: {
        id: project.id
      },
      data: {
        exportProgress: 80
      }
    });

    const exportName = `${toSafeFilename(project.filename)}-completed-v${exportVersion}.xlsx`;
    const storageResult = await storage.putObject({
      pathname: `exports/${project.clientWorkspaceId}/${project.id}/${exportName}`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: outputBuffer
    });

    await prisma.projectFile.create({
      data: {
        orgId: payload.orgId,
        clientWorkspaceId: project.clientWorkspaceId,
        projectId: project.id,
        kind: 'EXPORT_XLSX',
        filename: exportName,
        blobUrl: storageResult.pathname,
        blobPathname: storageResult.pathname,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: outputBuffer.length,
        exportVersion,
        sourceKbVersionHash: payload.kbVersionHash ?? project.lastKbVersionHash ?? null,
        generatedAt: new Date()
      }
    });

    await prisma.questionnaireProject.update({
      where: {
        id: project.id
      },
      data: {
        status: 'READY',
        exportJobStatus: 'SUCCEEDED',
        exportProgress: 100,
        errorJson: Prisma.JsonNull,
        exportVersion,
        ...(payload.kbVersionHash
          ? {
              lastKbVersionHash: payload.kbVersionHash
            }
          : {})
      }
    });

    await updateJobRun(prisma, {
      orgId: payload.orgId,
      clientWorkspaceId: project.clientWorkspaceId,
      projectId: project.id,
      jobType: 'EXPORT_XLSX',
      idempotencyKey,
      queueJobId: String(job?.id ?? idempotencyKey),
      status: 'SUCCEEDED',
      progress: 100,
      metadata: {
        exportVersion,
        sourceKbVersionHash: payload.kbVersionHash ?? project.lastKbVersionHash ?? null,
        pathname: storageResult.pathname
      }
    });

    await prisma.auditLog.create({
      data: {
        orgId: payload.orgId,
        clientWorkspaceId: project.clientWorkspaceId,
        projectId: project.id,
        action: 'project_xlsx_exported',
        metadata: {
          filename: exportName,
          exportVersion,
          pathname: storageResult.pathname
        }
      }
    });

    void captureWorkerEvent({
      event: 'export_created',
      distinctId: `org:${payload.orgId}`,
      orgId: payload.orgId,
      properties: {
        projectId: project.id,
        exportVersion,
        pathname: storageResult.pathname
      }
    });
  } catch (error) {
    await prisma.questionnaireProject.update({
      where: {
        id: project.id
      },
      data: {
        exportJobStatus: 'FAILED',
        exportProgress: 100,
        errorJson: {
          message: error instanceof Error ? error.message : 'Export failed'
        }
      }
    });

    await updateJobRun(prisma, {
      orgId: payload.orgId,
      clientWorkspaceId: project.clientWorkspaceId,
      projectId: project.id,
      jobType: 'EXPORT_XLSX',
      idempotencyKey,
      queueJobId: String(job?.id ?? idempotencyKey),
      status: 'FAILED',
      progress: 100,
      errorJson: {
        message: error instanceof Error ? error.message : 'Export failed'
      }
    });

    throw error;
  }
}

async function processRetentionPurgeJob(
  payload: RetentionPurgeJobPayload,
  deps: {
    prisma: ReturnType<typeof createPrismaClient>;
    storage: ReturnType<typeof createStorageAdapter>;
    job?: Job<RetentionPurgeJobPayload>;
  }
): Promise<void> {
  const { prisma, storage, job } = deps;
  const idempotencyKey = String(job?.id ?? `retention-purge:${payload.orgId ?? 'all'}`);
  const targetOrgs = payload.orgId
    ? await prisma.org.findMany({
        where: { id: payload.orgId },
        select: { id: true, retentionDays: true }
      })
    : await prisma.org.findMany({
        select: { id: true, retentionDays: true }
      });

  if (targetOrgs.length === 0) {
    return;
  }

  let totalDeletedFiles = 0;
  let totalDeletedDocuments = 0;

  for (const org of targetOrgs) {
    const cutoff = new Date(Date.now() - org.retentionDays * 24 * 60 * 60 * 1000);

    await updateJobRun(prisma, {
      orgId: org.id,
      jobType: 'RETENTION_PURGE',
      idempotencyKey,
      queueJobId: String(job?.id ?? idempotencyKey),
      status: 'RUNNING',
      progress: 10
    });

    const [expiredDocs, expiredFiles] = await Promise.all([
      prisma.kBDocument.findMany({
        where: {
          orgId: org.id,
          createdAt: {
            lt: cutoff
          }
        },
        select: {
          id: true,
          clientWorkspaceId: true,
          blobPathname: true,
          blobUrl: true
        },
        take: 1000
      }),
      prisma.projectFile.findMany({
        where: {
          orgId: org.id,
          createdAt: {
            lt: cutoff
          }
        },
        select: {
          id: true,
          clientWorkspaceId: true,
          projectId: true,
          blobPathname: true,
          blobUrl: true
        },
        take: 1000
      })
    ]);

    if (!payload.dryRun) {
      for (const doc of expiredDocs) {
        const locator = toBlobLocator(doc.blobPathname, doc.blobUrl);

        if (locator) {
          try {
            await storage.deleteObject(locator);
            totalDeletedFiles += 1;
          } catch (error) {
            logger.warn({ error, locator }, 'failed to delete expired kb blob');
          }
        }
      }

      for (const file of expiredFiles) {
        const locator = toBlobLocator(file.blobPathname, file.blobUrl);

        if (locator) {
          try {
            await storage.deleteObject(locator);
            totalDeletedFiles += 1;
          } catch (error) {
            logger.warn({ error, locator }, 'failed to delete expired project blob');
          }
        }
      }

      await prisma.kBDocument.deleteMany({
        where: {
          id: {
            in: expiredDocs.map((doc) => doc.id)
          },
          orgId: org.id
        }
      });
      await prisma.projectFile.deleteMany({
        where: {
          id: {
            in: expiredFiles.map((file) => file.id)
          },
          orgId: org.id
        }
      });
    }

    totalDeletedDocuments += expiredDocs.length;

    await prisma.auditLog.create({
      data: {
        orgId: org.id,
        action: payload.dryRun ? 'retention_purge_dry_run' : 'retention_purge_completed',
        metadata: {
          dryRun: Boolean(payload.dryRun),
          retentionDays: org.retentionDays,
          cutoff: cutoff.toISOString(),
          expiredKbDocuments: expiredDocs.length,
          expiredProjectFiles: expiredFiles.length,
          deletedBlobCount: payload.dryRun ? 0 : expiredDocs.length + expiredFiles.length
        }
      }
    });
  }

  const firstOrgId = targetOrgs[0]?.id;

  if (!firstOrgId) {
    return;
  }

  await updateJobRun(prisma, {
    orgId: payload.orgId ?? firstOrgId,
    jobType: 'RETENTION_PURGE',
    idempotencyKey,
    queueJobId: String(job?.id ?? idempotencyKey),
    status: 'SUCCEEDED',
    progress: 100,
    metadata: {
      dryRun: Boolean(payload.dryRun),
      orgCount: targetOrgs.length,
      deletedBlobCount: totalDeletedFiles,
      deletedDocumentCount: totalDeletedDocuments
    }
  });
}

async function start(): Promise<void> {
  initWorkerTelemetry();

  const [
    kbQueueName,
    projectParseQueueName,
    answerGenerateQueueName,
    exportXlsxQueueName,
    retentionPurgeQueueName
  ] = queueNames;

  if (
    !kbQueueName ||
    !projectParseQueueName ||
    !answerGenerateQueueName ||
    !exportXlsxQueueName ||
    !retentionPurgeQueueName
  ) {
    throw new Error('Queue names are not configured');
  }

  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const prisma = createPrismaClient();
  const storage = createStorageAdapter();
  const queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const limiterConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
  const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const answerModel = process.env.OPENAI_ANSWER_MODEL ?? 'gpt-4o-mini';

  const retentionQueue = new Queue<RetentionPurgeJobPayload>(retentionPurgeQueueName, {
    connection: queueConnection
  });

  await prisma.$connect();
  await queueConnection.ping();

  await retentionQueue.add(
    'nightly-retention-purge',
    {},
    {
      jobId: 'nightly-retention-purge',
      repeat: {
        every: RETENTION_PURGE_INTERVAL_MINUTES * 60 * 1000
      },
      removeOnComplete: 20,
      removeOnFail: 20
    }
  );

  const workers = [
    new Worker<KBIndexJobPayload>(
      kbQueueName,
      async (job) => {
        await processKbIndexJob(job.data, {
          prisma,
          storage,
          openai,
          embeddingModel,
          job
        });
      },
      {
        connection: workerConnection,
        concurrency: 2
      }
    ),
    new Worker<ProjectParseJobPayload>(
      projectParseQueueName,
      async (job) => {
        await processProjectParseJob(job.data, {
          prisma,
          storage,
          job
        });
      },
      {
        connection: workerConnection,
        concurrency: 2
      }
    ),
    new Worker<AnswerGenerateJobPayload>(
      answerGenerateQueueName,
      async (job) => {
        await processAnswerGenerateJob(job.data, {
          prisma,
          openai,
          embeddingModel,
          answerModel,
          redis: limiterConnection,
          job
        });
      },
      {
        connection: workerConnection,
        concurrency: 2
      }
    ),
    new Worker<ExportXlsxJobPayload>(
      exportXlsxQueueName,
      async (job) => {
        await processExportXlsxJob(job.data, {
          prisma,
          storage,
          job
        });
      },
      {
        connection: workerConnection,
        concurrency: 1
      }
    ),
    new Worker<RetentionPurgeJobPayload>(
      retentionPurgeQueueName,
      async (job) => {
        await processRetentionPurgeJob(job.data, {
          prisma,
          storage,
          job
        });
      },
      {
        connection: workerConnection,
        concurrency: 1
      }
    )
  ];

  workers.forEach((worker) => {
    worker.on('completed', (job) => {
      logger.info({
        msg: 'job completed',
        queue: worker.name,
        jobId: job.id
      });
    });

    worker.on('failed', (job, error) => {
      logger.error({
        msg: 'job failed',
        queue: worker.name,
        jobId: job?.id,
        error: error.message
      });

      const context: Parameters<typeof captureWorkerException>[1] = {
        queue: worker.name
      };

      if (job?.id !== undefined && job?.id !== null) {
        context.jobId = job.id;
      }

      const data = (job?.data ?? {}) as {
        orgId?: string;
        clientId?: string;
        projectId?: string;
      };

      if (data.orgId) {
        context.orgId = data.orgId;
      }

      if (data.clientId) {
        context.clientId = data.clientId;
      }

      if (data.projectId) {
        context.projectId = data.projectId;
      }

      captureWorkerException(error, context);
    });
  });

  logger.info({
    msg: 'worker started',
    queues: queueNames,
    storage: storage.kind,
    embeddingModel,
    answerModel,
    retentionPurgeIntervalMinutes: RETENTION_PURGE_INTERVAL_MINUTES,
    orgOpenAiBudgetUsd: ORG_OPENAI_BUDGET_USD,
    orgOpenAiConcurrencyLimit: ORG_OPENAI_CONCURRENCY_LIMIT,
    openaiConfigured: Boolean(openai)
  });

  const shutdown = async () => {
    logger.info({ msg: 'worker shutting down' });

    await Promise.all(workers.map((worker) => worker.close()));
    await retentionQueue.close();
    await limiterConnection.quit();
    await workerConnection.quit();
    await queueConnection.quit();
    await prisma.$disconnect();
    await closeWorkerTelemetry();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void start();
