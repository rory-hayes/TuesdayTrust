"use client"

import React from "react"
import { Heading, Text, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tuesdaytrust/ui"
import { RoiTile } from "../../components/roi-tile"
import { sampleRoiMetrics } from "../../lib/sample-data"
import { fetchOrgWorkspaceReports, type OrgWorkspaceReport } from "../../lib/api"
import { useWorkspace } from "../../lib/use-workspace"

export default function AnalyticsPage() {
  const { orgId } = useWorkspace()
  const autoFillPercent = Math.round(sampleRoiMetrics.autoFillRate * 100)
  const [reports, setReports] = React.useState<OrgWorkspaceReport[]>([])
  const [reportStatus, setReportStatus] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!orgId) return
    void (async () => {
      const result = await fetchOrgWorkspaceReports(orgId)
      if (result.error) {
        setReportStatus(result.error.message)
        return
      }
      setReportStatus(null)
      setReports(result.data?.workspaces ?? [])
    })()
  }, [orgId])

  return (
    <div className="space-y-6">
      <div>
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Analytics
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          ROI metrics use conservative assumptions and show how the library compounds over time.
        </Text>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <RoiTile
          label="Auto-fill rate"
          value={`${autoFillPercent}%`}
          helper={`${sampleRoiMetrics.autoFillCount} of ${sampleRoiMetrics.totalSuggestions} suggestions`}
        />
        <RoiTile
          label="Time saved"
          value={`${sampleRoiMetrics.timeSavedHours} hours`}
          helper="Based on auto-fill usage only"
        />
        <RoiTile
          label="Avg completion time"
          value={`${sampleRoiMetrics.avgCompletionTimeHours} hours`}
          helper="Completed questionnaires only"
        />
      </div>

      <div className="rounded-xl border border-zinc-950/10 bg-white p-6 text-zinc-950 shadow-xs dark:border-white/10 dark:bg-zinc-900 dark:text-white">
        <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Assumptions</div>
        <div className="mt-2 text-sm">
          Time saved is estimated at three minutes per auto-fill suggestion. Update this once we
          have usage telemetry.
        </div>
      </div>

      <div className="rounded-xl border border-zinc-950/10 bg-white p-6 text-zinc-950 shadow-xs dark:border-white/10 dark:bg-zinc-900 dark:text-white">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Client reports</div>
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Workspace-level summaries for consultant reporting.
            </div>
          </div>
          {reportStatus ? (
            <Text className="text-sm text-amber-600">{reportStatus}</Text>
          ) : null}
        </div>

        {reports.length === 0 ? (
          <Text className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No report data yet.</Text>
        ) : (
          <Table className="mt-4">
            <TableHead>
              <TableRow>
                <TableHeader>Workspace</TableHeader>
                <TableHeader>Auto-fill rate</TableHeader>
                <TableHeader>Time saved</TableHeader>
                <TableHeader>Completed</TableHeader>
                <TableHeader>Last activity</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.workspace_id}>
                  <TableCell>{report.name}</TableCell>
                  <TableCell>{Math.round(report.auto_fill_rate * 100)}%</TableCell>
                  <TableCell>{report.time_saved_hours}h</TableCell>
                  <TableCell>{report.counts.questionnaires_completed}</TableCell>
                  <TableCell>{report.last_activity_at ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
