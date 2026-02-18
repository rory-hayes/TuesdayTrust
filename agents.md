# EvidenceQ Agent Rules

This file defines implementation discipline for Codex/automation agents in this repository.

## Mission Lock
- Build EvidenceQ as a consultant-mode questionnaire product.
- Preserve the consultant wedge and citation enforcement.
- Avoid scope creep beyond PRD.

## Scope Guardrails
- Do not add new top-level routes beyond:
  - `/clients`
  - `/clients/[clientId]`
  - `/projects/[projectId]`
  - `/account`
- Do not introduce non-MVP features from roadmap (trust center, browser autofill, public API keys, advanced rules engine).
- Do not add support for additional questionnaire formats in MVP (XLSX only).

## Architecture Guardrails
- Web runs on Next.js (Vercel deployment target).
- API + Worker + Postgres + Redis run on Render (production target).
- File storage abstraction must keep Vercel Blob as production provider.
- OpenAI integration belongs in worker flows only.
- Tenant isolation must remain explicit in data model and service boundaries.

## UI Discipline
- `packages/ui` is the only approved source for app primitives and layout wrappers.
- Tailwind Plus snippets must be copied into curated components; never imported as vendor runtime files.
- shadcn/Radix usage is allowed only for missing primitives and must be wrapped in `packages/ui`.

## Security + Compliance Posture Rules
- Never claim ISO/SOC2 certification in product copy or docs.
- Keep baseline controls explicit: encryption at rest/in transit, tenant isolation, retention/delete support, audit logging.
- Maintain “no answer without citation” as a non-optional product rule.

## Coding Expectations
- TypeScript strict mode only.
- Keep lint and typecheck green before finishing changes.
- Keep docs aligned when behavior or architecture decisions change.
- Prefer clear placeholders over speculative partial implementations.

## Documentation Sync Requirements
If changing MVP scope or architecture assumptions, update all impacted docs in the same PR:
- `PRD.md`
- `design.md`
- `architecture.md`
- `plans.md`

