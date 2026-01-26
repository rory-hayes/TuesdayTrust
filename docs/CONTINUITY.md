# TuesdayTrust — CONTINUITY

This document captures the current project state, locked decisions, and near-term priorities.
Agents must read this before starting any work.

---

## Current Repository State (as of 2026-01-26)
- Monorepo structure: `apps/web` (Next.js), `apps/worker` (Node/TS), `packages/shared` (types/limits/validation), `packages/ui` (Catalyst components).
- Supabase migrations:
  - `supabase/migrations/001_init.sql` (schema + enums + RLS + storage buckets)
  - `supabase/migrations/002_retention.sql` (questionnaire_files.expires_at)
  - `supabase/migrations/003_live_question_mode.sql` (live questions + mappings)
  - `supabase/migrations/004_org_access_limits.sql` (org invites, limits, usage, SSO, features)
  - `supabase/migrations/005_trust_center_shares.sql` (Trust Center share links)
- Edge Functions:
  - `supabase/functions/api` provides questionnaire, answer hygiene, live question, ROI, and signed upload URL endpoints.
- Worker pipeline:
- XLSX + DOCX + PDF parsing, suggestion generation, export generation, audit events, structured job logs.
- UI screens (Catalyst, neutral palette): Inbox, Upload Wizard, Review Queue, Live Question Mode, Answer Library, Evidence, Analytics, Settings.
- Fixtures: XLSX samples + base answer library in `fixtures/`.
- Cleanup script: `scripts/cleanup-expired.ts` purges expired uploads/exports.

## Locked Decisions (do not change without ADR)
- UI kit: Catalyst (TailwindUI).
- Styling: Catalyst demo neutral palette (zinc) + Inter typography.
- Architecture: Supabase (DB/Auth/Storage) + Edge Functions (API/dispatch) + QStash + Node worker.
- AI policy: embeddings + re-ranking + constrained rewrite only; no free-form factual generation.
- Trust portals: Live Question Mode (copy/paste), no scraping.
- Per-org active job cap: 3 (QUEUED + RUNNING).

## Product Invariants (must never break)
- Multi-tenant isolation (RLS) is enforced for all tenant data.
- All state-changing actions produce audit events.
- Job pipeline is idempotent, retryable, observable.
- Export fidelity is treated as table-stakes; regressions are unacceptable.
- UI always reflects “human in control” (no silent automation).

## Phase 1 Implementation Status
Implemented:
- Supabase schema + RLS policies per `docs/schema.md`.
- Signed upload URL endpoint and questionnaire creation endpoint.
- Job creation + QStash enqueue stub in Edge Function.
- Worker pipeline for XLSX → suggestions → export with audit events.
- Confidence buckets (AUTO_FILL / NEEDS_REVIEW / MANUAL) with deterministic scoring.
- Retention defaults enforced: uploads 30 days, exports 90 days (expires_at column + cleanup script).
- Limits enforced: 10 MB upload size, 500 questions, 3 active jobs per org.
- UI pages for upload, inbox, review queue, answer library, evidence, analytics, settings.
- Baseline observability: structured job logs include org_id, questionnaire_id, stage.

## Phase 2 Implementation Status
Implemented:
- Live Question Mode API + UI (copy/paste workflow, mappings, audit events).
- Duplicate detection endpoint + merge workflow with audit logging.
- Review cadence API (expiring answers) surfaced in Answer Library UI.
- ROI analytics v1 endpoint + Analytics UI tiles.
- Catalyst UI refresh for review queue, answer library, and analytics views.

Not implemented yet:
- Real embeddings + re-ranking pipeline (still stubbed).
- Full Supabase Auth sign-in flows and production auth wiring.
- Production QStash configuration and retry/backoff behavior.
- Scope mismatch warnings.

## Phase 3 Implementation Status
Implemented:
- PDF ingestion + export pipeline (structured Q/A output).
- Role-aware UI gating + API role checks (Admin/Editor/Reviewer/Viewer).
- Settings SSO storage + domain enforcement for org-scoped routes.
- E2E DOCX upload → queued smoke path (signed upload stubs).
- Auth-backed onboarding + org/workspace creation.
- Org invites (token-based) + member listing + role updates.
- Workspace switcher + workspace access management (consultant mode).
- Org limits + usage tracking stubs (budget gating + max question overrides) + usage summary endpoint.
- Trust Center gating + internal overview content.
- Trust Center public share links (token-based, expiring, revocable) + public snapshot page.
- Consultant mode per-workspace role overrides + client report summaries (workspace-level metrics).
- Budget guardrails use estimated token usage; auto-fill downgraded when budget exceeded.

Not implemented yet:
- Trust Center disclosure controls beyond include toggles (per-answer/evidence allowlists, access requests).
- Cost controls and billing integrations (real token telemetry, usage-based billing, plan enforcement).
- Consultant mode client reporting exports (PDF/CSV) and advanced client dashboards.

## How to run
- Dev server: `pnpm dev`
- Generate fixtures: `pnpm generate:fixtures`
- Unit/integration coverage: `pnpm test:coverage`
- E2E (requires browsers): `pnpm exec playwright install` then `pnpm test:e2e`
- Cleanup expired uploads/exports: `pnpm cleanup:expired`

## Known Risks / Follow-ups
- Playwright browsers are not installed by default; E2E tests require `pnpm exec playwright install`.
- Playwright expects `http://localhost:3000`; ensure the port is free or a dev server is running before `pnpm test:e2e`.
- E2E runs with `NEXT_PUBLIC_E2E_TEST_MODE=true` and stubbed Supabase env vars; production needs real Supabase config.
- QStash integration is stubbed; worker dispatch needs real queue configuration.
- Auth + membership UI is scaffolded; production auth flows still need wiring.
- Embeddings/reranking pipeline still stubbed; only lexical matching is active.
- ROI metrics use conservative assumptions (3 minutes saved per auto-fill); update once telemetry is available.
- DOCX export is a structured Q/A document and does not preserve source formatting.
- PDF export is a structured Q/A document and does not preserve source formatting.
- SSO enforcement is limited to email domain checks; invite delivery is manual (token copy/paste).
- Trust Center share tokens expose a limited snapshot; disclose only shareable evidence.
- Budget usage is estimated from question counts until real LLM telemetry is available.

## Near-Term Priorities (next 2–4 weeks)
1) Phase 3 scale & distribution: advanced RBAC, optional SSO, and cost controls.
2) Trust Center module (optional) and consultant mode.
3) Cost controls and usage-based limits refinements.
