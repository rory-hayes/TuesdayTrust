export const OrgRole = {
  ADMIN: "ADMIN",
  EDITOR: "EDITOR",
  REVIEWER: "REVIEWER",
  VIEWER: "VIEWER"
} as const

export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole]

export const AnswerStatus = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  DEPRECATED: "DEPRECATED"
} as const

export type AnswerStatus = (typeof AnswerStatus)[keyof typeof AnswerStatus]

export const QuestionnaireStatus = {
  UPLOADED: "UPLOADED",
  QUEUED: "QUEUED",
  PARSING: "PARSING",
  PARSED: "PARSED",
  EMBEDDING: "EMBEDDING",
  MATCHING: "MATCHING",
  READY_FOR_REVIEW: "READY_FOR_REVIEW",
  EXPORTING: "EXPORTING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED"
} as const

export type QuestionnaireStatus =
  (typeof QuestionnaireStatus)[keyof typeof QuestionnaireStatus]

export const JobType = {
  PROCESS_QUESTIONNAIRE: "PROCESS_QUESTIONNAIRE",
  EXPORT_QUESTIONNAIRE: "EXPORT_QUESTIONNAIRE",
  EXPORT_REPORT: "EXPORT_REPORT",
  REINDEX_ANSWERS: "REINDEX_ANSWERS",
  DEDUPE_ANSWERS: "DEDUPE_ANSWERS"
} as const

export type JobType = (typeof JobType)[keyof typeof JobType]

export const JobStatus = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED"
} as const

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus]

export const AccessRequestStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  DENIED: "DENIED"
} as const

export type AccessRequestStatus =
  (typeof AccessRequestStatus)[keyof typeof AccessRequestStatus]

export const ReportExportFormat = {
  CSV: "csv",
  PDF: "pdf"
} as const

export type ReportExportFormat =
  (typeof ReportExportFormat)[keyof typeof ReportExportFormat]

export const ConfidenceBucket = {
  AUTO_FILL: "AUTO_FILL",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  MANUAL: "MANUAL"
} as const

export type ConfidenceBucket =
  (typeof ConfidenceBucket)[keyof typeof ConfidenceBucket]

export const SuggestionStatus = {
  PROPOSED: "proposed",
  ACCEPTED: "accepted",
  EDITED: "edited",
  NEEDS_NEW_ANSWER: "needs_new_answer"
} as const

export type SuggestionStatus =
  (typeof SuggestionStatus)[keyof typeof SuggestionStatus]

export const SensitivityLevel = {
  STANDARD: "STANDARD",
  SENSITIVE: "SENSITIVE",
  RESTRICTED: "RESTRICTED"
} as const

export type SensitivityLevel =
  (typeof SensitivityLevel)[keyof typeof SensitivityLevel]

export const ResponseType = {
  YESNO: "yesno",
  FREE_TEXT: "free_text",
  NUMERIC: "numeric",
  DATE: "date",
  SELECT: "select"
} as const

export type ResponseType = (typeof ResponseType)[keyof typeof ResponseType]

export const LiveQuestionAction = {
  ACCEPTED: "accepted",
  EDITED: "edited",
  NEW_ANSWER_NEEDED: "new_answer_needed"
} as const

export type LiveQuestionAction =
  (typeof LiveQuestionAction)[keyof typeof LiveQuestionAction]
