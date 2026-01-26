# TuesdayTrust — Acceptance Criteria

This is the canonical checklist for “done”. Every build task must map to these criteria.

---

## A) Onboarding + Workspace
- Users can sign up and create an org + workspace.
- Users can invite team members and assign roles.
- RLS ensures a user cannot access another org’s data.

## B) Upload + Questionnaire Processing (XLSX)
- User can upload XLSX via signed URL (no public bucket).
- User can upload DOCX via signed URL (no public bucket).
- User can upload PDF via signed URL (no public bucket).
- Creating a questionnaire enqueues a job and returns immediately.
- Questionnaire status transitions follow schema state machine.
- Processing produces:
  - Questions extracted and normalized
  - Suggestions with confidence bucket + reasons
  - Export file (or export job) with original structure preserved for XLSX
  - DOCX export uses a structured Q/A document (formatting may differ from input)
  - PDF export uses a structured Q/A document (formatting may differ from input)
- Failures surface clearly with `failed_reason` and retry option.

## C) Review Workflow
- Review screen supports filtering by confidence bucket.
- Actions:
  - Accept suggestion (logs audit event)
  - Edit suggestion (creates audit event; prompts canonical vs variant)
  - Mark “New answer needed”
- Only approved canonical answers can be used for Auto-fill.
- Confidence explanation is visible (vector similarity, scope match, freshness).

## D) Answer Library
- Users can create draft answers.
- Reviewer/Admin can approve/deprecate answers.
- Answers have:
  - owner
  - scope
  - tags
  - review cadence
  - evidence links
- Answer usage stats are displayed.
- Duplicate answers can be merged by Reviewer/Admin (audit logged).

## E) Live Question Mode (Trust Portals)
- User can paste a portal question and receive:
  - suggested answer (from candidates)
  - confidence bucket + reasons
  - evidence links
- User can save mapping feedback (accepted/edited/new answer needed).
- No portal scraping or auto-fill is implemented.

## F) Security
- RLS active and tested for key tables.
- Audit events recorded for all required actions (security.md).
- Uploads and exports are private with short-lived signed URLs.
- Retention defaults enforced (uploads auto-delete after configured period).
- OpenAI calls follow policy: select-from-candidates; no free-form factual generation.

## G) Observability
- Job pipeline logs include job_id, org_id, questionnaire_id, stage.
- Token usage metrics recorded per job and per org.
- Alerts defined for failure spikes and backlog growth.

## H) Performance + Limits
- Batch embeddings are used.
- Per-tenant concurrency caps enforced.
- Max file size and max question count enforced.
- If budgets exceed, system degrades gracefully (e.g., skip reranker).
