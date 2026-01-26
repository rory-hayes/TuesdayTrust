# TuesdayTrust — API (Edge Functions + Worker Contracts)

This document defines the public API surface used by the web app and the internal contract between Edge Functions and the worker.

All endpoints require authentication unless explicitly noted.

---

## 1) Auth
- Supabase Auth session (JWT) is required for API calls.
- Edge Functions must validate the user and org/workspace membership.
- Use RLS in DB as the final enforcement layer.

---

## 2) Endpoints (Edge Functions)

### GET /api/me
Return current user, org memberships, workspaces, and enabled features.

Response:
```json
{
  "user": { "id": "uuid", "email": "user@acme.com" },
  "memberships": [{ "org_id": "uuid", "role": "ADMIN" }],
  "orgs": [{ "id": "uuid", "name": "Acme" }],
  "workspaces": [{ "id": "uuid", "org_id": "uuid", "name": "Primary", "org_name": "Acme" }],
  "features": { "org_id": { "trust_center_enabled": false, "consultant_mode_enabled": false } }
}
```

### POST /api/onboarding
Create an org + workspace and assign the current user as Admin.

Request:
```json
{ "org_name": "Acme", "workspace_name": "Primary" }
```

Response:
```json
{
  "org": { "id": "uuid", "name": "Acme" },
  "workspace": { "id": "uuid", "org_id": "uuid", "name": "Primary" },
  "role": "ADMIN"
}
```

### POST /api/workspaces
Create a workspace within an org (Admin only).

Request:
```json
{ "org_id": "uuid", "name": "Client Workspace" }
```

### GET /api/workspaces/:id/members
List workspace members (Admin only).

### POST /api/workspaces/:id/members
Add an org member to a workspace (Admin only).

Request:
```json
{ "user_id": "uuid", "role": "EDITOR (optional)" }
```

### POST /api/workspaces/:id/members/:user_id/role
Update a workspace member role (Admin only).

Request:
```json
{ "role": "VIEWER" }
```

### POST /api/workspaces/:id/members/:user_id/remove
Remove a member from a workspace (Admin only).

### GET /api/orgs/:id/members
List org members (Admin only).

### POST /api/orgs/:id/members/:user_id/role
Update a member role (Admin only).

Request:
```json
{ "role": "EDITOR" }
```

### POST /api/orgs/:id/members/:user_id/remove
Remove a member from the org (Admin only).

### GET /api/orgs/:id/invites
List org invites (Admin only).

### POST /api/orgs/:id/invites
Create an invite (Admin only).

Request:
```json
{ "email": "person@acme.com", "role": "EDITOR", "expires_in_days": 7 }
```

### POST /api/invites/accept
Accept an invite token.

Request:
```json
{ "token": "invite-token" }
```

### GET /api/orgs/:id/settings
Return org settings (limits, SSO config, feature flags).

### POST /api/orgs/:id/settings
Update org settings (Admin only).

Request:
```json
{
  "limits": { "max_upload_bytes": 10485760, "max_questions": 500 },
  "sso": { "enabled": false, "provider": "SAML", "domain": "acme.com" },
  "features": { "trust_center_enabled": true, "consultant_mode_enabled": true }
}
```

### GET /api/orgs/:id/usage
Return current month usage and budget (Admin only).

Response:
```json
{
  "period_start": "2026-01-01",
  "tokens_in": 0,
  "tokens_out": 0,
  "tokens_used": 0,
  "monthly_token_budget": 100000,
  "budget_remaining": 100000
}
```

### GET /api/orgs/:id/reports
Return workspace-level reporting summaries (Admin only).

Response:
```json
{
  "workspaces": [
    {
      "workspace_id": "uuid",
      "name": "Client Workspace",
      "counts": {
        "questionnaires_total": 4,
        "questionnaires_completed": 2,
        "questionnaires_in_review": 1,
        "questionnaires_failed": 1,
        "suggestions_total": 120,
        "auto_fill": 80,
        "needs_review": 30,
        "manual": 10,
        "approved_answers": 42
      },
      "auto_fill_rate": 0.67,
      "time_saved_hours": 4,
      "last_activity_at": "2026-01-26T00:00:00Z"
    }
  ]
}
```

