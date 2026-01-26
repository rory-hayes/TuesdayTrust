"use client"

import {
  Badge,
  Button,
  Divider,
  Heading,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text
} from "@tuesdaytrust/ui"
import { ScopeChip } from "../../components/scope-chip"
import { sampleAnswers, sampleDuplicateAnswers, sampleExpiringAnswers } from "../../lib/sample-data"
import { canCreateAnswer, canReviewAnswers } from "../../lib/permissions"
import { useWorkspace } from "../../lib/use-workspace"

const statusColors: Record<string, "green" | "amber" | "red"> = {
  APPROVED: "green",
  DRAFT: "amber",
  DEPRECATED: "red"
}

export default function AnswersPage() {
  const { role } = useWorkspace()
  const canCreate = canCreateAnswer(role)
  const canReview = canReviewAnswers(role)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading level={1} className="text-zinc-950 dark:text-white">
            Answer Library
          </Heading>
          <Text className="text-zinc-500 dark:text-zinc-400">
            Canonical answers with ownership, scope, and review cadence.
          </Text>
        </div>
        <Button color="dark" disabled={!canCreate}>
          New draft answer
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-zinc-950/10 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-zinc-900">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Answer</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Owner</TableHeader>
                <TableHeader>Scope</TableHeader>
                <TableHeader>Usage</TableHeader>
                <TableHeader>Last reviewed</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {sampleAnswers.map((answer) => (
                <TableRow key={answer.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-zinc-950 dark:text-white">{answer.title}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{answer.id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge color={statusColors[answer.status] ?? "zinc"}>
                      {answer.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{answer.owner}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {answer.scope.products.map((product) => (
                        <ScopeChip key={`${answer.id}-product-${product}`} label={product} />
                      ))}
                      {answer.scope.regions.map((region) => (
                        <ScopeChip key={`${answer.id}-region-${region}`} label={region} />
                      ))}
                      {answer.scope.tiers.map((tier) => (
                        <ScopeChip key={`${answer.id}-tier-${tier}`} label={tier} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{answer.usageCount}</TableCell>
                  <TableCell>{answer.lastReviewed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <aside className="space-y-6">
          <div className="rounded-xl border border-zinc-950/10 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-zinc-900">
            <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Expiring soon</Text>
            <Divider className="my-3 border-zinc-950/10 dark:border-white/10" />
            <div className="space-y-4">
              {sampleExpiringAnswers.map((item) => (
                <div key={item.id} className="space-y-1">
                  <Text className="text-sm font-semibold text-zinc-950 dark:text-white">{item.title}</Text>
                  <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                    Owner {item.owner} • Due in {item.dueInDays} days
                  </Text>
                  <Button
                    outline
                    className="mt-2 border-zinc-950/10 text-zinc-950 dark:border-white/10 dark:text-white"
                    disabled={!canReview}
                  >
                    Mark reviewed
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-950/10 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-zinc-900">
            <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Duplicate candidates</Text>
            <Divider className="my-3 border-zinc-950/10 dark:border-white/10" />
            <div className="space-y-4">
              {sampleDuplicateAnswers.map((item) => (
                <div key={item.id} className="space-y-1">
                  <Text className="text-sm font-semibold text-zinc-950 dark:text-white">
                    {item.primary.title}
                  </Text>
                  <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                    Possible duplicate: {item.duplicate.title} • Similarity {item.similarity}
                  </Text>
                  <Button
                    outline
                    className="mt-2 border-zinc-950/10 text-zinc-950 dark:border-white/10 dark:text-white"
                    disabled={!canReview}
                  >
                    Review merge
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
