import { createHash, randomUUID } from "node:crypto"
import {
  ConfidenceBucket,
  DOCX_MIME_TYPE,
  ESTIMATED_TOKENS_PER_QUESTION,
  JobStatus,
  EXPORT_RETENTION_DAYS,
  MAX_QUESTIONNAIRE_QUESTIONS,
  PDF_MIME_TYPE,
  QuestionnaireStatus,
  SuggestionStatus,
  XLSX_MIME_TYPE
} from "@tuesdaytrust/shared"
import type { DataStore } from "./datastore/types"
import type { FileStorage } from "./storage/types"
import { parseQuestionsFromXlsx } from "./xlsx/parser"
import { applySuggestionsToWorkbook } from "./xlsx/exporter"
import { parseQuestionsFromDocx } from "./docx/parser"
import { applySuggestionsToDocx } from "./docx/exporter"
import { parseQuestionsFromPdf } from "./pdf/parser"
import { applySuggestionsToPdf } from "./pdf/exporter"
import { generateSuggestions } from "./suggestions/generate"
import { logJobEvent } from "./metrics/logging"
import type { ParsedWorkbook } from "./questions/types"

export interface ProcessJobPayload {
  jobId: string
  orgId: string
  workspaceId: string
  questionnaireId: string
}

export interface JobRunnerOptions {
  dataStore: DataStore
  fileStorage: FileStorage
  now?: () => Date
}

function getPeriodStart(date: Date) {
  const period = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  return period.toISOString().slice(0, 10)
}

