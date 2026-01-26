export interface SupabaseClientLike {
  auth: {
    getUser: (token: string) => Promise<{ data: { user: { id: string; email?: string | null } | null } }>
  }
  from: (table: string) => any
  storage: {
    from: (bucket: string) => any
  }
}

export interface HandlerDependencies {
  supabase: SupabaseClientLike
  qstash: { url: string; token: string }
  now?: () => Date
  maxUploadBytes?: number
  maxOrgActiveJobs?: number
  uploadRetentionDays?: number
  signedUploadExpiresInSeconds?: number
}

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const DEFAULT_MAX_ORG_ACTIVE_JOBS = 3
const DEFAULT_UPLOAD_RETENTION_DAYS = 30
const DEFAULT_SIGNED_UPLOAD_TTL_SECONDS = 600
const DEFAULT_REVIEW_WINDOW_DAYS = 14
const DUPLICATE_SIMILARITY_THRESHOLD = 0.78
const TIME_SAVED_MINUTES_PER_AUTOFILL = 3
const DEFAULT_INVITE_EXPIRY_DAYS = 7
const DEFAULT_TRUST_CENTER_SHARE_EXPIRY_DAYS = 30
const MAX_TRUST_CENTER_SHARE_EXPIRY_DAYS = 365
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf"
])

const LIVE_QUESTION_ACTIONS = new Set(["accepted", "edited", "new_answer_needed"])
const ORG_ROLES = new Set(["ADMIN", "EDITOR", "REVIEWER", "VIEWER"])
const UPLOAD_ROLES = new Set(["ADMIN", "EDITOR"])
const ANSWER_EDIT_ROLES = new Set(["ADMIN", "EDITOR"])
const REVIEW_ROLES = new Set(["ADMIN", "REVIEWER"])
const LIVE_QUESTION_ROLES = new Set(["ADMIN", "EDITOR", "REVIEWER"])
const REQUEUE_ROLES = new Set(["ADMIN", "REVIEWER"])

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  })
}

function parseAuthHeader(request: Request) {
  const header = request.headers.get("authorization")
  if (!header) return null
  const [, token] = header.split(" ")
  return token ?? null
}

async function parseJsonBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function normalizeDomain(value?: string | null) {
  return value?.trim().toLowerCase() ?? null
}

function getEmailDomain(email?: string | null) {
  if (!email) return null
  const [, domain] = email.split("@")
  return domain?.toLowerCase() ?? null
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function lexicalSimilarity(a: string, b: string) {
  const aTokens = new Set(tokenize(a))
  const bTokens = new Set(tokenize(b))
  if (aTokens.size === 0 || bTokens.size === 0) return 0
  let intersection = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1
  }
  const union = aTokens.size + bTokens.size - intersection
  return intersection / union
}

