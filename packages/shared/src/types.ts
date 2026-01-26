import type {
  AnswerStatus,
  ConfidenceBucket,
  AccessRequestStatus,
  JobStatus,
  JobType,
  LiveQuestionAction,
  QuestionnaireStatus,
  ReportExportFormat,
  ResponseType,
  SensitivityLevel,
  SuggestionStatus
} from "./enums"

export interface Questionnaire {
  id: string
  orgId: string
  workspaceId: string
  title: string
  source: string
  status: QuestionnaireStatus
  progressTotal: number
  progressDone: number
  createdBy: string
  createdAt: string
  updatedAt: string
  failedReason?: string | null
}

export interface QuestionnaireFile {
  id: string
  questionnaireId: string
  orgId: string
  storageBucket: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  kind: "input" | "export"
  expiresAt?: string | null
  createdAt: string
}

export interface Question {
  id: string
  questionnaireId: string
  orgId: string
  workspaceId: string
  index: number
  section?: string | null
  prompt: string
  rawPrompt: string
  responseType: ResponseType
  constraints: Record<string, unknown>
  sourceRef: Record<string, unknown>
  createdAt: string
}

export interface Answer {
  id: string
  orgId: string
  workspaceId: string
  title: string
  body: string
  status: AnswerStatus
  ownerUserId: string
  tags: string[]
  scope: Record<string, unknown>
  sensitivity: SensitivityLevel
  reviewIntervalDays: number
  lastReviewedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface Suggestion {
  id: string
  questionId: string
  orgId: string
  workspaceId: string
  selectedAnswerId?: string | null
  selectedVariantId?: string | null
  confidenceScore: number
  confidenceBucket: ConfidenceBucket
  reasons: Record<string, unknown>
  status: SuggestionStatus
  reviewedBy?: string | null
  reviewedAt?: string | null
  createdAt: string
}

export interface Job {
  id: string
  orgId: string
  workspaceId: string
  jobType: JobType
  status: JobStatus
  payload: Record<string, unknown>
  attempts: number
  maxAttempts: number
  nextRunAt: string
  lockedAt?: string | null
  lockedBy?: string | null
  createdAt: string
  updatedAt: string
  lastError?: string | null
}

export interface JobAttempt {
  id: string
  jobId: string
  startedAt: string
  endedAt: string
  status: string
  error?: string | null
  metrics: Record<string, unknown>
  createdAt: string
}

export interface LiveQuestion {
  id: string
  orgId: string
  workspaceId: string
  questionText: string
  context: Record<string, unknown>
  constraints: Record<string, unknown>
  createdBy: string
  createdAt: string
}

export interface LiveQuestionMapping {
  id: string
  liveQuestionId: string
  orgId: string
  workspaceId: string
  selectedAnswerId?: string | null
  selectedVariantId?: string | null
  action: LiveQuestionAction
  finalText?: string | null
  createdBy: string
  createdAt: string
}

export interface TrustCenterAllowlistAnswer {
  id: string
  orgId: string
  workspaceId: string
  answerId: string
  createdBy: string
  createdAt: string
}

export interface TrustCenterAllowlistEvidence {
  id: string
  orgId: string
  workspaceId: string
  evidenceId: string
  createdBy: string
  createdAt: string
}

export interface TrustCenterAccessRequest {
  id: string
  orgId: string
  workspaceId: string
  shareId?: string | null
  requesterName?: string | null
  requesterEmail?: string | null
  requesterCompany?: string | null
  message?: string | null
  status: AccessRequestStatus
  createdAt: string
  reviewedAt?: string | null
  reviewedBy?: string | null
  decisionNote?: string | null
}

export interface ReportExport {
  id: string
  orgId: string
  workspaceId?: string | null
  jobId?: string | null
  format: ReportExportFormat
  status: JobStatus
  storageBucket?: string | null
  storagePath?: string | null
  fileName?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  checksumSha256?: string | null
  expiresAt?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  completedAt?: string | null
  lastError?: string | null
}

export interface TokenUsageEvent {
  id: string
  orgId: string
  workspaceId?: string | null
  jobId?: string | null
  questionnaireId?: string | null
  eventType: string
  provider?: string | null
  model?: string | null
  tokensIn: number
  tokensOut: number
  costUsd: number
  metadata: Record<string, unknown>
  createdAt: string
}
