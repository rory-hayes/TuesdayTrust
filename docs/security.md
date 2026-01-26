# TuesdayTrust — Security

TuesdayTrust is a trust product. Security posture is not optional.

---

## 1) Security Principles
- Least privilege everywhere.
- Multi-tenant isolation via RLS and org-scoped queries.
- Human-in-the-loop governance: no silent changes.
- Auditability for all state changes and exports.
- Explicit retention and deletion controls.
- No training on customer data; no data leakage through prompts.

---

## 2) Threat Model (high-level)
### Primary threats
- Cross-tenant data exposure (RLS failure, query bug)
- Leaked uploads (misconfigured buckets, signed URL misuse)
- Prompt injection / data exfiltration via LLM calls
- Unauthorized exports or evidence sharing
- Abuse of the system as a generic AI API
- Token/cost blowups (DoS via large uploads)

### Required mitigations
- Strict RLS policies + server-side checks.
- Private storage buckets; signed URLs short TTL.
- Input sanitization; never pass untrusted portal content to privileged tools.
- Hard limits: file size, question count, per-tenant budgets.
- Audit logs for exports and answer changes.
- Secrets management (Supabase secrets / env vars); never in client.

---

## 3) Data Classification
- STANDARD: typical questionnaire content
- SENSITIVE: architecture/security posture details
- RESTRICTED: credentials, secrets (should be blocked)

Rules:
- Detect and block obvious secrets in uploads where possible.
- Provide tenant controls to mark answers/evidence as sensitive/restricted.

---

## 4) Authentication and Authorization
- Supabase Auth for users.
- Roles: Admin, Editor, Reviewer, Viewer (see PRD).
- RLS is the enforcement layer; APIs must still validate membership.
 - Org invites are token-based with expiry; accept requires an authenticated session and email match when available.
 - When SSO is enabled and a domain is configured, API access enforces email domain matching for org-scoped routes.

Permission highlights:
- Only Reviewer/Admin can approve answers and merge duplicates.
- Only Admin can change retention policies and billing settings.
- Export permission is policy-controlled and logged.

### Role matrix (current enforcement)
- Admin: all actions.
- Editor: upload questionnaires, create/edit draft answers, Live Question Mode.
- Reviewer: approve/merge answers, requeue jobs, Live Question Mode.
- Viewer: read-only access; no write actions.

### Trust Center sharing
- Share links are token-based, revocable, and expiring.
- Public access is limited to the shared snapshot only.
- Evidence exposed via share links must be marked `shareable`.
- Allowlists must explicitly control which answers/evidence are visible publicly.
- Access requests are logged and require Admin approval before expanding exposure.

---

## 5) Storage Security
- Supabase Storage buckets are private.
- Upload flow uses signed URLs.
- URLs expire quickly (e.g., 5–15 minutes for upload; 1 hour for export download).
- Object paths include org_id and questionnaire_id.
- Virus scanning is recommended (phase 2+), at minimum content-type validation.

---

## 6) Retention and Deletion
Defaults:
- Raw uploads auto-delete after 30 days (configurable).
- Export files retained 90 days (configurable).
- Structured data (questions, mappings, answers) retained until tenant deletes workspace.

Requirements:
- Workspace delete must cascade and remove storage objects.
- Users can request full org deletion.

---

## 7) OpenAI / AI Safety Controls
- Use OpenAI in “select-from-candidates” mode only.
- Do not send restricted/secrets content to OpenAI.
- Strip irrelevant text and only send minimal question + candidate answers.
- Never include other tenants’ content in prompts.

Logging:
- Store token usage and request ids (no raw prompt content by default).
- Provide opt-in debug mode for prompt retention (enterprise only).

---

## 8) Audit Logging Requirements
Audit events MUST be produced for:
- Answer create/edit/approve/deprecate/merge
- Evidence create/link/unlink
- Questionnaire upload, processing start/end, export
- User role changes
- Retention policy changes
- Job requeue/cancel

Audit payload must include sufficient context for forensic review.

---

## 9) Security Roadmap (credibility)
- Phase 1: baseline controls above + good hygiene.
- Phase 2: SSO/RBAC enhancements, malware scanning, DPA template.
- Phase 3: pursue SOC2 Type I if needed for enterprise expansion.
