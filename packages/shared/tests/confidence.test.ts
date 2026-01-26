import { describe, expect, it } from "vitest"
import {
  clampScore,
  computeConfidenceScore,
  scoreToBucket,
  DEFAULT_CONFIDENCE_THRESHOLDS
} from "../src/confidence"
import { ConfidenceBucket } from "../src/enums"

describe("confidence scoring", () => {
  it("clamps scores between 0 and 1", () => {
    expect(clampScore(-1)).toBe(0)
    expect(clampScore(2)).toBe(1)
    expect(clampScore(0.4)).toBe(0.4)
    expect(clampScore(Number.NaN)).toBe(0)
  })

  it("maps score to bucket thresholds", () => {
    expect(scoreToBucket(1)).toBe(ConfidenceBucket.AUTO_FILL)
    expect(scoreToBucket(DEFAULT_CONFIDENCE_THRESHOLDS.autoFill)).toBe(
      ConfidenceBucket.AUTO_FILL
    )
    expect(scoreToBucket(DEFAULT_CONFIDENCE_THRESHOLDS.needsReview)).toBe(
      ConfidenceBucket.NEEDS_REVIEW
    )
    expect(scoreToBucket(0.2)).toBe(ConfidenceBucket.MANUAL)
  })

  it("computes a deterministic score", () => {
    const score = computeConfidenceScore({
      vectorSimilarity: 0.8,
      lexicalOverlap: 0.6,
      scopeMatch: true,
      freshnessDays: 30,
      acceptanceRate: 0.7
    })

    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it("handles scope mismatch", () => {
    const score = computeConfidenceScore({
      vectorSimilarity: 0,
      lexicalOverlap: 0,
      scopeMatch: false,
      freshnessDays: 365,
      acceptanceRate: 0
    })

    expect(score).toBe(0)
  })
})
