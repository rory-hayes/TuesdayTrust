import { randomUUID, createHash } from "node:crypto"
import type {
  Answer,
  Job,
  JobAttempt,
  Questionnaire,
  QuestionnaireFile,
  ReportExport,
  TokenUsageEvent
} from "@tuesdaytrust/shared"
import { AnswerStatus } from "@tuesdaytrust/shared"
import type {
  AuditEventInput,
  DataStore,
  ExportFileInput,
  JobAttemptInput,
  NewQuestion,
  NewSuggestion,
  OrgAnswerRow,
  OrgQuestionnaireRow,
  OrgSuggestionRow,
  OrgWorkspace,
  OrgLimits,
  OrgUsage,
  ReportExportFileInput,
  ReportExportInput,
  ReportExportUpdate,
  TokenUsageInput
} from "./types"

interface MemoryData {
  questionnaires: Map<string, Questionnaire>
  questionnaireFiles: Map<string, QuestionnaireFile>
  answers: Map<string, Answer>
  workspaces: Map<string, { id: string; orgId: string; name: string }>
  jobs: Map<string, Job>
  questions: NewQuestion[]
  suggestions: NewSuggestion[]
  jobAttempts: JobAttempt[]
  auditEvents: AuditEventInput[]
  orgLimits: Map<string, OrgLimits>
  orgUsage: Map<string, OrgUsage>
  reportExports: Map<string, ReportExport>
  tokenUsageEvents: TokenUsageEvent[]
  storage: Map<string, Uint8Array>
}

export class MemoryDataStore implements DataStore {
  private data: MemoryData

  constructor(seed?: Partial<MemoryData>) {
    this.data = {
      questionnaires: seed?.questionnaires ?? new Map(),
      questionnaireFiles: seed?.questionnaireFiles ?? new Map(),
      answers: seed?.answers ?? new Map(),
      workspaces: seed?.workspaces ?? new Map(),
      jobs: seed?.jobs ?? new Map(),
      questions: seed?.questions ?? [],
      suggestions: seed?.suggestions ?? [],
      jobAttempts: seed?.jobAttempts ?? [],
      auditEvents: seed?.auditEvents ?? [],
      orgLimits: seed?.orgLimits ?? new Map(),
      orgUsage: seed?.orgUsage ?? new Map(),
      reportExports: seed?.reportExports ?? new Map(),
      tokenUsageEvents: seed?.tokenUsageEvents ?? [],
      storage: seed?.storage ?? new Map()
    }
  }

  seedQuestionnaire(questionnaire: Questionnaire) {
    this.data.questionnaires.set(questionnaire.id, questionnaire)
  }

  seedJob(job: Job) {
    this.data.jobs.set(job.id, job)
  }

  seedAnswer(answer: Answer) {
    this.data.answers.set(answer.id, answer)
  }

  seedOrgLimits(limits: OrgLimits) {
    this.data.orgLimits.set(limits.orgId, limits)
  }

  seedOrgUsage(usage: OrgUsage) {
    this.data.orgUsage.set(`${usage.orgId}:${usage.periodStart}`, usage)
  }

  seedWorkspace(workspace: { id: string; orgId: string; name: string }) {
    this.data.workspaces.set(workspace.id, workspace)
  }

  seedFile(file: QuestionnaireFile, content: Uint8Array) {
    this.data.questionnaireFiles.set(file.id, file)
    this.data.storage.set(file.storagePath, content)
  }

  getStoredFile(path: string) {
    return this.data.storage.get(path) ?? null
  }

  async getQuestionnaire(questionnaireId: string) {
    return this.data.questionnaires.get(questionnaireId) ?? null
  }

  async getQuestionnaireFile(questionnaireId: string, kind: "input" | "export") {
    for (const file of this.data.questionnaireFiles.values()) {
      if (file.questionnaireId === questionnaireId && file.kind === kind) {
        return file
      }
    }
    return null
  }

