import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type {
  Answer,
  Job,
  JobAttempt,
  Questionnaire,
  QuestionnaireFile,
  ReportExport,
  Suggestion,
  TokenUsageEvent
} from "@tuesdaytrust/shared"
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
  ReportExportFileInput,
  ReportExportInput,
  ReportExportUpdate,
  TokenUsageInput
} from "./types"
import type { OrgLimits, OrgUsage } from "./types"

interface SupabaseConfig {
  url: string
  serviceRoleKey: string
}

export function createSupabaseDataStore(config: SupabaseConfig) {
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false }
  })
  return new SupabaseDataStore(client)
}

export class SupabaseDataStore implements DataStore {
  constructor(private client: SupabaseClient) {}

  async getQuestionnaire(questionnaireId: string) {
    const { data } = await this.client
      .from("questionnaires")
      .select("*")
      .eq("id", questionnaireId)
      .single()
    return (data as Questionnaire) ?? null
  }

  async getQuestionnaireFile(questionnaireId: string, kind: "input" | "export") {
    const { data } = await this.client
      .from("questionnaire_files")
      .select("*")
      .eq("questionnaire_id", questionnaireId)
      .eq("kind", kind)
      .limit(1)
      .maybeSingle()
    return (data as QuestionnaireFile) ?? null
  }

  async updateQuestionnaireStatus(questionnaireId: string, status: Questionnaire["status"], failedReason?: string | null) {
    await this.client
      .from("questionnaires")
      .update({ status, failed_reason: failedReason ?? null })
      .eq("id", questionnaireId)
  }

  async updateQuestionnaireProgress(questionnaireId: string, progressDone: number, progressTotal: number) {
    await this.client
      .from("questionnaires")
      .update({ progress_done: progressDone, progress_total: progressTotal })
      .eq("id", questionnaireId)
  }

  async createQuestions(questions: NewQuestion[]) {
    await this.client.from("questions").insert(
      questions.map((question) => ({
        id: question.id,
        questionnaire_id: question.questionnaireId,
        org_id: question.orgId,
        workspace_id: question.workspaceId,
        index: question.index,
        section: question.section ?? null,
        prompt: question.prompt,
        raw_prompt: question.rawPrompt,
        response_type: question.responseType,
        constraints: question.constraints,
        source_ref: question.sourceRef
      }))
    )
  }

  async listApprovedAnswers(orgId: string, workspaceId: string) {
    const { data } = await this.client
      .from("answers")
      .select("*")
      .eq("org_id", orgId)
      .eq("workspace_id", workspaceId)
      .eq("status", "APPROVED")
    return (data as Answer[]) ?? []
  }

  async createSuggestions(suggestions: NewSuggestion[]) {
    await this.client.from("suggestions").insert(
      suggestions.map((suggestion) => ({
        id: suggestion.id,
        question_id: suggestion.questionId,
        org_id: suggestion.orgId,
        workspace_id: suggestion.workspaceId,
        selected_answer_id: suggestion.selectedAnswerId ?? null,
        selected_variant_id: suggestion.selectedVariantId ?? null,
        confidence_score: suggestion.confidenceScore,
        confidence_bucket: suggestion.confidenceBucket,
        reasons: suggestion.reasons,
        status: suggestion.status
      }))
    )
  }

  async createExportFile(file: ExportFileInput) {
    const { data: storageData, error: storageError } = await this.client.storage
      .from(file.storageBucket)
      .upload(file.storagePath, file.content, {
        contentType: file.mimeType,
        upsert: true
      })

    if (storageError) {
      throw new Error(`storage upload failed: ${storageError.message}`)
    }

    const { data, error } = await this.client
      .from("questionnaire_files")
      .insert({
        questionnaire_id: file.questionnaireId,
        org_id: file.orgId,
        storage_bucket: file.storageBucket,
        storage_path: storageData?.path ?? file.storagePath,
        file_name: file.fileName,
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
        checksum_sha256: file.checksumSha256,
        expires_at: file.expiresAt ?? null,
        kind: "export"
      })
      .select("*")
      .single()

    if (error) {
      throw new Error(`failed to insert export file: ${error.message}`)
    }

    return data as QuestionnaireFile
  }

  async recordAuditEvent(event: AuditEventInput) {
    await this.client.from("audit_events").insert({
      org_id: event.orgId,
      workspace_id: event.workspaceId ?? null,
      actor_user_id: event.actorUserId ?? null,
      event_type: event.eventType,
      entity_type: event.entityType,
      entity_id: event.entityId,
      payload: event.payload
    })
  }

