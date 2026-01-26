# TuesdayTrust — plans.md (Codex Execution Plans)

This repo uses a strict execution plan format so an AI agent can make changes safely and predictably.

Use this format **for every task** (even small ones). Keep plans short, but complete.

---

## Execution Plan Template

### 1) Goal
What is the exact outcome? One sentence.

### 2) Context
- Why are we doing this?
- What user workflow does it improve?
- Link to relevant sections of `docs/PRD.md` / `docs/architecture.md` / `docs/acceptance-criteria.md`.

### 3) Assumptions
- Any assumptions being made?
- Any constraints from `docs/decisions.md`?

### 4) Scope
**In scope:**
- …

**Out of scope:**
- …

### 5) Files and Components Affected
List concrete files and modules.

### 6) Plan (Step-by-step)
1. …
2. …
3. …

### 7) Acceptance Criteria Checklist
Bullet list copied/adapted from `docs/acceptance-criteria.md`.

### 8) Tests
- Unit tests:
- Integration tests:
- E2E tests:
- Manual checks:

### 9) Risks and Mitigations
- Risk:
- Mitigation:

### 10) Rollback Plan
How to revert safely if needed.

### 11) Post-merge Verification
- Deploy checks
- Monitoring checks
- Cost checks

---

## Example (abbreviated)

### Goal
Implement `POST /api/questionnaires` to create a questionnaire, store file metadata, and enqueue a processing job.

### Context
Supports onboarding + upload wizard workflow in PRD.

### Plan
1) Create Edge Function route with auth + RLS checks.
2) Insert questionnaire + file row, status `queued`.
3) Enqueue `{questionnaire_id}` to QStash.
4) Return questionnaire id + initial status.
5) Add integration test + schema updates if needed.