export async function processQuestionnaireJob(
  payload: ProcessJobPayload,
  options: JobRunnerOptions
) {
  const { dataStore, fileStorage, now = () => new Date() } = options
  const startedAt = now()
  let maxQuestions = MAX_QUESTIONNAIRE_QUESTIONS
  let periodStart = getPeriodStart(startedAt)
  let budgetExceeded = false
  let tokensUsed = 0
  let estimatedTokens = 0

  try {
    const orgLimits = await dataStore.getOrgLimits(payload.orgId)
    maxQuestions = orgLimits?.maxQuestions ?? MAX_QUESTIONNAIRE_QUESTIONS
    periodStart = getPeriodStart(startedAt)
    const orgUsage = await dataStore.getOrgUsage(payload.orgId, periodStart)
    tokensUsed = (orgUsage?.tokensIn ?? 0) + (orgUsage?.tokensOut ?? 0)
    const questionnaire = await dataStore.getQuestionnaire(payload.questionnaireId)
    if (!questionnaire) {
      throw new Error("questionnaire not found")
    }

    if (questionnaire.status === QuestionnaireStatus.COMPLETED) {
      await dataStore.updateJobStatus(payload.jobId, JobStatus.SUCCEEDED)
      return
    }

    await dataStore.updateJobStatus(payload.jobId, JobStatus.RUNNING)
    await dataStore.updateQuestionnaireStatus(
      payload.questionnaireId,
      QuestionnaireStatus.PARSING
    )
    logJobEvent({
      job_id: payload.jobId,
      org_id: payload.orgId,
      questionnaire_id: payload.questionnaireId,
      stage: "PARSING",
      status: "STARTED"
    })

    await dataStore.recordAuditEvent({
      orgId: payload.orgId,
      workspaceId: payload.workspaceId,
      actorUserId: null,
      eventType: "questionnaire.processing_started",
      entityType: "questionnaire",
      entityId: payload.questionnaireId,
      payload: { job_id: payload.jobId }
    })

    const inputFile = await dataStore.getQuestionnaireFile(
      payload.questionnaireId,
      "input"
    )
    if (!inputFile) {
      throw new Error("input file not found")
    }

    const inputBytes = await fileStorage.download(
      inputFile.storageBucket,
      inputFile.storagePath
    )

    let parsed: ParsedWorkbook
    if (inputFile.mimeType === XLSX_MIME_TYPE) {
      parsed = parseQuestionsFromXlsx(inputBytes)
    } else if (inputFile.mimeType === DOCX_MIME_TYPE) {
      parsed = await parseQuestionsFromDocx(inputBytes)
    } else if (inputFile.mimeType === PDF_MIME_TYPE) {
      parsed = await parseQuestionsFromPdf(inputBytes)
    } else {
      throw new Error("unsupported input file type")
    }

    if (parsed.totalQuestions > maxQuestions) {
      throw new Error("question count exceeds limit")
    }

    estimatedTokens = parsed.totalQuestions * ESTIMATED_TOKENS_PER_QUESTION
    if (typeof orgLimits?.monthlyTokenBudget === "number") {
      budgetExceeded = tokensUsed + estimatedTokens >= orgLimits.monthlyTokenBudget
    }

    await dataStore.updateQuestionnaireStatus(
      payload.questionnaireId,
      QuestionnaireStatus.PARSED
    )
    logJobEvent({
      job_id: payload.jobId,
      org_id: payload.orgId,
      questionnaire_id: payload.questionnaireId,
      stage: "PARSED",
      status: "SUCCEEDED"
    })
    await dataStore.updateQuestionnaireProgress(
      payload.questionnaireId,
      0,
      parsed.totalQuestions
    )

    const createdAt = now().toISOString()
    const questionRows = parsed.questions.map((question) => ({
      id: randomUUID(),
      questionnaireId: payload.questionnaireId,
      orgId: payload.orgId,
      workspaceId: payload.workspaceId,
      index: question.index,
      section: question.section,
      prompt: question.prompt,
      rawPrompt: question.rawPrompt,
      responseType: question.responseType,
      constraints: {},
      sourceRef: question.sourceRef,
      createdAt
    }))

    await dataStore.createQuestions(questionRows)

    await dataStore.updateQuestionnaireStatus(
      payload.questionnaireId,
      QuestionnaireStatus.EMBEDDING
    )
    logJobEvent({
      job_id: payload.jobId,
      org_id: payload.orgId,
      questionnaire_id: payload.questionnaireId,
      stage: "EMBEDDING",
      status: "STARTED"
    })

    const answers = await dataStore.listApprovedAnswers(
      payload.orgId,
      payload.workspaceId
    )

    await dataStore.updateQuestionnaireStatus(
      payload.questionnaireId,
      QuestionnaireStatus.MATCHING
    )
    logJobEvent({
      job_id: payload.jobId,
      org_id: payload.orgId,
      questionnaire_id: payload.questionnaireId,
      stage: "MATCHING",
      status: "STARTED"
    })

    const matches = generateSuggestions(parsed.questions, answers, { budgetExceeded })
    const suggestions = matches.map((match) => {
      const questionRow = questionRows.find(
        (question) => question.index === match.question.index
      )
      return {
        id: randomUUID(),
        questionId: questionRow?.id ?? randomUUID(),
        orgId: payload.orgId,
        workspaceId: payload.workspaceId,
        selectedAnswerId: match.selectedAnswerId,
        selectedVariantId: null,
        confidenceScore: match.confidenceScore,
        confidenceBucket: match.confidenceBucket,
        reasons: match.reasons,
        status: SuggestionStatus.PROPOSED,
        createdAt
      }
    })

    await dataStore.createSuggestions(suggestions)

    let exportBytes: Uint8Array
    let exportExtension: "xlsx" | "docx"
    let exportMimeType: string

    if (inputFile.mimeType === DOCX_MIME_TYPE) {
      exportBytes = await applySuggestionsToDocx(
        matches.map((match) => {
          const selectedAnswer = answers.find(
            (answer) => answer.id === match.selectedAnswerId
          )
          return {
            questionText: match.question.rawPrompt,
            answerText: selectedAnswer?.body ?? ""
          }
        })
      )
      exportExtension = "docx"
      exportMimeType = DOCX_MIME_TYPE
    } else if (inputFile.mimeType === PDF_MIME_TYPE) {
      exportBytes = await applySuggestionsToPdf(
        matches.map((match) => {
          const selectedAnswer = answers.find(
            (answer) => answer.id === match.selectedAnswerId
          )
          return {
            questionText: match.question.rawPrompt,
            answerText: selectedAnswer?.body ?? ""
          }
        })
      )
      exportExtension = "pdf"
      exportMimeType = PDF_MIME_TYPE
    } else {
      const exportSuggestions = matches
        .filter((match) => match.selectedAnswerId)
        .map((match) => {
          const selectedAnswer = answers.find(
            (answer) => answer.id === match.selectedAnswerId
          )
          return {
            questionIndex: match.question.index,
            answerText: selectedAnswer?.body ?? "",
            sourceRef: match.question.sourceRef
          }
        })
      exportBytes = applySuggestionsToWorkbook(inputBytes, exportSuggestions)
      exportExtension = "xlsx"
      exportMimeType = XLSX_MIME_TYPE
    }

    await dataStore.updateQuestionnaireStatus(
      payload.questionnaireId,
      QuestionnaireStatus.EXPORTING
    )
    logJobEvent({
      job_id: payload.jobId,
      org_id: payload.orgId,
      questionnaire_id: payload.questionnaireId,
      stage: "EXPORTING",
      status: "STARTED"
    })

    const exportChecksum = createHash("sha256").update(exportBytes).digest("hex")
    const exportExpiresAt = new Date(
      now().getTime() + EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()
    await dataStore.createExportFile({
      orgId: payload.orgId,
      questionnaireId: payload.questionnaireId,
      content: exportBytes,
      storageBucket: "exports",
      storagePath: `org/${payload.orgId}/questionnaires/${payload.questionnaireId}/export.${exportExtension}`,
      fileName: `${questionnaire.title}-export.${exportExtension}`,
      mimeType: exportMimeType,
      sizeBytes: exportBytes.byteLength,
      checksumSha256: exportChecksum,
      expiresAt: exportExpiresAt
    })

    const doneCount = matches.length
    await dataStore.updateQuestionnaireProgress(
      payload.questionnaireId,
      doneCount,
      parsed.totalQuestions
    )

    await dataStore.updateQuestionnaireStatus(
      payload.questionnaireId,
      QuestionnaireStatus.READY_FOR_REVIEW
    )

    await dataStore.updateQuestionnaireStatus(
      payload.questionnaireId,
      QuestionnaireStatus.COMPLETED
    )
    logJobEvent({
      job_id: payload.jobId,
      org_id: payload.orgId,
      questionnaire_id: payload.questionnaireId,
      stage: "COMPLETED",
      status: "SUCCEEDED"
    })

    await dataStore.recordAuditEvent({
      orgId: payload.orgId,
      workspaceId: payload.workspaceId,
      actorUserId: null,
      eventType: "questionnaire.processing_completed",
      entityType: "questionnaire",
      entityId: payload.questionnaireId,
      payload: {
        job_id: payload.jobId,
        counts: {
          auto_fill: matches.filter(
            (match) => match.confidenceBucket === ConfidenceBucket.AUTO_FILL
          ).length,
          needs_review: matches.filter(
            (match) => match.confidenceBucket === ConfidenceBucket.NEEDS_REVIEW
          ).length,
          manual: matches.filter(
            (match) => match.confidenceBucket === ConfidenceBucket.MANUAL
          ).length
        }
      }
    })

    const endedAt = now()
    await dataStore.upsertOrgUsage(payload.orgId, periodStart, estimatedTokens, 0)
    await dataStore.createJobAttempt({
      jobId: payload.jobId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      status: "SUCCEEDED",
      metrics: {
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        questions: parsed.totalQuestions,
        auto_fill: matches.filter(
          (match) => match.confidenceBucket === ConfidenceBucket.AUTO_FILL
        ).length,
        needs_review: matches.filter(
          (match) => match.confidenceBucket === ConfidenceBucket.NEEDS_REVIEW
        ).length,
        manual: matches.filter(
          (match) => match.confidenceBucket === ConfidenceBucket.MANUAL
        ).length,
        tokens_in: estimatedTokens,
        tokens_out: 0,
        budget_exceeded: budgetExceeded
      }
    })

    await dataStore.updateJobStatus(payload.jobId, JobStatus.SUCCEEDED)
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    logJobEvent({
      job_id: payload.jobId,
      org_id: payload.orgId,
      questionnaire_id: payload.questionnaireId,
      stage: "FAILED",
      status: "FAILED",
      error: message
    })
    await dataStore.updateQuestionnaireStatus(
      payload.questionnaireId,
      QuestionnaireStatus.FAILED,
      message
    )
    await dataStore.updateJobStatus(payload.jobId, JobStatus.FAILED, message)

    const endedAt = now()
    await dataStore.createJobAttempt({
      jobId: payload.jobId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      status: "FAILED",
      error: message,
      metrics: { duration_ms: endedAt.getTime() - startedAt.getTime() }
    })

    throw error
  }
}
