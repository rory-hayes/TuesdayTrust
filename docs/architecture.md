# TuesdayTrust — Architecture

## 1) High-Level System Overview

TuesdayTrust is built as a Supabase-first application with an asynchronous job pipeline for questionnaire processing.

### Core components
- **Web app**: Next.js (TypeScript) + Catalyst UI kit + Tailwind tokens.
- **Supabase**:
  - Postgres (source of truth)
  - Storage (uploads/exports)
  - Auth (users + org membership)
  - RLS for multi-tenancy
- **Edge Functions** (API gateway + dispatcher):
  - Create questionnaire records
  - Generate signed upload URLs
  - Enqueue background jobs
  - Serve lightweight read APIs
  - Manage Trust Center allowlists + access requests
  - Enqueue client report exports (CSV/PDF)
- **Access control**:
  - Org memberships define baseline roles.
  - When consultant mode is enabled, workspace memberships gate workspace access.
- **Job Queue**: Upstash QStash (recommended) for durable job dispatch.
- **Worker Service** (Node/TS recommended):
  - Processes questionnaires asynchronously
  - Calls OpenAI for embeddings + re-ranking + constrained rewrites
  - Writes results back to Postgres + Storage

---

## 2) Core Data Flow (File Upload → Completed Export)

1) User uploads file via signed URL to Supabase Storage.
2) Frontend calls `POST /api/questionnaires` (Edge Function) with file metadata.
3) Edge Function creates:
   - Questionnaire row (status `queued`)
   - QuestionnaireFile row (storage location, checksum, size)
   - Job row (type `PROCESS_QUESTIONNAIRE`)
4) Edge Function enqueues `{job_id, questionnaire_id}` to QStash.
5) Worker pulls job:
   - downloads file from Storage
   - parses XLSX, DOCX, or PDF deterministically into Questions
   - generates embeddings for questions in batches
   - retrieves candidate Answers (pgvector) filtered by scope + status
   - (optional) LLM re-ranks candidates and selects answer ids
   - computes confidence score + bucket
   - stores Suggestions + mappings
   - generates export file (XLSX, DOCX, or PDF) and uploads to Storage
   - marks Questionnaire `ready_for_review` or `completed` depending on workflow
6) UI subscribes (or polls) for status updates and renders progress.

---

## 3) Job System Design

### Goals
- Async, reliable, observable processing
- Idempotent and retryable
- Per-tenant concurrency caps
- Cost control per tenant and per job

### Key patterns
- **Idempotency keys**:
  - Job id + stage is the idempotency boundary.
- **Job attempts**:
  - Every failure produces a JobAttempt row with error payload and retry metadata.
- **Stage transitions**:
  - A strict state machine (see `docs/schema.md`).
- **Cancellation and pause**:
  - Admin can pause processing per tenant; worker checks before executing stages.
 - **Report exports**:
   - `EXPORT_REPORT` jobs generate CSV/PDF summaries and store in Supabase Storage.

---

## 4) AI Invocation Policy (OpenAI)

TuesdayTrust uses OpenAI with strict constraints.

### Allowed AI uses
1) **Embeddings**:
   - Embed canonical answers and incoming questions.
   - Used for candidate retrieval and clustering.
2) **Re-ranking** (optional but recommended):
   - Given a question and top-N candidate answers, select the best candidate.
   - Output must be: `{selected_answer_id | null, rationale, missing_fields, confidence_adjustment}`.
   - Never generate new facts.
3) **Constrained rewrite**:
   - Transform an existing answer to meet formatting constraints.
   - Example: “Shorten to 250 chars without changing meaning.”

### Forbidden AI uses
- Free-form generation of new factual answers for a customer’s security posture.
- Using customer data to train models.
- Autonomously approving answer changes.

### Safety rails
- “Select-from-candidates or flag” approach.
- Confidence thresholds control automation:
  - Auto-fill only when high confidence and scope matches.
  - Otherwise require review.

---

## 5) Retrieval + Confidence Scoring (Hybrid)

### Candidate generation
- Embed normalized question text.
- Query pgvector index on approved answers.
- Filter by:
  - tenant/workspace,
  - answer status (approved),
  - scope match (product/region/tier),
  - sensitivity policy.

Return top N candidates.

### Re-ranking
- Combine:
  - vector similarity,
  - lexical overlap,
  - constraint match (yes/no, required fields),
  - freshness (last reviewed),
  - historical acceptance rate.

Optional LLM re-ranker may adjust confidence and select best candidate.

### Confidence buckets
- `AUTO_FILL` (≥ threshold; safe)
- `NEEDS_REVIEW`
- `MANUAL` (no match)

Thresholds are defined and tuned in `docs/schema.md` + `docs/acceptance-criteria.md`.

---

## 6) Storage and Retention

- Uploads stored in Supabase Storage (private bucket).
- Exports stored similarly, with access logged.
- Default retention:
  - raw uploads auto-delete after 30 days (configurable per tenant).
  - parsed structured data (questions/mappings) retained until deleted by tenant.

---

## 7) Scaling and Cost Controls

### Scaling levers
- Worker horizontal scaling (stateless).
- Batch embedding requests.
- Concurrency caps per tenant.
- Queue backpressure (QStash scheduling).

### Cost controls
- Per-tenant monthly token budget and hard cap.
- Per-job max questions and max file size.
- Graceful degradation:
  - skip LLM re-ranking if budget tight,
  - fall back to vector-only ranking.
- Org limits are stored in `org_limits`; monthly usage in `org_usage`.
- While LLM calls are stubbed, token usage is estimated from question counts for budget simulation.

---

## 8) Technology Choices (current decisions)
- Supabase for DB/Auth/Storage.
- Edge Functions for API + dispatch.
- QStash + worker for background processing.
- Catalyst UI kit for UI foundation.
- Styling: Catalyst demo neutral palette (zinc) and Inter typography.

See `docs/decisions.md` for full ADRs.
