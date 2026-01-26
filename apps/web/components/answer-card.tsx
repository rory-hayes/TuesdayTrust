import React from "react"
import { Divider, Heading, Text } from "@tuesdaytrust/ui"
import { ScopeChip } from "./scope-chip"

interface AnswerCardProps {
  title: string
  body: string
  owner: string
  lastReviewed: string
  usageCount: number
  scope: {
    products: string[]
    regions: string[]
    tiers: string[]
  }
  evidence?: Array<{ title: string; url?: string | null }>
}

export function AnswerCard({ title, body, owner, lastReviewed, usageCount, scope, evidence = [] }: AnswerCardProps) {
  return (
    <div className="rounded-xl border border-zinc-950/10 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-zinc-900">
      <div className="space-y-2">
        <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Suggested answer</Text>
        <Heading level={3} className="text-zinc-950 dark:text-white">
          {title}
        </Heading>
        <Text className="text-sm text-zinc-500 dark:text-zinc-400">
          Owner: {owner} • Last reviewed {lastReviewed} • Used {usageCount} times
        </Text>
      </div>
      <Divider className="my-4 border-zinc-950/10 dark:border-white/10" />
      <Text className="text-zinc-950 dark:text-white">{body}</Text>
      <div className="mt-4 flex flex-wrap gap-2">
        {scope.products.map((product) => (
          <ScopeChip key={`product-${product}`} label={product} status="match" />
        ))}
        {scope.regions.map((region) => (
          <ScopeChip key={`region-${region}`} label={region} status="match" />
        ))}
        {scope.tiers.map((tier) => (
          <ScopeChip key={`tier-${tier}`} label={tier} status="match" />
        ))}
      </div>
      {evidence.length > 0 ? (
        <div className="mt-4 space-y-2">
          <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Evidence</Text>
          <ul className="space-y-1 text-sm text-zinc-950 dark:text-white">
            {evidence.map((item) => (
              <li key={item.title}>{item.title}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