  async updateQuestionnaireStatus(questionnaireId: string, status: Questionnaire["status"], failedReason?: string | null) {
    const questionnaire = this.data.questionnaires.get(questionnaireId)
    if (!questionnaire) return
    questionnaire.status = status
    questionnaire.failedReason = failedReason ?? null
    questionnaire.updatedAt = new Date().toISOString()
  }

  async updateQuestionnaireProgress(questionnaireId: string, progressDone: number, progressTotal: number) {
    const questionnaire = this.data.questionnaires.get(questionnaireId)
    if (!questionnaire) return
    questionnaire.progressDone = progressDone
    questionnaire.progressTotal = progressTotal
    questionnaire.updatedAt = new Date().toISOString()
  }

  async createQuestions(questions: NewQuestion[]) {
    this.data.questions.push(...questions)
  }

  async listApprovedAnswers(orgId: string, workspaceId: string) {
    return Array.from(this.data.answers.values()).filter(
      (answer) =>
        answer.orgId === orgId &&
        answer.workspaceId === workspaceId &&
        answer.status === AnswerStatus.APPROVED
    )
  }

  async createSuggestions(suggestions: NewSuggestion[]) {
    this.data.suggestions.push(...suggestions)
  }

  async createExportFile(file: ExportFileInput) {
    const checksum = createHash("sha256").update(file.content).digest("hex")
    const storedFile: QuestionnaireFile = {
      id: randomUUID(),
      questionnaireId: file.questionnaireId,
      orgId: file.orgId,
      storageBucket: file.storageBucket,
      storagePath: file.storagePath,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      checksumSha256: checksum,
      kind: "export",
      expiresAt: file.expiresAt ?? null,
      createdAt: new Date().toISOString()
    }

    this.data.questionnaireFiles.set(storedFile.id, storedFile)
    this.data.storage.set(file.storagePath, file.content)
    return storedFile
  }

  async recordAuditEvent(event: AuditEventInput) {
    this.data.auditEvents.push(event)
  }

  async createJobAttempt(attempt: JobAttemptInput) {
    const jobAttempt: JobAttempt = {
      id: randomUUID(),
      jobId: attempt.jobId,
      startedAt: attempt.startedAt,
      endedAt: attempt.endedAt,
      status: attempt.status,
      error: attempt.error ?? null,
      metrics: attempt.metrics,
      createdAt: new Date().toISOString()
    }
    this.data.jobAttempts.push(jobAttempt)
    return jobAttempt
  }

  async getOrgLimits(orgId: string) {
    return this.data.orgLimits.get(orgId) ?? null
  }

  async getOrgUsage(orgId: string, periodStart: string) {
    const start = new Date(`${periodStart}T00:00:00.000Z`)
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    const events = this.data.tokenUsageEvents.filter(
      (event) =>
        event.orgId === orgId &&
        new Date(event.createdAt) >= start &&
        new Date(event.createdAt) < end
    )
    const tokensIn = events.reduce((sum, event) => sum + (event.tokensIn ?? 0), 0)
    const tokensOut = events.reduce((sum, event) => sum + (event.tokensOut ?? 0), 0)
    return { orgId, periodStart, tokensIn, tokensOut }
  }

  async upsertOrgUsage(orgId: string, periodStart: string, tokensIn: number, tokensOut: number) {
    const key = `${orgId}:${periodStart}`
    const existing = this.data.orgUsage.get(key)
    if (existing) {
      existing.tokensIn += tokensIn
      existing.tokensOut += tokensOut
      return
    }
    this.data.orgUsage.set(key, {
      orgId,
      periodStart,
      tokensIn,
      tokensOut
    })
  }

  async createReportExport(input: ReportExportInput) {
    const record: ReportExport = {
      id: randomUUID(),
      orgId: input.orgId,
      workspaceId: input.workspaceId ?? null,
      jobId: input.jobId ?? null,
      format: input.format,
      status: "QUEUED",
      storageBucket: null,
      storagePath: null,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
      checksumSha256: null,
      expiresAt: null,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      lastError: null
    }
    this.data.reportExports.set(record.id, record)
    return record
  }

