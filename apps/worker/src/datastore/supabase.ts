import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type {
  Answer,
  Job,
  JobAttempt,
  Questionnaire,
  QuestionnaireFile
} from "@tuesdaytrust/shared"
import type {
  AuditEventInput,
  DataStore,
  ExportFileInput,
  JobAttemptInput,
  NewQuestion,
  NewSuggestion
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
    const { data } = await this.client
      .from("org_usage")
      .select("*")
      .eq("org_id", orgId)
      .eq("period_start", periodStart)
      .maybeSingle()

    if (!data) return null

    return {
      orgId: data.org_id,
      periodStart: data.period_start,
      tokensIn: data.tokens_in ?? 0,
      tokensOut: data.tokens_out ?? 0
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
}
