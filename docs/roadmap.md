# TuesdayTrust — Roadmap

This roadmap optimizes for a compounding, low-touch SaaS:
- build reliable job pipeline + governance first,
- build compounding library hygiene second,
- add scale/distribution features third.

Dates are intentionally relative; focus is on sequencing.

---

## Phase 1 — Foundations (Weeks 1–4)
### Outcomes
- End-to-end questionnaire pipeline works for XLSX with high fidelity.
- Canonical Answer Library exists with approvals and audit log.
- Async job system is reliable, observable, and cost-controlled.
- Review UX works (Auto-fill / Needs Review / Manual).

### Deliverables
- Supabase Auth + Postgres + Storage configured.
- Edge Functions:
  - create questionnaire record, signed upload URLs,
  - enqueue processing job.
- Worker:
  - parse XLSX → questions,
  - embeddings + retrieval,
  - suggestions + confidence buckets,
  - export XLSX.
- UI screens (Catalyst):
  - Upload wizard (basic),
  - Questionnaire inbox,
  - Questionnaire review screen,
  - Answer Library (basic).
- Observability baseline: job logs, error tracking, token usage tracking.
- Security baseline: RLS, audit events, retention defaults.

Success metrics:
- 1 questionnaire processed end-to-end in < 10 minutes (500 questions), async.
- Export preserves original spreadsheet structure reliably for target template set.
- No silent failures; clear status at each stage.

---

## Phase 2 — Compounding Loop (Weeks 5–8)
### Outcomes
- The library improves over time with minimal manual overhead.
- Trust portal “Live Question Mode” is first-class and feeds reuse.
- Library hygiene (dedupe + review cadence) reduces drift.

### Deliverables
- Duplicate detection + merge workflow for answers.
- Review cadence system: “answers expiring” alerts.
- Scope mismatch warnings.
- Live Question Mode (copy/paste workflow).
- ROI analytics V1 (time saved, autofill rate, completion time).
- Consultant mode (optional): multi-workspace, client separation.

Success metrics:
- Autofill rate improves week-over-week for pilot tenants.
- Review queue shrinks over time as KB compounds.
- Users report time saved and confidence improved.

---

## Phase 3 — Scale & Distribution (Weeks 9–12)
### Outcomes
- Enterprise-ready hardening and smoother onboarding.
- Distribution via consultants and content.
- Product is operationally low-touch.

### Deliverables
- DOCX/PDF support (incrementally; start with DOCX).
- Advanced RBAC, optional SSO (later).
- Trust Center module (optional, gated).
- Export templates and integrations (Drive/Notion links).
- Billing, plans, usage-based limits, and cost controls.
- Runbook and on-call procedures refined.

Success metrics:
- Onboarding time < 60 minutes to first completed questionnaire for most tenants.
- Cost per questionnaire within target range (defined in architecture).
- Support tickets per customer < defined threshold (runbook).

---

## Long-term (post 12 weeks)
- Portal browser extension for “select text → answer panel”.
- Vendor assessment tracker module.
- Trust center with controlled disclosure and access logs.
- Automated evidence validity checks.
- Multi-lingual answer sets (if needed).
