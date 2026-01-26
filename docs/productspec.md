# TuesdayTrust — Product Spec (Quick Reference)

This is a concise reference for product terminology, key objects, and pages.
It is not a replacement for PRD/Architecture/Schema — it is a summary to help agents orient quickly.

---

## 1) Core Terms
- **Questionnaire**: a customer’s set of security questions (file upload or portal session).
- **Question**: an individual prompt inside a questionnaire.
- **Canonical Answer**: the approved source-of-truth answer snippet.
- **Variant**: a scoped modification of a canonical answer.
- **Evidence**: documents/links supporting an answer.
- **Suggestion**: a proposed answer mapping for a question, with confidence and reasons.
- **Confidence Bucket**: AUTO_FILL / NEEDS_REVIEW / MANUAL.

---

## 2) Pages (App)
- Inbox (Questionnaires list)
- Upload Wizard (create + upload + status)
- Questionnaire Review (core workflow)
- Answer Library (canonical answers + variants)
- Evidence (upload/link, access levels)
- Analytics (ROI + operational metrics)
- Settings (org/workspace/users/roles/retention/billing)

---

## 3) Roles
- Admin: everything incl. billing/retention/users.
- Reviewer: approve answers, merge, accept/edit suggestions.
- Editor: create drafts, upload, propose changes.
- Viewer: view/copy; export per policy.

---

## 4) Core System Behaviors
- Async job pipeline processes questionnaire uploads (XLSX/DOCX/PDF).
- Retrieval is hybrid: vector + metadata filters.
- LLM is optional and constrained: re-rank/select or rewrite without changing meaning.
- No portal scraping: Live Question Mode is copy/paste.

---

## 5) Success Metrics
- Time saved (transparent method)
- Autofill rate
- Avg time to ready_for_review
- Manual answer rate
- Job failure rate (operational)
