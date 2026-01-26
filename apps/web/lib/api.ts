import type { CreateQuestionnaireInput } from "@tuesdaytrust/shared"
import { supabase } from "./supabase"

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface ApiResult<T> {
  data: T | null
  error: ApiError | null
}

export interface SignedUploadInput {
  workspace_id: string
  questionnaire_id?: string
  input_file: {
    file_name: string
    mime_type: string
    size_bytes: number
  }
}

export interface SignedUploadResponse {
  questionnaire_id: string
  input_file: {
    bucket: string
    path: string
    file_name: string
    mime_type: string
    size_bytes: number
    signed_url: string
    expires_in: number
  }
}

export interface LiveQuestionAnswerInput {
  workspace_id: string
  question_text: string
  context?: Record<string, unknown>
  constraints?: Record<string, unknown>
}

export interface LiveQuestionAnswerResponse {
  live_question_id: string
  confidence_bucket: string
  confidence_score: number
  suggested: {
    answer_id: string
    variant_id: string | null
    text: string
    evidence: Array<{ id: string; title: string; url: string | null }>
  } | null
  reasons: Record<string, unknown>
}

export interface LiveQuestionMapInput {
  live_question_id: string
  selected_answer_id?: string
  selected_variant_id?: string
  action: "accepted" | "edited" | "new_answer_needed"
  final_text?: string
}

export interface DuplicateAnswersResponse {
  threshold: number
  duplicates: Array<{
    answer_id: string
    duplicate_id: string
    similarity: number
    title: string
    duplicate_title: string
  }>
}

export interface ExpiringAnswersResponse {
  window_days: number
  answers: Array<{
    id: string
    title: string
    last_reviewed_at: string | null
    review_interval_days: number
    due_at: string
    days_until_due: number
  }>
}

export interface RoiAnalyticsResponse {
  workspace_id: string
  counts: {
    total_suggestions: number
    auto_fill: number
    needs_review: number
    manual: number
  }
  auto_fill_rate: number
  avg_completion_time_hours: number
  time_saved_hours: number
  assumptions: {
    minutes_saved_per_auto_fill: number
    based_on: string
  }
}

export interface MeResponse {
  user: { id: string; email: string | null }
  memberships: Array<{ org_id: string; role: string }>
  orgs: Array<{ id: string; name: string }>
  workspaces: Array<{ id: string; org_id: string; name: string; org_name: string }>
  features: Record<string, { trust_center_enabled: boolean; consultant_mode_enabled: boolean }>
}

export interface OnboardingResponse {
  org: { id: string; name: string }
  workspace: { id: string; org_id: string; name: string }
  role: string
}

export interface OrgMember {
  user_id: string
  role: string
  created_at?: string
}

export interface OrgInvite {
  id: string
  email: string
  role: string
  token: string
  expires_at: string
  created_at: string
  accepted_at?: string | null
}

export interface OrgSettingsResponse {
  limits: {
    max_upload_bytes: number | null
    max_questions: number | null
    max_active_jobs: number | null
    monthly_token_budget: number | null
  } | null
  sso: {
    enabled: boolean
    provider: string | null
    domain: string | null
    metadata_url: string | null
  } | null
  features: {
    trust_center_enabled: boolean
    consultant_mode_enabled: boolean
  } | null
}

export interface OrgUsageResponse {
  period_start: string
  tokens_in: number
  tokens_out: number
  tokens_used: number
  monthly_token_budget: number | null
  budget_remaining: number | null
}

export interface WorkspaceMember {
  user_id: string
  role: string
  created_at?: string
}

export interface TrustCenterOverviewResponse {
  workspace_id: string
  summary: {
    approved_answers: number
    answers_with_evidence: number
    evidence_total: number
    evidence_shareable: number
  }
  answers: Array<{ id: string; title: string; last_reviewed_at: string }>
  evidence: Array<{ id: string; title: string; url: string | null; expires_at: string | null }>
}

export interface TrustCenterShare {
  id: string
  token: string
  include_answers: boolean
  include_evidence: boolean
  expires_at: string | null
  revoked_at: string | null
  created_at: string
  created_by: string
}

