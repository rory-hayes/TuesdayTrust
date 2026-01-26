import React from "react"
import { Badge } from "@tuesdaytrust/ui"
import { ConfidenceBucket } from "@tuesdaytrust/shared"
const bucketColors: Record<ConfidenceBucket, "green" | "amber" | "red"> = {
  [ConfidenceBucket.AUTO_FILL]: "green",
  [ConfidenceBucket.NEEDS_REVIEW]: "amber",
  [ConfidenceBucket.MANUAL]: "red"
}

const bucketLabels: Record<ConfidenceBucket, string> = {
  [ConfidenceBucket.AUTO_FILL]: "Auto-fill",
  [ConfidenceBucket.NEEDS_REVIEW]: "Needs review",
  [ConfidenceBucket.MANUAL]: "Manual"
}

export function ConfidenceBadge({ bucket }: { bucket: ConfidenceBucket }) {
  return (
    <Badge color={bucketColors[bucket]}>
      {bucketLabels[bucket]}
    </Badge>
  )
}
