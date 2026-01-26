import { randomUUID, createHash } from "node:crypto"
import type {
  Answer,
  Job,
  JobAttempt,
  Questionnaire,
  QuestionnaireFile
} from "@tuesdaytrust/shared"
import { AnswerStatus } from "@tuesdaytrust/shared"
import type {
  AuditEventInput,
  DataStore,
  ExportFileInput,
  JobAttemptInput,
  NewQuestion,
  NewSuggestion,
  OrgLimits,
  OrgUsage
} from "./types"

interface MemoryData {
  questionnaires: Map<string, Questionnaire>
  questionnaireFiles: Map<string, QuestionnaireFile>
  answers: Map<string, Answer>
  jobs: Map<string, Job>
  questions: NewQuestion[]
  suggestions: NewSuggestion[]
  jobAttempts: JobAttempt[]
  auditEvents: AuditEventInput[]
  orgLimits: Map<string, OrgLimits>
  orgUsage: Map<string, OrgUsage>
  storage: Map<string, Uint8Array>
}

export class MemoryDataStore implements DataStore {
  private data: MemoryData

  constructor(seed?: Partial<MemoryData>) {
    this.data = {
      questionnaires: seed?.questionnaires ?? new Map(),
      questionnaireFiles: seed?.questionnaireFiles ?? new Map(),
      answers: seed?.answers ?? new Map(),
      jobs: seed?.jobs ?? new Map(),
      questions: seed?.questions ?? [],
      suggestions: seed?.suggestions ?? [],
      jobAttempts: seed?.jobAttempts ?? [],
      auditEvents: seed?.auditEvents ?? [],
      orgLimits: seed?.orgLimits ?? new Map(),
      orgUsage: seed?.orgUsage ?? new Map(),
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
    return this.data.orgUsage.get(`${orgId}:${periodStart}`) ?? null
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
