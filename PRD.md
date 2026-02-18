# PRD: EvidenceQ (MVP)

## 1) Product Summary
EvidenceQ is a consultant-mode security questionnaire workspace for vCISO and GRC firms managing multiple client companies. The MVP goal is to produce citation-grade questionnaire responses from a client knowledge base and export completed XLSX deliverables.

## 2) Core Wedge
- Primary buyer and user: consultant firms (not internal trust teams).
- Home behavior: consultants land on **Clients** first, then drill into a client and project.
- Core trust rule: **No answer without citation**.
- Valid outcome: **Insufficient evidence** is allowed and must be tracked as a gap.
- Deliverable first: export answered XLSX is mandatory in MVP.

## 3) MVP Routes (Fixed)
Only these four routes are in MVP scope:
1. `/clients`
2. `/clients/[clientId]` (tabs inside route only: KB Vault, Questionnaires)
3. `/projects/[projectId]`
4. `/account` (Team + Retention/Delete only; Billing later)

No additional standalone routes may be added during MVP unless PRD is revised.

## 4) Happy Path (MVP)
1. Consultant signs up.
2. Consultant creates a Client Workspace.
3. Consultant uploads client KB files (policy/evidence docs).
4. Consultant uploads questionnaire file (**XLSX only**).
5. Consultant maps question/answer/evidence columns.
6. System drafts answers from KB only.
7. If evidence is missing, output is "Insufficient evidence" and create Gap Item.
8. Consultant reviews, edits, and approves answers.
9. System exports completed XLSX with answers and citations.

## 5) In-Scope Functional Requirements
- Multi-tenant consultant org model with many client workspaces.
- KB document ingestion pipeline (upload -> index -> chunk -> embed).
- XLSX upload and column-mapping workflow.
- Draft answer generation from KB-only retrieval (RAG).
- Draft answer model with citations linked to KB chunks.
- Completion gate: unanswered citations block completion state.
- Gap List model and status tracking.
- Review flow: edit, approve, reject, and approve-all-ready.
- Export pipeline for answered XLSX with evidence column output.
- Audit log of review/approval/export events.

## 6) Non-Goals (Explicit)
- No portal autofill or browser extension.
- No trust center.
- No support for non-XLSX questionnaire formats.
- No public API keys management page.
- No complex rules engine.
- No multi-region architecture.
- No enterprise compliance claims (ISO/SOC2 certification claims).

## 7) Product Rules (Hard)
- Draft answers must cite KB evidence to be considered complete.
- If citations are absent, answer remains blocked or marked insufficient.
- LLM responses must never be presented as final without source anchoring.
- OpenAI usage is worker-side only.
- All uploaded originals and exports are stored through storage abstraction backed by Vercel Blob in production.

## 8) KPI Targets (MVP)
- Time-to-first-draft for first questionnaire section: < 15 minutes after uploads/mapping.
- Citation coverage on non-insufficient answers: 100%.
- Export success rate for valid XLSX projects: >= 99% in internal testing.
- Gap capture rate for unsupported questions: 100%.
- Critical severity defects in export workflow before alpha: 0 open.

## 9) Acceptance Criteria
### A) IA + UX
- Exactly four top-level routes exist and render.
- `/clients` is consultant-first workspace listing.

### B) Data + Process
- Prisma schema includes all required core entities.
- Worker generates `AnswerDraft` records using only client-scoped KB chunks.
- Answers without at least one valid citation cannot be approved.
- Invalid citations force `NEEDS_REVIEW`; unsupported questions become `INSUFFICIENT_EVIDENCE`.
- Gap items are created for insufficient evidence and linked to question/project/client.
- Export writes answer and evidence columns back into XLSX.
- Approval/Audit entities record edits, approvals, rejections, and exports.

### C) Infrastructure
- Local development starts with dockerized Postgres + Redis.
- `pnpm dev` starts web + api + worker.
- API exposes `/health` with DB + Redis checks.

### D) Technical Guardrails
- Storage abstraction exists with Blob provider and dev-local fallback.
- Tailwind Plus integration path exists without vendor direct import coupling.
- OpenAI calls happen in worker only.
- Retrieval and generation are scoped to `orgId + clientWorkspaceId`.

### E) Alpha Hardening Acceptance
- Dev auth fallback is disabled by default and only works when `NODE_ENV=development` and `DEV_AUTH_ENABLED=true`.
- Blob object names are randomized (`addRandomSuffix: true`) and web UI never links raw Blob URLs.
- File downloads always flow through authenticated API proxy (`GET /v1/files/:fileId/download`).
- Retention baseline exists (`org.retentionDays`, default `90`) with manual and scheduled purge support.
- Deletion workflow removes associated Blob objects and scoped DB records for a client workspace.
- Worker jobs include retries/backoff, idempotency keys, progress fields, and terminal failure states with error context.
- OpenAI usage is metered per event and budget-capped by org (`ORG_OPENAI_BUDGET_USD`).
- XLSX export sanitizes formula-leading values (`=`, `+`, `-`, `@`) and keeps deterministic citation formatting.

## 10) Still Out of Scope For MVP
- Full auth implementation.
- Portal/browser autofill.
- Trust center workflows.
- Non-XLSX questionnaire formats.
- Public API keys page.
- Evidence Pack generation.
- Gap-to-backlog integrations.
- Billing flows.
