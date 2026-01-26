# TuesdayTrust — PRD (Product Requirements Document)

## 1) Product Summary
TuesdayTrust is a **governed answer engine** for security questionnaires and trust portal reviews.

It helps teams complete security questionnaires quickly and consistently by:
- maintaining a canonical, approved Answer Library,
- matching incoming questions to approved answers with confidence scoring,
- enforcing human review where needed,
- preserving auditability and change control,
- producing clear ROI metrics (time saved, autofill rate, turnaround time).

## 2) Problem
Security questionnaires are high-stakes, repetitive, and revenue-blocking:
- sellers receive vendor security questionnaires in Excel/PDF/Word or portal UIs,
- teams copy/paste answers across old spreadsheets,
- inconsistencies create risk,
- the process slows deals and consumes senior security time.

Existing compliance platforms reduce evidence collection but often do not eliminate the last-mile questionnaire workflow pain.

## 3) Goals
- Reduce questionnaire completion time from days to hours.
- Increase consistency and governance of security answers.
- Provide explainable confidence scoring and a review workflow.
- Create a compounding Answer Library that becomes a durable asset.
- Keep the system operationally low-touch (reliable jobs, clear states, low support).

## 4) Non-goals
- Not a full compliance/GRC platform.
- Not autonomous “AI that answers anything”.
- Not a portal scraper that bypasses authentication or terms of service.
- Not a replacement EHR/CRM style all-in-one platform.

## 5) Primary Personas (ICP)
1) **Security Lead / GRC Manager** (SaaS 20–200 employees)
   - Owns security reviews, questionnaire accuracy, evidence.
2) **Sales Engineer / Deal Desk** (SaaS selling mid-market/enterprise)
   - Needs quick turnaround to unblock deals.
3) **Compliance Consultant / Auditor**
   - Completes questionnaires across multiple clients, wants throughput.

## 6) Core Workflows (End State)

### 6.1 Onboarding + Library Bootstrapping
User can initialize the Answer Library via:
- importing one or more previously completed questionnaires (XLSX/DOCX/PDF),
- importing docs (Notion/Confluence/Google Docs exports),
- starting from templates,
- manual authoring.

System outputs Draft answers and guides the user through:
- dedupe/merge suggestions,
- owner assignment,
- scope assignment (product/region/tier),
- approval workflow,
- review cadence configuration.

### 6.2 Upload Questionnaire (File-Native)
User uploads XLSX, DOCX, or PDF.
System:
- parses and normalizes questions,
- retrieves candidate answers from approved library,
- re-ranks and selects best answer (or flags “needs review/new answer”),
- writes suggestions and confidence reasons,
- shows a review queue,
- exports a completed file in the original format with fidelity.

### 6.3 Live Question Mode (Trust Portals)
For trust portals that cannot be uploaded:
- user copies a question from the portal,
- pastes into TuesdayTrust “Live Question Mode”,
- system returns suggested answer + evidence + confidence,
- user copies back into portal,
- the mapping is stored to improve future reuse.

No scraping, no auto-filling of portal fields, no bypassing authentication.

### 6.4 Review + Governance
- Suggestions are bucketed into: Auto-fill, Needs Review, Manual.
- Human review is explicit, with clear actions:
  - Accept,
  - Edit (update canonical or create variant),
  - Create variant,
  - Mark as “New answer needed”.

All actions create audit logs. Approved content is the only content used for high-confidence auto-fill.

### 6.5 Answer Library Maintenance (Compounding Loop)
- Duplicate detection and merge workflows.
- Review cadence: answers expire until re-approved.
- Scope mismatch warnings (product/region/tier).
- Change impact: show which questionnaires used an answer.
- Usage stats per answer (reuse count, edit rate, last used).

### 6.6 ROI and Analytics
- Time saved estimate (conservative assumptions; transparent method).
- Autofill rate over time.
- Average time-to-complete per questionnaire.
- Review bottlenecks (who/where time is spent).
- Confidence distribution and drift alerts.

## 7) Product Requirements (Functional)

### 7.1 Answer Library
- Canonical answers with:
  - title, body, tags,
  - scope (product/region/tier),
  - owner,
  - status (draft/approved/deprecated),
  - review cadence,
  - evidence links,
  - audit history,
  - variants.
- Search + filters by tag, scope, status, last reviewed.
- Merge/dedupe suggestions and workflows.

### 7.2 Questionnaire Engine
- XLSX ingestion with robust parsing and preservation of format on export.
- Question normalization (strip noise, detect constraints).
- Candidate retrieval (vector + metadata filters).
- Re-ranking and confidence scoring.
- Suggestion storage + review queue.
- Export completed XLSX with original structure preserved.

### 7.3 Live Question Mode
- Paste question, optional context and constraints.
- Returns suggested answer + evidence + confidence explanation.
- One-click copy with formatting options (plain, shortened, with evidence links).
- Stores mapping and analytics.

### 7.4 Roles and Permissions
Roles: Admin, Editor, Reviewer, Viewer.
- Admin: manage workspace, users, retention, billing, keys.
- Editor: create/edit drafts, propose changes, upload.
- Reviewer: approve, accept suggestions, manage variants.
- Viewer: view and copy, export allowed by policy.

### 7.5 Auditability
- All state changes logged with who/what/when.
- Export events logged.
- Answer approvals/rejections logged.

## 8) Product Requirements (Non-Functional)
- Multi-tenancy isolation (RLS).
- Job reliability (async processing, retries, idempotency).
- Observability (structured logs + metrics + alerting).
- Security baseline (encryption, least privilege, retention/deletion).
- Cost control (per-tenant budgets, rate limits, usage telemetry).
