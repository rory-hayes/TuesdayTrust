import { describe, expect, it } from "vitest"
import { generateSuggestions } from "../src/suggestions/generate"
import type { Answer } from "@tuesdaytrust/shared"
import { AnswerStatus, ConfidenceBucket } from "@tuesdaytrust/shared"

const answers: Answer[] = [
  {
    id: "a1",
    orgId: "org",
    workspaceId: "ws",
    title: "MFA",
    body: "We enforce MFA for admin access.",
    status: AnswerStatus.APPROVED,
    ownerUserId: "user",
    tags: [],
    scope: {},
    sensitivity: "STANDARD",
    reviewIntervalDays: 90,
    lastReviewedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

describe("generateSuggestions", () => {
  it("returns manual bucket when no answers", () => {
    const results = generateSuggestions(
      [
        {
          index: 0,
          section: null,
          prompt: "Describe your encryption policies",
          rawPrompt: "Describe your encryption policies",
          responseType: "free_text",
          sourceRef: { sheet: "Sheet1", row: 1, col: 0 }
        }
      ],
      []
    )

    expect(results[0]?.selectedAnswerId).toBeNull()
  })

  it("selects best matching answer", () => {
    const results = generateSuggestions(
      [
        {
          index: 0,
          section: null,
          prompt: "Do you enforce MFA for admin access?",
          rawPrompt: "Do you enforce MFA for admin access?",
          responseType: "yesno",
          sourceRef: { sheet: "Sheet1", row: 1, col: 0 }
        }
      ],
      answers
    )

    expect(results[0]?.selectedAnswerId).toBe("a1")
  })

  it("handles empty prompts without crashing", () => {
    const results = generateSuggestions(
      [
        {
          index: 0,
          section: null,
          prompt: "",
          rawPrompt: "",
          responseType: "free_text",
          sourceRef: { sheet: "Sheet1", row: 1, col: 0 }
        }
      ],
      answers
    )

    expect(results[0]?.confidenceScore).toBeGreaterThanOrEqual(0)
  })

  it("handles invalid last reviewed date", () => {
    const results = generateSuggestions(
      [
        {
          index: 0,
          section: null,
          prompt: "Do you enforce MFA?",
          rawPrompt: "Do you enforce MFA?",
          responseType: "yesno",
          sourceRef: { sheet: "Sheet1", row: 1, col: 0 }
        }
      ],
      [
        {
          ...answers[0],
          lastReviewedAt: "not-a-date"
        }
      ]
    )

    expect(results[0]?.reasons.freshness_days).toBe(365)
  })

  it("auto-fills when similarity is high", () => {
    const results = generateSuggestions(
      [
        {
          index: 0,
          section: null,
          prompt: "We enforce MFA for admin access.",
          rawPrompt: "We enforce MFA for admin access.",
          responseType: "free_text",
          sourceRef: { sheet: "Sheet1", row: 1, col: 0 }
        }
      ],
      answers
    )

    expect(results[0]?.confidenceBucket).toBe(ConfidenceBucket.AUTO_FILL)
    expect(results[0]?.selectedAnswerId).toBe("a1")
  })

  it("downgrades auto-fill when budget exceeded", () => {
    const results = generateSuggestions(
      [
        {
          index: 0,
          section: null,
          prompt: "We enforce MFA for admin access.",
          rawPrompt: "We enforce MFA for admin access.",
          responseType: "free_text",
          sourceRef: { sheet: "Sheet1", row: 1, col: 0 }
        }
      ],
      answers,
      { budgetExceeded: true }
    )

    expect(results[0]?.confidenceBucket).toBe(ConfidenceBucket.NEEDS_REVIEW)
    expect(results[0]?.selectedAnswerId).toBe("a1")
    expect(results[0]?.reasons.budget_exceeded).toBe(true)
  })
})
