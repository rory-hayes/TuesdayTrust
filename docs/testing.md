# TuesdayTrust — Testing Strategy

Goal: keep TuesdayTrust low-touch by preventing regressions and catching failures early.

---

## 1) Test Layers

### Unit tests (fast)
- XLSX parsing and normalization
- Confidence scoring function (bucket thresholds)
- Scope matching and filters
- Deduping / clustering utilities
- Constrained rewrite helpers (no meaning change constraints where possible)

### Integration tests
- Edge Function endpoints with auth + RLS
- Worker job stage transitions
- Storage signed URL flows
- Vector retrieval with pgvector (seeded data)

### End-to-End (E2E)
Use Playwright:
- Sign in
- Upload questionnaire
- See progress states
- Review suggestions
- Export and download output
- Live Question Mode (paste → get suggestion → map)

---

## 2) Required Test Data
Maintain deterministic test fixtures:
- `fixtures/questionnaires/simple.xlsx` (20 questions, stable format)
- `fixtures/questionnaires/complex.xlsx` (multiple sheets, merged cells, constraints)
- `fixtures/questionnaires/simple.docx` (paragraph-based questions)
- `fixtures/questionnaires/simple.pdf` (text-based questions)
- `fixtures/answers/base_library.json` (canonical answers + scopes + evidence links)

---

## 3) Acceptance Criteria Mapping
Every epic must map tests to `docs/acceptance-criteria.md`.
If acceptance criteria is not testable, it must be rewritten to be testable.

---

## 4) Failure Case Testing (must)
- Parsing failure (corrupt file)
- Unsupported format
- Embedding API rate limit
- Budget exceeded (graceful degrade)
- Export failure (retry and surface state)
- RLS violation attempts

---

## 5) CI Expectations
- Run unit + integration tests on PR.
- Run E2E on main branch or nightly (depending on speed).
- Lint and typecheck required.
