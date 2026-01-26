# TuesdayTrust — Observability

TuesdayTrust is job-driven; observability is mandatory.

---

## 1) Logging
- Structured JSON logs (server + worker).
- Include:
  - org_id, workspace_id
  - questionnaire_id, job_id
  - stage, status
  - duration_ms
  - error_code (if failure)

Never log:
- secrets
- raw uploaded files
- full prompt content by default

---

## 2) Metrics (minimum)
### Job metrics
- jobs_started_total
- jobs_succeeded_total
- jobs_failed_total
- job_duration_ms (p50/p95)
- stage_duration_ms
- retries_total
- queue_lag_ms

### AI cost metrics
- tokens_in_total / tokens_out_total
- cost_estimate_usd (approx; tagged by org)
- embeddings_batches_total
- rerank_calls_total

### Product metrics (ROI)
- autofill_rate
- avg_time_to_ready_for_review
- avg_review_time (if measurable)
- manual_answer_rate

---

## 3) Tracing
- Correlate job → sub-steps → OpenAI calls via request ids.
- Use a trace id propagated across worker calls.

---

## 4) Alerting (low-touch requirement)
Alerts should fire for:
- sustained job failure rate > threshold
- queue backlog growing
- OpenAI rate limit spikes
- token usage anomalies for a tenant
- export failures

---

## 5) Tooling (recommended)
- Sentry for error tracking (web + worker).
- Postgres view for job analytics.
- Optional: Grafana/Prometheus or hosted equivalent later.
