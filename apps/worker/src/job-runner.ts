import { createHash, randomUUID } from "node:crypto"
import {
  ConfidenceBucket,
  DOCX_MIME_TYPE,
  JobStatus,
  ReportExportFormat,
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
import { buildReportCsv, buildReportPdf, type WorkspaceReportRow } from "./reports/exporter"

export interface ProcessJobPayload {
  jobId: string
  orgId: string
  workspaceId: string
  questionnaireId: string
}

export interface ReportExportJobPayload {
  jobId: string
  orgId: string
  reportExportId: string
  workspaceId?: string | null
  format: ReportExportFormat
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

async function buildOrgWorkspaceReports(orgId: string, dataStore: DataStore) {
  const [workspaces, questionnaires, suggestions, answers] = await Promise.all([
    dataStore.listOrgWorkspaces(orgId),
    dataStore.listOrgQuestionnaires(orgId),
    dataStore.listOrgSuggestions(orgId),
    dataStore.listOrgApprovedAnswers(orgId)
  ])

  const reportMap = new Map<string, WorkspaceReportRow>()
  for (const workspace of workspaces) {
    reportMap.set(workspace.id, {
      workspaceId: workspace.id,
      name: workspace.name ?? "Workspace",
      counts: {
        questionnaires_total: 0,
        questionnaires_completed: 0,
        questionnaires_in_review: 0,
        questionnaires_failed: 0,
        suggestions_total: 0,
        auto_fill: 0,
        needs_review: 0,
        manual: 0,
        approved_answers: 0
      },
      auto_fill_rate: 0,
      time_saved_hours: 0,
      last_activity_at: null
    })
  }

  for (const row of questionnaires) {
    const record = reportMap.get(row.workspaceId)
    if (!record) continue
    record.counts.questionnaires_total += 1
    if (row.status === QuestionnaireStatus.COMPLETED) {
      record.counts.questionnaires_completed += 1
    } else if (row.status === QuestionnaireStatus.FAILED) {
      record.counts.questionnaires_failed += 1
    } else if (row.status === QuestionnaireStatus.READY_FOR_REVIEW) {
      record.counts.questionnaires_in_review += 1
    }
    if (row.updatedAt) {
      const updatedAt = new Date(row.updatedAt).toISOString()
      if (!record.last_activity_at || updatedAt > record.last_activity_at) {
        record.last_activity_at = updatedAt
      }
    }
  }

  for (const row of suggestions) {
    const record = reportMap.get(row.workspaceId)
    if (!record) continue
    record.counts.suggestions_total += 1
    if (row.confidenceBucket === ConfidenceBucket.AUTO_FILL) record.counts.auto_fill += 1
    if (row.confidenceBucket === ConfidenceBucket.NEEDS_REVIEW) record.counts.needs_review += 1
    if (row.confidenceBucket === ConfidenceBucket.MANUAL) record.counts.manual += 1
  }

  for (const row of answers) {
    const record = reportMap.get(row.workspaceId)
    if (!record) continue
    record.counts.approved_answers += 1
  }

  const reports = Array.from(reportMap.values()).map((record) => {
    const autoFillRate =
      record.counts.suggestions_total > 0
        ? Number((record.counts.auto_fill / record.counts.suggestions_total).toFixed(2))
        : 0
    const timeSavedHours = Number(
      ((record.counts.auto_fill * 3) / 60).toFixed(2)
    )
    return {
      ...record,
      auto_fill_rate: autoFillRate,
      time_saved_hours: timeSavedHours
    } satisfies WorkspaceReportRow
  })

  return reports
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
  let jobTokensIn = 0
  let jobTokensOut = 0

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

    if (typeof orgLimits?.monthlyTokenBudget === "number") {
      budgetExceeded = tokensUsed >= orgLimits.monthlyTokenBudget
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
    if (jobTokensIn > 0 || jobTokensOut > 0) {
      await dataStore.upsertOrgUsage(payload.orgId, periodStart, jobTokensIn, jobTokensOut)
      await dataStore.recordTokenUsage({
        orgId: payload.orgId,
        workspaceId: payload.workspaceId,
        jobId: payload.jobId,
        questionnaireId: payload.questionnaireId,
        eventType: "questionnaire.processing",
        tokensIn: jobTokensIn,
        tokensOut: jobTokensOut,
        costUsd: 0,
        metadata: { source: "job_runner" }
      })
    }
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
        tokens_in: jobTokensIn,
        tokens_out: jobTokensOut,
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

export async function processReportExportJob(
  payload: ReportExportJobPayload,
  options: JobRunnerOptions
) {
  const { dataStore, now = () => new Date() } = options
  const startedAt = now()

  try {
    await dataStore.updateJobStatus(payload.jobId, JobStatus.RUNNING)
    const exportRecord = await dataStore.getReportExport(payload.reportExportId)
    if (!exportRecord) {
      throw new Error("report export not found")
    }

    await dataStore.updateReportExport(payload.reportExportId, { status: JobStatus.RUNNING })
    await dataStore.recordAuditEvent({
      orgId: payload.orgId,
      workspaceId: payload.workspaceId ?? null,
      actorUserId: null,
      eventType: "report.export_started",
      entityType: "report_export",
      entityId: payload.reportExportId,
      payload: { format: payload.format }
    })

    const reports = await buildOrgWorkspaceReports(payload.orgId, dataStore)
    const filteredReports = payload.workspaceId
      ? reports.filter((report) => report.workspaceId === payload.workspaceId)
      : reports

    let bytes: Uint8Array
    let extension: "csv" | "pdf"
    let mimeType: string

    if (payload.format === ReportExportFormat.PDF) {
      bytes = await buildReportPdf(filteredReports)
      extension = "pdf"
      mimeType = "application/pdf"
    } else {
      bytes = buildReportCsv(filteredReports)
      extension = "csv"
      mimeType = "text/csv"
    }

    const checksum = createHash("sha256").update(bytes).digest("hex")
    const expiresAt = new Date(
      now().getTime() + EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()

    await dataStore.storeReportExportFile({
      reportExportId: payload.reportExportId,
      orgId: payload.orgId,
      content: bytes,
      storageBucket: "exports",
      storagePath: `org/${payload.orgId}/reports/${payload.reportExportId}.${extension}`,
      fileName: `client-report-${payload.reportExportId}.${extension}`,
      mimeType,
      sizeBytes: bytes.byteLength,
      checksumSha256: checksum,
      expiresAt
    })

    await dataStore.recordAuditEvent({
      orgId: payload.orgId,
      workspaceId: payload.workspaceId ?? null,
      actorUserId: null,
      eventType: "report.export_completed",
      entityType: "report_export",
      entityId: payload.reportExportId,
      payload: { format: payload.format }
    })

    const endedAt = now()
    await dataStore.createJobAttempt({
      jobId: payload.jobId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      status: "SUCCEEDED",
      metrics: {
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        rows: filteredReports.length,
        format: payload.format
      }
    })

    await dataStore.updateJobStatus(payload.jobId, JobStatus.SUCCEEDED)
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    await dataStore.updateReportExport(payload.reportExportId, {
      status: JobStatus.FAILED,
      lastError: message,
      completedAt: now().toISOString()
    })
    await dataStore.createJobAttempt({
      jobId: payload.jobId,
      startedAt: startedAt.toISOString(),
      endedAt: now().toISOString(),
      status: "FAILED",
      error: message,
      metrics: { format: payload.format }
    })
    await dataStore.updateJobStatus(payload.jobId, JobStatus.FAILED, message)
  }
}
