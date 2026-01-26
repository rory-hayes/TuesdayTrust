# TuesdayTrust — Schema (Postgres + pgvector)

This document is the **source of truth** for the data model and state machines.

Implementation will live in Supabase Postgres with RLS enabled.

---

## 1) Multi-Tenancy Model
- All tenant-owned rows include `org_id` (and often `workspace_id`).
- RLS enforces:
  - users can only access rows where they are members of the org/workspace.
- Never rely on client-side filtering for tenant isolation.

---

## 2) Core Enums

### org_role
- `ADMIN`
- `EDITOR`
- `REVIEWER`
- `VIEWER`

### answer_status
- `DRAFT`
- `APPROVED`
- `DEPRECATED`

### questionnaire_status
- `UPLOADED`
- `QUEUED`
- `PARSING`
- `PARSED`
- `EMBEDDING`
- `MATCHING`
- `READY_FOR_REVIEW`
- `EXPORTING`
- `COMPLETED`
- `FAILED`

### job_type
- `PROCESS_QUESTIONNAIRE`
- `EXPORT_QUESTIONNAIRE`
- `EXPORT_REPORT`
- `REINDEX_ANSWERS`
- `DEDUPE_ANSWERS`

### job_status
- `QUEUED`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`

### confidence_bucket
- `AUTO_FILL`
- `NEEDS_REVIEW`
- `MANUAL`

### sensitivity_level
- `STANDARD`
- `SENSITIVE`
- `RESTRICTED`

### live_question_action
- `accepted`
- `edited`
- `new_answer_needed`

---

## 3) Tables (v1 end-state target)

### organizations
- `id` (uuid, pk)
- `name` (text)
- `created_at` (timestamptz)

### workspaces
- `id` (uuid, pk)
- `org_id` (uuid, fk organizations)
- `name` (text)
- `created_at`

### org_memberships
- `id` (uuid, pk)
- `org_id` (uuid, fk)
- `user_id` (uuid, fk auth.users)
- `role` (org_role)
- `created_at`

### org_invites
- `id` (uuid, pk)
- `org_id` (uuid, fk)
- `email` (text)
- `role` (org_role)
- `token` (text, unique)
- `expires_at` (timestamptz)
- `created_by` (uuid)
- `created_at`
- `accepted_at` (timestamptz, nullable)
- `accepted_by` (uuid, nullable)

### org_limits
- `id` (uuid, pk)
- `org_id` (uuid, fk, unique)
- `max_upload_bytes` (bigint, nullable)
- `max_questions` (int, nullable)
- `max_active_jobs` (int, nullable)
- `monthly_token_budget` (int, nullable)
- `created_at`, `updated_at`

### org_usage
- `id` (uuid, pk)
- `org_id` (uuid, fk)
- `period_start` (date)
- `tokens_in` (int)
- `tokens_out` (int)
- `created_at`, `updated_at`

### org_sso_settings
- `id` (uuid, pk)
- `org_id` (uuid, fk, unique)
- `enabled` (boolean)
- `provider` (text, nullable)
- `domain` (text, nullable)
- `metadata_url` (text, nullable)
- `created_at`, `updated_at`

### org_features
- `id` (uuid, pk)
- `org_id` (uuid, fk, unique)
- `trust_center_enabled` (boolean)
- `consultant_mode_enabled` (boolean)
- `created_at`, `updated_at`

### trust_center_shares
- `id` (uuid, pk)
- `org_id` (uuid, fk)
- `workspace_id` (uuid, fk)
- `token` (text, unique)
- `include_answers` (boolean)
- `include_evidence` (boolean)
- `expires_at` (timestamptz, nullable)
- `revoked_at` (timestamptz, nullable)
- `created_by` (uuid)
- `created_at`

### trust_center_allowlist_answers
- `id` (uuid, pk)
- `org_id` (uuid, fk)
- `workspace_id` (uuid, fk)
- `answer_id` (uuid, fk answers)
- `created_by` (uuid)
- `created_at`

### trust_center_allowlist_evidence
- `id` (uuid, pk)
- `org_id` (uuid, fk)
- `workspace_id` (uuid, fk)
- `evidence_id` (uuid, fk evidence)
- `created_by` (uuid)
- `created_at`

### trust_center_access_requests
- `id` (uuid, pk)
- `org_id` (uuid, fk)
- `workspace_id` (uuid, fk)
- `share_id` (uuid, fk trust_center_shares, nullable)
- `requester_name` (text, nullable)
- `requester_email` (text, nullable)
- `requester_company` (text, nullable)
- `message` (text, nullable)
- `status` (text) — PENDING | APPROVED | DENIED
- `created_at`, `reviewed_at`, `reviewed_by`, `decision_note`

### trust_center_access_request_answers
- `id` (uuid, pk)
- `request_id` (uuid, fk trust_center_access_requests)
- `org_id` (uuid, fk)
- `workspace_id` (uuid, fk)
- `answer_id` (uuid, fk answers)
- `created_at`

### trust_center_access_request_evidence
- `id` (uuid, pk)
- `request_id` (uuid, fk trust_center_access_requests)
- `org_id` (uuid, fk)
- `workspace_id` (uuid, fk)
- `evidence_id` (uuid, fk evidence)
- `created_at`

### workspace_memberships
- `id` (uuid, pk)
- `workspace_id` (uuid, fk)
- `user_id` (uuid, fk auth.users)
- `role` (org_role)
- `created_at`

### questionnaires
- `id` (uuid, pk)
- `org_id` (uuid, fk)
- `workspace_id` (uuid, fk)
- `title` (text)
- `source` (text) — e.g. “Excel upload”, “Portal session”, “Doc import”
- `status` (questionnaire_status)
- `progress_total` (int)
- `progress_done` (int)
- `created_by` (uuid)
- `created_at`, `updated_at`
- `failed_reason` (text, nullable)

### questionnaire_files
- `id` (uuid, pk)
- `questionnaire_id` (uuid, fk)
- `org_id` (uuid)
- `storage_bucket` (text)
- `storage_path` (text)
- `file_name` (text)
- `mime_type` (text)
- `size_bytes` (bigint)
- `checksum_sha256` (text)
- `kind` (text) — input | export
- `expires_at` (timestamptz, nullable)
- `created_at`

### questions
- `id` (uuid, pk)
- `questionnaire_id` (uuid, fk)
- `org_id` (uuid)
- `workspace_id` (uuid)
- `index` (int) — deterministic order
- `section` (text, nullable)
- `prompt` (text) — normalized question text
- `raw_prompt` (text) — original text
- `response_type` (text) — yesno | free_text | numeric | date | select
- `constraints` (jsonb) — {max_chars, required_fields, allowed_values}
- `source_ref` (jsonb) — {sheet, row, col} for XLSX
- `created_at`

### answers (canonical)
- `id` (uuid, pk)
- `org_id` (uuid)
- `workspace_id` (uuid)
- `title` (text)
- `body` (text)
- `status` (answer_status)
- `owner_user_id` (uuid)
- `tags` (text[])
- `scope` (jsonb) — {products:[], regions:[], tiers:[]}
- `sensitivity` (sensitivity_level)
- `review_interval_days` (int)
- `last_reviewed_at` (timestamptz, nullable)
- `created_at`, `updated_at`

### answer_variants
- `id` (uuid, pk)
- `org_id` (uuid)
- `workspace_id` (uuid)
- `answer_id` (uuid, fk answers)
- `body` (text)
- `scope_override` (jsonb, nullable)
- `status` (answer_status)
- `created_by` (uuid)
- `created_at`

### evidence
- `id` (uuid, pk)
- `org_id` (uuid)
- `workspace_id` (uuid)
- `type` (text) — link | upload
- `title` (text)
- `url` (text, nullable)
- `storage_bucket` (text, nullable)
- `storage_path` (text, nullable)
- `access_level` (text) — internal | shareable
- `expires_at` (timestamptz, nullable)
- `created_at`

### answer_evidence_links
- `id` (uuid, pk)
- `org_id` (uuid)
- `answer_id` (uuid, fk)
- `evidence_id` (uuid, fk)
- `created_at`

### answer_embeddings
- `answer_id` (uuid, pk fk answers)
- `org_id` (uuid)
- `workspace_id` (uuid)
- `embedding` (vector) — pgvector
- `embedding_model` (text)
- `created_at`

### question_embeddings
- `question_id` (uuid, pk fk questions)
- `org_id` (uuid)
- `workspace_id` (uuid)
- `embedding` (vector)
- `embedding_model` (text)
- `created_at`

### suggestions
- `id` (uuid, pk)
- `question_id` (uuid, fk questions)
- `org_id` (uuid)
- `workspace_id` (uuid)
- `selected_answer_id` (uuid, fk answers, nullable)
- `selected_variant_id` (uuid, fk answer_variants, nullable)
- `confidence_score` (numeric) — 0..1
- `confidence_bucket` (confidence_bucket)
- `reasons` (jsonb) — {vector, lexical, scope, freshness, history}
- `status` (text) — proposed | accepted | edited | needs_new_answer
- `reviewed_by` (uuid, nullable)
- `reviewed_at` (timestamptz, nullable)
- `created_at`

### live_questions
- `id` (uuid, pk)
- `org_id` (uuid)
- `workspace_id` (uuid)
- `question_text` (text)
- `context` (jsonb)
- `constraints` (jsonb)
- `created_by` (uuid)
- `created_at`

### live_question_mappings
- `id` (uuid, pk)
- `live_question_id` (uuid, fk live_questions)
- `org_id` (uuid)
- `workspace_id` (uuid)
- `selected_answer_id` (uuid, fk answers, nullable)
- `selected_variant_id` (uuid, fk answer_variants, nullable)
- `action` (live_question_action)
- `final_text` (text, nullable)
- `created_by` (uuid)
- `created_at`

### audit_events
- `id` (uuid, pk)
- `org_id` (uuid)
- `workspace_id` (uuid, nullable)
- `actor_user_id` (uuid, nullable)
- `event_type` (text)
- `entity_type` (text)
- `entity_id` (uuid)
- `payload` (jsonb)
- `created_at`

### jobs
- `id` (uuid, pk)
- `org_id` (uuid)
- `workspace_id` (uuid)
- `job_type` (job_type)
- `status` (job_status)
- `payload` (jsonb)
- `attempts` (int)
- `max_attempts` (int)
- `next_run_at` (timestamptz)
- `locked_at` (timestamptz, nullable)
- `locked_by` (text, nullable)
- `created_at`, `updated_at`
- `last_error` (text, nullable)

### job_attempts
- `id` (uuid, pk)
- `job_id` (uuid, fk jobs)
- `started_at`, `ended_at`
- `status` (text)
- `error` (text, nullable)
- `metrics` (jsonb) — tokens, duration_ms, counts
- `created_at`

### report_exports
- `id` (uuid, pk)
- `org_id` (uuid, fk)
- `workspace_id` (uuid, fk, nullable)
- `job_id` (uuid, fk jobs, nullable)
- `format` (text) — csv | pdf
- `status` (job_status)
- `storage_bucket` (text, nullable)
- `storage_path` (text, nullable)
- `file_name` (text, nullable)
- `mime_type` (text, nullable)
- `size_bytes` (bigint, nullable)
- `checksum_sha256` (text, nullable)
- `expires_at` (timestamptz, nullable)
- `created_by` (uuid)
- `created_at`, `updated_at`, `completed_at`
- `last_error` (text, nullable)

### token_usage_events
- `id` (uuid, pk)
- `org_id` (uuid, fk)
- `workspace_id` (uuid, fk, nullable)
- `job_id` (uuid, fk jobs, nullable)
- `questionnaire_id` (uuid, fk questionnaires, nullable)
- `event_type` (text)
- `provider` (text, nullable)
- `model` (text, nullable)
- `tokens_in` (int)
- `tokens_out` (int)
- `cost_usd` (numeric)
- `metadata` (jsonb)
- `created_at`

---

## 4) Indexes (minimum)
- `answers(org_id, workspace_id, status)`
- `questions(questionnaire_id, index)`
- `suggestions(question_id)`
- `live_questions(org_id, workspace_id, created_at desc)`
- `live_question_mappings(live_question_id)`
- pgvector index on `answer_embeddings.embedding` (HNSW/IVFFLAT depending on pgvector version)
- `audit_events(org_id, created_at desc)`
- `jobs(status, next_run_at)`
- `trust_center_allowlist_answers(workspace_id)`
- `trust_center_allowlist_evidence(workspace_id)`
- `trust_center_access_requests(workspace_id, created_at desc)`
- `report_exports(org_id, created_at desc)`
- `token_usage_events(org_id, created_at desc)`

---

## 5) State Machines

### Questionnaire status transitions (strict)
- UPLOADED → QUEUED → PARSING → PARSED → EMBEDDING → MATCHING → READY_FOR_REVIEW → EXPORTING → COMPLETED
- Any stage may transition to FAILED with `failed_reason` set.
- Retry logic applies at job level, not via ad-hoc status changes.

### Suggestion status transitions
- proposed → accepted
- proposed → edited
- proposed → needs_new_answer
- edited → accepted (after reviewer confirmation)

---

## 6) RLS Notes (required)
- Enforce org membership in RLS policies for every table above.
- Ensure Storage object access is mediated via signed URLs and server-side checks.
