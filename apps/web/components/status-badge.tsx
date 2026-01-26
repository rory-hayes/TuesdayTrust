import React from "react"
import { Badge } from "@tuesdaytrust/ui"
import { QuestionnaireStatus } from "@tuesdaytrust/shared"

const statusColors: Record<
  QuestionnaireStatus,
  "amber" | "green" | "red" | "zinc"
> = {
  [QuestionnaireStatus.UPLOADED]: "amber",
  [QuestionnaireStatus.QUEUED]: "amber",
  [QuestionnaireStatus.PARSING]: "amber",
  [QuestionnaireStatus.PARSED]: "amber",
  [QuestionnaireStatus.EMBEDDING]: "amber",
  [QuestionnaireStatus.MATCHING]: "amber",
  [QuestionnaireStatus.READY_FOR_REVIEW]: "green",
  [QuestionnaireStatus.EXPORTING]: "amber",
  [QuestionnaireStatus.COMPLETED]: "green",
  [QuestionnaireStatus.FAILED]: "red"
}

export function StatusBadge({ status }: { status: QuestionnaireStatus }) {
  return (
    <Badge color={statusColors[status]}>
      {status.replace(/_/g, " ").toLowerCase()}
    </Badge>
  )
}
