# EvidenceQ Foundation

This repository was initialized from the `next-forge` starter pattern (Vercel) and pruned to a focused MVP foundation for consultant-mode security questionnaires.

## Apps
- `apps/web` - Next.js UI shell (4-route MVP IA)
- `apps/api` - Fastify API (`/health`)
- `apps/worker` - BullMQ worker scaffold

## Packages
- `packages/ui` - Curated UI system + Tailwind Plus integration surface
- `packages/database` - Prisma schema/client
- `packages/storage` - Vercel Blob abstraction + dev local fallback

## Local startup
1. `docker compose up -d`
2. `pnpm install`
3. `pnpm db:generate`
4. `pnpm db:migrate`
5. `pnpm dev`

## Prompt 2 plumbing included
- Client workspace creation and listing
- KB document registration + `kb-index` worker pipeline
- XLSX questionnaire project creation + mapping + parse pipeline
- Direct browser uploads via `/api/blob/upload-token`

See `/Users/rory/TuesdayTrust/RUNBOOK.md` for env vars and upload flow details.
