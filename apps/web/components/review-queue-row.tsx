import React from "react"
import clsx from "clsx"
import { Text } from "@tuesdaytrust/ui"
import { ConfidenceBucket } from "@tuesdaytrust/shared"
import { ConfidenceBadge } from "./confidence-badge"

interface ReviewQueueRowProps {
  question: string
  bucket: ConfidenceBucket
  active?: boolean
}

export function ReviewQueueRow({ question, bucket, active = false }: ReviewQueueRowProps) {
  return (
    <div
      className={clsx(
        "flex items-start justify-between gap-4 rounded-lg border border-transparent px-3 py-3",
        active
          ? "border-zinc-950/10 bg-zinc-100 dark:border-white/10 dark:bg-white/5"
          : "hover:bg-zinc-100 dark:hover:bg-white/5"
      )}
    >
      <Text className="text-sm text-zinc-950 dark:text-white">{question}</Text>
      <ConfidenceBadge bucket={bucket} />
    </div>
  )
}
