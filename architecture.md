# EvidenceQ Architecture (MVP)

## 1) Deployment Topology
- **Web (Next.js):** Vercel (Hobby during build, Pro before alpha/customers).
- **API (Fastify):** Render Web Service.
- **Worker (BullMQ):** Render Worker Service.
- **Database:** Render Postgres.
- **Queue/Cache:** Render Redis.
- **Object Storage:** Vercel Blob (production provider).
- **LLM:** OpenAI (worker-side only).

## 2) Monorepo Layout
- `apps/web`: Next.js UI shell with 4-route IA.
- `apps/api`: Fastify HTTP API and health endpoint.
- `apps/worker`: async pipelines (ingest/index/answer/export queues).
- `packages/ui`: curated design system and Tailwind Plus integration boundary.
- `packages/database`: Prisma schema/client for tenant-safe entities.
- `packages/storage`: storage abstraction (Blob + local-dev fallback).

## 3) Data Model
Prisma models include:
- `Org`
- `User`
- `ClientWorkspace`
- `KBDocument`
- `KBChunk` (citation anchors: doc/page/section/sheet/cell)
- `QuestionnaireProject`
- `ProjectFile`
- `QuestionItem`
- `AnswerDraft` (`DRAFT|READY|NEEDS_REVIEW|APPROVED|REJECTED|INSUFFICIENT_EVIDENCE`)
- `ApprovalEvent` / `AuditLog`
- `GapItem`

Tenant isolation strategy:
- `orgId` present across business-critical entities.
- service layer must always scope queries by `orgId`.
- audit logs include org and actor context.

## 4) Job Pipeline
Queues (BullMQ):
- `kb-index`
- `project-parse`
- `answer-generate`
- `export-xlsx`

Expected lifecycle:
1. Upload KB docs / XLSX file.
2. `kb-index` extracts text (PDF/DOCX/TXT/MD), chunks, embeds, and stores `KBChunk`.
3. `project-parse` reads mapped XLSX columns and stores `QuestionItem`.
4. `answer-generate` retrieves top chunks by embedding similarity and calls OpenAI.
5. Worker validates citations (`kbChunkId` must be retrieved; `quote` must exist in chunk text).
6. Valid outputs become `READY`; invalid outputs become `NEEDS_REVIEW`; no support becomes `INSUFFICIENT_EVIDENCE` + `GapItem`.
7. `export-xlsx` writes answers/evidence back to XLSX and uploads export Blob.

## 5) Storage Architecture
`packages/storage` provides provider abstraction:
- Production: Vercel Blob.
- Development fallback: local disk storage when blob token is absent.

Rules:
- All project files and exports use storage abstraction.
- Application code should not directly call Blob SDK outside abstraction.
- Blob writes use randomized suffixes (`addRandomSuffix: true`).
- Database stores Blob locator/pathname metadata; UI does not expose raw Blob URLs.
- Downloads are proxied via authenticated API (`/v1/files/:fileId/download`) with org ownership checks.
- Optional app-layer Blob encryption can be enabled behind feature flag in future; not required for MVP alpha.

## 6) LLM Boundary
- OpenAI client instantiation occurs in worker only.
- API/web must not directly run completion logic.
- “No answer without citation” enforcement is an application rule in answer/review pipeline.
- Embeddings model: `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`).
- Answer model: `OPENAI_ANSWER_MODEL` (default `gpt-4o-mini`).

## 7) Security Baseline (No Overclaims)
Security posture for MVP:
- Encryption in transit via HTTPS/TLS.
- Encryption at rest via managed provider defaults (Render/Vercel).
- Tenant isolation by org-scoped data access.
- API and worker data operations scoped to `orgId` and client workspace.
- Audit events for generation, edits, approvals, rejections, and exports.
- Blob objects use randomized pathnames and authenticated proxy download routing.
- Dev auth fallback is local-only and explicit (`DEV_AUTH_ENABLED=true` + `NODE_ENV=development`).
- Data retention/delete controls are active:
  - org-level `retentionDays` baseline (default 90)
  - scheduled retention purge worker job
  - admin-only client workspace deletion that removes Blob objects + DB records
- Worker failures persist actionable error metadata on affected entities (`errorJson`, status fields).
- OpenAI usage events are recorded per call and budget-capped at org level.

Explicitly out of scope for claims:
- No ISO/SOC2 certification claims in MVP.
- No multi-region guarantees in MVP.

## 8) Reliability + Observability
- API and worker use structured logging (Fastify/Pino + worker pino logger).
- Correlation context includes request/job IDs and org/project/client identifiers where available.
- Sentry is wired for web, API, and worker, enabled only when DSN env vars are set.
- BullMQ queues use retries + exponential backoff for transient failures.
- Idempotency keys prevent duplicate heavy work:
  - `kb-index:<kbDocumentId>:v<indexVersion>`
  - `answer-generate:<projectId>:<questionId>:<kbVersionHash>`
  - `export-xlsx:<projectId>:v<exportVersion>:<kbVersionHash>`

## 9) RAG + Export Guardrails
- Retrieval is always scoped to `orgId + clientWorkspaceId`.
- Citation validation requires:
  - cited `kbChunkId` must be in retrieved set
  - `citation.quote` must be a substring of chunk text
- Answers without valid citations cannot be approved.
- Insufficient evidence creates/updates `GapItem`.
- XLSX export guardrails:
  - formula-injection sanitization for answer/evidence cells
  - deterministic evidence format: `"<DocName> <Locator>: <Quote>"`
  - quote length capped for readability

## 10) Local Development
- `docker-compose.yml` runs Postgres + Redis locally.
- Shared defaults:
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evidenceq?schema=public`
  - `REDIS_URL=redis://localhost:6379`
- API `/health` confirms DB + Redis availability.

## 11) pgvector Baseline
- PostgreSQL is the primary DB from day 1.
- Local Docker uses a pgvector-enabled Postgres image (`ankane/pgvector`).
- Prisma schema stores embeddings with `Unsupported("vector")` on `KBChunk.embedding`.
- Migration baseline includes: `CREATE EXTENSION IF NOT EXISTS vector;`
