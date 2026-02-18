# EvidenceQ Security Baseline (Alpha)

This document reflects implemented baseline controls. It is not a certification statement and does not claim ISO/SOC2 compliance.

## Scope
- Product: EvidenceQ consultant-mode questionnaire workflow.
- Data classes: uploaded KB documents, questionnaire files, generated drafts, citations, exports, and audit metadata.

## Core Controls

### 1) Authentication and Authorization
- API requires bearer auth for all protected routes.
- Clerk JWT verification is used when Clerk env vars are configured.
- Dev auth fallback is allowed only when:
  - `NODE_ENV=development`
  - `DEV_AUTH_ENABLED=true`
- Authorization checks enforce org scoping and resource ownership checks for:
  - org membership
  - client workspace access
  - project access
- Destructive operations are admin-only (owner role baseline).

### 2) Tenant Isolation
- Multi-tenant data is scoped by `orgId`.
- Client and project data also include `clientWorkspaceId` / `projectId`.
- Retrieval and generation paths include explicit org/client filters.

### 3) File Storage and Access
- Production file storage is Vercel Blob behind storage abstraction.
- Blob uploads use randomized object naming (`addRandomSuffix: true`).
- UI does not expose direct Blob URLs.
- File download path is proxied and authenticated:
  - `GET /v1/files/:fileId/download`
- Local dev fallback uses local disk storage only when Blob token is absent and environment is non-production.

### 4) Data Retention and Deletion
- Org retention baseline (`retentionDays`) defaults to 90 days.
- Worker includes scheduled retention purge.
- Manual purge can be queued by admin from account settings.
- Client workspace deletion removes associated files and DB records.

### 5) Auditability
- Audit logs capture key lifecycle actions:
  - uploads
  - indexing completion/failure
  - answer generation enqueue/completion
  - approvals/rejections/edits
  - exports
  - deletion/purge actions

### 6) LLM Safety and Cost Guardrails
- OpenAI calls run in worker only.
- Usage events are recorded with token/cost estimates.
- Org budget cap blocks new generation when exceeded.
- Per-org concurrency limits reduce runaway generation load.
- Approved answers are never overwritten unless force is explicitly requested internally.

### 7) Export Safety
- XLSX export sanitizes formula-leading values (`=`, `+`, `-`, `@`) to reduce formula injection risk.
- Evidence output is deterministic and citation-formatted.

### 8) Observability
- Structured logging is enabled in API and worker.
- Optional Sentry capture for web/api/worker when DSN env vars are set.
- Optional PostHog event emission is env-gated.

## Explicit Non-Claims
- No claim of ISO 27001 or SOC 2 certification.
- No multi-region resilience guarantee.
- No trust center publication feature in MVP.
