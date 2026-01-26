import { describe, expect, it, vi } from "vitest"
import * as XLSX from "xlsx"
import { Document, Packer, Paragraph } from "docx"
import PDFDocument from "pdfkit"
import { randomUUID } from "node:crypto"
import {
  AnswerStatus,
  JobStatus,
  QuestionnaireStatus,
  type Answer,
  type Job,
  type Questionnaire,
  type QuestionnaireFile
} from "@tuesdaytrust/shared"
import { processQuestionnaireJob, processReportExportJob } from "../src/job-runner"
import { MemoryDataStore } from "../src/datastore/memory"
import { MemoryFileStorage } from "../src/storage/memory"
import type { DataStore } from "../src/datastore/types"
import type { FileStorage } from "../src/storage/types"

function buildWorkbookBuffer() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Question"],
    ["Do you enforce MFA for admin access?"],
    ["Describe your incident response process."]
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1")
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return new Uint8Array(buffer)
}

function buildLargeWorkbookBuffer(rows: number) {
  const data = [["Question"]]
  for (let i = 0; i < rows; i += 1) {
    data.push([`Question ${i + 1}`])
  }
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1")
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return new Uint8Array(buffer)
}

async function buildDocxBuffer() {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Do you enforce MFA for admin access?" }),
          new Paragraph({ text: "Describe your incident response process." })
        ]
      }
    ]
  })
  const buffer = await Packer.toBuffer(document)
  return new Uint8Array(buffer)
}

async function buildPdfBuffer() {
  return new Promise<Uint8Array>((resolve, reject) => {
    const doc = new PDFDocument()
    const chunks: Uint8Array[] = []

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk))
    doc.on("end", () => {
      const output = Buffer.concat(chunks)
      resolve(new Uint8Array(output))
    })
    doc.on("error", (error) => reject(error))

    doc.text("Do you enforce MFA for admin access?")
    doc.moveDown()
    doc.text("Describe your incident response process.")
    doc.end()
  })
}

