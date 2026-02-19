# EvidenceQ Runbook

## Local startup
1. Start infrastructure:
   - `docker compose up -d`
2. Install dependencies:
   - `pnpm install`
3. Generate Prisma client:
   - `pnpm db:generate`
4. Apply database migrations:
   - `pnpm db:migrate`
5. Start all services:
   - `pnpm dev`

## Required environment variables

### Shared
- `DATABASE_URL` - Postgres connection string
- `REDIS_URL` - Redis connection string

### Blob storage
- `BLOB_READ_WRITE_TOKEN` - required for production Blob uploads and for local direct browser uploads via token route

### Worker OpenAI
- `OPENAI_API_KEY` - required for KB indexing + answer generation (worker only)
- `OPENAI_EMBEDDING_MODEL` - optional, defaults to `text-embedding-3-small`
- `OPENAI_ANSWER_MODEL` - optional, defaults to `gpt-4o-mini`
- `ORG_OPENAI_BUDGET_USD` - optional budget cap for generation safety (default `50`)
- `ORG_OPENAI_CONCURRENCY_LIMIT` - optional per-org generation concurrency limit (default `2`)
- `OPENAI_BILLING_PERIOD_DAYS` - optional budget window size in days (default `30`)

### Observability and analytics (optional)
- `SENTRY_DSN` - enables API + worker Sentry exception capture
- `NEXT_PUBLIC_SENTRY_DSN` - enables web Sentry browser capture
- `POSTHOG_KEY` - enables server-side product event capture (`client_created`, `kb_uploaded`, `kb_index_ready`, `project_created`, `project_mapped`, `answers_generated`, `export_created`)
- `POSTHOG_HOST` - optional PostHog host override (default `https://us.i.posthog.com`)

### Clerk authentication
- Web (`apps/web`):
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
- API (`apps/api`):
  - `CLERK_SECRET_KEY`
  - `CLERK_JWT_ISSUER`
  - `CLERK_JWT_AUDIENCE` (optional)

## Web upload token route
- Path: `POST /api/blob/upload-token`
- File: `/Users/rory/TuesdayTrust/apps/web/src/app/api/blob/upload-token/route.ts`
- Purpose: mint client upload tokens for `@vercel/blob/client` direct browser uploads
- Upload flow:
  1. Browser uploads directly to Vercel Blob using `upload(..., { handleUploadUrl: '/api/blob/upload-token' })`
  2. Web app receives Blob URL response
  3. Web app calls API to register metadata:
     - `POST /v1/clients/:clientId/kb/documents`
     - `POST /v1/clients/:clientId/projects`

## Auth mode behavior
- Clerk mode (if configured):
  - Web wraps app with `ClerkProvider` and forwards bearer tokens to API requests.
  - API validates bearer JWT using Clerk JWKS (`CLERK_JWT_ISSUER` and optional `CLERK_JWT_AUDIENCE`).
  - If org claim is absent in a valid Clerk token, API falls back to a per-user org key (`org_user_<userId>`).
- Dev mode (local only): enabled only when `NODE_ENV=development` **and** `DEV_AUTH_ENABLED=true`.
- Dev requests use `Authorization: Bearer dev` with `x-org-id` and `x-user-id` headers.

## File access safety
- Blob URLs are never linked directly in web UI.
- Downloads are always proxied through authenticated API endpoint: `GET /v1/files/:fileId/download`.
- Blob upload token route enforces `addRandomSuffix: true`.

## Worker queues
- `kb-index`
  - Extracts document text, chunks text, embeds with OpenAI, stores KB chunks with citation anchors.
- `project-parse`
  - Parses XLSX using stored mapping and creates `QuestionItem` rows.
- `answer-generate`
  - Retrieves top KB chunks by embedding similarity, calls OpenAI, validates citations, stores `AnswerDraft`, creates `GapItem` on insufficient evidence.
- `export-xlsx`
  - Writes answer/evidence cells into source XLSX, uploads export to Blob, stores `ProjectFile` record.
