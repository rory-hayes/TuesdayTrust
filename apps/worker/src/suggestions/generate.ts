import { ConfidenceBucket, computeConfidenceScore, scoreToBucket } from "@tuesdaytrust/shared"
import type { Answer } from "@tuesdaytrust/shared"
import type { ParsedQuestion } from "../questions/types"

export interface SuggestionMatch {
  question: ParsedQuestion
  selectedAnswerId: string | null
  confidenceScore: number
  confidenceBucket: string
  reasons: Record<string, unknown>
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function lexicalSimilarity(a: string, b: string) {
  const aTokens = new Set(tokenize(a))
  const bTokens = new Set(tokenize(b))
  if (aTokens.size === 0 || bTokens.size === 0) return 0
  let intersection = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1
  }
  const union = aTokens.size + bTokens.size - intersection
  return intersection / union
}

function daysSince(dateValue?: string | null) {
  if (!dateValue) return 365
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return 365
  const diff = Date.now() - date.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function generateSuggestions(
  questions: ParsedQuestion[],
  answers: Answer[],
  options?: { budgetExceeded?: boolean }
): SuggestionMatch[] {
  return questions.map((question) => {
    let bestAnswer: Answer | null = null
    let bestSimilarity = 0

    for (const answer of answers) {
      const similarity = lexicalSimilarity(question.prompt, `${answer.title} ${answer.body}`)
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestAnswer = answer
      }
    }

    const freshnessDays = daysSince(bestAnswer?.lastReviewedAt ?? null)
    const scopeMatch = Boolean(bestAnswer)
    const score = computeConfidenceScore({
      vectorSimilarity: bestSimilarity,
      lexicalOverlap: bestSimilarity,
      scopeMatch,
      freshnessDays,
      acceptanceRate: 0.7
    })
    let bucket = scoreToBucket(score)
    if (options?.budgetExceeded && bucket === ConfidenceBucket.AUTO_FILL) {
      bucket = ConfidenceBucket.NEEDS_REVIEW
    }

    return {
      question,
      selectedAnswerId: bucket === ConfidenceBucket.MANUAL ? null : bestAnswer?.id ?? null,
      confidenceScore: score,
      confidenceBucket: bucket,
      reasons: {
        vector_similarity: bestSimilarity,
        lexical_overlap: bestSimilarity,
        scope_match: scopeMatch,
        freshness_days: freshnessDays,
        budget_exceeded: options?.budgetExceeded ?? false
      }
    }
  })
}