export interface TrustCenterShareListResponse {
  shares: TrustCenterShare[]
}

export interface TrustCenterAllowlistResponse {
  workspace_id: string
  allowlist: {
    answer_ids: string[]
    evidence_ids: string[]
  }
  answers: Array<{ id: string; title: string; last_reviewed_at: string }>
  evidence: Array<{ id: string; title: string; url: string | null; expires_at: string | null }>
}

export interface TrustCenterAccessRequestInput {
  token: string
  requester_name?: string
  requester_email?: string
  requester_company?: string
  message?: string
  answer_ids?: string[]
  evidence_ids?: string[]
}

export interface TrustCenterAccessRequest {
  id: string
  org_id: string
  workspace_id: string
  share_id: string | null
  requester_name: string | null
  requester_email: string | null
  requester_company: string | null
  message: string | null
  status: string
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  decision_note: string | null
  answer_ids?: string[]
  evidence_ids?: string[]
}

export interface TrustCenterAccessRequestListResponse {
  requests: TrustCenterAccessRequest[]
}

export interface OrgWorkspaceReport {
  workspace_id: string
  name: string
  counts: {
    questionnaires_total: number
    questionnaires_completed: number
    questionnaires_in_review: number
    questionnaires_failed: number
    suggestions_total: number
    auto_fill: number
    needs_review: number
    manual: number
    approved_answers: number
  }
  auto_fill_rate: number
  time_saved_hours: number
  last_activity_at: string | null
}

export interface OrgWorkspaceReportsResponse {
  workspaces: OrgWorkspaceReport[]
}

export interface ReportExportInput {
  format: "csv" | "pdf"
  workspace_id?: string
}

export interface ReportExportRecord {
  id: string
  org_id: string
  workspace_id: string | null
  job_id: string | null
  format: "csv" | "pdf"
  status: string
  storage_bucket: string | null
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  checksum_sha256: string | null
  expires_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  completed_at: string | null
  last_error: string | null
  signed_url?: string | null
}

export interface ReportExportResponse {
  report_export: ReportExportRecord
  job_id: string
}

export interface ReportExportListResponse {
  exports: ReportExportRecord[]
}

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ?? ""
}

async function getAuthHeader() {
  if (typeof window === "undefined") return null
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? `Bearer ${token}` : null
  } catch {
    return null
  }
}

async function requestJson<T>(path: string, options: RequestInit): Promise<ApiResult<T>> {
  const authHeader = await getAuthHeader()
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
      ...(authHeader ? { authorization: authHeader } : {})
    }
  })

  const payload = (await response.json()) as { error?: ApiError } & T
  if (!response.ok || payload.error) {
    return {
      data: null,
      error: payload.error ?? {
        code: "INTERNAL_ERROR",
        message: "Unexpected error"
      }
    }
  }
  return { data: payload as T, error: null }
}

export function createQuestionnaire(input: CreateQuestionnaireInput) {
  return requestJson<{ questionnaire_id: string; status: string; job_id: string }>(
    "/api/questionnaires",
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  )
}

export function fetchMe() {
  return requestJson<MeResponse>("/api/me", { method: "GET" })
}

export function createOnboarding(orgName: string, workspaceName: string) {
  return requestJson<OnboardingResponse>("/api/onboarding", {
    method: "POST",
    body: JSON.stringify({ org_name: orgName, workspace_name: workspaceName })
  })
}

export function createWorkspace(orgId: string, name: string) {
  return requestJson<{ workspace: { id: string; org_id: string; name: string } }>(
    "/api/workspaces",
    {
      method: "POST",
      body: JSON.stringify({ org_id: orgId, name })
    }
  )
}

export function fetchOrgMembers(orgId: string) {
  return requestJson<{ members: OrgMember[] }>(`/api/orgs/${orgId}/members`, { method: "GET" })
}

export function fetchOrgInvites(orgId: string) {
  return requestJson<{ invites: OrgInvite[] }>(`/api/orgs/${orgId}/invites`, { method: "GET" })
}

