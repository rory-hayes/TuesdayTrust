import type {
  Answer,
  Job,
  JobAttempt,
  Questionnaire,
  QuestionnaireFile,
  Suggestion
} from "@tuesdaytrust/shared"
import type { QuestionnaireStatus } from "@tuesdaytrust/shared"

export interface NewQuestion {
  id: string
  questionnaireId: string
  orgId: string
  workspaceId: string
  index: number
  section?: string | null
  prompt: string
  rawPrompt: string
  responseType: string
  constraints: Record<string, unknown>
  sourceRef: Record<string, unknown>
  createdAt: string
}

export interface NewSuggestion {
  id: string
  questionId: string
  orgId: string
  workspaceId: string
  selectedAnswerId?: string | null
  selectedVariantId?: string | null
  confidenceScore: number
  confidenceBucket: string
  reasons: Record<string, unknown>
  status: string
  reviewedBy?: string | null
  reviewedAt?: string | null
  createdAt: string
}

export interface ExportFileInput {
  orgId: string
  questionnaireId: string
  content: Uint8Array
  storageBucket: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  expiresAt?: string | null
}

export interface AuditEventInput {
  orgId: string
  workspaceId?: string | null
  actorUserId?: string | null
  eventType: string
  entityType: string
  entityId: string
  payload: Record<string, unknown>
}

export interface JobAttemptInput {
  jobId: string
  startedAt: string
  endedAt: string
  status: string
  error?: string | null
  metrics: Record<string, unknown>
}

export interface OrgLimits {
  orgId: string
  maxUploadBytes?: number | null
  maxQuestions?: number | null
  maxActiveJobs?: number | null
  monthlyTokenBudget?: number | null
}

export interface OrgUsage {
  orgId: string
  periodStart: string
  tokensIn: number
  tokensOut: number
}

export interface DataStore {
  getQuestionnaire(questionnaireId: string): Promise<Questionnaire | null>
  getQuestionnaireFile(questionnaireId: string, kind: "input" | "export"):
    Promise<QuestionnaireFile | null>
  updateQuestionnaireStatus(
    questionnaireId: string,
    status: QuestionnaireStatus,
    failedReason?: string | null
  ): Promise<void>
  updateQuestionnaireProgress(
    questionnaireId: string,
    progressDone: number,
    progressTotal: number
  ): Promise<void>
  createQuestions(questions: NewQuestion[]): Promise<void>
  listApprovedAnswers(orgId: string, workspaceId: string): Promise<Answer[]>
  createSuggestions(suggestions: NewSuggestion[]): Promise<void>
  createExportFile(file: ExportFileInput): Promise<QuestionnaireFile>
  recordAuditEvent(event: AuditEventInput): Promise<void>
  createJobAttempt(attempt: JobAttemptInput): Promise<JobAttempt>
  getOrgLimits(orgId: string): Promise<OrgLimits | null>
  getOrgUsage(orgId: string, periodStart: string): Promise<OrgUsage | null>
  upsertOrgUsage(orgId: string, periodStart: string, tokensIn: number, tokensOut: number): Promise<void>
  updateJobStatus(jobId: string, status: Job["status"], error?: string | null):
    Promise<void>
  getJob(jobId: string): Promise<Job | null>
}