### POST /api/orgs/:id/reports/export
Queue a client report export (Admin only).

Request:
```json
{ "format": "csv", "workspace_id": "uuid (optional)" }
```

Response:
```json
{
  "report_export": { "id": "uuid", "format": "csv", "status": "QUEUED" },
  "job_id": "uuid"
}
```

### GET /api/orgs/:id/reports/exports
List recent report exports (Admin only).

Query params:
- `workspace_id` (optional)


### POST /api/questionnaires
Create a questionnaire record and enqueue processing.

Allowed input file MIME types:
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX)
- `application/pdf` (PDF)

Request:
```json
{
  "questionnaire_id": "uuid (optional)",
  "workspace_id": "uuid",
  "title": "Acme Security Questionnaire",
  "input_file": {
    "bucket": "uploads",
    "path": "org/{org_id}/questionnaires/{uuid}/input.xlsx",
    "file_name": "acme.xlsx",
    "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "size_bytes": 123456,
    "checksum_sha256": "…"
  }
}
```

### POST /api/uploads/sign
Generate a signed upload URL for an XLSX or DOCX file before creating the questionnaire.

Allowed input file MIME types:
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX)
- `application/pdf` (PDF)

Request:
```json
{
  "workspace_id": "uuid",
  "questionnaire_id": "uuid (optional)",
  "input_file": {
    "file_name": "acme.xlsx",
    "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "size_bytes": 123456
  }
}
```

Response:
```json
{
  "questionnaire_id": "uuid",
  "input_file": {
    "bucket": "uploads",
    "path": "org/{org_id}/questionnaires/{uuid}/input.xlsx",
    "file_name": "acme.xlsx",
    "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "size_bytes": 123456,
    "signed_url": "https://...",
    "expires_in": 600
  }
}
```

Response:
```json
{
  "questionnaire_id": "uuid",
  "status": "QUEUED",
  "job_id": "uuid"
}
```

### GET /api/questionnaires/:id
Return questionnaire metadata + progress + export link if available.

Response:
```json
{
  "id": "uuid",
  "title": "…",
  "status": "READY_FOR_REVIEW",
  "progress": {"done": 210, "total": 420},
  "export_file": {"bucket":"exports","path":"…","signed_url":"…"},
  "counts": {"auto_fill": 300, "needs_review": 90, "manual": 30}
}
```

### GET /api/questionnaires/:id/questions
Return questions + suggestions for review UI (paged).

Query params:
- `bucket` = AUTO_FILL | NEEDS_REVIEW | MANUAL | ALL
- `cursor` / `limit`

### POST /api/questionnaires/:id/requeue
Admin/reviewer requeues processing job (idempotent).

### POST /api/questionnaires/:id/export
Triggers export job (if export is not generated during processing).

---

## 3) Live Question Mode

### POST /api/live-question/answer
Request:
```json
{
  "workspace_id": "uuid",
  "question_text": "Do you enforce MFA for all admin access?",
  "context": {"section":"Access Control"},
  "constraints": {"max_chars": 500}
}
```

Response:
```json
{
  "live_question_id": "uuid",
  "confidence_bucket": "NEEDS_REVIEW",
  "confidence_score": 0.78,
  "suggested": {
    "answer_id": "uuid",
    "variant_id": null,
    "text": "…",
    "evidence": [{"title":"MFA Policy","url":"…"}]
  },
  "reasons": {
    "scope_match": true,
    "vector_similarity": 0.82,
    "lexical_overlap": 0.61,
    "freshness_days": 44
  }
}
```

### POST /api/live-question/map
Persist mapping feedback after user accepts/edits:
```json
{
  "live_question_id": "uuid",
  "selected_answer_id": "uuid",
  "action": "accepted|edited|new_answer_needed",
  "final_text": "…"
}
```

---

## 4) Answer Library (CRUD)

