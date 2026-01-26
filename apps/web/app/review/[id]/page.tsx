"use client"

import {
  Button,
  Divider,
  Heading,
  Select,
  Text
} from "@tuesdaytrust/ui"
import { ConfidenceBadge } from "../../../components/confidence-badge"
import { AnswerCard } from "../../../components/answer-card"
import { ReviewQueueRow } from "../../../components/review-queue-row"
import { ScopeChip } from "../../../components/scope-chip"
import { sampleReviewQueue } from "../../../lib/sample-data"
import { ConfidenceBucket } from "@tuesdaytrust/shared"
import {
  canEditAnswers,
  canRequeueJobs,
  canReviewAnswers
} from "../../../lib/permissions"
import { useWorkspace } from "../../../lib/use-workspace"

export default function ReviewPage() {
  const { role } = useWorkspace()
  const selected = sampleReviewQueue[0]
  if (!selected) {
    return (
      <div className="space-y-4">
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Review Queue
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          No review items available yet.
        </Text>
      </div>
    )
  }
  const scope = selected.answer?.scope ?? { products: [], regions: [], tiers: [] }
  const canReview = canReviewAnswers(role)
  const canEdit = canEditAnswers(role)
  const canRequeue = canRequeueJobs(role)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Heading level={1} className="text-zinc-950 dark:text-white">
            Review Queue
          </Heading>
          <Text className="text-zinc-600 dark:text-zinc-400">
            Suggestions are sorted by confidence bucket. Nothing is submitted without your review.
          </Text>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button color="dark">
            Export in progress
          </Button>
          <Button outline disabled={!canRequeue}>Re-run matching</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1.7fr_1fr]">
        <section className="rounded-xl border border-zinc-950/10 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-3">
            <Text className="text-sm font-semibold text-zinc-950 dark:text-white">Questions</Text>
            <Select defaultValue="all" aria-label="Filter questions">
              <option value="all">All</option>
              <option value={ConfidenceBucket.AUTO_FILL}>Auto-fill</option>
              <option value={ConfidenceBucket.NEEDS_REVIEW}>Needs review</option>
              <option value={ConfidenceBucket.MANUAL}>Manual</option>
            </Select>
          </div>
          <div className="mt-4 space-y-2">
            {sampleReviewQueue.map((item, index) => (
              <ReviewQueueRow
                key={item.id}
                question={item.question}
                bucket={item.bucket}
                active={index === 0}
              />
            ))}
          </div>
        </section>

      <section className="space-y-6">
          <div className="rounded-xl border border-zinc-950/10 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-zinc-900">
            <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Question</Text>
            <Heading level={2} className="mt-2 text-zinc-950 dark:text-white">
              {selected.question}
            </Heading>
            <Text className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Copy-safe answer selection with explicit review required.
            </Text>
          </div>

          {selected.answer ? (
            <AnswerCard
              title={selected.answer.title}
              body={selected.answer.body}
              owner={selected.answer.owner}
              lastReviewed={selected.answer.lastReviewed}
              usageCount={selected.answer.usageCount}
              scope={selected.answer.scope}
              evidence={selected.answer.evidence}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-950/20 bg-zinc-50 p-6 text-zinc-600 dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-400">
              No approved answer available. Mark as new answer needed to capture the response.
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button color="dark" disabled={!canReview}>
              Accept suggestion
            </Button>
            <Button outline disabled={!canEdit}>Edit answer</Button>
            <Button outline disabled={!canEdit}>New answer needed</Button>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-xl border border-zinc-950/10 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-zinc-900">
            <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Confidence</Text>
            <div className="mt-3">
              <ConfidenceBadge bucket={selected.bucket} />
            </div>
            <Divider className="my-4 border-zinc-950/10 dark:border-white/10" />
            <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Explanation</Text>
            <ul className="mt-3 space-y-2 text-sm text-zinc-950 dark:text-white">
              <li>Vector similarity: {selected.reasons.vector_similarity}</li>
              <li>Scope match: {selected.reasons.scope_match ? "Yes" : "No"}</li>
              <li>Freshness: {selected.reasons.freshness_days} days</li>
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-950/10 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-zinc-900">
            <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Scope match</Text>
            <div className="mt-3 flex flex-wrap gap-2">
              {scope.products.map((product) => (
                <ScopeChip key={`scope-product-${product}`} label={product} status="match" />
              ))}
              {scope.regions.map((region) => (
                <ScopeChip key={`scope-region-${region}`} label={region} status="match" />
              ))}
              {scope.tiers.map((tier) => (
                <ScopeChip key={`scope-tier-${tier}`} label={tier} status="match" />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-950/10 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-zinc-900">
            <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Audit trail</Text>
            <ul className="mt-3 space-y-3 text-sm text-zinc-950 dark:text-white">
              <li className="flex items-start justify-between gap-3">
                <span>Suggestion created</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Just now</span>
              </li>
              <li className="flex items-start justify-between gap-3 text-zinc-500 dark:text-zinc-400">
                <span>No reviewer action yet</span>
                <span className="text-xs">Awaiting review</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