function daysSince(dateValue?: string | null) {
  if (!dateValue) return 365
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return 365
  const diff = Date.now() - date.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function getPeriodStart(date: Date) {
  const period = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  return period.toISOString().slice(0, 10)
}

function clampScore(score: number) {
  if (Number.isNaN(score)) return 0
  return Math.max(0, Math.min(1, score))
}

function scoreToBucket(score: number) {
  const normalized = clampScore(score)
  if (normalized >= 0.85) return "AUTO_FILL"
  if (normalized >= 0.6) return "NEEDS_REVIEW"
  return "MANUAL"
}

function computeConfidenceScore(inputs: {
  vectorSimilarity: number
  lexicalOverlap: number
  scopeMatch: boolean
  freshnessDays: number
  acceptanceRate: number
}) {
  const vectorWeight = 0.4
  const lexicalWeight = 0.25
  const scopeWeight = 0.2
  const freshnessWeight = 0.1
  const historyWeight = 0.05

  const scopeScore = inputs.scopeMatch ? 1 : 0
  const freshnessScore = Math.max(0, 1 - inputs.freshnessDays / 365)

  const score =
    inputs.vectorSimilarity * vectorWeight +
    inputs.lexicalOverlap * lexicalWeight +
    scopeScore * scopeWeight +
    freshnessScore * freshnessWeight +
    inputs.acceptanceRate * historyWeight

  return clampScore(score)
}

export function createHandlers({
  supabase,
  qstash,
  now = () => new Date(),
  maxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES,
  maxOrgActiveJobs = DEFAULT_MAX_ORG_ACTIVE_JOBS,
  uploadRetentionDays = DEFAULT_UPLOAD_RETENTION_DAYS,
  signedUploadExpiresInSeconds = DEFAULT_SIGNED_UPLOAD_TTL_SECONDS
}: HandlerDependencies) {
  async function enqueueJob(payload: Record<string, unknown>) {
    if (!qstash.url || !qstash.token) return
    await fetch(qstash.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${qstash.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
  }

  async function requireUser(request: Request) {
    const token = parseAuthHeader(request)
    if (!token) return null
    const { data } = await supabase.auth.getUser(token)
    return data.user ?? null
  }

  async function requireWorkspaceMembership(userId: string, workspaceId: string) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, org_id")
      .eq("id", workspaceId)
      .single()

    if (!workspace) return null

    const { data: orgMembership } = await supabase
      .from("org_memberships")
      .select("id, role")
      .eq("org_id", workspace.org_id)
      .eq("user_id", userId)
      .maybeSingle()

    if (!orgMembership) return null

    const features = await getOrgFeatures(workspace.org_id)
    if (features.consultant_mode_enabled) {
      const { data: workspaceMembership } = await supabase
        .from("workspace_memberships")
        .select("id, role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle()

      if (!workspaceMembership) return null
      return { orgId: workspace.org_id, role: workspaceMembership.role }
    }

    return { orgId: workspace.org_id, role: orgMembership.role }
  }

  async function requireOrgMembership(userId: string, orgId: string) {
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("id, role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!membership) return null

    return { orgId, role: membership.role }
  }

  async function getOrgLimits(orgId: string) {
    const { data } = await supabase
      .from("org_limits")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle()

    return data
  }

  async function getOrgFeatures(orgId: string) {
    const { data } = await supabase
      .from("org_features")
      .select("trust_center_enabled, consultant_mode_enabled")
      .eq("org_id", orgId)
      .maybeSingle()

    return {
      trust_center_enabled: data?.trust_center_enabled ?? false,
      consultant_mode_enabled: data?.consultant_mode_enabled ?? false
    }
  }

  async function enforceSso(user: { email?: string | null }, orgId: string) {
    const { data } = await supabase
      .from("org_sso_settings")
      .select("enabled, domain")
      .eq("org_id", orgId)
      .maybeSingle()

    if (!data?.enabled) return null
    const requiredDomain = normalizeDomain(data.domain)
    if (!requiredDomain) return null
    const userDomain = getEmailDomain(user.email)
    if (!userDomain || userDomain !== requiredDomain) {
      return jsonResponse(403, {
        error: { code: "SSO_REQUIRED", message: "SSO domain mismatch" }
      })
    }
    return null
  }

  async function requireOrgAccess(user: { id: string; email?: string | null }, orgId: string) {
    const membership = await requireOrgMembership(user.id, orgId)
    if (!membership) {
      return { membership: null, error: jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } }) }
    }
    const ssoError = await enforceSso(user, orgId)
    if (ssoError) {
      return { membership: null, error: ssoError }
    }
    return { membership, error: null }
  }

  async function requireWorkspaceAccess(user: { id: string; email?: string | null }, workspaceId: string) {
    const membership = await requireWorkspaceMembership(user.id, workspaceId)
    if (!membership) {
      return { membership: null, error: jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } }) }
    }
    const ssoError = await enforceSso(user, membership.orgId)
    if (ssoError) {
      return { membership: null, error: ssoError }
    }
    return { membership, error: null }
  }

  async function recordAuditEvent(input: {
    orgId: string
    workspaceId?: string | null
    actorUserId?: string | null
    eventType: string
    entityType: string
    entityId: string
    payload?: Record<string, unknown>
  }) {
    await supabase.from("audit_events").insert({
      org_id: input.orgId,
      workspace_id: input.workspaceId ?? null,
      actor_user_id: input.actorUserId ?? null,
      event_type: input.eventType,
      entity_type: input.entityType,
      entity_id: input.entityId,
      payload: input.payload ?? {}
    })
  }

  function requireRole(role: string, allowed: Set<string>, message: string) {
    if (!allowed.has(role)) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message } })
    }
    return null
  }

  async function checkOrgCapacity(orgId: string, maxActiveJobs: number) {
    const { count, error } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["QUEUED", "RUNNING"])

    if (error) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: error.message }
      })
    }

    if ((count ?? 0) >= maxActiveJobs) {
      return jsonResponse(429, {
        error: {
          code: "RATE_LIMITED",
          message: "Job queue is at capacity for this organization"
        }
      })
    }

    return null
  }

  function computeExpiry(days: number) {
    return new Date(now().getTime() + days * 24 * 60 * 60 * 1000).toISOString()
  }

  function buildUploadPath(orgId: string, questionnaireId: string, fileName: string) {
    const safeFileName = sanitizeFileName(fileName)
    return `org/${orgId}/questionnaires/${questionnaireId}/${safeFileName}`
  }

  function validateCreateQuestionnaireInput(payload: Record<string, unknown>, maxBytes: number) {
    const errors: string[] = []
    const questionnaireId = payload.questionnaire_id
    const workspaceId = payload.workspace_id
    const title = payload.title
    const inputFile = payload.input_file

    if (
      questionnaireId !== undefined &&
      (!isNonEmptyString(questionnaireId) || questionnaireId.length === 0)
    ) {
      errors.push("questionnaire_id must be a non-empty string")
    }
    if (!isNonEmptyString(workspaceId)) {
      errors.push("workspace_id is required")
    }
    if (!isNonEmptyString(title)) {
      errors.push("title is required")
    }
    if (!inputFile || typeof inputFile !== "object") {
      errors.push("input_file is required")
    }

    if (inputFile && typeof inputFile === "object") {
      const bucket = inputFile.bucket
      const path = inputFile.path
      const fileName = inputFile.file_name
      const mimeType = inputFile.mime_type
      const checksum = inputFile.checksum_sha256
      const sizeBytes = inputFile.size_bytes
      if (!isNonEmptyString(bucket)) errors.push("input_file.bucket is required")
      if (!isNonEmptyString(path)) errors.push("input_file.path is required")
      if (!isNonEmptyString(fileName)) errors.push("input_file.file_name is required")
      if (!isNonEmptyString(mimeType)) errors.push("input_file.mime_type is required")
      if (
        isNonEmptyString(mimeType) &&
        !ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)
      ) {
        errors.push("input_file.mime_type must be XLSX, DOCX, or PDF")
      }
      if (typeof sizeBytes !== "number" || sizeBytes <= 0) {
        errors.push("input_file.size_bytes must be a positive number")
      }
      if (typeof sizeBytes === "number" && sizeBytes > maxBytes) {
        errors.push("input_file.size_bytes exceeds max file size")
      }
      if (!isNonEmptyString(checksum)) {
        errors.push("input_file.checksum_sha256 is required")
      }
    }

    return { valid: errors.length === 0, errors }
  }

  function validateSignedUploadInput(payload: Record<string, unknown>, maxBytes: number) {
    const errors: string[] = []
    const workspaceId = payload.workspace_id
    const questionnaireId = payload.questionnaire_id
    const inputFile = payload.input_file

    if (!isNonEmptyString(workspaceId)) {
      errors.push("workspace_id is required")
    }
    if (
      questionnaireId !== undefined &&
      (!isNonEmptyString(questionnaireId) || questionnaireId.length === 0)
    ) {
      errors.push("questionnaire_id must be a non-empty string")
    }
    if (!inputFile || typeof inputFile !== "object") {
      errors.push("input_file is required")
    } else {
      const fileName = inputFile.file_name
      const mimeType = inputFile.mime_type
      const sizeBytes = inputFile.size_bytes
      if (!isNonEmptyString(fileName)) errors.push("input_file.file_name is required")
      if (!isNonEmptyString(mimeType)) errors.push("input_file.mime_type is required")
      if (
        isNonEmptyString(mimeType) &&
        !ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)
      ) {
        errors.push("input_file.mime_type must be XLSX, DOCX, or PDF")
      }
      if (typeof sizeBytes !== "number" || sizeBytes <= 0) {
        errors.push("input_file.size_bytes must be a positive number")
      }
      if (typeof sizeBytes === "number" && sizeBytes > maxBytes) {
        errors.push("input_file.size_bytes exceeds max file size")
      }
    }

    return { valid: errors.length === 0, errors }
  }

  function validateLiveQuestionInput(payload: Record<string, unknown>) {
    const errors: string[] = []
    const workspaceId = payload.workspace_id
    const questionText = payload.question_text
    const context = payload.context
    const constraints = payload.constraints

    if (!isNonEmptyString(workspaceId)) {
      errors.push("workspace_id is required")
    }
    if (!isNonEmptyString(questionText)) {
      errors.push("question_text is required")
    }
    if (context !== undefined && (typeof context !== "object" || context === null)) {
      errors.push("context must be an object")
    }
    if (constraints !== undefined && (typeof constraints !== "object" || constraints === null)) {
      errors.push("constraints must be an object")
    }

    return { valid: errors.length === 0, errors }
  }

  function validateLiveQuestionMapInput(payload: Record<string, unknown>) {
    const errors: string[] = []
    const liveQuestionId = payload.live_question_id
    const action = payload.action
    const selectedAnswerId = payload.selected_answer_id
    const finalText = payload.final_text

    if (!isNonEmptyString(liveQuestionId)) {
      errors.push("live_question_id is required")
    }
    if (!isNonEmptyString(action) || !LIVE_QUESTION_ACTIONS.has(action)) {
      errors.push("action must be accepted, edited, or new_answer_needed")
    }
    if (
      isNonEmptyString(action) &&
      (action === "accepted" || action === "edited") &&
      !isNonEmptyString(selectedAnswerId)
    ) {
      errors.push("selected_answer_id is required for accepted or edited")
    }
    if (
      isNonEmptyString(action) &&
      action === "edited" &&
      (finalText === undefined || !isNonEmptyString(finalText))
    ) {
      errors.push("final_text is required for edited action")
    }

    return { valid: errors.length === 0, errors }
  }

  function validateMergeInput(payload: Record<string, unknown>) {
    const errors: string[] = []
    const targetAnswerId = payload.target_answer_id
    if (!isNonEmptyString(targetAnswerId)) {
      errors.push("target_answer_id is required")
    }
    return { valid: errors.length === 0, errors }
  }

  function normalizeEmail(email: string) {
    return email.trim().toLowerCase()
  }

  function parseOptionalNumber(value: unknown) {
    if (value === null || value === undefined || value === "") return null
    const parsed = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(parsed)) return null
    return parsed
  }

  function validateOnboardingInput(payload: Record<string, unknown>) {
    const errors: string[] = []
    if (!isNonEmptyString(payload.org_name)) {
      errors.push("org_name is required")
    }
    if (!isNonEmptyString(payload.workspace_name)) {
      errors.push("workspace_name is required")
    }
    return { valid: errors.length === 0, errors }
  }

  function validateWorkspaceInput(payload: Record<string, unknown>) {
    const errors: string[] = []
    if (!isNonEmptyString(payload.org_id)) {
      errors.push("org_id is required")
    }
    if (!isNonEmptyString(payload.name)) {
      errors.push("name is required")
    }
    return { valid: errors.length === 0, errors }
  }

  function validateInviteInput(payload: Record<string, unknown>) {
    const errors: string[] = []
    if (!isNonEmptyString(payload.email)) {
      errors.push("email is required")
    }
    if (!isNonEmptyString(payload.role) || !ORG_ROLES.has(payload.role)) {
      errors.push("role must be ADMIN, EDITOR, REVIEWER, or VIEWER")
    }
    if (
      payload.expires_in_days !== undefined &&
      (typeof payload.expires_in_days !== "number" || payload.expires_in_days <= 0)
    ) {
      errors.push("expires_in_days must be a positive number")
    }
    return { valid: errors.length === 0, errors }
  }

  async function handleGetMe(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("org_memberships")
      .select("org_id, role")
      .eq("user_id", user.id)

    if (membershipError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: membershipError.message } })
    }

    const orgIds = (memberships ?? []).map((row: { org_id: string }) => row.org_id)
    if (orgIds.length === 0) {
      return jsonResponse(200, {
        user: { id: user.id, email: user.email ?? null },
        memberships: [],
        orgs: [],
        workspaces: [],
        features: {}
      })
    }

    const { data: orgs, error: orgError } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds)

    if (orgError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: orgError.message } })
    }

    const { data: workspaces, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, org_id, name")
      .in("org_id", orgIds)

    if (workspaceError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: workspaceError.message } })
    }

    const { data: features, error: featureError } = await supabase
      .from("org_features")
      .select("org_id, trust_center_enabled, consultant_mode_enabled")
      .in("org_id", orgIds)

    if (featureError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: featureError.message } })
    }

    const consultantOrgIds = new Set(
      (features ?? [])
        .filter((feature: { consultant_mode_enabled: boolean }) => feature.consultant_mode_enabled)
        .map((feature: { org_id: string }) => feature.org_id)
    )

    let workspaceMembershipIds = new Set<string>()
    if (consultantOrgIds.size > 0) {
      const { data: workspaceMemberships, error: workspaceMembershipError } = await supabase
        .from("workspace_memberships")
        .select("workspace_id")
        .eq("user_id", user.id)

      if (workspaceMembershipError) {
        return jsonResponse(500, {
          error: { code: "INTERNAL_ERROR", message: workspaceMembershipError.message }
        })
      }

      workspaceMembershipIds = new Set(
        (workspaceMemberships ?? []).map((row: { workspace_id: string }) => row.workspace_id)
      )
    }

    const orgNameMap = new Map(
      (orgs ?? []).map((org: { id: string; name: string }) => [org.id, org.name])
    )
    const workspaceList = (workspaces ?? [])
      .filter((workspace: { id: string; org_id: string }) => {
        if (!consultantOrgIds.has(workspace.org_id)) return true
        return workspaceMembershipIds.has(workspace.id)
      })
      .map((workspace: { id: string; org_id: string; name: string }) => ({
        id: workspace.id,
        org_id: workspace.org_id,
        name: workspace.name,
        org_name: orgNameMap.get(workspace.org_id) ?? "Unknown org"
      }))
    const featureMap = (features ?? []).reduce<Record<string, { trust_center_enabled: boolean; consultant_mode_enabled: boolean }>>(
      (acc, feature: { org_id: string; trust_center_enabled: boolean; consultant_mode_enabled: boolean }) => {
        acc[feature.org_id] = {
          trust_center_enabled: feature.trust_center_enabled ?? false,
          consultant_mode_enabled: feature.consultant_mode_enabled ?? false
        }
        return acc
      },
      {}
    )

    return jsonResponse(200, {
      user: { id: user.id, email: user.email ?? null },
      memberships: memberships ?? [],
      orgs: orgs ?? [],
      workspaces: workspaceList,
      features: featureMap
    })
  }

  async function handleOnboarding(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON payload" }
      })
    }

    const validation = validateOnboardingInput(payload)
    if (!validation.valid) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid input", details: validation.errors }
      })
    }

    const orgName = (payload.org_name as string).trim()
    const workspaceName = (payload.workspace_name as string).trim()

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: orgName })
      .select("id, name")
      .single()

    if (orgError || !org) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: orgError?.message ?? "org create failed" }
      })
    }

    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .insert({ org_id: org.id, name: workspaceName })
      .select("id, org_id, name")
      .single()

    if (workspaceError || !workspace) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: workspaceError?.message ?? "workspace create failed" }
      })
    }

    await supabase.from("org_memberships").insert({
      org_id: org.id,
      user_id: user.id,
      role: "ADMIN"
    })

    await supabase.from("workspace_memberships").insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: "ADMIN"
    })

    await supabase.from("org_limits").insert({ org_id: org.id })
    await supabase.from("org_sso_settings").insert({ org_id: org.id, enabled: false })
    await supabase.from("org_features").insert({
      org_id: org.id,
      trust_center_enabled: false,
      consultant_mode_enabled: false
    })

    await recordAuditEvent({
      orgId: org.id,
      actorUserId: user.id,
      eventType: "organization.created",
      entityType: "organization",
      entityId: org.id,
      payload: { name: orgName }
    })

    await recordAuditEvent({
      orgId: org.id,
      workspaceId: workspace.id,
      actorUserId: user.id,
      eventType: "workspace.created",
      entityType: "workspace",
      entityId: workspace.id,
      payload: { name: workspaceName }
    })

    return jsonResponse(200, {
      org,
      workspace,
      role: "ADMIN"
    })
  }

  async function handleCreateWorkspace(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON payload" }
      })
    }

    const validation = validateWorkspaceInput(payload)
    if (!validation.valid) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid input", details: validation.errors }
      })
    }

    const orgId = payload.org_id as string
    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const workspaceName = (payload.name as string).trim()
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .insert({ org_id: orgId, name: workspaceName })
      .select("id, org_id, name")
      .single()

    if (workspaceError || !workspace) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: workspaceError?.message ?? "workspace create failed" }
      })
    }

    const { data: members } = await supabase
      .from("org_memberships")
      .select("user_id, role")
      .eq("org_id", orgId)

    const memberRows = (members ?? []).map((row: { user_id: string; role: string }) => ({
      workspace_id: workspace.id,
      user_id: row.user_id,
      role: row.role
    }))

    if (memberRows.length > 0) {
      await supabase.from("workspace_memberships").insert(memberRows)
    }

    await recordAuditEvent({
      orgId,
      workspaceId: workspace.id,
      actorUserId: user.id,
      eventType: "workspace.created",
      entityType: "workspace",
      entityId: workspace.id,
      payload: { name: workspaceName }
    })

    return jsonResponse(200, { workspace })
  }

  async function handleListWorkspaceMembers(request: Request, workspaceId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, org_id")
      .eq("id", workspaceId)
      .single()

    if (!workspace) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Workspace not found" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, workspace.org_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const { data: members, error: memberError } = await supabase
      .from("workspace_memberships")
      .select("user_id, role, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })

    if (memberError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: memberError.message } })
    }

    return jsonResponse(200, { members: members ?? [] })
  }

  async function handleAddWorkspaceMember(request: Request, workspaceId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload || !isNonEmptyString(payload.user_id)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "user_id is required" }
      })
    }

    const requestedRole = isNonEmptyString(payload.role) ? String(payload.role) : null
    if (requestedRole && !ORG_ROLES.has(requestedRole)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "role must be a valid org role" }
      })
    }

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, org_id")
      .eq("id", workspaceId)
      .single()

    if (!workspace) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Workspace not found" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, workspace.org_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const targetUserId = payload.user_id as string
    const { data: orgMember } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", workspace.org_id)
      .eq("user_id", targetUserId)
      .maybeSingle()

    if (!orgMember) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Org member not found" } })
    }

    const { data: existing } = await supabase
      .from("workspace_memberships")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetUserId)
      .maybeSingle()

    if (existing) {
      return jsonResponse(409, { error: { code: "CONFLICT", message: "Member already added" } })
    }

    const roleToAssign = requestedRole ?? orgMember.role
    const { data: added, error: insertError } = await supabase
      .from("workspace_memberships")
      .insert({
        workspace_id: workspaceId,
        user_id: targetUserId,
        role: roleToAssign
      })
      .select("user_id, role, created_at")
      .single()

    if (insertError || !added) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: insertError?.message ?? "Insert failed" }
      })
    }

    await recordAuditEvent({
      orgId: workspace.org_id,
      workspaceId,
      actorUserId: user.id,
      eventType: "workspace_member.added",
      entityType: "workspace_membership",
      entityId: targetUserId,
      payload: {}
    })

    return jsonResponse(200, { member: added })
  }

  async function handleUpdateWorkspaceMemberRole(
    request: Request,
    workspaceId: string,
    memberUserId: string
  ) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload || !isNonEmptyString(payload.role)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "role is required" }
      })
    }

    const nextRole = String(payload.role)
    if (!ORG_ROLES.has(nextRole)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "role must be a valid org role" }
      })
    }

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, org_id")
      .eq("id", workspaceId)
      .single()

    if (!workspace) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Workspace not found" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, workspace.org_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const { data: updated, error: updateError } = await supabase
      .from("workspace_memberships")
      .update({ role: nextRole })
      .eq("workspace_id", workspaceId)
      .eq("user_id", memberUserId)
      .select("user_id, role, created_at")
      .maybeSingle()

    if (updateError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: updateError.message } })
    }
    if (!updated) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Member not found" } })
    }

    await recordAuditEvent({
      orgId: workspace.org_id,
      workspaceId,
      actorUserId: user.id,
      eventType: "workspace.member_role_updated",
      entityType: "workspace_membership",
      entityId: `${workspaceId}:${memberUserId}`,
      payload: { role: nextRole }
    })

    return jsonResponse(200, { member: updated })
  }

  async function handleRemoveWorkspaceMember(request: Request, workspaceId: string, userId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, org_id")
      .eq("id", workspaceId)
      .single()

    if (!workspace) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Workspace not found" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, workspace.org_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const { data: existing } = await supabase
      .from("workspace_memberships")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!existing) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Member not found" } })
    }

    await supabase
      .from("workspace_memberships")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)

    await recordAuditEvent({
      orgId: workspace.org_id,
      workspaceId,
      actorUserId: user.id,
      eventType: "workspace_member.removed",
      entityType: "workspace_membership",
      entityId: userId,
      payload: {}
    })

    return jsonResponse(200, { ok: true })
  }

  async function handleListMembers(request: Request, orgId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const { data: members, error } = await supabase
      .from("org_memberships")
      .select("user_id, role, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })

    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    return jsonResponse(200, { members: members ?? [] })
  }

  async function handleUpdateMemberRole(request: Request, orgId: string, userId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const payload = await parseJsonBody(request)
    if (!payload || !isNonEmptyString(payload.role) || !ORG_ROLES.has(payload.role)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "role must be ADMIN, EDITOR, REVIEWER, or VIEWER" }
      })
    }

    const { data: existing } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!existing) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Member not found" } })
    }

    const { data: updated, error: updateError } = await supabase
      .from("org_memberships")
      .update({ role: payload.role })
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .select("user_id, role")
      .single()

    if (updateError || !updated) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: updateError?.message ?? "Update failed" }
      })
    }

    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id")
      .eq("org_id", orgId)
    const workspaceIds = (workspaces ?? []).map((row: { id: string }) => row.id)
    if (workspaceIds.length > 0) {
      await supabase
        .from("workspace_memberships")
        .update({ role: payload.role })
        .eq("user_id", userId)
        .in("workspace_id", workspaceIds)
    }

    await recordAuditEvent({
      orgId,
      actorUserId: user.id,
      eventType: "org_member.role_updated",
      entityType: "org_membership",
      entityId: userId,
      payload: { from: existing.role, to: payload.role }
    })

    return jsonResponse(200, { member: updated })
  }

  async function handleRemoveMember(request: Request, orgId: string, userId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const { data: existing } = await supabase
      .from("org_memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!existing) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Member not found" } })
    }

    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id")
      .eq("org_id", orgId)
    const workspaceIds = (workspaces ?? []).map((row: { id: string }) => row.id)
    if (workspaceIds.length > 0) {
      await supabase
        .from("workspace_memberships")
        .delete()
        .eq("user_id", userId)
        .in("workspace_id", workspaceIds)
    }

    await supabase
      .from("org_memberships")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", userId)

    await recordAuditEvent({
      orgId,
      actorUserId: user.id,
      eventType: "org_member.removed",
      entityType: "org_membership",
      entityId: userId,
      payload: {}
    })

    return jsonResponse(200, { ok: true })
  }

  async function handleListInvites(request: Request, orgId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const { data: invites, error } = await supabase
      .from("org_invites")
      .select("id, email, role, token, expires_at, created_at, accepted_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })

    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    return jsonResponse(200, { invites: invites ?? [] })
  }

  async function handleCreateInvite(request: Request, orgId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const payload = await parseJsonBody(request)
    if (!payload) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON payload" }
      })
    }

    const validation = validateInviteInput(payload)
    if (!validation.valid) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid input", details: validation.errors }
      })
    }

    const email = normalizeEmail(payload.email as string)
    const role = payload.role as string
    const expiresIn = (payload.expires_in_days as number | undefined) ?? DEFAULT_INVITE_EXPIRY_DAYS
    const token = crypto.randomUUID()
    const expiresAt = new Date(now().getTime() + expiresIn * 24 * 60 * 60 * 1000).toISOString()

    const { data: invite, error } = await supabase
      .from("org_invites")
      .insert({
        org_id: orgId,
        email,
        role,
        token,
        expires_at: expiresAt,
        created_by: user.id
      })
      .select("id, email, role, token, expires_at, created_at, accepted_at")
      .single()

    if (error || !invite) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: error?.message ?? "invite create failed" }
      })
    }

    await recordAuditEvent({
      orgId,
      actorUserId: user.id,
      eventType: "org.invite_created",
      entityType: "org_invite",
      entityId: invite.id,
      payload: { email, role, expires_at: expiresAt }
    })

    return jsonResponse(200, { invite })
  }

  async function handleAcceptInvite(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload || !isNonEmptyString(payload.token)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "token is required" }
      })
    }

    const token = payload.token as string
    const { data: invite } = await supabase
      .from("org_invites")
      .select("*")
      .eq("token", token)
      .maybeSingle()

    if (!invite) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Invite not found" } })
    }
    if (invite.accepted_at) {
      return jsonResponse(409, { error: { code: "CONFLICT", message: "Invite already accepted" } })
    }
    const expiresAt = new Date(invite.expires_at)
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < now().getTime()) {
      return jsonResponse(400, { error: { code: "VALIDATION_ERROR", message: "Invite expired" } })
    }
    if (invite.email && user.email && normalizeEmail(invite.email) !== normalizeEmail(user.email)) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Invite email mismatch" } })
    }

    const { data: existingMembership } = await supabase
      .from("org_memberships")
      .select("id, role")
      .eq("org_id", invite.org_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!existingMembership) {
      await supabase.from("org_memberships").insert({
        org_id: invite.org_id,
        user_id: user.id,
        role: invite.role
      })
    }

    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id")
      .eq("org_id", invite.org_id)

    const workspaceIds = (workspaces ?? []).map((row: { id: string }) => row.id)
    if (workspaceIds.length > 0) {
      const { data: existingWorkspaceMemberships } = await supabase
        .from("workspace_memberships")
        .select("workspace_id")
        .eq("user_id", user.id)
        .in("workspace_id", workspaceIds)

      const existingWorkspaceIds = new Set(
        (existingWorkspaceMemberships ?? []).map((row: { workspace_id: string }) => row.workspace_id)
      )
      const newWorkspaceMemberships = workspaceIds
        .filter((id: string) => !existingWorkspaceIds.has(id))
        .map((workspaceId: string) => ({
          workspace_id: workspaceId,
          user_id: user.id,
          role: invite.role
        }))
      if (newWorkspaceMemberships.length > 0) {
        await supabase.from("workspace_memberships").insert(newWorkspaceMemberships)
      }
    }

    await supabase
      .from("org_invites")
      .update({ accepted_at: now().toISOString(), accepted_by: user.id })
      .eq("id", invite.id)

    await recordAuditEvent({
      orgId: invite.org_id,
      actorUserId: user.id,
      eventType: "org.invite_accepted",
      entityType: "org_invite",
      entityId: invite.id,
      payload: { email: invite.email, role: invite.role }
    })

    return jsonResponse(200, { org_id: invite.org_id, role: invite.role })
  }

  async function handleGetOrgSettings(request: Request, orgId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const { data: limits } = await supabase
      .from("org_limits")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle()
    const { data: sso } = await supabase
      .from("org_sso_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle()
    const { data: features } = await supabase
      .from("org_features")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle()

    return jsonResponse(200, {
      limits: limits ?? null,
      sso: sso ?? null,
      features: features ?? null
    })
  }

  async function handleGetOrgUsage(request: Request, orgId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const periodStart = getPeriodStart(now())
    const periodStartDate = new Date(`${periodStart}T00:00:00.000Z`)
    const periodEndDate = new Date(Date.UTC(periodStartDate.getUTCFullYear(), periodStartDate.getUTCMonth() + 1, 1))
    const { data: usageEvents } = await supabase
      .from("token_usage_events")
      .select("tokens_in, tokens_out")
      .eq("org_id", orgId)
      .gte("created_at", periodStartDate.toISOString())
      .lt("created_at", periodEndDate.toISOString())

    const { data: limits } = await supabase
      .from("org_limits")
      .select("monthly_token_budget")
      .eq("org_id", orgId)
      .maybeSingle()

    const tokensIn = (usageEvents ?? []).reduce(
      (sum: number, row: { tokens_in?: number }) => sum + (row.tokens_in ?? 0),
      0
    )
    const tokensOut = (usageEvents ?? []).reduce(
      (sum: number, row: { tokens_out?: number }) => sum + (row.tokens_out ?? 0),
      0
    )
    const tokensUsed = tokensIn + tokensOut
    const budget = limits?.monthly_token_budget ?? null
    const budgetRemaining = budget !== null ? Math.max(0, budget - tokensUsed) : null

    return jsonResponse(200, {
      period_start: periodStart,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      tokens_used: tokensUsed,
      monthly_token_budget: budget,
      budget_remaining: budgetRemaining
    })
  }

  async function handleOrgWorkspaceReports(request: Request, orgId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const { data: workspaces, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("org_id", orgId)
      .order("name", { ascending: true })

    if (workspaceError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: workspaceError.message } })
    }

    const { data: questionnaires, error: questionnaireError } = await supabase
      .from("questionnaires")
      .select("workspace_id, status, updated_at")
      .eq("org_id", orgId)

    if (questionnaireError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: questionnaireError.message } })
    }

    const { data: suggestions, error: suggestionError } = await supabase
      .from("suggestions")
      .select("workspace_id, confidence_bucket")
      .eq("org_id", orgId)

    if (suggestionError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: suggestionError.message } })
    }

    const { data: answers, error: answerError } = await supabase
      .from("answers")
      .select("workspace_id, status")
      .eq("org_id", orgId)
      .eq("status", "APPROVED")

    if (answerError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: answerError.message } })
    }

    const reportMap = new Map<string, {
      id: string
      name: string
      questionnaires_total: number
      questionnaires_completed: number
      questionnaires_in_review: number
      questionnaires_failed: number
      suggestions_total: number
      auto_fill: number
      needs_review: number
      manual: number
      approved_answers: number
      last_activity_at: string | null
    }>()

    for (const workspace of workspaces ?? []) {
      reportMap.set(workspace.id, {
        id: workspace.id,
        name: workspace.name ?? "Workspace",
        questionnaires_total: 0,
        questionnaires_completed: 0,
        questionnaires_in_review: 0,
        questionnaires_failed: 0,
        suggestions_total: 0,
        auto_fill: 0,
        needs_review: 0,
        manual: 0,
        approved_answers: 0,
        last_activity_at: null
      })
    }

    for (const row of questionnaires ?? []) {
      const record = reportMap.get(row.workspace_id)
      if (!record) continue
      record.questionnaires_total += 1
      if (row.status === "COMPLETED") {
        record.questionnaires_completed += 1
      } else if (row.status === "FAILED") {
        record.questionnaires_failed += 1
      } else if (row.status === "READY_FOR_REVIEW") {
        record.questionnaires_in_review += 1
      }
      if (row.updated_at) {
        const updatedAt = new Date(row.updated_at).toISOString()
        if (!record.last_activity_at || updatedAt > record.last_activity_at) {
          record.last_activity_at = updatedAt
        }
      }
    }

    for (const row of suggestions ?? []) {
      const record = reportMap.get(row.workspace_id)
      if (!record) continue
      record.suggestions_total += 1
      if (row.confidence_bucket === "AUTO_FILL") record.auto_fill += 1
      if (row.confidence_bucket === "NEEDS_REVIEW") record.needs_review += 1
      if (row.confidence_bucket === "MANUAL") record.manual += 1
    }

    for (const row of answers ?? []) {
      const record = reportMap.get(row.workspace_id)
      if (!record) continue
      record.approved_answers += 1
    }

    const reports = Array.from(reportMap.values()).map((record) => {
      const autoFillRate =
        record.suggestions_total > 0
          ? Number((record.auto_fill / record.suggestions_total).toFixed(2))
          : 0
      const timeSavedHours = Number(
        ((record.auto_fill * TIME_SAVED_MINUTES_PER_AUTOFILL) / 60).toFixed(2)
      )
      return {
        workspace_id: record.id,
        name: record.name,
        counts: {
          questionnaires_total: record.questionnaires_total,
          questionnaires_completed: record.questionnaires_completed,
          questionnaires_in_review: record.questionnaires_in_review,
          questionnaires_failed: record.questionnaires_failed,
          suggestions_total: record.suggestions_total,
          auto_fill: record.auto_fill,
          needs_review: record.needs_review,
          manual: record.manual,
          approved_answers: record.approved_answers
        },
        auto_fill_rate: autoFillRate,
        time_saved_hours: timeSavedHours,
        last_activity_at: record.last_activity_at
      }
    })

    return jsonResponse(200, { workspaces: reports })
  }

  async function handleCreateReportExport(request: Request, orgId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const payload = await parseJsonBody(request)
    if (!payload || !isNonEmptyString(payload.format)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "format is required" }
      })
    }

    const format = String(payload.format).toLowerCase()
    if (!["csv", "pdf"].includes(format)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "format must be csv or pdf" }
      })
    }

    const workspaceId = isNonEmptyString(payload.workspace_id) ? payload.workspace_id : null

    let jobWorkspaceId = workspaceId
    if (!jobWorkspaceId) {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("id")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!workspace) {
        return jsonResponse(400, {
          error: { code: "VALIDATION_ERROR", message: "workspace_id is required" }
        })
      }
      jobWorkspaceId = workspace.id
    }

    const reportExportId = crypto.randomUUID()
    const jobId = crypto.randomUUID()

    const { data: reportExport, error: exportError } = await supabase
      .from("report_exports")
      .insert({
        id: reportExportId,
        org_id: orgId,
        workspace_id: workspaceId,
        job_id: jobId,
        format,
        status: "QUEUED",
        created_by: user.id
      })
      .select("*")
      .single()

    if (exportError || !reportExport) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: exportError?.message ?? "Insert failed" } })
    }

    const { error: jobError } = await supabase
      .from("jobs")
      .insert({
        id: jobId,
        org_id: orgId,
        workspace_id: jobWorkspaceId,
        job_type: "EXPORT_REPORT",
        status: "QUEUED",
        payload: {
          job_id: jobId,
          org_id: orgId,
          workspace_id: jobWorkspaceId,
          report_export_id: reportExportId,
          format,
          type: "EXPORT_REPORT"
        }
      })

    if (jobError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: jobError.message } })
    }

    await enqueueJob({
      job_id: jobId,
      org_id: orgId,
      workspace_id: jobWorkspaceId,
      report_export_id: reportExportId,
      format,
      type: "EXPORT_REPORT"
    })

    await recordAuditEvent({
      orgId,
      workspaceId,
      actorUserId: user.id,
      eventType: "report.export_requested",
      entityType: "report_export",
      entityId: reportExportId,
      payload: { format }
    })

    return jsonResponse(200, { report_export: reportExport, job_id: jobId })
  }

  async function handleListReportExports(request: Request, orgId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const url = new URL(request.url)
    const workspaceId = url.searchParams.get("workspace_id")

    let query = supabase
      .from("report_exports")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }

    const { data: exports, error } = await query

    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    const exportsWithUrls = await Promise.all(
      (exports ?? []).map(async (row: Record<string, unknown>) => {
        if (!row.storage_bucket || !row.storage_path) {
          return { ...row, signed_url: null }
        }
        const { data } = await supabase.storage
          .from(row.storage_bucket as string)
          .createSignedUrl(row.storage_path as string, 3600)
        return { ...row, signed_url: data?.signedUrl ?? null }
      })
    )

    return jsonResponse(200, { exports: exportsWithUrls })
  }

  async function handleUpdateOrgSettings(request: Request, orgId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { membership, error: accessError } = await requireOrgAccess(user, orgId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const payload = await parseJsonBody(request)
    if (!payload) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON payload" }
      })
    }

    const errors: string[] = []
    const limits = payload.limits as Record<string, unknown> | undefined
    const sso = payload.sso as Record<string, unknown> | undefined
    const features = payload.features as Record<string, unknown> | undefined

    const parsedLimits = limits
      ? {
          max_upload_bytes: parseOptionalNumber(limits.max_upload_bytes),
          max_questions: parseOptionalNumber(limits.max_questions),
          max_active_jobs: parseOptionalNumber(limits.max_active_jobs),
          monthly_token_budget: parseOptionalNumber(limits.monthly_token_budget)
        }
      : null

    if (parsedLimits) {
      for (const [key, value] of Object.entries(parsedLimits)) {
        if (value !== null && value <= 0) {
          errors.push(`${key} must be positive`)
        }
      }
    }

    if (sso) {
      if (sso.enabled !== undefined && typeof sso.enabled !== "boolean") {
        errors.push("sso.enabled must be boolean")
      }
    }

    if (features) {
      if (
        features.trust_center_enabled !== undefined &&
        typeof features.trust_center_enabled !== "boolean"
      ) {
        errors.push("features.trust_center_enabled must be boolean")
      }
      if (
        features.consultant_mode_enabled !== undefined &&
        typeof features.consultant_mode_enabled !== "boolean"
      ) {
        errors.push("features.consultant_mode_enabled must be boolean")
      }
    }

    if (errors.length > 0) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid input", details: errors }
      })
    }

    const nowIso = now().toISOString()

    if (parsedLimits) {
      const { data: existing } = await supabase
        .from("org_limits")
        .select("id")
        .eq("org_id", orgId)
        .maybeSingle()
      if (existing) {
        await supabase
          .from("org_limits")
          .update({ ...parsedLimits, updated_at: nowIso })
          .eq("org_id", orgId)
      } else {
        await supabase
          .from("org_limits")
          .insert({ org_id: orgId, ...parsedLimits, updated_at: nowIso })
      }

      await recordAuditEvent({
        orgId,
        actorUserId: user.id,
        eventType: "org.limits_updated",
        entityType: "org_limits",
        entityId: orgId,
        payload: parsedLimits
      })
    }

    if (sso) {
      const { data: existing } = await supabase
        .from("org_sso_settings")
        .select("id")
        .eq("org_id", orgId)
        .maybeSingle()
      const updatePayload = {
        enabled: sso.enabled ?? false,
        provider: isNonEmptyString(sso.provider) ? sso.provider : null,
        domain: isNonEmptyString(sso.domain) ? sso.domain : null,
        metadata_url: isNonEmptyString(sso.metadata_url) ? sso.metadata_url : null,
        updated_at: nowIso
      }
      if (existing) {
        await supabase.from("org_sso_settings").update(updatePayload).eq("org_id", orgId)
      } else {
        await supabase.from("org_sso_settings").insert({ org_id: orgId, ...updatePayload })
      }
      await recordAuditEvent({
        orgId,
        actorUserId: user.id,
        eventType: "org.sso_updated",
        entityType: "org_sso_settings",
        entityId: orgId,
        payload: updatePayload
      })
    }

    if (features) {
      const { data: existing } = await supabase
        .from("org_features")
        .select("id")
        .eq("org_id", orgId)
        .maybeSingle()
      const updatePayload = {
        trust_center_enabled: features.trust_center_enabled ?? false,
        consultant_mode_enabled: features.consultant_mode_enabled ?? false,
        updated_at: nowIso
      }
      if (existing) {
        await supabase.from("org_features").update(updatePayload).eq("org_id", orgId)
      } else {
        await supabase.from("org_features").insert({ org_id: orgId, ...updatePayload })
      }
      await recordAuditEvent({
        orgId,
        actorUserId: user.id,
        eventType: "org.features_updated",
        entityType: "org_features",
        entityId: orgId,
        payload: updatePayload
      })
    }

    return jsonResponse(200, { ok: true })
  }

  async function handleSignUpload(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON payload" }
      })
    }

    const baseValidation = validateSignedUploadInput(payload, maxUploadBytes)
    if (!baseValidation.valid) {
      return jsonResponse(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: baseValidation.errors
        }
      })
    }

    const workspaceId = payload.workspace_id as string
    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, UPLOAD_ROLES, "Editor role required")
    if (roleResponse) return roleResponse

    const orgLimits = await getOrgLimits(membership.orgId)
    const maxUpload = typeof orgLimits?.max_upload_bytes === "number"
      ? orgLimits.max_upload_bytes
      : maxUploadBytes
    const inputFile = payload.input_file as Record<string, unknown>
    const sizeBytes = inputFile.size_bytes
    if (typeof sizeBytes === "number" && sizeBytes > maxUpload) {
      return jsonResponse(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: ["input_file.size_bytes exceeds max file size"]
        }
      })
    }

    const maxActiveJobs = typeof orgLimits?.max_active_jobs === "number"
      ? orgLimits.max_active_jobs
      : maxOrgActiveJobs
    const capacityResponse = await checkOrgCapacity(membership.orgId, maxActiveJobs)
    if (capacityResponse) return capacityResponse

    const questionnaireId = (payload.questionnaire_id as string | undefined) ??
      crypto.randomUUID()
    const fileName = inputFile.file_name as string
    const path = buildUploadPath(membership.orgId, questionnaireId, fileName)

    const { data, error } = await supabase.storage
      .from("uploads")
      .createSignedUploadUrl(path, signedUploadExpiresInSeconds)

    if (error || !data?.signedUrl) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: error?.message ?? "Upload URL error" }
      })
    }

    return jsonResponse(200, {
      questionnaire_id: questionnaireId,
      input_file: {
        bucket: "uploads",
        path: data.path ?? path,
        file_name: fileName,
        mime_type: inputFile.mime_type,
        size_bytes: inputFile.size_bytes,
        signed_url: data.signedUrl,
        expires_in: signedUploadExpiresInSeconds
      }
    })
  }

  async function handleCreateQuestionnaire(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON payload" }
      })
    }

    const baseValidation = validateCreateQuestionnaireInput(payload, maxUploadBytes)
    if (!baseValidation.valid) {
      return jsonResponse(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: baseValidation.errors
        }
      })
    }

    const workspaceId = payload.workspace_id as string
    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, UPLOAD_ROLES, "Editor role required")
    if (roleResponse) return roleResponse

    const orgLimits = await getOrgLimits(membership.orgId)
    const maxUpload = typeof orgLimits?.max_upload_bytes === "number"
      ? orgLimits.max_upload_bytes
      : maxUploadBytes
    const inputFile = payload.input_file as Record<string, unknown>
    const sizeBytes = inputFile.size_bytes
    if (typeof sizeBytes === "number" && sizeBytes > maxUpload) {
      return jsonResponse(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: ["input_file.size_bytes exceeds max file size"]
        }
      })
    }

    const maxActiveJobs = typeof orgLimits?.max_active_jobs === "number"
      ? orgLimits.max_active_jobs
      : maxOrgActiveJobs
    const capacityResponse = await checkOrgCapacity(membership.orgId, maxActiveJobs)
    if (capacityResponse) return capacityResponse

    const questionnaireId = (payload.questionnaire_id as string | undefined) ??
      crypto.randomUUID()

    const { data: existingQuestionnaire } = await supabase
      .from("questionnaires")
      .select("id")
      .eq("id", questionnaireId)
      .maybeSingle()

    if (existingQuestionnaire) {
      return jsonResponse(409, {
        error: { code: "VALIDATION_ERROR", message: "questionnaire_id already exists" }
      })
    }

    const source =
      inputFile.mime_type === "application/pdf"
        ? "PDF upload"
        : inputFile.mime_type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ? "DOCX upload"
          : "Excel upload"
    const { data: questionnaire, error: questionnaireError } = await supabase
      .from("questionnaires")
      .insert({
        id: questionnaireId,
        org_id: membership.orgId,
        workspace_id: workspaceId,
        title: payload.title,
        source,
        status: "QUEUED",
        progress_total: 0,
        progress_done: 0,
        created_by: user.id
      })
      .select("*")
      .single()

    if (questionnaireError) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: questionnaireError.message }
      })
    }

    const inputExpiresAt = computeExpiry(uploadRetentionDays)
    const { error: fileError } = await supabase.from("questionnaire_files").insert({
      questionnaire_id: questionnaire.id,
      org_id: membership.orgId,
      storage_bucket: inputFile.bucket,
      storage_path: inputFile.path,
      file_name: inputFile.file_name,
      mime_type: inputFile.mime_type,
      size_bytes: inputFile.size_bytes,
      checksum_sha256: inputFile.checksum_sha256,
      expires_at: inputExpiresAt,
      kind: "input"
    })

    if (fileError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: fileError.message } })
    }

    const jobId = crypto.randomUUID()
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        id: jobId,
        org_id: membership.orgId,
        workspace_id: workspaceId,
        job_type: "PROCESS_QUESTIONNAIRE",
        status: "QUEUED",
        payload: {
          job_id: jobId,
          org_id: membership.orgId,
          workspace_id: workspaceId,
          questionnaire_id: questionnaire.id,
          type: "PROCESS_QUESTIONNAIRE"
        }
      })
      .select("*")
      .single()

    if (jobError) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: jobError.message } })
    }

    await enqueueJob({
      job_id: jobId,
      org_id: membership.orgId,
      workspace_id: workspaceId,
      questionnaire_id: questionnaire.id,
      type: "PROCESS_QUESTIONNAIRE"
    })

    await supabase.from("audit_events").insert({
      org_id: membership.orgId,
      workspace_id: workspaceId,
      actor_user_id: user.id,
      event_type: "questionnaire.created",
      entity_type: "questionnaire",
      entity_id: questionnaire.id,
      payload: { job_id: job.id }
    })

    return jsonResponse(200, {
      questionnaire_id: questionnaire.id,
      status: questionnaire.status,
      job_id: job.id
    })
  }

  async function handleGetQuestionnaire(request: Request, id: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { data: questionnaire } = await supabase
      .from("questionnaires")
      .select("*")
      .eq("id", id)
      .single()

    if (!questionnaire) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Questionnaire not found" } })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, questionnaire.workspace_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }

    const { data: exportFile } = await supabase
      .from("questionnaire_files")
      .select("*")
      .eq("questionnaire_id", id)
      .eq("kind", "export")
      .maybeSingle()

    let signedUrl: string | null = null
    if (exportFile) {
      const { data } = await supabase.storage
        .from(exportFile.storage_bucket)
        .createSignedUrl(exportFile.storage_path, 3600)
      signedUrl = data?.signedUrl ?? null
    }

    const { data: questionIds } = await supabase
      .from("questions")
      .select("id")
      .eq("questionnaire_id", id)

    const ids = questionIds?.map((item: { id: string }) => item.id) ?? []
    const { data: suggestionRows } = await supabase
      .from("suggestions")
      .select("confidence_bucket")
      .in("question_id", ids)

    const counts = {
      auto_fill: suggestionRows?.filter(
        (row: { confidence_bucket: string }) => row.confidence_bucket === "AUTO_FILL"
      ).length ?? 0,
      needs_review: suggestionRows?.filter(
        (row: { confidence_bucket: string }) => row.confidence_bucket === "NEEDS_REVIEW"
      ).length ?? 0,
      manual: suggestionRows?.filter(
        (row: { confidence_bucket: string }) => row.confidence_bucket === "MANUAL"
      ).length ?? 0
    }

    return jsonResponse(200, {
      id: questionnaire.id,
      title: questionnaire.title,
      status: questionnaire.status,
      progress: { done: questionnaire.progress_done, total: questionnaire.progress_total },
      export_file: exportFile
        ? { bucket: exportFile.storage_bucket, path: exportFile.storage_path, signed_url: signedUrl }
        : null,
      counts
    })
  }

  async function handleListQuestions(request: Request, id: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { data: questionnaire } = await supabase
      .from("questionnaires")
      .select("workspace_id")
      .eq("id", id)
      .single()

    if (!questionnaire) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Questionnaire not found" } })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, questionnaire.workspace_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }

    const url = new URL(request.url)
    const bucket = url.searchParams.get("bucket")
    const limit = Number(url.searchParams.get("limit") ?? 50)

    const { data: questions } = await supabase
      .from("questions")
      .select("*")
      .eq("questionnaire_id", id)
      .order("index", { ascending: true })
      .limit(limit)

    if (!questions) {
      return jsonResponse(200, { questions: [] })
    }

    const questionIds = questions.map((question: { id: string }) => question.id)
    let suggestionQuery = supabase
      .from("suggestions")
      .select("*")
      .in("question_id", questionIds)

    if (bucket && bucket !== "ALL") {
      suggestionQuery = suggestionQuery.eq("confidence_bucket", bucket)
    }

    const { data: suggestions } = await suggestionQuery

    return jsonResponse(200, { questions, suggestions: suggestions ?? [] })
  }

  async function handleRequeue(request: Request, id: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { data: questionnaire } = await supabase
      .from("questionnaires")
      .select("*")
      .eq("id", id)
      .single()

    if (!questionnaire) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Questionnaire not found" } })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, questionnaire.workspace_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, REQUEUE_ROLES, "Reviewer role required")
    if (roleResponse) return roleResponse

    await supabase
      .from("questionnaires")
      .update({ status: "QUEUED", failed_reason: null })
      .eq("id", id)

    const jobId = crypto.randomUUID()
    const { data: job } = await supabase
      .from("jobs")
      .insert({
        id: jobId,
        org_id: membership.orgId,
        workspace_id: questionnaire.workspace_id,
        job_type: "PROCESS_QUESTIONNAIRE",
        status: "QUEUED",
        payload: {
          job_id: jobId,
          org_id: membership.orgId,
          workspace_id: questionnaire.workspace_id,
          questionnaire_id: questionnaire.id,
          type: "PROCESS_QUESTIONNAIRE"
        }
      })
      .select("*")
      .single()

    if (job) {
      await enqueueJob({
        job_id: jobId,
        org_id: membership.orgId,
        workspace_id: questionnaire.workspace_id,
        questionnaire_id: questionnaire.id,
        type: "PROCESS_QUESTIONNAIRE"
      })
    }

    await supabase.from("audit_events").insert({
      org_id: membership.orgId,
      workspace_id: questionnaire.workspace_id,
      actor_user_id: user.id,
      event_type: "questionnaire.requeued",
      entity_type: "questionnaire",
      entity_id: questionnaire.id,
      payload: { job_id: job?.id }
    })

    return jsonResponse(200, { job_id: job?.id, status: "QUEUED" })
  }

  async function handleExport(request: Request, id: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { data: questionnaire } = await supabase
      .from("questionnaires")
      .select("*")
      .eq("id", id)
      .single()

    if (!questionnaire) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Questionnaire not found" } })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, questionnaire.workspace_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }

    const jobId = crypto.randomUUID()
    const { data: job } = await supabase
      .from("jobs")
      .insert({
        id: jobId,
        org_id: membership.orgId,
        workspace_id: questionnaire.workspace_id,
        job_type: "EXPORT_QUESTIONNAIRE",
        status: "QUEUED",
        payload: {
          job_id: jobId,
          org_id: membership.orgId,
          workspace_id: questionnaire.workspace_id,
          questionnaire_id: questionnaire.id,
          type: "EXPORT_QUESTIONNAIRE"
        }
      })
      .select("*")
      .single()

    if (job) {
      await enqueueJob({
        job_id: jobId,
        org_id: membership.orgId,
        workspace_id: questionnaire.workspace_id,
        questionnaire_id: questionnaire.id,
        type: "EXPORT_QUESTIONNAIRE"
      })
    }

    await supabase.from("audit_events").insert({
      org_id: membership.orgId,
      workspace_id: questionnaire.workspace_id,
      actor_user_id: user.id,
      event_type: "questionnaire.export_requested",
      entity_type: "questionnaire",
      entity_id: questionnaire.id,
      payload: { job_id: job?.id }
    })

    return jsonResponse(200, { job_id: job?.id, status: "QUEUED" })
  }

  async function handleListAnswers(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const url = new URL(request.url)
    const status = url.searchParams.get("status")
    const workspaceId = url.searchParams.get("workspace_id")

    if (!workspaceId) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "workspace_id is required" }
      })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }

    let query = supabase
      .from("answers")
      .select("*")
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)

    if (status) {
      query = query.eq("status", status)
    }

    const { data, error } = await query
    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    return jsonResponse(200, { answers: data ?? [] })
  }

  async function handleCreateAnswer(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON payload" }
      })
    }

    const workspaceId = payload.workspace_id as string | undefined
    const title = payload.title as string | undefined
    const body = payload.body as string | undefined

    if (!workspaceId || !title || !body) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "workspace_id, title, body are required" }
      })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, ANSWER_EDIT_ROLES, "Editor role required")
    if (roleResponse) return roleResponse

    const { data, error } = await supabase
      .from("answers")
      .insert({
        org_id: membership.orgId,
        workspace_id: workspaceId,
        title,
        body,
        status: "DRAFT",
        owner_user_id: user.id,
        tags: payload.tags ?? [],
        scope: payload.scope ?? {},
        sensitivity: payload.sensitivity ?? "STANDARD",
        review_interval_days: payload.review_interval_days ?? 365
      })
      .select("*")
      .single()

    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    await supabase.from("audit_events").insert({
      org_id: membership.orgId,
      workspace_id: workspaceId,
      actor_user_id: user.id,
      event_type: "answer.created",
      entity_type: "answer",
      entity_id: data.id,
      payload: {}
    })

    return jsonResponse(200, { answer: data })
  }

  async function handleApproveAnswer(request: Request, id: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { data: answer } = await supabase.from("answers").select("*").eq("id", id).single()
    if (!answer) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Answer not found" } })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, answer.workspace_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    if (!["ADMIN", "REVIEWER"].includes(membership.role)) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Reviewer role required" } })
    }

    const { data, error } = await supabase
      .from("answers")
      .update({ status: "APPROVED", last_reviewed_at: now().toISOString() })
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    await supabase.from("audit_events").insert({
      org_id: membership.orgId,
      workspace_id: answer.workspace_id,
      actor_user_id: user.id,
      event_type: "answer.approved",
      entity_type: "answer",
      entity_id: id,
      payload: {}
    })

    return jsonResponse(200, { answer: data })
  }

  async function handleLiveQuestionAnswer(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON payload" }
      })
    }

    const validation = validateLiveQuestionInput(payload)
    if (!validation.valid) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid input", details: validation.errors }
      })
    }

    const workspaceId = payload.workspace_id as string
    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(
      membership.role,
      LIVE_QUESTION_ROLES,
      "Editor or Reviewer role required"
    )
    if (roleResponse) return roleResponse

    const { data: answers, error } = await supabase
      .from("answers")
      .select("*")
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)
      .eq("status", "APPROVED")

    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    let bestAnswer: Record<string, unknown> | null = null
    let bestSimilarity = 0
    const questionText = payload.question_text as string

    for (const answer of answers ?? []) {
      const text = `${answer.title ?? ""} ${answer.body ?? ""}`
      const similarity = lexicalSimilarity(questionText, text)
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestAnswer = answer
      }
    }

    const freshnessBase = bestAnswer?.last_reviewed_at ?? bestAnswer?.created_at ?? null
    const freshnessDays = daysSince(freshnessBase as string | null)
    const scopeMatch = Boolean(bestAnswer)
    const acceptanceRate = bestAnswer ? 0.7 : 0
    const score = computeConfidenceScore({
      vectorSimilarity: bestSimilarity,
      lexicalOverlap: bestSimilarity,
      scopeMatch,
      freshnessDays,
      acceptanceRate
    })
    const bucket = scoreToBucket(score)

    const { data: liveQuestion, error: liveQuestionError } = await supabase
      .from("live_questions")
      .insert({
        org_id: membership.orgId,
        workspace_id: workspaceId,
        question_text: questionText,
        context: payload.context ?? {},
        constraints: payload.constraints ?? {},
        created_by: user.id
      })
      .select("*")
      .single()

    if (liveQuestionError || !liveQuestion) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: liveQuestionError?.message ?? "Insert failed" }
      })
    }

    await supabase.from("audit_events").insert({
      org_id: membership.orgId,
      workspace_id: workspaceId,
      actor_user_id: user.id,
      event_type: "live_question.created",
      entity_type: "live_question",
      entity_id: liveQuestion.id,
      payload: {}
    })

    let evidence: Array<{ id: string; title: string; url: string | null }> = []
    if (bestAnswer?.id) {
      const { data: links } = await supabase
        .from("answer_evidence_links")
        .select("evidence_id")
        .eq("answer_id", bestAnswer.id)
      const evidenceIds = links?.map((link: { evidence_id: string }) => link.evidence_id) ?? []
      if (evidenceIds.length > 0) {
        const { data: evidenceRows, error: evidenceError } = await supabase
          .from("evidence")
          .select("id, title, url")
          .in("id", evidenceIds)
        if (evidenceError) {
          return jsonResponse(500, {
            error: { code: "INTERNAL_ERROR", message: evidenceError.message }
          })
        }
        evidence = (evidenceRows ?? []).map((row: { id: string; title: string; url: string | null }) => ({
          id: row.id,
          title: row.title,
          url: row.url ?? null
        }))
      }
    }

    return jsonResponse(200, {
      live_question_id: liveQuestion.id,
      confidence_bucket: bucket,
      confidence_score: score,
      suggested: bestAnswer
        ? {
            answer_id: bestAnswer.id,
            variant_id: null,
            text: bestAnswer.body ?? "",
            evidence
          }
        : null,
      reasons: {
        scope_match: scopeMatch,
        vector_similarity: bestSimilarity,
        lexical_overlap: bestSimilarity,
        freshness_days: freshnessDays
      }
    })
  }

  async function handleLiveQuestionMap(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON payload" }
      })
    }

    const validation = validateLiveQuestionMapInput(payload)
    if (!validation.valid) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid input", details: validation.errors }
      })
    }

    const liveQuestionId = payload.live_question_id as string
    const { data: liveQuestion } = await supabase
      .from("live_questions")
      .select("*")
      .eq("id", liveQuestionId)
      .single()

    if (!liveQuestion) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Live question not found" } })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, liveQuestion.workspace_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(
      membership.role,
      LIVE_QUESTION_ROLES,
      "Editor or Reviewer role required"
    )
    if (roleResponse) return roleResponse

    const selectedAnswerId = (payload.selected_answer_id as string | undefined) ?? null
    if (selectedAnswerId) {
      const { data: answer } = await supabase
        .from("answers")
        .select("id, workspace_id")
        .eq("id", selectedAnswerId)
        .single()
      if (!answer) {
        return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Answer not found" } })
      }
      if (answer.workspace_id !== liveQuestion.workspace_id) {
        return jsonResponse(409, {
          error: { code: "VALIDATION_ERROR", message: "Answer is outside live question workspace" }
        })
      }
    }

    const { data: mapping, error } = await supabase
      .from("live_question_mappings")
      .insert({
        live_question_id: liveQuestionId,
        org_id: membership.orgId,
        workspace_id: liveQuestion.workspace_id,
        selected_answer_id: selectedAnswerId,
        selected_variant_id: payload.selected_variant_id ?? null,
        action: payload.action,
        final_text: payload.final_text ?? null,
        created_by: user.id
      })
      .select("*")
      .single()

    if (error || !mapping) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: error?.message ?? "Insert failed" }
      })
    }

    await supabase.from("audit_events").insert({
      org_id: membership.orgId,
      workspace_id: liveQuestion.workspace_id,
      actor_user_id: user.id,
      event_type: "live_question.mapped",
      entity_type: "live_question_mapping",
      entity_id: mapping.id,
      payload: { action: payload.action }
    })

    return jsonResponse(200, { mapping })
  }

  async function handleListDuplicateAnswers(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const url = new URL(request.url)
    const workspaceId = url.searchParams.get("workspace_id")
    if (!workspaceId) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "workspace_id is required" }
      })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }

    const { data: answers, error } = await supabase
      .from("answers")
      .select("*")
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)
      .eq("status", "APPROVED")

    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    const duplicates: Array<{
      answer_id: string
      duplicate_id: string
      similarity: number
      title: string
      duplicate_title: string
    }> = []

    const rows = answers ?? []
    for (let i = 0; i < rows.length; i += 1) {
      const first = rows[i]
      const firstText = `${first.title ?? ""} ${first.body ?? ""}`
      for (let j = i + 1; j < rows.length; j += 1) {
        const second = rows[j]
        const secondText = `${second.title ?? ""} ${second.body ?? ""}`
        const similarity = lexicalSimilarity(firstText, secondText)
        if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
          duplicates.push({
            answer_id: first.id,
            duplicate_id: second.id,
            similarity: Number(similarity.toFixed(2)),
            title: first.title ?? "",
            duplicate_title: second.title ?? ""
          })
        }
      }
    }

    duplicates.sort((a, b) => b.similarity - a.similarity)

    return jsonResponse(200, {
      threshold: DUPLICATE_SIMILARITY_THRESHOLD,
      duplicates
    })
  }

  async function handleMergeAnswer(request: Request, id: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON payload" }
      })
    }

    const validation = validateMergeInput(payload)
    if (!validation.valid) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Invalid input", details: validation.errors }
      })
    }

    const { data: answer } = await supabase.from("answers").select("*").eq("id", id).single()
    if (!answer) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Answer not found" } })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, answer.workspace_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    if (!["ADMIN", "REVIEWER"].includes(membership.role)) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Reviewer role required" } })
    }

    const targetAnswerId = payload.target_answer_id as string
    if (targetAnswerId === id) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "target_answer_id must differ from source" }
      })
    }

    const { data: targetAnswer } = await supabase
      .from("answers")
      .select("*")
      .eq("id", targetAnswerId)
      .single()

    if (!targetAnswer) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Target answer not found" } })
    }

    if (targetAnswer.workspace_id !== answer.workspace_id) {
      return jsonResponse(409, {
        error: { code: "VALIDATION_ERROR", message: "Answers must be in the same workspace" }
      })
    }

    await supabase
      .from("suggestions")
      .update({ selected_answer_id: targetAnswerId })
      .eq("selected_answer_id", id)

    const { data: deprecatedAnswer, error } = await supabase
      .from("answers")
      .update({ status: "DEPRECATED", updated_at: now().toISOString() })
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    await supabase.from("audit_events").insert({
      org_id: membership.orgId,
      workspace_id: answer.workspace_id,
      actor_user_id: user.id,
      event_type: "answer.merged",
      entity_type: "answer",
      entity_id: id,
      payload: { target_answer_id: targetAnswerId }
    })

    return jsonResponse(200, {
      deprecated_answer: deprecatedAnswer,
      target_answer_id: targetAnswerId
    })
  }

  async function handleListExpiringAnswers(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const url = new URL(request.url)
    const workspaceId = url.searchParams.get("workspace_id")
    if (!workspaceId) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "workspace_id is required" }
      })
    }

    const windowDays = Number(url.searchParams.get("window_days") ?? DEFAULT_REVIEW_WINDOW_DAYS)
    const reviewWindowDays = Number.isFinite(windowDays) && windowDays > 0
      ? windowDays
      : DEFAULT_REVIEW_WINDOW_DAYS

    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }

    const { data: answers, error } = await supabase
      .from("answers")
      .select("*")
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)
      .eq("status", "APPROVED")

    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    const nowValue = now()
    const expiring = (answers ?? [])
      .map((answer: Record<string, unknown>) => {
        const reviewInterval = Number(answer.review_interval_days ?? 365)
        const baseDate = answer.last_reviewed_at ?? answer.created_at
        const dueAt = new Date(baseDate as string)
        dueAt.setDate(dueAt.getDate() + reviewInterval)
        const diffMs = dueAt.getTime() - nowValue.getTime()
        const daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
        return {
          id: answer.id,
          title: answer.title ?? "",
          last_reviewed_at: answer.last_reviewed_at ?? null,
          review_interval_days: reviewInterval,
          due_at: dueAt.toISOString(),
          days_until_due: daysUntilDue
        }
      })
      .filter((answer) => answer.days_until_due <= reviewWindowDays)
      .sort((a, b) => a.days_until_due - b.days_until_due)

    return jsonResponse(200, { window_days: reviewWindowDays, answers: expiring })
  }

  async function handleReviewAnswer(request: Request, id: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { data: answer } = await supabase.from("answers").select("*").eq("id", id).single()
    if (!answer) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Answer not found" } })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, answer.workspace_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    if (!["ADMIN", "REVIEWER"].includes(membership.role)) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Reviewer role required" } })
    }

    const reviewedAt = now().toISOString()
    const { data, error } = await supabase
      .from("answers")
      .update({ last_reviewed_at: reviewedAt, updated_at: reviewedAt })
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    await supabase.from("audit_events").insert({
      org_id: membership.orgId,
      workspace_id: answer.workspace_id,
      actor_user_id: user.id,
      event_type: "answer.reviewed",
      entity_type: "answer",
      entity_id: id,
      payload: {}
    })

    return jsonResponse(200, { answer: data })
  }

  async function handleRoiAnalytics(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const url = new URL(request.url)
    const workspaceId = url.searchParams.get("workspace_id")
    if (!workspaceId) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "workspace_id is required" }
      })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }

    const { data: suggestions, error: suggestionsError } = await supabase
      .from("suggestions")
      .select("confidence_bucket")
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)

    if (suggestionsError) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: suggestionsError.message }
      })
    }

    const totalSuggestions = suggestions?.length ?? 0
    const autoFillCount = suggestions?.filter(
      (row: { confidence_bucket: string }) => row.confidence_bucket === "AUTO_FILL"
    ).length ?? 0
    const needsReviewCount = suggestions?.filter(
      (row: { confidence_bucket: string }) => row.confidence_bucket === "NEEDS_REVIEW"
    ).length ?? 0
    const manualCount = suggestions?.filter(
      (row: { confidence_bucket: string }) => row.confidence_bucket === "MANUAL"
    ).length ?? 0

    const autoFillRate = totalSuggestions > 0
      ? Number((autoFillCount / totalSuggestions).toFixed(2))
      : 0

    const { data: questionnaires, error: questionnaireError } = await supabase
      .from("questionnaires")
      .select("created_at, updated_at")
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)
      .eq("status", "COMPLETED")

    if (questionnaireError) {
      return jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: questionnaireError.message }
      })
    }

    const durations = (questionnaires ?? []).map((row: { created_at: string; updated_at: string }) => {
      const start = new Date(row.created_at)
      const end = new Date(row.updated_at)
      const diff = end.getTime() - start.getTime()
      return diff > 0 ? diff : 0
    })
    const avgDurationMs =
      durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0
    const avgCompletionTimeHours = Number((avgDurationMs / (1000 * 60 * 60)).toFixed(2))

    const timeSavedHours = Number(
      ((autoFillCount * TIME_SAVED_MINUTES_PER_AUTOFILL) / 60).toFixed(2)
    )

    return jsonResponse(200, {
      workspace_id: workspaceId,
      counts: {
        total_suggestions: totalSuggestions,
        auto_fill: autoFillCount,
        needs_review: needsReviewCount,
        manual: manualCount
      },
      auto_fill_rate: autoFillRate,
      avg_completion_time_hours: avgCompletionTimeHours,
      time_saved_hours: timeSavedHours,
      assumptions: {
        minutes_saved_per_auto_fill: TIME_SAVED_MINUTES_PER_AUTOFILL,
        based_on: "auto_fill only"
      }
    })
  }

  async function buildTrustCenterOverviewInternal(orgId: string, workspaceId: string) {
    const { data: answers } = await supabase
      .from("answers")
      .select("id, title, last_reviewed_at, created_at")
      .eq("org_id", orgId)
      .eq("workspace_id", workspaceId)
      .eq("status", "APPROVED")

    const { data: evidence } = await supabase
      .from("evidence")
      .select("id, title, url, access_level, expires_at")
      .eq("org_id", orgId)
      .eq("workspace_id", workspaceId)

    const answerIds = (answers ?? []).map((row: { id: string }) => row.id)
    let linkedEvidenceIds = new Set<string>()
    if (answerIds.length > 0) {
      const { data: links } = await supabase
        .from("answer_evidence_links")
        .select("evidence_id")
        .in("answer_id", answerIds)
      linkedEvidenceIds = new Set(
        (links ?? []).map((row: { evidence_id: string }) => row.evidence_id)
      )
    }

    const shareableEvidence = (evidence ?? []).filter(
      (row: { access_level: string }) => row.access_level === "shareable"
    )

    const answerHighlights = (answers ?? [])
      .slice(0, 8)
      .map((row: { id: string; title: string; last_reviewed_at: string | null; created_at: string }) => ({
        id: row.id,
        title: row.title ?? "",
        last_reviewed_at: row.last_reviewed_at ?? row.created_at
      }))

    const evidenceHighlights = shareableEvidence
      .slice(0, 8)
      .map((row: { id: string; title: string; url: string | null; expires_at: string | null }) => ({
        id: row.id,
        title: row.title ?? "",
        url: row.url ?? null,
        expires_at: row.expires_at ?? null
      }))

    return {
      workspace_id: workspaceId,
      summary: {
        approved_answers: answers?.length ?? 0,
        answers_with_evidence: linkedEvidenceIds.size,
        evidence_total: evidence?.length ?? 0,
        evidence_shareable: shareableEvidence.length
      },
      answers: answerHighlights,
      evidence: evidenceHighlights
    }
  }

  async function getTrustCenterAllowlist(orgId: string, workspaceId: string) {
    const { data: allowlistAnswers } = await supabase
      .from("trust_center_allowlist_answers")
      .select("answer_id")
      .eq("org_id", orgId)
      .eq("workspace_id", workspaceId)

    const { data: allowlistEvidence } = await supabase
      .from("trust_center_allowlist_evidence")
      .select("evidence_id")
      .eq("org_id", orgId)
      .eq("workspace_id", workspaceId)

    const answerIds = new Set(
      (allowlistAnswers ?? []).map((row: { answer_id: string }) => row.answer_id)
    )
    const evidenceIds = new Set(
      (allowlistEvidence ?? []).map((row: { evidence_id: string }) => row.evidence_id)
    )
    return {
      answerIds,
      evidenceIds,
      hasAllowlist: answerIds.size > 0 || evidenceIds.size > 0
    }
  }

  async function buildTrustCenterOverviewPublic(
    orgId: string,
    workspaceId: string,
    includeAnswers: boolean,
    includeEvidence: boolean
  ) {
    const allowlist = await getTrustCenterAllowlist(orgId, workspaceId)
    const { data: answers } = includeAnswers
      ? await supabase
          .from("answers")
          .select("id, title, last_reviewed_at, created_at")
          .eq("org_id", orgId)
          .eq("workspace_id", workspaceId)
          .eq("status", "APPROVED")
      : { data: [] }

    const { data: evidence } = includeEvidence
      ? await supabase
          .from("evidence")
          .select("id, title, url, access_level, expires_at")
          .eq("org_id", orgId)
          .eq("workspace_id", workspaceId)
          .eq("access_level", "shareable")
      : { data: [] }

    const filteredAnswers = allowlist.hasAllowlist
      ? (answers ?? []).filter((row: { id: string }) => allowlist.answerIds.has(row.id))
      : answers ?? []
    const filteredEvidence = allowlist.hasAllowlist
      ? (evidence ?? []).filter((row: { id: string }) => allowlist.evidenceIds.has(row.id))
      : evidence ?? []

    const answerIds = filteredAnswers.map((row: { id: string }) => row.id)
    let answersWithEvidence = new Set<string>()
    if (includeAnswers && includeEvidence && answerIds.length > 0) {
      const { data: links } = await supabase
        .from("answer_evidence_links")
        .select("answer_id, evidence_id")
        .in("answer_id", answerIds)
      const shareableEvidenceIds = new Set(
        filteredEvidence.map((row: { id: string }) => row.id)
      )
      answersWithEvidence = new Set(
        (links ?? [])
          .filter((row: { evidence_id: string }) => shareableEvidenceIds.has(row.evidence_id))
          .map((row: { answer_id: string }) => row.answer_id)
      )
    }

    const answerHighlights = filteredAnswers
      .slice(0, 8)
      .map((row: { id: string; title: string; last_reviewed_at: string | null; created_at: string }) => ({
        id: row.id,
        title: row.title ?? "",
        last_reviewed_at: row.last_reviewed_at ?? row.created_at
      }))

    const evidenceHighlights = filteredEvidence
      .slice(0, 8)
      .map((row: { id: string; title: string; url: string | null; expires_at: string | null }) => ({
        id: row.id,
        title: row.title ?? "",
        url: row.url ?? null,
        expires_at: row.expires_at ?? null
      }))

    return {
      workspace_id: workspaceId,
      summary: {
        approved_answers: includeAnswers ? filteredAnswers.length : 0,
        answers_with_evidence: includeAnswers && includeEvidence ? answersWithEvidence.size : 0,
        evidence_total: includeEvidence ? filteredEvidence.length : 0,
        evidence_shareable: includeEvidence ? filteredEvidence.length : 0
      },
      answers: includeAnswers ? answerHighlights : [],
      evidence: includeEvidence ? evidenceHighlights : []
    }
  }

  async function handleTrustCenterOverview(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const url = new URL(request.url)
    const workspaceId = url.searchParams.get("workspace_id")
    if (!workspaceId) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "workspace_id is required" }
      })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }

    const features = await getOrgFeatures(membership.orgId)
    if (!features.trust_center_enabled) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Trust Center disabled" } })
    }

    const overview = await buildTrustCenterOverviewInternal(membership.orgId, workspaceId)
    return jsonResponse(200, overview)
  }

  async function handleGetTrustCenterAllowlist(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const url = new URL(request.url)
    const workspaceId = url.searchParams.get("workspace_id")
    if (!workspaceId) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "workspace_id is required" }
      })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const features = await getOrgFeatures(membership.orgId)
    if (!features.trust_center_enabled) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Trust Center disabled" } })
    }

    const { data: answers } = await supabase
      .from("answers")
      .select("id, title, last_reviewed_at, created_at")
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)
      .eq("status", "APPROVED")

    const { data: evidence } = await supabase
      .from("evidence")
      .select("id, title, url, access_level, expires_at")
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)
      .eq("access_level", "shareable")

    const allowlist = await getTrustCenterAllowlist(membership.orgId, workspaceId)

    return jsonResponse(200, {
      workspace_id: workspaceId,
      allowlist: {
        answer_ids: Array.from(allowlist.answerIds),
        evidence_ids: Array.from(allowlist.evidenceIds)
      },
      answers: (answers ?? []).map((row: { id: string; title: string; last_reviewed_at: string | null; created_at: string }) => ({
        id: row.id,
        title: row.title ?? "",
        last_reviewed_at: row.last_reviewed_at ?? row.created_at
      })),
      evidence: (evidence ?? []).map((row: { id: string; title: string; url: string | null; expires_at: string | null }) => ({
        id: row.id,
        title: row.title ?? "",
        url: row.url ?? null,
        expires_at: row.expires_at ?? null
      }))
    })
  }

  async function handleUpdateTrustCenterAllowlist(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload || !isNonEmptyString(payload.workspace_id)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "workspace_id is required" }
      })
    }

    const workspaceId = payload.workspace_id as string
    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const features = await getOrgFeatures(membership.orgId)
    if (!features.trust_center_enabled) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Trust Center disabled" } })
    }

    const answerIds = Array.isArray(payload.answer_ids)
      ? payload.answer_ids.filter((value) => isNonEmptyString(value))
      : []
    const evidenceIds = Array.isArray(payload.evidence_ids)
      ? payload.evidence_ids.filter((value) => isNonEmptyString(value))
      : []

    await supabase
      .from("trust_center_allowlist_answers")
      .delete()
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)

    await supabase
      .from("trust_center_allowlist_evidence")
      .delete()
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)

    if (answerIds.length > 0) {
      await supabase.from("trust_center_allowlist_answers").insert(
        answerIds.map((answerId) => ({
          org_id: membership.orgId,
          workspace_id: workspaceId,
          answer_id: answerId,
          created_by: user.id
        }))
      )
    }

    if (evidenceIds.length > 0) {
      await supabase.from("trust_center_allowlist_evidence").insert(
        evidenceIds.map((evidenceId) => ({
          org_id: membership.orgId,
          workspace_id: workspaceId,
          evidence_id: evidenceId,
          created_by: user.id
        }))
      )
    }

    await recordAuditEvent({
      orgId: membership.orgId,
      workspaceId,
      actorUserId: user.id,
      eventType: "trust_center.allowlist_updated",
      entityType: "trust_center_allowlist",
      entityId: workspaceId,
      payload: { answer_ids: answerIds, evidence_ids: evidenceIds }
    })

    return jsonResponse(200, {
      workspace_id: workspaceId,
      allowlist: {
        answer_ids: answerIds,
        evidence_ids: evidenceIds
      }
    })
  }

  async function handleCreateTrustCenterAccessRequest(request: Request) {
    const payload = await parseJsonBody(request)
    if (!payload || !isNonEmptyString(payload.token)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "token is required" }
      })
    }

    const token = payload.token as string
    const { data: share } = await supabase
      .from("trust_center_shares")
      .select("id, org_id, workspace_id, expires_at, revoked_at")
      .eq("token", token)
      .maybeSingle()

    if (!share) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Share not found" } })
    }

    if (share.revoked_at) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Share revoked" } })
    }

    if (share.expires_at) {
      const expiresAt = new Date(share.expires_at)
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now().getTime()) {
        return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Share expired" } })
      }
    }

    const features = await getOrgFeatures(share.org_id)
    if (!features.trust_center_enabled) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Trust Center disabled" } })
    }

    const requesterName = isNonEmptyString(payload.requester_name) ? payload.requester_name : null
    const requesterEmail = isNonEmptyString(payload.requester_email) ? payload.requester_email : null
    const requesterCompany = isNonEmptyString(payload.requester_company) ? payload.requester_company : null
    const message = isNonEmptyString(payload.message) ? payload.message : null

    const { data: requestRow, error } = await supabase
      .from("trust_center_access_requests")
      .insert({
        org_id: share.org_id,
        workspace_id: share.workspace_id,
        share_id: share.id,
        requester_name: requesterName,
        requester_email: requesterEmail,
        requester_company: requesterCompany,
        message,
        status: "PENDING"
      })
      .select("*")
      .single()

    if (error || !requestRow) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error?.message ?? "Insert failed" } })
    }

    const answerIds = Array.isArray(payload.answer_ids)
      ? payload.answer_ids.filter((value) => isNonEmptyString(value))
      : []
    const evidenceIds = Array.isArray(payload.evidence_ids)
      ? payload.evidence_ids.filter((value) => isNonEmptyString(value))
      : []

    if (answerIds.length > 0) {
      const { data: validAnswers } = await supabase
        .from("answers")
        .select("id")
        .eq("org_id", share.org_id)
        .eq("workspace_id", share.workspace_id)
        .in("id", answerIds)
      const validIds = (validAnswers ?? []).map((row: { id: string }) => row.id)
      if (validIds.length > 0) {
        await supabase.from("trust_center_access_request_answers").insert(
          validIds.map((answerId) => ({
            request_id: requestRow.id,
            org_id: share.org_id,
            workspace_id: share.workspace_id,
            answer_id: answerId
          }))
        )
      }
    }

    if (evidenceIds.length > 0) {
      const { data: validEvidence } = await supabase
        .from("evidence")
        .select("id")
        .eq("org_id", share.org_id)
        .eq("workspace_id", share.workspace_id)
        .in("id", evidenceIds)
      const validIds = (validEvidence ?? []).map((row: { id: string }) => row.id)
      if (validIds.length > 0) {
        await supabase.from("trust_center_access_request_evidence").insert(
          validIds.map((evidenceId) => ({
            request_id: requestRow.id,
            org_id: share.org_id,
            workspace_id: share.workspace_id,
            evidence_id: evidenceId
          }))
        )
      }
    }

    await recordAuditEvent({
      orgId: share.org_id,
      workspaceId: share.workspace_id,
      actorUserId: null,
      eventType: "trust_center.access_requested",
      entityType: "trust_center_access_request",
      entityId: requestRow.id,
      payload: {
        requester_email: requesterEmail,
        requester_company: requesterCompany,
        requested_answers: answerIds.length,
        requested_evidence: evidenceIds.length
      }
    })

    return jsonResponse(200, { request: requestRow })
  }

  async function handleListTrustCenterAccessRequests(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const url = new URL(request.url)
    const workspaceId = url.searchParams.get("workspace_id")
    if (!workspaceId) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "workspace_id is required" }
      })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const { data: requests } = await supabase
      .from("trust_center_access_requests")
      .select("*")
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })

    const requestIds = (requests ?? []).map((row: { id: string }) => row.id)
    const { data: requestAnswers } = requestIds.length
      ? await supabase
          .from("trust_center_access_request_answers")
          .select("request_id, answer_id")
          .in("request_id", requestIds)
      : { data: [] }
    const { data: requestEvidence } = requestIds.length
      ? await supabase
          .from("trust_center_access_request_evidence")
          .select("request_id, evidence_id")
          .in("request_id", requestIds)
      : { data: [] }

    return jsonResponse(200, {
      requests: (requests ?? []).map((requestRow: Record<string, unknown>) => ({
        ...requestRow,
        answer_ids: (requestAnswers ?? [])
          .filter((row: { request_id: string }) => row.request_id === requestRow.id)
          .map((row: { answer_id: string }) => row.answer_id),
        evidence_ids: (requestEvidence ?? [])
          .filter((row: { request_id: string }) => row.request_id === requestRow.id)
          .map((row: { evidence_id: string }) => row.evidence_id)
      }))
    })
  }

  async function handleUpdateTrustCenterAccessRequest(
    request: Request,
    requestId: string
  ) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload || !isNonEmptyString(payload.status)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "status is required" }
      })
    }

    const status = (payload.status as string).toUpperCase()
    if (!["APPROVED", "DENIED"].includes(status)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "status must be APPROVED or DENIED" }
      })
    }

    const { data: requestRow } = await supabase
      .from("trust_center_access_requests")
      .select("id, org_id, workspace_id")
      .eq("id", requestId)
      .maybeSingle()

    if (!requestRow) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Request not found" } })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, requestRow.workspace_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const decisionNote = isNonEmptyString(payload.decision_note) ? payload.decision_note : null
    const reviewedAt = now().toISOString()

    const { data: updated } = await supabase
      .from("trust_center_access_requests")
      .update({
        status,
        reviewed_at: reviewedAt,
        reviewed_by: user.id,
        decision_note: decisionNote
      })
      .eq("id", requestId)
      .select("*")
      .single()

    const grantRequested = payload.grant_requested !== false
    if (status === "APPROVED" && grantRequested) {
      const { data: requestAnswers } = await supabase
        .from("trust_center_access_request_answers")
        .select("answer_id")
        .eq("request_id", requestId)
      const { data: requestEvidence } = await supabase
        .from("trust_center_access_request_evidence")
        .select("evidence_id")
        .eq("request_id", requestId)

      if ((requestAnswers ?? []).length > 0) {
        await supabase.from("trust_center_allowlist_answers").insert(
          (requestAnswers ?? []).map((row: { answer_id: string }) => ({
            org_id: requestRow.org_id,
            workspace_id: requestRow.workspace_id,
            answer_id: row.answer_id,
            created_by: user.id
          })),
          { onConflict: "org_id,workspace_id,answer_id" }
        )
      }
      if ((requestEvidence ?? []).length > 0) {
        await supabase.from("trust_center_allowlist_evidence").insert(
          (requestEvidence ?? []).map((row: { evidence_id: string }) => ({
            org_id: requestRow.org_id,
            workspace_id: requestRow.workspace_id,
            evidence_id: row.evidence_id,
            created_by: user.id
          })),
          { onConflict: "org_id,workspace_id,evidence_id" }
        )
      }
    }

    await recordAuditEvent({
      orgId: requestRow.org_id,
      workspaceId: requestRow.workspace_id,
      actorUserId: user.id,
      eventType: status === "APPROVED"
        ? "trust_center.access_request_approved"
        : "trust_center.access_request_denied",
      entityType: "trust_center_access_request",
      entityId: requestId,
      payload: { decision_note: decisionNote }
    })

    return jsonResponse(200, { request: updated })
  }

  async function handleListTrustCenterShares(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const url = new URL(request.url)
    const workspaceId = url.searchParams.get("workspace_id")
    if (!workspaceId) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "workspace_id is required" }
      })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const features = await getOrgFeatures(membership.orgId)
    if (!features.trust_center_enabled) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Trust Center disabled" } })
    }

    const { data: shares, error } = await supabase
      .from("trust_center_shares")
      .select("id, token, include_answers, include_evidence, expires_at, revoked_at, created_at, created_by")
      .eq("org_id", membership.orgId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })

    if (error) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error.message } })
    }

    return jsonResponse(200, { shares: shares ?? [] })
  }

  async function handleCreateTrustCenterShare(request: Request) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const payload = await parseJsonBody(request)
    if (!payload || !isNonEmptyString(payload.workspace_id)) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "workspace_id is required" }
      })
    }

    const workspaceId = payload.workspace_id as string
    const { membership, error: accessError } = await requireWorkspaceAccess(user, workspaceId)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const features = await getOrgFeatures(membership.orgId)
    if (!features.trust_center_enabled) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Trust Center disabled" } })
    }

    const includeAnswers =
      payload.include_answers === undefined ? true : Boolean(payload.include_answers)
    const includeEvidence =
      payload.include_evidence === undefined ? true : Boolean(payload.include_evidence)

    const expiresIn = Number(payload.expires_in_days ?? DEFAULT_TRUST_CENTER_SHARE_EXPIRY_DAYS)
    if (Number.isNaN(expiresIn) || expiresIn <= 0 || expiresIn > MAX_TRUST_CENTER_SHARE_EXPIRY_DAYS) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "expires_in_days must be between 1 and 365" }
      })
    }

    const expiresAt = new Date(now().getTime() + expiresIn * 24 * 60 * 60 * 1000).toISOString()
    const token = crypto.randomUUID().replace(/-/g, "")

    const { data: share, error } = await supabase
      .from("trust_center_shares")
      .insert({
        org_id: membership.orgId,
        workspace_id: workspaceId,
        token,
        include_answers: includeAnswers,
        include_evidence: includeEvidence,
        expires_at: expiresAt,
        created_by: user.id
      })
      .select("id, token, include_answers, include_evidence, expires_at, revoked_at, created_at, created_by")
      .single()

    if (error || !share) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error?.message ?? "Insert failed" } })
    }

    await recordAuditEvent({
      orgId: membership.orgId,
      workspaceId,
      actorUserId: user.id,
      eventType: "trust_center.share_created",
      entityType: "trust_center_share",
      entityId: share.id,
      payload: { expires_at: expiresAt, include_answers: includeAnswers, include_evidence: includeEvidence }
    })

    return jsonResponse(200, { share })
  }

  async function handleRevokeTrustCenterShare(request: Request, shareId: string) {
    const user = await requireUser(request)
    if (!user) {
      return jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Auth required" } })
    }

    const { data: share } = await supabase
      .from("trust_center_shares")
      .select("id, org_id, workspace_id")
      .eq("id", shareId)
      .maybeSingle()

    if (!share) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Share not found" } })
    }

    const { membership, error: accessError } = await requireWorkspaceAccess(user, share.workspace_id)
    if (accessError || !membership) {
      return accessError ?? jsonResponse(403, { error: { code: "FORBIDDEN", message: "Access denied" } })
    }
    const roleResponse = requireRole(membership.role, new Set(["ADMIN"]), "Admin role required")
    if (roleResponse) return roleResponse

    const revokedAt = now().toISOString()
    const { data: updated, error } = await supabase
      .from("trust_center_shares")
      .update({ revoked_at: revokedAt })
      .eq("id", shareId)
      .select("id, token, include_answers, include_evidence, expires_at, revoked_at, created_at, created_by")
      .single()

    if (error || !updated) {
      return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: error?.message ?? "Update failed" } })
    }

    await recordAuditEvent({
      orgId: share.org_id,
      workspaceId: share.workspace_id,
      actorUserId: user.id,
      eventType: "trust_center.share_revoked",
      entityType: "trust_center_share",
      entityId: shareId,
      payload: { revoked_at: revokedAt }
    })

    return jsonResponse(200, { share: updated })
  }

  async function handleTrustCenterPublic(request: Request) {
    const url = new URL(request.url)
    const token = url.searchParams.get("token")
    if (!token) {
      return jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "token is required" }
      })
    }

    const { data: share } = await supabase
      .from("trust_center_shares")
      .select("id, org_id, workspace_id, include_answers, include_evidence, expires_at, revoked_at")
      .eq("token", token)
      .maybeSingle()

    if (!share) {
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Share not found" } })
    }

    if (share.revoked_at) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Share revoked" } })
    }

    if (share.expires_at) {
      const expiresAt = new Date(share.expires_at)
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now().getTime()) {
        return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Share expired" } })
      }
    }

    const features = await getOrgFeatures(share.org_id)
    if (!features.trust_center_enabled) {
      return jsonResponse(403, { error: { code: "FORBIDDEN", message: "Trust Center disabled" } })
    }

    const overview = await buildTrustCenterOverviewPublic(
      share.org_id,
      share.workspace_id,
      Boolean(share.include_answers),
      Boolean(share.include_evidence)
    )

    return jsonResponse(200, {
      share_id: share.id,
      ...overview
    })
  }

  async function handleRequest(request: Request) {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
        }
      })
    }

    if (path === "/api/me" && request.method === "GET") {
      return handleGetMe(request)
    }

    if (path === "/api/onboarding" && request.method === "POST") {
      return handleOnboarding(request)
    }

    if (path === "/api/workspaces" && request.method === "POST") {
      return handleCreateWorkspace(request)
    }

    const orgMembersMatch = path.match(/^\/api\/orgs\/([a-f0-9-]+)\/members$/)
    if (orgMembersMatch && request.method === "GET") {
      return handleListMembers(request, orgMembersMatch[1])
    }

    const orgMemberRoleMatch = path.match(/^\/api\/orgs\/([a-f0-9-]+)\/members\/([a-f0-9-]+)\/role$/)
    if (orgMemberRoleMatch && request.method === "POST") {
      return handleUpdateMemberRole(request, orgMemberRoleMatch[1], orgMemberRoleMatch[2])
    }

    const orgMemberRemoveMatch = path.match(/^\/api\/orgs\/([a-f0-9-]+)\/members\/([a-f0-9-]+)\/remove$/)
    if (orgMemberRemoveMatch && request.method === "POST") {
      return handleRemoveMember(request, orgMemberRemoveMatch[1], orgMemberRemoveMatch[2])
    }

    const orgInvitesMatch = path.match(/^\/api\/orgs\/([a-f0-9-]+)\/invites$/)
    if (orgInvitesMatch && request.method === "GET") {
      return handleListInvites(request, orgInvitesMatch[1])
    }

    if (orgInvitesMatch && request.method === "POST") {
      return handleCreateInvite(request, orgInvitesMatch[1])
    }

    if (path === "/api/invites/accept" && request.method === "POST") {
      return handleAcceptInvite(request)
    }

    const orgSettingsMatch = path.match(/^\/api\/orgs\/([a-f0-9-]+)\/settings$/)
    if (orgSettingsMatch && request.method === "GET") {
      return handleGetOrgSettings(request, orgSettingsMatch[1])
    }

    if (orgSettingsMatch && request.method === "POST") {
      return handleUpdateOrgSettings(request, orgSettingsMatch[1])
    }

    const orgUsageMatch = path.match(/^\/api\/orgs\/([a-f0-9-]+)\/usage$/)
    if (orgUsageMatch && request.method === "GET") {
      return handleGetOrgUsage(request, orgUsageMatch[1])
    }

    const orgReportsMatch = path.match(/^\/api\/orgs\/([a-f0-9-]+)\/reports$/)
    if (orgReportsMatch && request.method === "GET") {
      return handleOrgWorkspaceReports(request, orgReportsMatch[1])
    }

    const orgReportsExportMatch = path.match(/^\/api\/orgs\/([a-f0-9-]+)\/reports\/export$/)
    if (orgReportsExportMatch && request.method === "POST") {
      return handleCreateReportExport(request, orgReportsExportMatch[1])
    }

    const orgReportsExportsMatch = path.match(/^\/api\/orgs\/([a-f0-9-]+)\/reports\/exports$/)
    if (orgReportsExportsMatch && request.method === "GET") {
      return handleListReportExports(request, orgReportsExportsMatch[1])
    }

    const workspaceMembersMatch = path.match(/^\/api\/workspaces\/([a-f0-9-]+)\/members$/)
    if (workspaceMembersMatch && request.method === "GET") {
      return handleListWorkspaceMembers(request, workspaceMembersMatch[1])
    }
    if (workspaceMembersMatch && request.method === "POST") {
      return handleAddWorkspaceMember(request, workspaceMembersMatch[1])
    }

    const workspaceMemberRoleMatch = path.match(/^\/api\/workspaces\/([a-f0-9-]+)\/members\/([a-f0-9-]+)\/role$/)
    if (workspaceMemberRoleMatch && request.method === "POST") {
      return handleUpdateWorkspaceMemberRole(
        request,
        workspaceMemberRoleMatch[1],
        workspaceMemberRoleMatch[2]
      )
    }

    const workspaceMemberRemoveMatch = path.match(/^\/api\/workspaces\/([a-f0-9-]+)\/members\/([a-f0-9-]+)\/remove$/)
    if (workspaceMemberRemoveMatch && request.method === "POST") {
      return handleRemoveWorkspaceMember(request, workspaceMemberRemoveMatch[1], workspaceMemberRemoveMatch[2])
    }

    if (path === "/api/uploads/sign" && request.method === "POST") {
      return handleSignUpload(request)
    }

    if (path === "/api/questionnaires" && request.method === "POST") {
      return handleCreateQuestionnaire(request)
    }

    const questionnaireMatch = path.match(/^\/api\/questionnaires\/([a-f0-9-]+)$/)
    if (questionnaireMatch && request.method === "GET") {
      return handleGetQuestionnaire(request, questionnaireMatch[1])
    }

    const questionsMatch = path.match(/^\/api\/questionnaires\/([a-f0-9-]+)\/questions$/)
    if (questionsMatch && request.method === "GET") {
      return handleListQuestions(request, questionsMatch[1])
    }

    const requeueMatch = path.match(/^\/api\/questionnaires\/([a-f0-9-]+)\/requeue$/)
    if (requeueMatch && request.method === "POST") {
      return handleRequeue(request, requeueMatch[1])
    }

    const exportMatch = path.match(/^\/api\/questionnaires\/([a-f0-9-]+)\/export$/)
    if (exportMatch && request.method === "POST") {
      return handleExport(request, exportMatch[1])
    }

    if (path === "/api/answers" && request.method === "GET") {
      return handleListAnswers(request)
    }

    if (path === "/api/answers" && request.method === "POST") {
      return handleCreateAnswer(request)
    }

    const approveMatch = path.match(/^\/api\/answers\/([a-f0-9-]+)\/approve$/)
    if (approveMatch && request.method === "POST") {
      return handleApproveAnswer(request, approveMatch[1])
    }

    if (path === "/api/live-question/answer" && request.method === "POST") {
      return handleLiveQuestionAnswer(request)
    }

    if (path === "/api/live-question/map" && request.method === "POST") {
      return handleLiveQuestionMap(request)
    }

    if (path === "/api/answers/duplicates" && request.method === "GET") {
      return handleListDuplicateAnswers(request)
    }

    if (path === "/api/answers/expiring" && request.method === "GET") {
      return handleListExpiringAnswers(request)
    }

    if (path === "/api/trust-center/allowlist" && request.method === "GET") {
      return handleGetTrustCenterAllowlist(request)
    }

    if (path === "/api/trust-center/allowlist" && request.method === "POST") {
      return handleUpdateTrustCenterAllowlist(request)
    }

    if (path === "/api/trust-center/access-request" && request.method === "POST") {
      return handleCreateTrustCenterAccessRequest(request)
    }

    if (path === "/api/trust-center/access-requests" && request.method === "GET") {
      return handleListTrustCenterAccessRequests(request)
    }

    const accessRequestUpdateMatch = path.match(/^\/api\/trust-center\/access-requests\/([a-f0-9-]+)$/)
    if (accessRequestUpdateMatch && request.method === "POST") {
      return handleUpdateTrustCenterAccessRequest(request, accessRequestUpdateMatch[1])
    }

    if (path === "/api/trust-center/overview" && request.method === "GET") {
      return handleTrustCenterOverview(request)
    }

    if (path === "/api/trust-center/shares" && request.method === "GET") {
      return handleListTrustCenterShares(request)
    }

    if (path === "/api/trust-center/shares" && request.method === "POST") {
      return handleCreateTrustCenterShare(request)
    }

    const trustCenterShareRevokeMatch = path.match(/^\/api\/trust-center\/shares\/([a-f0-9-]+)\/revoke$/)
    if (trustCenterShareRevokeMatch && request.method === "POST") {
      return handleRevokeTrustCenterShare(request, trustCenterShareRevokeMatch[1])
    }

    if (path === "/api/trust-center/public" && request.method === "GET") {
      return handleTrustCenterPublic(request)
    }

    const mergeMatch = path.match(/^\/api\/answers\/([a-f0-9-]+)\/merge$/)
    if (mergeMatch && request.method === "POST") {
      return handleMergeAnswer(request, mergeMatch[1])
    }

    const reviewMatch = path.match(/^\/api\/answers\/([a-f0-9-]+)\/review$/)
    if (reviewMatch && request.method === "POST") {
      return handleReviewAnswer(request, reviewMatch[1])
    }

    if (path === "/api/analytics/roi" && request.method === "GET") {
      return handleRoiAnalytics(request)
    }

    return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Route not found" } })
  }

  return { handleRequest }
}
