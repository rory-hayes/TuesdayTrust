import { describe, expect, it, vi } from "vitest"
import * as XLSX from "xlsx"
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
import { MemoryDataStore } from "../src/datastore/memory"
import { MemoryFileStorage } from "../src/storage/memory"

vi.mock("../src/suggestions/generate", () => ({
  generateSuggestions: () => [
    {
      question: {
        index: 0,
        section: "Sheet1",
        prompt: "Question",
        rawPrompt: "Question",
        responseType: "free_text",
        sourceRef: { sheet: "Sheet1", row: 1, col: 0 }
      },
      selectedAnswerId: "answer-1",
      confidenceScore: 0.9,
      confidenceBucket: "AUTO_FILL",
      reasons: {}
    },
    {
      question: {
        index: 999,
        section: "Sheet1",
        prompt: "Question",
        rawPrompt: "Question",
        responseType: "free_text",
        sourceRef: { sheet: "Sheet1", row: 1, col: 0 }
      },
      selectedAnswerId: "missing-answer",
      confidenceScore: 0.9,
      confidenceBucket: "AUTO_FILL",
      reasons: {}
    }
  ]
}))

function buildWorkbookBuffer() {
  const worksheet = XLSX.utils.aoa_to_sheet([["Question"], ["Sample question"]])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1")
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return new Uint8Array(buffer)
}

describe("processQuestionnaireJob with mocked suggestions", () => {
  it("handles missing selected answer body", async () => {
    const { processQuestionnaireJob } = await import("../src/job-runner")

    const orgId = randomUUID()
    const workspaceId = randomUUID()
    const questionnaireId = randomUUID()
    const jobId = randomUUID()

    const questionnaire: Questionnaire = {
      id: questionnaireId,
      orgId,
      workspaceId,
      title: "Mocked Questionnaire",
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

    const answer: Answer = {
      id: "answer-1",
      orgId,
      workspaceId,
      title: "Policy",
      body: "We enforce MFA.",
      status: AnswerStatus.APPROVED,
      ownerUserId: randomUUID(),
      tags: [],
      scope: {},
      sensitivity: "STANDARD",
      reviewIntervalDays: 90,
      lastReviewedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const store = new MemoryDataStore()
    store.seedQuestionnaire(questionnaire)
    store.seedJob(job)
    store.seedFile(file, buildWorkbookBuffer())
    store.seedAnswer(answer)

    const fileStorage = new MemoryFileStorage((path) => store.getStoredFile(path))

    await processQuestionnaireJob(
      { jobId, orgId, workspaceId, questionnaireId },
      { dataStore: store, fileStorage }
    )

    expect(store.getSnapshot().jobs.get(jobId)?.status).toBe(JobStatus.SUCCEEDED)
  })
})
