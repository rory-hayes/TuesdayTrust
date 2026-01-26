# TuesdayTrust — agents.md (Codex Orchestrator)

This repository builds **TuesdayTrust** (domain: `tuesdaytrust.com`): a governed answer engine for security questionnaires and trust portal reviews.

This file is the **orchestrator contract** for AI coding agents (Codex). It defines how work is planned, executed, validated, and documented so the codebase compounds and stays low-touch.

---

## 0) Non‑Negotiable Product Invariants

Agents MUST NOT violate these invariants.

### Answer correctness and governance
- The system **never invents new facts** for questionnaire answers.
- AI may only:
  1) **retrieve** candidate canonical answers,
  2) **re-rank/select** from candidates,
  3) **rewrite** an existing answer *without changing meaning* (e.g., shorten to fit character limits).
- Any suggested answer must be traceable to a **Canonical Answer** (or an explicit **New Answer Needed** state).
- All state-changing actions must produce an **Audit Event**.

### Multi-tenancy and security
- Every tenant’s data must be isolated (RLS + tenant-scoped queries).
- Uploaded files are handled via signed URLs; no public buckets.
- Secrets never live in client code or git history.

### Reliability
- Questionnaire processing is asynchronous and job-driven.
- Jobs must be idempotent, retryable, and observable.
- No silent failures. Users always see clear state and next action.

### UX trust signals
- The UI must reinforce “human in control”:
  - clear confidence buckets,
  - explicit accept/edit actions,
  - explanations for matches,
  - audit trail visibility.

---

## 1) Required Docs (Single Sources of Truth)

Agents must treat these as authoritative:

- `docs/PRD.md` — what we are building (requirements, personas, workflows).
- `docs/architecture.md` — how we build it (systems, job pipeline, AI invocation).
- `docs/schema.md` — data model and state machines (tables/enums/indexes).
- `docs/api.md` — endpoints, payloads, auth, error semantics.
- `docs/design.md` — UI/UX, Catalyst usage, design tokens, layouts.
- `docs/security.md` — security model, retention, RBAC, auditability.
- `docs/testing.md` — test strategy and required coverage.
- `docs/observability.md` — logging/metrics/tracing and required signals.
- `docs/acceptance-criteria.md` — what “done” means for each capability.
- `docs/decisions.md` — ADR log; do not re-litigate settled decisions.
- `docs/CONTINUITY.md` — current state, locked decisions, and near-term priorities.
- `docs/runbook.md` — operating procedures and failure recovery.
- `docs/contributing.md` — local dev workflow and standards.
- `docs/plans.md` — execution plan format (must be used per task).
- `docs/productspec.md` — quick reference spec (domain objects + UI pages).

---

## 2) Standard Workflow for Every Task

Agents MUST follow this workflow in order.

### Step A — Pre-flight (read before coding)
1) Read `docs/CONTINUITY.md` (current state + invariants).
2) Read relevant sections of `docs/PRD.md`.
3) Read relevant sections of `docs/architecture.md`, `docs/schema.md`, `docs/api.md`.
4) Check `docs/decisions.md` for constraints.
5) Confirm acceptance criteria in `docs/acceptance-criteria.md`.
6) Confirm any security implications in `docs/security.md`.

### Step B — Write an execution plan
- Create a plan using the format in `docs/plans.md`.
- The plan must include:
  - exact files to change,
  - step-by-step implementation,
  - acceptance criteria checklist,
  - test plan,
  - rollback plan.

### Step C — Implement
- Implement only what the plan states (avoid scope creep).
- Prefer small, composable changes.
- Keep UI and backend contracts consistent with `docs/api.md` and `docs/schema.md`.

### Step D — Validate
- Add/extend automated tests per `docs/testing.md`.
- Ensure observable signals per `docs/observability.md`.
- Confirm all acceptance criteria are met.

### Step E — Update documentation
- Update `docs/CONTINUITY.md` to reflect the new state.
- If any decision changed/was made, add an ADR to `docs/decisions.md`.
- If schema or API changed, update `docs/schema.md` and/or `docs/api.md`.

### Step F — PR hygiene
- Ensure code is formatted and builds.
- Provide a concise summary and the acceptance checklist in the PR description.

---

## 3) Change Control Rules

Agents MUST follow these rules.

### Schema changes
- Never alter tables/enums without updating `docs/schema.md`.
- Any schema decision requires an ADR entry in `docs/decisions.md`.
- Schema migrations must be reversible when possible.

### AI behavior changes
- Never move from “select-from-candidates” to “generate free-form answers”.
- Any changes to confidence scoring require:
  - updates to `docs/architecture.md` and `docs/acceptance-criteria.md`,
  - tests demonstrating expected behavior.

### Job pipeline changes
- Job stages and statuses are authoritative in `docs/schema.md` and `docs/architecture.md`.
- Any new job stage must have:
  - clear retry/backoff rules,
  - idempotency strategy,
  - progress reporting,
  - observability events.

---

## 4) Definition of Done (global)

A task is done only when:
- Acceptance criteria are met (`docs/acceptance-criteria.md`),
- Tests are updated and passing (`docs/testing.md`),
- Observability is adequate (`docs/observability.md`),
- Security posture is preserved (`docs/security.md`),
- Documentation reflects the new state (`docs/CONTINUITY.md` + any impacted docs).

---

## 5) Naming and Brand

- Product name: **TuesdayTrust**
- Domain: **tuesdaytrust.com**
- Design system: **Catalyst (Tailwind UI kit)**
- Color palette tokens are defined in `docs/design.md`.
