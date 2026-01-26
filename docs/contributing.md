# TuesdayTrust — Contributing

This repo is optimized for Codex-driven, documentation-led development.

---

## 1) Principles
- Keep the system trustworthy and low-touch.
- Follow docs as sources of truth (`/docs`).
- Avoid scope creep. Small PRs, tight acceptance criteria.

---

## 2) Required Workflow (for humans and Codex)
1) Read `docs/CONTINUITY.md`.
2) Create an execution plan (`docs/plans.md` format).
3) Implement changes.
4) Add/extend tests (`docs/testing.md`).
5) Update docs (CONTINUITY + ADRs + schema/API if impacted).

---

## 3) Code Conventions
- TypeScript-first.
- Prefer small modules with clear boundaries.
- No secrets in client code.
- Use structured logging for worker and server.

---

## 4) Branching and PRs
- Branch naming: `feat/...`, `fix/...`, `chore/...`.
- PR must include:
  - summary
  - plan link or plan snippet
  - acceptance checklist
  - test evidence

---

## 5) Local Dev (placeholder)
Document exact commands once project scaffolding is finalized. Typical:
- `pnpm install`
- `pnpm dev`
- `pnpm test`

Also:
- Supabase local dev config and env vars
- worker process run instructions

---

## 6) Documentation Updates (required)
If you modify:
- schema → update `docs/schema.md` + ADR
- API → update `docs/api.md`
- architecture → update `docs/architecture.md` + ADR
- design tokens/layout → update `docs/design.md`
