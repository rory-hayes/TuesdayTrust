import { describe, expect, it, vi } from "vitest"
import { logJobEvent } from "../src/metrics/logging"


describe("logJobEvent", () => {
  it("logs structured JSON", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    logJobEvent({
      job_id: "job",
      org_id: "org",
      questionnaire_id: "q",
      stage: "PARSING",
      status: "STARTED"
    })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