  async updateReportExport(id: string, update: ReportExportUpdate) {
    const record = this.data.reportExports.get(id)
    if (!record) return null
    record.status = update.status
    record.storageBucket = update.storageBucket ?? record.storageBucket
    record.storagePath = update.storagePath ?? record.storagePath
    record.fileName = update.fileName ?? record.fileName
    record.mimeType = update.mimeType ?? record.mimeType
    record.sizeBytes = update.sizeBytes ?? record.sizeBytes
    record.checksumSha256 = update.checksumSha256 ?? record.checksumSha256
    record.expiresAt = update.expiresAt ?? record.expiresAt
    record.completedAt = update.completedAt ?? record.completedAt
    record.lastError = update.lastError ?? record.lastError
    record.updatedAt = new Date().toISOString()
    return record
  }

  async getReportExport(id: string) {
    return this.data.reportExports.get(id) ?? null
  }

  async storeReportExportFile(input: ReportExportFileInput) {
    const record = this.data.reportExports.get(input.reportExportId)
    if (!record) {
      throw new Error("report export not found")
    }
    record.storageBucket = input.storageBucket
    record.storagePath = input.storagePath
    record.fileName = input.fileName
    record.mimeType = input.mimeType
    record.sizeBytes = input.sizeBytes
    record.checksumSha256 = input.checksumSha256
    record.expiresAt = input.expiresAt ?? null
    record.status = "SUCCEEDED"
    record.completedAt = new Date().toISOString()
    record.updatedAt = new Date().toISOString()
    this.data.storage.set(input.storagePath, input.content)
    return record
  }

  async listOrgWorkspaces(orgId: string) {
    return Array.from(this.data.workspaces.values())
      .filter((workspace) => workspace.orgId === orgId)
      .map((workspace) => ({ id: workspace.id, name: workspace.name })) satisfies OrgWorkspace[]
  }

  async listOrgQuestionnaires(orgId: string) {
    return Array.from(this.data.questionnaires.values())
      .filter((questionnaire) => questionnaire.orgId === orgId)
      .map((questionnaire) => ({
        workspaceId: questionnaire.workspaceId,
        status: questionnaire.status,
        updatedAt: questionnaire.updatedAt ?? null
      })) satisfies OrgQuestionnaireRow[]
  }

  async listOrgSuggestions(orgId: string) {
    return this.data.suggestions
      .filter((suggestion) => suggestion.orgId === orgId)
      .map((suggestion) => ({
        workspaceId: suggestion.workspaceId,
        confidenceBucket: suggestion.confidenceBucket
      })) satisfies OrgSuggestionRow[]
  }

  async listOrgApprovedAnswers(orgId: string) {
    return Array.from(this.data.answers.values())
      .filter((answer) => answer.orgId === orgId && answer.status === AnswerStatus.APPROVED)
      .map((answer) => ({
        workspaceId: answer.workspaceId,
        status: answer.status
      })) satisfies OrgAnswerRow[]
  }

  async recordTokenUsage(event: TokenUsageInput) {
    const usage: TokenUsageEvent = {
      id: randomUUID(),
      orgId: event.orgId,
      workspaceId: event.workspaceId ?? null,
      jobId: event.jobId ?? null,
      questionnaireId: event.questionnaireId ?? null,
      eventType: event.eventType,
      provider: event.provider ?? null,
      model: event.model ?? null,
      tokensIn: event.tokensIn ?? 0,
      tokensOut: event.tokensOut ?? 0,
      costUsd: event.costUsd ?? 0,
      metadata: event.metadata ?? {},
      createdAt: new Date().toISOString()
    }
    this.data.tokenUsageEvents.push(usage)
    return usage
  }

  async updateJobStatus(jobId: string, status: Job["status"], error?: string | null) {
    const job = this.data.jobs.get(jobId)
    if (!job) return
    job.status = status
    job.lastError = error ?? null
    job.updatedAt = new Date().toISOString()
  }

  async getJob(jobId: string) {
    return this.data.jobs.get(jobId) ?? null
  }

  getSnapshot() {
    return this.data
  }
}
