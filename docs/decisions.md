# TuesdayTrust — Decisions (ADR Log)

Format:
- Date
- Status (Accepted / Superseded)
- Context
- Decision
- Alternatives
- Consequences

---

## ADR-001 — Product Name and Domain
- Date: 2026-01-25
- Status: Accepted
- Context: Need short, credible, expandable brand under Tuesday umbrella.
- Decision: Product name is **TuesdayTrust** with domain **tuesdaytrust.com**.
- Alternatives: QV Trust, QV Security, Attest (domain taken).
- Consequences: All copy and UI should use TuesdayTrust; future modules can be “Trust Center”, etc.

## ADR-002 — UI Foundation: Catalyst
- Date: 2026-01-25
- Status: Accepted
- Context: Need fast delivery with enterprise-grade polish and consistency.
- Decision: Use TailwindUI **Catalyst** kit for 90% of UI; build a small set of signature components.
- Alternatives: build from scratch, other UI kits.
- Consequences: UI changes must align with Catalyst patterns; tokens applied for brand.

## ADR-003 — Brand Palette
- Date: 2026-01-25
- Status: Superseded
- Context: Trust-heavy workflow tool requires calm, authoritative design.
- Decision: Use palette: `#CEE5F2`, `#ACCBE1`, `#7C98B3`, `#637081`, `#536B78`.
- Alternatives: darker teal palette, lavender palette.
- Consequences: Tokens defined in design.md; ensure accessibility for text.

## ADR-004 — Architecture: Supabase + Edge + Worker
- Date: 2026-01-25
- Status: Accepted
- Context: Async processing and multi-step jobs cannot reliably run in edge-only runtime.
- Decision: Use Supabase (DB/Auth/Storage) + Edge Functions (API/dispatch) + QStash + a Node worker for processing.
- Alternatives: edge-only, AWS full stack.
- Consequences: Job system and worker contract must be documented and tested.

## ADR-005 — AI Policy: Retrieve + Select, No Free-form Facts
- Date: 2026-01-25
- Status: Accepted
- Context: Questionnaire answers must be correct, auditable, and governed.
- Decision: OpenAI used for embeddings + optional re-ranking + constrained rewrite only. No free-form factual answer generation.
- Alternatives: pure LLM answering.
- Consequences: Product must enforce human-in-loop and confidence thresholds.

## ADR-006 — Trust Portals Handling
- Date: 2026-01-25
- Status: Accepted
- Context: Many questionnaires are inside portals and cannot be uploaded.
- Decision: Provide “Live Question Mode” (copy/paste) and optionally a browser extension later. No scraping.
- Alternatives: portal scraping.
- Consequences: UX must support fast one-at-a-time answering; mappings stored for compounding.

## ADR-007 — Monorepo Layout + Tooling
- Date: 2026-01-25
- Status: Accepted
- Context: Phase 1 requires web app, worker, shared types, and UI kit reuse with consistent tooling.
- Decision: Use a pnpm workspace monorepo with `apps/web` (Next.js), `apps/worker` (Node/TS), `packages/shared` (types/logic), and `packages/ui` (Catalyst components).
- Alternatives: Single-package repo, separate repos per service.
- Consequences: Shared TS configs + workspace dependencies; Next.js transpiles shared packages.

## ADR-008 — Initial Confidence Scoring + Thresholds
- Date: 2026-01-25
- Status: Accepted
- Context: Phase 1 needs deterministic confidence buckets for review workflow.
- Decision: Use weighted heuristic scoring (vector 0.4, lexical 0.25, scope 0.2, freshness 0.1, history 0.05) with thresholds: AUTO_FILL ≥ 0.85, NEEDS_REVIEW ≥ 0.6, else MANUAL.
- Alternatives: Vector-only scoring, higher automation thresholds.
- Consequences: Conservative auto-fill; thresholds must be tuned with real data.