  async createJobAttempt(attempt: JobAttemptInput) {
    const { data, error } = await this.client
      .from("job_attempts")
      .insert({
        job_id: attempt.jobId,
        started_at: attempt.startedAt,
        ended_at: attempt.endedAt,
        status: attempt.status,
        error: attempt.error ?? null,
        metrics: attempt.metrics
      })
      .select("*")
      .single()

    if (error) {
      throw new Error(`failed to create job attempt: ${error.message}`)
    }

    return data as JobAttempt
  }

  async getOrgLimits(orgId: string) {
    const { data } = await this.client
      .from("org_limits")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle()

    if (!data) return null

    return {
      orgId: data.org_id,
      maxUploadBytes: data.max_upload_bytes ?? null,
      maxQuestions: data.max_questions ?? null,
      maxActiveJobs: data.max_active_jobs ?? null,
      monthlyTokenBudget: data.monthly_token_budget ?? null
    } satisfies OrgLimits
  }

  async getOrgUsage(orgId: string, periodStart: string) {
    const periodStartDate = new Date(`${periodStart}T00:00:00.000Z`)
    const periodEndDate = new Date(Date.UTC(periodStartDate.getUTCFullYear(), periodStartDate.getUTCMonth() + 1, 1))
    const { data } = await this.client
      .from("token_usage_events")
      .select("tokens_in, tokens_out")
      .eq("org_id", orgId)
      .gte("created_at", periodStartDate.toISOString())
      .lt("created_at", periodEndDate.toISOString())

    const tokensIn = (data ?? []).reduce(
      (sum: number, row: { tokens_in?: number }) => sum + (row.tokens_in ?? 0),
      0
    )
    const tokensOut = (data ?? []).reduce(
      (sum: number, row: { tokens_out?: number }) => sum + (row.tokens_out ?? 0),
      0
    )

    return {
      orgId,
      periodStart,
      tokensIn,
      tokensOut
    } satisfies OrgUsage
  }

  async upsertOrgUsage(orgId: string, periodStart: string, tokensIn: number, tokensOut: number) {
    const existing = await this.getOrgUsage(orgId, periodStart)
    if (existing) {
      await this.client
        .from("org_usage")
        .update({
          tokens_in: existing.tokensIn + tokensIn,
          tokens_out: existing.tokensOut + tokensOut
        })
        .eq("org_id", orgId)
        .eq("period_start", periodStart)
      return
    }

    await this.client
      .from("org_usage")
      .insert({
        org_id: orgId,
        period_start: periodStart,
        tokens_in: tokensIn,
        tokens_out: tokensOut
      })
  }

  async createReportExport(input: ReportExportInput) {
    const { data, error } = await this.client
      .from("report_exports")
      .insert({
        org_id: input.orgId,
        workspace_id: input.workspaceId ?? null,
        job_id: input.jobId ?? null,
        format: input.format,
        status: "QUEUED",
        created_by: input.createdBy
      })
      .select("*")
      .single()

    if (error) {
      throw new Error(`failed to create report export: ${error.message}`)
    }

    return this.mapReportExport(data)
  }

