import React from "react"
import { Badge } from "@tuesdaytrust/ui"

const scopeColors = {
  match: "green",
  mismatch: "red",
  neutral: "zinc"
} as const

type ScopeStatus = keyof typeof scopeColors

export function ScopeChip({ label, status = "neutral" }: { label: string; status?: ScopeStatus }) {
  return (
    <Badge color={scopeColors[status]}>{label}</Badge>
  )
}
