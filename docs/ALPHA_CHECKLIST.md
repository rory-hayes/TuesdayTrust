# EvidenceQ Alpha Checklist

## Platform + Environment
- Upgrade Vercel project to Pro before onboarding alpha consultants.
- Confirm Render services (API, worker, Postgres, Redis) are in production plan/sizing for expected alpha load.
- Set `BLOB_READ_WRITE_TOKEN` for web/api/worker.
- Set `OPENAI_API_KEY`, `OPENAI_EMBEDDING_MODEL`, and `OPENAI_ANSWER_MODEL`.
- Set `ORG_OPENAI_BUDGET_USD` (recommended default: `50`) and confirm alerting when exceeded.
- Set `ORG_OPENAI_CONCURRENCY_LIMIT` (recommended default: `2`).
- Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` if incident capture is required.
- Set `POSTHOG_KEY` only if product analytics are desired.

## Security Baseline Verification
- Confirm `DEV_AUTH_ENABLED` is **not** enabled outside local development.
- Verify API auth uses Clerk JWT in shared/hosted environments.
- Confirm Blob upload token route enforces randomized suffix (`addRandomSuffix: true`).
- Confirm web never renders direct Blob URLs.
- Verify all file downloads go through `GET /v1/files/:fileId/download`.
- Verify cross-org access checks block unauthorized file and project access.

## Data Lifecycle + Trust
- Validate org retention default (`retentionDays=90`) in `/account`.
- Validate manual purge can be queued from `/account`.
- Validate scheduled retention purge job is active in worker.
- Test admin-only client workspace deletion:
  - Blob objects removed
  - related DB rows removed
  - audit log event recorded

## Pipeline Reliability
- Run end-to-end KB indexing with PDF and DOCX inputs.
- Validate failed indexing surfaces actionable error in `/clients/[clientId]`.
- Run answer generation and confirm:
  - citations required for READY/APPROVED states
  - insufficient evidence generates gaps
- Force worker failure scenario and confirm failed job status + error visibility.
- Re-run same export/version and confirm duplicate export file is not created.

## Export Safety
- Validate Excel formula injection sanitization (`=`, `+`, `-`, `@`) in output cells.
- Validate citation formatting consistency:
  - `"<DocName> <Locator>: <Quote>"`
- Validate quote length cap in evidence cells.

## Final Go/No-Go
- Run full sample questionnaire loop:
  - client creation
  - KB upload + indexing READY
  - XLSX upload + mapping + parse
  - answer generation + review/approve
  - export download via authenticated route
- Ensure no open critical defects in auth, data isolation, export safety, or retention/delete.
