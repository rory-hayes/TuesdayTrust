# EvidenceQ Plan

## Phase 1: Foundation (Complete)
Goal: establish a strict build target and production-stack scaffold.

Deliverables:
- next-forge-style monorepo setup with pnpm workspaces and Turborepo.
- `apps/web`, `apps/api`, `apps/worker` skeletons.
- `packages/ui`, `packages/database`, `packages/storage` foundations.
- Docker local infra for Postgres + Redis.
- Full baseline docs (`PRD`, design, architecture, agent rules, roadmap).

Exit criteria:
- `pnpm dev` starts web/api/worker.
- API `/health` returns service checks.
- Four-route IA renders in web shell.

## Phase 2: MVP Implementation (Complete)
Goal: ship consultant-grade XLSX workflow with citation enforcement.

Scope:
- Auth and org onboarding.
- Client workspace CRUD.
- KB upload and indexing pipeline.
- XLSX upload + column mapping + question normalization.
- Answer drafting from KB context only.
- Citation validation gate (cannot complete without citation).
- Insufficient evidence handling + Gap List management.
- XLSX export with answers and citation columns.
- Review workflow (edit, approve, reject, approve-all-ready).

Exit criteria:
- End-to-end happy path works for pilot datasets.
- Citation and gap rules enforced consistently.
- No additional top-level routes beyond the 4-route IA.

## Phase 3: Alpha Hardening (Current)
Goal: stabilize reliability, security baseline, and operational readiness for consultant alpha.

Scope:
- Auth hardening and local-only dev fallback gating.
- Blob safety baseline (randomized object names + authenticated proxy download).
- Retention/delete controls with admin-only destructive operations.
- Worker idempotency, retries, progress tracking, and failure surfacing.
- OpenAI usage accounting, budget caps, and concurrency safeguards.
- Export hardening (Excel injection sanitization + deterministic evidence formatting).
- Sentry + structured logging + optional PostHog events.

Exit criteria:
- Internal alpha checklist passes with no critical blockers.
- Export and answer pipeline reliability meets KPI targets.

## Future Wedges (Post-MVP)
- Evidence Pack generation.
- KB governance and evidence expiry policies.
- Gap-to-Backlog push (Jira/Linear integrations).
- BYO storage providers and signed URL policy controls.
- Trust center publishing (deferred).
- Portal/browser autofill (deferred).
- Expanded format support beyond XLSX (deferred).
