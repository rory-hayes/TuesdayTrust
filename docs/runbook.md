# TuesdayTrust — Runbook (Operations)

This runbook describes how to operate TuesdayTrust with minimal support burden.

---

## 1) Common Operations

### Requeue a stuck questionnaire
1) Inspect `questionnaires.status` and associated `jobs` row.
2) If job is `FAILED`, view `job_attempts` for root cause.
3) Fix root cause (config, parsing bug, quota).
4) Call `POST /api/questionnaires/:id/requeue` (admin/reviewer).
5) Confirm status transitions and monitor logs.

### Cancel a job
- Mark `jobs.status = CANCELLED` and ensure worker checks before executing stage.
- Record audit event.

### Pause processing for a tenant
- Set org “processing_paused = true” (implementation detail).
- Worker must short-circuit and reschedule jobs.
- Used for cost spikes or abuse incidents.

---

## 2) Debugging Checklist

### Parsing failures
- Verify file type and checksum.
- Download file from Storage with admin signed URL.
- Run parser locally with the same file.
- Confirm normalization rules for the template.

### Matching issues (wrong answers)
- Inspect candidate retrieval results.
- Confirm scope filters.
- Check whether the canonical answer is approved and embedded.
- Check confidence scoring reasons.

### Export fidelity issues
- Compare input and output structure.
- Identify which cells/sheets changed unexpectedly.
- Add regression fixture if reproducible.

---

## 3) Incident Response (lightweight)
1) Triage severity:
   - Data exposure risk? (highest)
   - Widespread processing failure?
   - Cost spike?
2) Contain:
   - pause processing if needed
   - disable offending tenant
3) Diagnose:
   - review logs + job attempts
4) Remediate:
   - patch and redeploy
5) Postmortem:
   - write an ADR or incident note in `docs/decisions.md` if systemic.

---

## 4) Cost Spike Procedure
- Identify tenant with abnormal token usage.
- Pause tenant processing.
- Inspect job payload sizes and question counts.
- Ensure max limits and budgets are enforced.
- If abuse: disable account and require manual review to re-enable.

---

## 5) Routine Maintenance (weekly)
- Review job failure dashboards.
- Review token usage per tenant.
- Review “answers expiring” counts to ensure cadence features work.
- Review backlog and update `docs/CONTINUITY.md`.