  async updateReportExport(id: string, update: ReportExportUpdate) {
    const { data, error } = await this.client
      .from("report_exports")
      .update({
        status: update.status,
        storage_bucket: update.storageBucket ?? undefined,
        storage_path: update.storagePath ?? undefined,
        file_name: update.fileName ?? undefined,
        mime_type: update.mimeType ?? undefined,
        size_bytes: update.sizeBytes ?? undefined,
        checksum_sha256: update.checksumSha256 ?? undefined,
        expires_at: update.expiresAt ?? undefined,
        completed_at: update.completedAt ?? undefined,
        last_error: update.lastError ?? undefined,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("*")
      .maybeSingle()

    if (error) {
      throw new Error(`failed to update report export: ${error.message}`)
    }

    return data ? this.mapReportExport(data) : null
  }

  async getReportExport(id: string) {
    const { data } = await this.client.from("report_exports").select("*").eq("id", id).maybeSingle()
    return data ? this.mapReportExport(data) : null
  }

  async storeReportExportFile(input: ReportExportFileInput) {
    const { data: storageData, error: storageError } = await this.client.storage
      .from(input.storageBucket)
      .upload(input.storagePath, input.content, {
        contentType: input.mimeType,
        upsert: true
      })

    if (storageError) {
      throw new Error(`storage upload failed: ${storageError.message}`)
    }

    const { data, error } = await this.client
      .from("report_exports")
      .update({
        storage_bucket: input.storageBucket,
        storage_path: storageData?.path ?? input.storagePath,
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        checksum_sha256: input.checksumSha256,
        expires_at: input.expiresAt ?? null,
        status: "SUCCEEDED",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", input.reportExportId)
      .select("*")
      .single()

    if (error) {
      throw new Error(`failed to update report export: ${error.message}`)
    }

    return this.mapReportExport(data)
  }

  async listOrgWorkspaces(orgId: string) {
    const { data } = await this.client
      .from("workspaces")
      .select("id, name")
      .eq("org_id", orgId)
      .order("name", { ascending: true })
    return (data ?? []).map((row: { id: string; name: string }) => ({
      id: row.id,
      name: row.name ?? "Workspace"
    })) satisfies OrgWorkspace[]
  }

  async listOrgQuestionnaires(orgId: string) {
    const { data } = await this.client
      .from("questionnaires")
      .select("workspace_id, status, updated_at")
      .eq("org_id", orgId)
    return (data ?? []).map((row: { workspace_id: string; status: Questionnaire["status"]; updated_at?: string | null }) => ({
      workspaceId: row.workspace_id,
      status: row.status,
      updatedAt: row.updated_at ?? null
    })) satisfies OrgQuestionnaireRow[]
  }

  async listOrgSuggestions(orgId: string) {
    const { data } = await this.client
      .from("suggestions")
      .select("workspace_id, confidence_bucket")
      .eq("org_id", orgId)
    return (data ?? []).map((row: { workspace_id: string; confidence_bucket: Suggestion["confidenceBucket"] }) => ({
      workspaceId: row.workspace_id,
      confidenceBucket: row.confidence_bucket
    })) satisfies OrgSuggestionRow[]
  }

  async listOrgApprovedAnswers(orgId: string) {
    const { data } = await this.client
      .from("answers")
      .select("workspace_id, status")
      .eq("org_id", orgId)
      .eq("status", "APPROVED")
    return (data ?? []).map((row: { workspace_id: string; status: Answer["status"] }) => ({
      workspaceId: row.workspace_id,
      status: row.status
    })) satisfies OrgAnswerRow[]
  }

  async recordTokenUsage(event: TokenUsageInput) {
    const { data, error } = await this.client
      .from("token_usage_events")
      .insert({
        org_id: event.orgId,
        workspace_id: event.workspaceId ?? null,
        job_id: event.jobId ?? null,
        questionnaire_id: event.questionnaireId ?? null,
        event_type: event.eventType,
        provider: event.provider ?? null,
        model: event.model ?? null,
        tokens_in: event.tokensIn ?? 0,
        tokens_out: event.tokensOut ?? 0,
        cost_usd: event.costUsd ?? 0,
        metadata: event.metadata ?? {}
      })
      .select("*")
      .single()

    if (error) {
      throw new Error(`failed to record token usage: ${error.message}`)
    }

    return this.mapTokenUsageEvent(data)
  }

  async updateJobStatus(jobId: string, status: Job["status"], error?: string | null) {
    await this.client
      .from("jobs")
      .update({ status, last_error: error ?? null })
      .eq("id", jobId)
  }

  async getJob(jobId: string) {
    const { data } = await this.client.from("jobs").select("*").eq("id", jobId).single()
    return (data as Job) ?? null
  }

  private mapReportExport(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      workspaceId: (row.workspace_id as string | null) ?? null,
      jobId: (row.job_id as string | null) ?? null,
      format: row.format as ReportExport["format"],
      status: row.status as ReportExport["status"],
      storageBucket: (row.storage_bucket as string | null) ?? null,
      storagePath: (row.storage_path as string | null) ?? null,
      fileName: (row.file_name as string | null) ?? null,
      mimeType: (row.mime_type as string | null) ?? null,
      sizeBytes: (row.size_bytes as number | null) ?? null,
      checksumSha256: (row.checksum_sha256 as string | null) ?? null,
      expiresAt: (row.expires_at as string | null) ?? null,
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      completedAt: (row.completed_at as string | null) ?? null,
      lastError: (row.last_error as string | null) ?? null
    } satisfies ReportExport
  }

  private mapTokenUsageEvent(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      workspaceId: (row.workspace_id as string | null) ?? null,
      jobId: (row.job_id as string | null) ?? null,
      questionnaireId: (row.questionnaire_id as string | null) ?? null,
      eventType: row.event_type as string,
      provider: (row.provider as string | null) ?? null,
      model: (row.model as string | null) ?? null,
      tokensIn: Number(row.tokens_in ?? 0),
      tokensOut: Number(row.tokens_out ?? 0),
      costUsd: Number(row.cost_usd ?? 0),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.created_at as string
    } satisfies TokenUsageEvent
  }
}