## ADR-009 — Upload Limits (Phase 1)
- Date: 2026-01-25
- Status: Accepted
- Context: Need guardrails for file size and question count to control cost and reliability.
- Decision: Enforce max upload size 10 MB and max 500 questions per questionnaire in Phase 1.
- Alternatives: Larger limits or per-tenant configurable limits.
- Consequences: Some large questionnaires require split uploads; revisit in Phase 2.

## ADR-010 — Per-Org Active Job Cap (Phase 1)
- Date: 2026-01-25
- Status: Accepted
- Context: Phase 1 requires basic concurrency controls to keep costs predictable and avoid queue overloads.
- Decision: Limit active jobs per org (QUEUED + RUNNING) to 3 by default.
- Alternatives: No cap, or dynamic caps per plan.
- Consequences: Organizations may need to wait during bursts; revisit with plan-based limits in Phase 2.

## ADR-011 — Review Cadence Reminder Window
- Date: 2026-01-26
- Status: Accepted
- Context: Phase 2 requires alerting on answers nearing review due dates.
- Decision: Expose an "expiring answers" list that includes answers due within 14 days. Due date is computed from `last_reviewed_at` when available, otherwise `created_at`.
- Alternatives: Require explicit review dates only, or compute reminders on the client.
- Consequences: API responses include `window_days` and `days_until_due`; UI can highlight overdue items.

## ADR-012 — ROI Analytics Assumptions (V1)
- Date: 2026-01-26
- Status: Accepted
- Context: Phase 2 needs transparent ROI metrics without full telemetry.
- Decision: Estimate time saved as 3 minutes per auto-fill suggestion. Completion time is derived from questionnaire `created_at` to `updated_at` for completed questionnaires only.
- Alternatives: Include needs-review time savings or require explicit time tracking.
- Consequences: ROI metrics are conservative and must be updated once usage telemetry is captured.

## ADR-013 — Adopt Catalyst Demo Neutral Palette
- Date: 2026-01-26
- Status: Accepted
- Context: Align product UI with the Catalyst demo visual language for consistency and maintainability.
- Decision: Replace the custom TuesdayTrust palette with the Catalyst demo’s neutral (zinc-based) palette and typography defaults (Inter). Update design docs and UI styles to use Catalyst defaults.
- Alternatives: Keep the TuesdayTrust palette with Catalyst layout patterns only.
- Consequences: Existing `tt-*` tokens are removed; UI styling relies on Catalyst default classes and themes.

## ADR-014 — DOCX Export Format (Structured Q/A)
- Date: 2026-01-26
- Status: Accepted
- Context: Phase 3 requires incremental DOCX support without full fidelity preservation.
- Decision: DOCX exports are generated as a structured Q/A document (Question and Answer paragraphs, in original order). Formatting from the source DOCX is not preserved.
- Alternatives: Attempt full DOCX formatting preservation; export plain text only.
- Consequences: DOCX exports may not match original styles; expectations are documented in acceptance criteria.

## ADR-015 — PDF Export Format (Structured Q/A)
- Date: 2026-01-26
- Status: Accepted
- Context: Phase 3 requires incremental PDF support without full fidelity preservation.
- Decision: PDF exports are generated as a structured Q/A document (Question and Answer blocks, in original order). Formatting from the source PDF is not preserved.
- Alternatives: Attempt full PDF formatting preservation; export plain text only.
- Consequences: PDF exports may not match original styles; expectations are documented in acceptance criteria.

## ADR-016 — Invite Acceptance Auto-Assigns Workspace Memberships
- Date: 2026-01-26
- Status: Accepted
- Context: Org invites need a clear default for workspace access in consultant mode.
- Decision: Accepting an org invite automatically assigns the user to all current workspaces in the org with the invite role.
- Alternatives: Require explicit workspace assignment after invite acceptance.
- Consequences: Simpler onboarding for consultants; admins can refine access later.

## ADR-017 — Org Limits + Usage Tracking Tables
- Date: 2026-01-26
- Status: Accepted
- Context: Phase 3 requires per-org limits and budget-aware processing.
- Decision: Introduce `org_limits` and `org_usage` tables. Worker checks monthly token budget and records `budget_exceeded` in job attempts; limits override defaults (max questions, max uploads, max active jobs).
- Alternatives: Hardcode limits only; compute budgets on the fly from job attempts.
- Consequences: Budgets are still stubbed until LLM usage is enabled; schema supports future cost controls.