describe("processQuestionnaireJob", () => {
  it("processes questionnaire and creates export", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()

    const questionnaire: Questionnaire = {
      id: questionnaireId,
      orgId,
      workspaceId,
      title: "Acme Security Questionnaire",
      source: "Excel upload",
      status: QuestionnaireStatus.QUEUED,
      progressTotal: 0,
      progressDone: 0,
      createdBy: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failedReason: null
    }

    const job: Job = {
      id: jobId,
      orgId,
      workspaceId,
      jobType: "PROCESS_QUESTIONNAIRE",
      status: JobStatus.QUEUED,
      payload: { questionnaireId },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date().toISOString(),
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    }

    const answer: Answer = {
      id: randomUUID(),
      orgId,
      workspaceId,
      title: "MFA Policy",
      body: "We enforce MFA for all administrator access.",
      status: AnswerStatus.APPROVED,
      ownerUserId: randomUUID(),
      tags: ["mfa"],
      scope: { products: ["core"], regions: ["global"], tiers: ["all"] },
      sensitivity: "STANDARD",
      reviewIntervalDays: 90,
      lastReviewedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const file: QuestionnaireFile = {
      id: randomUUID(),
      questionnaireId,
      orgId,
      storageBucket: "uploads",
      storagePath: `org/${orgId}/questionnaires/${questionnaireId}/input.xlsx`,
      fileName: "input.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 100,
      checksumSha256: "checksum",
      kind: "input",
      createdAt: new Date().toISOString()
    }

    const memoryStore = new MemoryDataStore()
    memoryStore.seedQuestionnaire(questionnaire)
    memoryStore.seedJob(job)
    memoryStore.seedAnswer(answer)
    memoryStore.seedFile(file, buildWorkbookBuffer())

    const fileStorage = new MemoryFileStorage((path) => memoryStore.getStoredFile(path))

    const now = new Date("2026-01-26T00:00:00Z")
    await processQuestionnaireJob(
      {
        jobId,
        orgId,
        workspaceId,
        questionnaireId
      },
      { dataStore: memoryStore, fileStorage, now: () => now }
    )

    const snapshot = memoryStore.getSnapshot()
    const updatedQuestionnaire = snapshot.questionnaires.get(questionnaireId)
    expect(updatedQuestionnaire?.status).toBe(QuestionnaireStatus.COMPLETED)

    expect(snapshot.suggestions.length).toBeGreaterThan(0)
    expect(snapshot.questionnaireFiles.size).toBeGreaterThan(1)
    const exportFile = Array.from(snapshot.questionnaireFiles.values()).find(
      (stored) => stored.kind === "export"
    )
    expect(exportFile).toBeTruthy()

    expect(snapshot.tokenUsageEvents.length).toBe(0)
  })

  it("processes DOCX questionnaire and creates export", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()

    const questionnaire: Questionnaire = {
      id: questionnaireId,
      orgId,
      workspaceId,
      title: "Docx Questionnaire",
      source: "Docx upload",
      status: QuestionnaireStatus.QUEUED,
      progressTotal: 0,
      progressDone: 0,
      createdBy: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failedReason: null
    }

    const job: Job = {
      id: jobId,
      orgId,
      workspaceId,
      jobType: "PROCESS_QUESTIONNAIRE",
      status: JobStatus.QUEUED,
      payload: { questionnaireId },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date().toISOString(),
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    }

    const answer: Answer = {
      id: randomUUID(),
      orgId,
      workspaceId,
      title: "MFA Policy",
      body: "We enforce MFA for all administrator access.",
      status: AnswerStatus.APPROVED,
      ownerUserId: randomUUID(),
      tags: ["mfa"],
      scope: { products: ["core"], regions: ["global"], tiers: ["all"] },
      sensitivity: "STANDARD",
      reviewIntervalDays: 90,
      lastReviewedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const file: QuestionnaireFile = {
      id: randomUUID(),
      questionnaireId,
      orgId,
      storageBucket: "uploads",
      storagePath: `org/${orgId}/questionnaires/${questionnaireId}/input.docx`,
      fileName: "input.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 100,
      checksumSha256: "checksum",
      kind: "input",
      createdAt: new Date().toISOString()
    }

    const memoryStore = new MemoryDataStore()
    memoryStore.seedQuestionnaire(questionnaire)
    memoryStore.seedJob(job)
    memoryStore.seedAnswer(answer)
    memoryStore.seedFile(file, await buildDocxBuffer())

    const fileStorage = new MemoryFileStorage((path) => memoryStore.getStoredFile(path))

    await processQuestionnaireJob(
      {
        jobId,
        orgId,
        workspaceId,
        questionnaireId
      },
      { dataStore: memoryStore, fileStorage }
    )

    const snapshot = memoryStore.getSnapshot()
    const exportFile = Array.from(snapshot.questionnaireFiles.values()).find(
      (stored) => stored.kind === "export"
    )
    expect(exportFile?.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
  })

  it("processes PDF questionnaire and creates export", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()

    const questionnaire: Questionnaire = {
      id: questionnaireId,
      orgId,
      workspaceId,
      title: "PDF Questionnaire",
      source: "PDF upload",
      status: QuestionnaireStatus.QUEUED,
      progressTotal: 0,
      progressDone: 0,
      createdBy: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failedReason: null
    }

    const job: Job = {
      id: jobId,
      orgId,
      workspaceId,
      jobType: "PROCESS_QUESTIONNAIRE",
      status: JobStatus.QUEUED,
      payload: { questionnaireId },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date().toISOString(),
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    }

    const answer: Answer = {
      id: randomUUID(),
      orgId,
      workspaceId,
      title: "MFA Policy",
      body: "We enforce MFA for all administrator access.",
      status: AnswerStatus.APPROVED,
      ownerUserId: randomUUID(),
      tags: ["mfa"],
      scope: { products: ["core"], regions: ["global"], tiers: ["all"] },
      sensitivity: "STANDARD",
      reviewIntervalDays: 90,
      lastReviewedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const file: QuestionnaireFile = {
      id: randomUUID(),
      questionnaireId,
      orgId,
      storageBucket: "uploads",
      storagePath: `org/${orgId}/questionnaires/${questionnaireId}/input.pdf`,
      fileName: "input.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      checksumSha256: "checksum",
      kind: "input",
      createdAt: new Date().toISOString()
    }

    const memoryStore = new MemoryDataStore()
    memoryStore.seedQuestionnaire(questionnaire)
    memoryStore.seedJob(job)
    memoryStore.seedAnswer(answer)
    memoryStore.seedFile(file, await buildPdfBuffer())

    const fileStorage = new MemoryFileStorage((path) => memoryStore.getStoredFile(path))

    await processQuestionnaireJob(
      {
        jobId,
        orgId,
        workspaceId,
        questionnaireId
      },
      { dataStore: memoryStore, fileStorage }
    )

    const snapshot = memoryStore.getSnapshot()
    const exportFile = Array.from(snapshot.questionnaireFiles.values()).find(
      (stored) => stored.kind === "export"
    )
    expect(exportFile?.mimeType).toBe("application/pdf")
  })

  it("marks questionnaire failed when input file missing", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()

    const questionnaire: Questionnaire = {
      id: questionnaireId,
      orgId,
      workspaceId,
      title: "Missing File Questionnaire",
      source: "Excel upload",
      status: QuestionnaireStatus.QUEUED,
      progressTotal: 0,
      progressDone: 0,
      createdBy: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failedReason: null
    }

    const job: Job = {
      id: jobId,
      orgId,
      workspaceId,
      jobType: "PROCESS_QUESTIONNAIRE",
      status: JobStatus.QUEUED,
      payload: { questionnaireId },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date().toISOString(),
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    }

    const memoryStore = new MemoryDataStore()
    memoryStore.seedQuestionnaire(questionnaire)
    memoryStore.seedJob(job)

    const fileStorage = new MemoryFileStorage((path) => memoryStore.getStoredFile(path))

    await expect(
      processQuestionnaireJob(
        { jobId, orgId, workspaceId, questionnaireId },
        { dataStore: memoryStore, fileStorage }
      )
    ).rejects.toThrow()

    const snapshot = memoryStore.getSnapshot()
    const updated = snapshot.questionnaires.get(questionnaireId)
    expect(updated?.status).toBe(QuestionnaireStatus.FAILED)
    expect(snapshot.jobs.get(jobId)?.status).toBe(JobStatus.FAILED)
  })

  it("fails when question count exceeds limit", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()

    const questionnaire: Questionnaire = {
      id: questionnaireId,
      orgId,
      workspaceId,
      title: "Large Questionnaire",
      source: "Excel upload",
      status: QuestionnaireStatus.QUEUED,
      progressTotal: 0,
      progressDone: 0,
      createdBy: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failedReason: null
    }

    const job: Job = {
      id: jobId,
      orgId,
      workspaceId,
      jobType: "PROCESS_QUESTIONNAIRE",
      status: JobStatus.QUEUED,
      payload: { questionnaireId },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date().toISOString(),
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    }

    const file: QuestionnaireFile = {
      id: randomUUID(),
      questionnaireId,
      orgId,
      storageBucket: "uploads",
      storagePath: `org/${orgId}/questionnaires/${questionnaireId}/input.xlsx`,
      fileName: "input.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 100,
      checksumSha256: "checksum",
      kind: "input",
      createdAt: new Date().toISOString()
    }

    const memoryStore = new MemoryDataStore()
    memoryStore.seedQuestionnaire(questionnaire)
    memoryStore.seedJob(job)
    memoryStore.seedFile(file, buildLargeWorkbookBuffer(501))

    const fileStorage = new MemoryFileStorage((path) => memoryStore.getStoredFile(path))

    await expect(
      processQuestionnaireJob(
        { jobId, orgId, workspaceId, questionnaireId },
        { dataStore: memoryStore, fileStorage }
      )
    ).rejects.toThrow("question count exceeds limit")
  })

  it("fails when org-specific question limit is exceeded", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()

    const questionnaire: Questionnaire = {
      id: questionnaireId,
      orgId,
      workspaceId,
      title: "Org Limited Questionnaire",
      source: "Excel upload",
      status: QuestionnaireStatus.QUEUED,
      progressTotal: 0,
      progressDone: 0,
      createdBy: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failedReason: null
    }

    const job: Job = {
      id: jobId,
      orgId,
      workspaceId,
      jobType: "PROCESS_QUESTIONNAIRE",
      status: JobStatus.QUEUED,
      payload: { questionnaireId },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date().toISOString(),
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    }

    const file: QuestionnaireFile = {
      id: randomUUID(),
      questionnaireId,
      orgId,
      storageBucket: "uploads",
      storagePath: `org/${orgId}/questionnaires/${questionnaireId}/input.xlsx`,
      fileName: "input.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 100,
      checksumSha256: "checksum",
      kind: "input",
      createdAt: new Date().toISOString()
    }

    const memoryStore = new MemoryDataStore()
    memoryStore.seedQuestionnaire(questionnaire)
    memoryStore.seedJob(job)
    memoryStore.seedFile(file, buildLargeWorkbookBuffer(2))
    memoryStore.seedOrgLimits({
      orgId,
      maxQuestions: 1
    })

    const fileStorage = new MemoryFileStorage((path) => memoryStore.getStoredFile(path))

    await expect(
      processQuestionnaireJob(
        { jobId, orgId, workspaceId, questionnaireId },
        { dataStore: memoryStore, fileStorage }
      )
    ).rejects.toThrow("question count exceeds limit")
  })

  it("records budget exceeded state in job attempt metrics", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()
    const now = new Date()
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10)

    const questionnaire: Questionnaire = {
      id: questionnaireId,
      orgId,
      workspaceId,
      title: "Budget Questionnaire",
      source: "Excel upload",
      status: QuestionnaireStatus.QUEUED,
      progressTotal: 0,
      progressDone: 0,
      createdBy: randomUUID(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      failedReason: null
    }

    const job: Job = {
      id: jobId,
      orgId,
      workspaceId,
      jobType: "PROCESS_QUESTIONNAIRE",
      status: JobStatus.QUEUED,
      payload: { questionnaireId },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: now.toISOString(),
      lockedAt: null,
      lockedBy: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastError: null
    }

    const answer: Answer = {
      id: randomUUID(),
      orgId,
      workspaceId,
      title: "MFA Policy",
      body: "We enforce MFA for all administrator access.",
      status: AnswerStatus.APPROVED,
      ownerUserId: randomUUID(),
      tags: ["mfa"],
      scope: { products: ["core"], regions: ["global"], tiers: ["all"] },
      sensitivity: "STANDARD",
      reviewIntervalDays: 90,
      lastReviewedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }

    const file: QuestionnaireFile = {
      id: randomUUID(),
      questionnaireId,
      orgId,
      storageBucket: "uploads",
      storagePath: `org/${orgId}/questionnaires/${questionnaireId}/input.xlsx`,
      fileName: "input.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 100,
      checksumSha256: "checksum",
      kind: "input",
      createdAt: now.toISOString()
    }

    const memoryStore = new MemoryDataStore()
    memoryStore.seedQuestionnaire(questionnaire)
    memoryStore.seedJob(job)
    memoryStore.seedAnswer(answer)
    memoryStore.seedFile(file, buildWorkbookBuffer())
    memoryStore.seedOrgLimits({
      orgId,
      monthlyTokenBudget: 1
    })
    memoryStore.seedOrgUsage({
      orgId,
      periodStart,
      tokensIn: 2,
      tokensOut: 0
    })

    const fileStorage = new MemoryFileStorage((path) => memoryStore.getStoredFile(path))

    await processQuestionnaireJob(
      { jobId, orgId, workspaceId, questionnaireId },
      { dataStore: memoryStore, fileStorage, now: () => now }
    )

    const snapshot = memoryStore.getSnapshot()
    const metrics = snapshot.jobAttempts[0]?.metrics as Record<string, unknown>
    expect(metrics?.budget_exceeded).toBe(true)
  })

  it("returns early when questionnaire already completed", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()

    const questionnaire: Questionnaire = {
      id: questionnaireId,
      orgId,
      workspaceId,
      title: "Completed Questionnaire",
      source: "Excel upload",
      status: QuestionnaireStatus.COMPLETED,
      progressTotal: 1,
      progressDone: 1,
      createdBy: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failedReason: null
    }

    const job: Job = {
      id: jobId,
      orgId,
      workspaceId,
      jobType: "PROCESS_QUESTIONNAIRE",
      status: JobStatus.QUEUED,
      payload: { questionnaireId },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date().toISOString(),
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    }

    const memoryStore = new MemoryDataStore()
    memoryStore.seedQuestionnaire(questionnaire)
    memoryStore.seedJob(job)

    const fileStorage = new MemoryFileStorage(() => new Uint8Array())

    await processQuestionnaireJob(
      { jobId, orgId, workspaceId, questionnaireId },
      { dataStore: memoryStore, fileStorage }
    )

    expect(memoryStore.getSnapshot().jobs.get(jobId)?.status).toBe(JobStatus.SUCCEEDED)
  })

  it("fails when questionnaire is missing", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()

    const job: Job = {
      id: jobId,
      orgId,
      workspaceId,
      jobType: "PROCESS_QUESTIONNAIRE",
      status: JobStatus.QUEUED,
      payload: { questionnaireId },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date().toISOString(),
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    }

    const memoryStore = new MemoryDataStore()
    memoryStore.seedJob(job)

    const fileStorage = new MemoryFileStorage(() => new Uint8Array())

    await expect(
      processQuestionnaireJob(
        { jobId, orgId, workspaceId, questionnaireId },
        { dataStore: memoryStore, fileStorage }
      )
    ).rejects.toThrow("questionnaire not found")
  })

  it("fails when input file type is unsupported", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()

    const questionnaire: Questionnaire = {
      id: questionnaireId,
      orgId,
      workspaceId,
      title: "Unsupported Questionnaire",
      source: "Text upload",
      status: QuestionnaireStatus.QUEUED,
      progressTotal: 0,
      progressDone: 0,
      createdBy: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failedReason: null
    }

    const job: Job = {
      id: jobId,
      orgId,
      workspaceId,
      jobType: "PROCESS_QUESTIONNAIRE",
      status: JobStatus.QUEUED,
      payload: { questionnaireId },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date().toISOString(),
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    }

    const file: QuestionnaireFile = {
      id: randomUUID(),
      questionnaireId,
      orgId,
      storageBucket: "uploads",
      storagePath: `org/${orgId}/questionnaires/${questionnaireId}/input.txt`,
      fileName: "input.txt",
      mimeType: "text/plain",
      sizeBytes: 100,
      checksumSha256: "checksum",
      kind: "input",
      createdAt: new Date().toISOString()
    }

    const memoryStore = new MemoryDataStore()
    memoryStore.seedQuestionnaire(questionnaire)
    memoryStore.seedJob(job)
    memoryStore.seedFile(file, new Uint8Array([1, 2, 3]))

    const fileStorage = new MemoryFileStorage((path) => memoryStore.getStoredFile(path))

    await expect(
      processQuestionnaireJob(
        { jobId, orgId, workspaceId, questionnaireId },
        { dataStore: memoryStore, fileStorage }
      )
    ).rejects.toThrow("unsupported input file type")
  })

  it("records unknown error when non-error thrown", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()

    const updateJobStatus = vi.fn(async () => {})
    const updateQuestionnaireStatus = vi.fn(async () => {})
    const createJobAttempt = vi.fn(async () => ({ id: "attempt" }))

    const dataStore: DataStore = {
      getQuestionnaire: async () => {
        throw "boom"
      },
      getQuestionnaireFile: async () => null,
      updateQuestionnaireStatus,
      updateQuestionnaireProgress: async () => {},
      createQuestions: async () => {},
      listApprovedAnswers: async () => [],
      createSuggestions: async () => {},
      createExportFile: async () => {
        throw new Error("unexpected")
      },
      recordAuditEvent: async () => {},
      createJobAttempt,
      getOrgLimits: async () => null,
      getOrgUsage: async () => null,
      upsertOrgUsage: async () => {},
      updateJobStatus,
      getJob: async () => null
    }

    const fileStorage: FileStorage = {
      download: async () => new Uint8Array()
    }

    await expect(
      processQuestionnaireJob(
        { jobId, orgId, workspaceId, questionnaireId },
        { dataStore, fileStorage }
      )
    ).rejects.toBe("boom")

    expect(updateQuestionnaireStatus).toHaveBeenCalledWith(
      questionnaireId,
      QuestionnaireStatus.FAILED,
      "unknown error"
    )
    expect(updateJobStatus).toHaveBeenCalledWith(jobId, JobStatus.FAILED, "unknown error")
    expect(createJobAttempt).toHaveBeenCalled()
  })
})