export function createOrgInvite(orgId: string, email: string, role: string, expiresInDays?: number) {
  return requestJson<{ invite: OrgInvite }>(`/api/orgs/${orgId}/invites`, {
    method: "POST",
    body: JSON.stringify({ email, role, expires_in_days: expiresInDays })
  })
}

export function acceptOrgInvite(token: string) {
  return requestJson<{ org_id: string; role: string }>("/api/invites/accept", {
    method: "POST",
    body: JSON.stringify({ token })
  })
}

export function fetchOrgSettings(orgId: string) {
  return requestJson<OrgSettingsResponse>(`/api/orgs/${orgId}/settings`, { method: "GET" })
}

export function updateOrgSettings(
  orgId: string,
  input: {
    limits?: Record<string, unknown>
    sso?: Record<string, unknown>
    features?: Record<string, unknown>
  }
) {
  return requestJson<{ ok: boolean }>(`/api/orgs/${orgId}/settings`, {
    method: "POST",
    body: JSON.stringify(input)
  })
}

export function fetchOrgUsage(orgId: string) {
  return requestJson<OrgUsageResponse>(`/api/orgs/${orgId}/usage`, { method: "GET" })
}

export function updateOrgMemberRole(orgId: string, userId: string, role: string) {
  return requestJson<{ member: OrgMember }>(`/api/orgs/${orgId}/members/${userId}/role`, {
    method: "POST",
    body: JSON.stringify({ role })
  })
}

export function removeOrgMember(orgId: string, userId: string) {
  return requestJson<{ ok: boolean }>(`/api/orgs/${orgId}/members/${userId}/remove`, {
    method: "POST"
  })
}

export function fetchWorkspaceMembers(workspaceId: string) {
  return requestJson<{ members: WorkspaceMember[] }>(`/api/workspaces/${workspaceId}/members`, {
    method: "GET"
  })
}

export function addWorkspaceMember(workspaceId: string, userId: string, role?: string) {
  return requestJson<{ member: WorkspaceMember }>(`/api/workspaces/${workspaceId}/members`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, role })
  })
}

export function updateWorkspaceMemberRole(workspaceId: string, userId: string, role: string) {
  return requestJson<{ member: WorkspaceMember }>(
    `/api/workspaces/${workspaceId}/members/${userId}/role`,
    {
      method: "POST",
      body: JSON.stringify({ role })
    }
  )
}

export function removeWorkspaceMember(workspaceId: string, userId: string) {
  return requestJson<{ ok: boolean }>(
    `/api/workspaces/${workspaceId}/members/${userId}/remove`,
    {
      method: "POST"
    }
  )
}

export function createSignedUploadUrl(input: SignedUploadInput) {
  return requestJson<SignedUploadResponse>("/api/uploads/sign", {
    method: "POST",
    body: JSON.stringify(input)
  })
}

export function getLiveQuestionAnswer(input: LiveQuestionAnswerInput) {
  return requestJson<LiveQuestionAnswerResponse>("/api/live-question/answer", {
    method: "POST",
    body: JSON.stringify(input)
  })
}

export function createLiveQuestionMapping(input: LiveQuestionMapInput) {
  return requestJson<{ mapping: Record<string, unknown> }>("/api/live-question/map", {
    method: "POST",
    body: JSON.stringify(input)
  })
}

export function fetchDuplicateAnswers(workspaceId: string) {
  return requestJson<DuplicateAnswersResponse>(
    `/api/answers/duplicates?workspace_id=${encodeURIComponent(workspaceId)}`,
    { method: "GET" }
  )
}

export function fetchExpiringAnswers(workspaceId: string, windowDays?: number) {
  const params = new URLSearchParams({ workspace_id: workspaceId })
  if (windowDays) params.set("window_days", String(windowDays))
  return requestJson<ExpiringAnswersResponse>(`/api/answers/expiring?${params.toString()}`, {
    method: "GET"
  })
}

export function mergeAnswer(answerId: string, targetAnswerId: string) {
  return requestJson<{ deprecated_answer: Record<string, unknown>; target_answer_id: string }>(
    `/api/answers/${answerId}/merge`,
    {
      method: "POST",
      body: JSON.stringify({ target_answer_id: targetAnswerId })
    }
  )
}