## ADR-018 — Consultant Mode Workspace Gating
- Date: 2026-01-26
- Status: Accepted
- Context: Consultant mode requires restricting access to specific workspaces within an org.
- Decision: When `consultant_mode_enabled` is true, workspace-scoped API routes require `workspace_memberships`. Org membership remains the source of truth for role, and workspace memberships default to the org role.
- Alternatives: No workspace gating; allow per-workspace roles independent of org role.
- Consequences: Admins can grant/remove workspace access without re-inviting users; role changes propagate to workspace memberships.

## ADR-019 — SSO Domain Enforcement (API Layer)
- Date: 2026-01-26
- Status: Accepted
- Context: SSO needs a minimal enforcement mechanism before full IdP integration.
- Decision: When SSO is enabled and a domain is configured, Edge APIs enforce email domain matching for org-scoped routes.
- Alternatives: Store settings only; enforce only at login time.
- Consequences: Users with mismatched domains are blocked from org actions until SSO is configured properly.

## ADR-020 — Trust Center Overview (Internal Preview)
- Date: 2026-01-26
- Status: Accepted
- Context: Phase 3 calls for a Trust Center module without full public sharing workflows.
- Decision: Trust Center v1 shows an internal summary of approved answers and shareable evidence for the selected workspace, gated by the feature flag.
- Alternatives: Defer Trust Center entirely or build a public-facing portal.
- Consequences: Trust Center is visible only to authenticated users until public sharing is designed.

## ADR-021 — Trust Center Share Links (Token-Based)
- Date: 2026-01-26
- Status: Accepted
- Context: Phase 3 requires public Trust Center sharing with explicit disclosure controls.
- Decision: Add expiring, revocable Trust Center share links with include toggles for answers and shareable evidence. Public access is via a tokenized URL and returns a limited snapshot.
- Alternatives: Build a full public portal with access requests, or keep Trust Center internal only.
- Consequences: Share tokens are sensitive; only shareable evidence is exposed and links can be revoked.

## ADR-022 — Budget Guardrails Use Estimated Token Usage (Stub)
- Date: 2026-01-26
- Status: Accepted
- Context: Cost controls require token budgets before real LLM telemetry is available.
- Decision: Estimate token usage based on question count (120 tokens per question) and apply budget guardrails. When budget is exceeded, auto-fill suggestions are downgraded to review-required.
- Alternatives: Leave budgets inactive until LLM is wired, or block processing outright.
- Consequences: Budget usage is approximate; update once real token metrics are available.

## ADR-023 — Per-Workspace Role Overrides in Consultant Mode
- Date: 2026-01-26
- Status: Accepted
- Context: Consultant mode requires finer-grained access control per client workspace.
- Decision: Allow admins to override roles per workspace membership while keeping org role as the default at invite time.
- Alternatives: Force workspace roles to always mirror org role.
- Consequences: Workspace access decisions must use workspace membership role when consultant mode is enabled.

## ADR-024 — Token Usage Telemetry (Replace Estimates)
- Date: 2026-01-26
- Status: Accepted
- Context: Estimated token usage is insufficient for billing accuracy and budget enforcement.
- Decision: Record token usage events and compute monthly usage from telemetry; jobs only reference actual usage to enforce budgets.
- Alternatives: Continue estimating tokens from question counts.
- Consequences: Token usage storage and reporting must be implemented before billing integration.

## ADR-025 — Trust Center Allowlists + Access Requests
- Date: 2026-01-26
- Status: Accepted
- Context: Public Trust Center sharing requires granular control and a way for clients to request more access.
- Decision: Add per-answer/evidence allowlists and access request workflows with admin approval and audit events.
- Alternatives: Keep Trust Center internal only or share everything by default.
- Consequences: Admins must maintain allowlists; access requests are now part of the Trust Center workflow.