describe("processReportExportJob", () => {
  it("creates report export files", async () => {
    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const jobId = randomUUID()

    const memoryStore = new MemoryDataStore()
    memoryStore.seedWorkspace({ id: workspaceId, orgId, name: "Client Workspace" })

    const questionnaire: Questionnaire = {
      id: randomUUID(),
      orgId,
      workspaceId,
      title: "Report Q",
      source: "Seed",
      status: QuestionnaireStatus.COMPLETED,
      progressTotal: 1,
      progressDone: 1,
      createdBy: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: "2026-01-10T00:00:00Z",
      failedReason: null
    }
    memoryStore.seedQuestionnaire(questionnaire)
    memoryStore.seedAnswer({
      id: randomUUID(),
      orgId,
      workspaceId,
      title: "Approved",
      body: "Answer",
      status: AnswerStatus.APPROVED,
      ownerUserId: randomUUID(),
      tags: [],
      scope: {},
      sensitivity: "STANDARD",
      reviewIntervalDays: 90,
      lastReviewedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    memoryStore.seedJob({
      id: jobId,
      orgId,
      workspaceId,
      jobType: "EXPORT_REPORT",
      status: JobStatus.QUEUED,
      payload: {},
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date().toISOString(),
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null
    })

    const reportExport = await memoryStore.createReportExport({
      orgId,
      workspaceId,
      jobId,
      format: "csv",
      createdBy: randomUUID()
    })

    await processReportExportJob(
      {
        jobId,
        orgId,
        workspaceId,
        reportExportId: reportExport.id,
        format: "csv"
      },
      { dataStore: memoryStore, fileStorage: new MemoryFileStorage(() => null) }
    )

    const updated = await memoryStore.getReportExport(reportExport.id)
    expect(updated?.status).toBe(JobStatus.SUCCEEDED)
    expect(updated?.storagePath).toContain(`/reports/${reportExport.id}.csv`)
  })
})
