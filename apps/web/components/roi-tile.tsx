import React from "react"
import { Heading, Text } from "@tuesdaytrust/ui"

interface RoiTileProps {
  label: string
  value: string
  helper?: string
}

export function RoiTile({ label, value, helper }: RoiTileProps) {
  return (
    <div className="rounded-xl border border-zinc-950/10 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-zinc-900">
      <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</Text>
      <Heading level={3} className="mt-2 text-zinc-950 dark:text-white">
        {value}
      </Heading>
      {helper ? <Text className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{helper}</Text> : null}
    </div>
  )
}
