import { ConfidenceBucket } from "./enums"

export interface ConfidenceInputs {
  vectorSimilarity: number
  lexicalOverlap: number
  scopeMatch: boolean
  freshnessDays: number
  acceptanceRate: number
}

export const DEFAULT_CONFIDENCE_THRESHOLDS = {
  autoFill: 0.85,
  needsReview: 0.6
} as const

export function clampScore(score: number) {
  if (Number.isNaN(score)) return 0
  return Math.max(0, Math.min(1, score))
}

export function scoreToBucket(score: number) {
  const normalized = clampScore(score)
  if (normalized >= DEFAULT_CONFIDENCE_THRESHOLDS.autoFill) {
    return ConfidenceBucket.AUTO_FILL
  }
  if (normalized >= DEFAULT_CONFIDENCE_THRESHOLDS.needsReview) {
    return ConfidenceBucket.NEEDS_REVIEW
  }
  return ConfidenceBucket.MANUAL
}

export function computeConfidenceScore(inputs: ConfidenceInputs) {
  const vectorWeight = 0.4
  const lexicalWeight = 0.25
  const scopeWeight = 0.2
  const freshnessWeight = 0.1
  const historyWeight = 0.05

  const scopeScore = inputs.scopeMatch ? 1 : 0
  const freshnessScore = Math.max(0, 1 - inputs.freshnessDays / 365)

  const score =
    inputs.vectorSimilarity * vectorWeight +
    inputs.lexicalOverlap * lexicalWeight +
    scopeScore * scopeWeight +
    freshnessScore * freshnessWeight +
    inputs.acceptanceRate * historyWeight

  return clampScore(score)
}