export function reviewAnswer(answerId: string) {
  return requestJson<{ answer: Record<string, unknown> }>(`/api/answers/${answerId}/review`, {
    method: "POST"
  })
}

export function fetchRoiAnalytics(workspaceId: string) {
  return requestJson<RoiAnalyticsResponse>(
    `/api/analytics/roi?workspace_id=${encodeURIComponent(workspaceId)}`,
    { method: "GET" }
  )
}

export function fetchTrustCenterOverview(workspaceId: string) {
  return requestJson<TrustCenterOverviewResponse>(
    `/api/trust-center/overview?workspace_id=${encodeURIComponent(workspaceId)}`,
    { method: "GET" }
  )
}

export function fetchTrustCenterShares(workspaceId: string) {
  return requestJson<TrustCenterShareListResponse>(
    `/api/trust-center/shares?workspace_id=${encodeURIComponent(workspaceId)}`,
    { method: "GET" }
  )
}

export function createTrustCenterShare(input: {
  workspace_id: string
  include_answers?: boolean
  include_evidence?: boolean
  expires_in_days?: number
}) {
  return requestJson<{ share: TrustCenterShare }>("/api/trust-center/shares", {
    method: "POST",
    body: JSON.stringify(input)
  })
}

export function revokeTrustCenterShare(shareId: string) {
  return requestJson<{ share: TrustCenterShare }>(`/api/trust-center/shares/${shareId}/revoke`, {
    method: "POST"
  })
}

export function fetchTrustCenterAllowlist(workspaceId: string) {
  return requestJson<TrustCenterAllowlistResponse>(
    `/api/trust-center/allowlist?workspace_id=${encodeURIComponent(workspaceId)}`,
    { method: "GET" }
  )
}

export function updateTrustCenterAllowlist(input: {
  workspace_id: string
  answer_ids: string[]
  evidence_ids: string[]
}) {
  return requestJson<TrustCenterAllowlistResponse>("/api/trust-center/allowlist", {
    method: "POST",
    body: JSON.stringify(input)
  })
}

export async function createTrustCenterAccessRequest(input: TrustCenterAccessRequestInput) {
  const response = await fetch(`${getApiBaseUrl()}/api/trust-center/access-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  })

  const payload = (await response.json()) as { error?: ApiError; request?: TrustCenterAccessRequest }
  if (!response.ok || payload.error) {
    return {
      data: null,
      error: payload.error ?? {
        code: "INTERNAL_ERROR",
        message: "Unexpected error"
      }
    } satisfies ApiResult<{ request: TrustCenterAccessRequest }>
  }
  return { data: payload as { request: TrustCenterAccessRequest }, error: null }
}

export function fetchTrustCenterAccessRequests(workspaceId: string) {
  return requestJson<TrustCenterAccessRequestListResponse>(
    `/api/trust-center/access-requests?workspace_id=${encodeURIComponent(workspaceId)}`,
    { method: "GET" }
  )
}

export function updateTrustCenterAccessRequest(
  requestId: string,
  input: { status: "APPROVED" | "DENIED"; decision_note?: string; grant_requested?: boolean }
) {
  return requestJson<{ request: TrustCenterAccessRequest }>(
    `/api/trust-center/access-requests/${requestId}`,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  )
}

export function fetchOrgWorkspaceReports(orgId: string) {
  return requestJson<OrgWorkspaceReportsResponse>(`/api/orgs/${orgId}/reports`, {
    method: "GET"
  })
}

export function createReportExport(orgId: string, input: ReportExportInput) {
  return requestJson<ReportExportResponse>(`/api/orgs/${orgId}/reports/export`, {
    method: "POST",
    body: JSON.stringify(input)
  })
}

export function fetchReportExports(orgId: string, workspaceId?: string) {
  const params = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ""
  return requestJson<ReportExportListResponse>(`/api/orgs/${orgId}/reports/exports${params}`, {
    method: "GET"
  })
}
