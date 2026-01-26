export interface JobLogEvent {
  job_id: string
  org_id: string
  questionnaire_id: string
  stage: string
  status: string
  duration_ms?: number
  error?: string
}

export function logJobEvent(event: JobLogEvent) {
  const payload = {
    timestamp: new Date().toISOString(),
    ...event
  }
  console.log(JSON.stringify(payload))
}