### GET /api/answers
Filters:
- `status`, `tag`, `scope`, `q`

### POST /api/answers
Create draft answer.

### POST /api/answers/:id/approve
Reviewer approves answer; audit event required.

### GET /api/answers/duplicates
List duplicate candidate pairs for approved answers.

Query params:
- `workspace_id` (required)

### GET /api/answers/expiring
List answers expiring within the review window.

Query params:
- `workspace_id` (required)
- `window_days` (optional, default 14)

### POST /api/answers/:id/review
Mark an answer as reviewed (updates `last_reviewed_at`); audit event required.

### POST /api/answers/:id/merge
Merge duplicates; requires reviewer/admin.

---

## 4.5) Trust Center (Preview)

### GET /api/trust-center/overview
Return Trust Center summary for a workspace (requires Trust Center feature flag).

Query params:
- `workspace_id` (required)

Response:
```json
{
  "workspace_id": "uuid",
  "summary": {
    "approved_answers": 12,
    "answers_with_evidence": 7,
    "evidence_total": 9,
    "evidence_shareable": 6
  },
  "answers": [{ "id": "uuid", "title": "MFA", "last_reviewed_at": "2026-01-01T00:00:00Z" }],
  "evidence": [{ "id": "uuid", "title": "Policy", "url": "https://example.com", "expires_at": null }]
}
```

### GET /api/trust-center/shares
List Trust Center share links for a workspace (Admin only).

Query params:
- `workspace_id` (required)

### POST /api/trust-center/shares
Create a Trust Center share link (Admin only).

Request:
```json
{
  "workspace_id": "uuid",
  "include_answers": true,
  "include_evidence": true,
  "expires_in_days": 30
}
```

### POST /api/trust-center/shares/:id/revoke
Revoke a Trust Center share link (Admin only).

### GET /api/trust-center/allowlist
Return approved answers/evidence and current allowlist (Admin only).

Query params:
- `workspace_id` (required)

### POST /api/trust-center/allowlist
Update allowlist selections (Admin only).

Request:
```json
{
  "workspace_id": "uuid",
  "answer_ids": ["uuid"],
  "evidence_ids": ["uuid"]
}
```

### POST /api/trust-center/access-request
Submit an access request from a shared link (no auth).

Request:
```json
{
  "token": "share-token",
  "requester_name": "Jane Doe",
  "requester_email": "jane@client.com",
  "requester_company": "Client Inc",
  "message": "Need more detail on SOC 2."
}
```

### GET /api/trust-center/access-requests
List access requests for a workspace (Admin only).

Query params:
- `workspace_id` (required)

### POST /api/trust-center/access-requests/:id
Approve or deny a request (Admin only).

Request:
```json
{ "status": "APPROVED", "decision_note": "Approved for Q1 review." }
```

### GET /api/trust-center/public
Return a shared Trust Center snapshot (no auth).

Query params:
- `token` (required)

### GET /api/analytics/roi
Return ROI metrics (autofill rate, time saved, completion time).

Query params:
- `workspace_id` (required)

---

## 5) Worker Contract

### Job payload format
```json
{
  "job_id": "uuid",
  "org_id": "uuid",
  "workspace_id": "uuid",
  "type": "PROCESS_QUESTIONNAIRE",
  "questionnaire_id": "uuid"
}
```

Report export payload:
```json
{
  "job_id": "uuid",
  "org_id": "uuid",
  "workspace_id": "uuid",
  "type": "EXPORT_REPORT",
  "report_export_id": "uuid",
  "format": "csv"
}
```

### Job result handling
Worker must update:
- `jobs.status`
- `questionnaires.status`
- `progress_done/total`
- `job_attempts.metrics` (tokens, duration_ms, counts)
- `audit_events` for major transitions

---

## 6) Error Semantics
- All API errors return:
```json
{"error": {"code":"…","message":"…","details":{…}}}
```
- Use consistent codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `RATE_LIMITED`, `INTERNAL_ERROR`.
- SSO enforcement uses `SSO_REQUIRED` when email domain mismatches.
