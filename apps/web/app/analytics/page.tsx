"use client"

import React from "react"
import { Heading, Text, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tuesdaytrust/ui"
import { RoiTile } from "../../components/roi-tile"
import { sampleRoiMetrics } from "../../lib/sample-data"
import {
  createReportExport,
  fetchOrgWorkspaceReports,
  fetchReportExports,
  type OrgWorkspaceReport,
  type ReportExportRecord
} from "../../lib/api"
import { useWorkspace } from "../../lib/use-workspace"

export default function AnalyticsPage() {
  const { orgId } = useWorkspace()
  const autoFillPercent = Math.round(sampleRoiMetrics.autoFillRate * 100)
  const [reports, setReports] = React.useState<OrgWorkspaceReport[]>([])
  const [reportStatus, setReportStatus] = React.useState<string | null>(null)
  const [exports, setExports] = React.useState<ReportExportRecord[]>([])
  const [exportStatus, setExportStatus] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!orgId) return
    void (async () => {
      const [reportResult, exportResult] = await Promise.all([
        fetchOrgWorkspaceReports(orgId),
        fetchReportExports(orgId)
      ])
      if (reportResult.error) {
        setReportStatus(reportResult.error.message)
      } else {
        setReportStatus(null)
        setReports(reportResult.data?.workspaces ?? [])
      }
      if (exportResult.error) {
        setExportStatus(exportResult.error.message)
      } else {
        setExportStatus(null)
        setExports(exportResult.data?.exports ?? [])
      }
    })()
  }, [orgId])

  async function handleCreateExport(format: "csv" | "pdf") {
    if (!orgId) return
    setExportStatus(null)
    const result = await createReportExport(orgId, { format })
    if (result.error) {
      setExportStatus(result.error.message)
      return
    }
    setExportStatus("Export queued.")
    const refreshed = await fetchReportExports(orgId)
    if (!refreshed.error) {
      setExports(refreshed.data?.exports ?? [])
    }
  }

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
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-zinc-200 px-3 py-1 text-sm text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-200"
                onClick={() => handleCreateExport("csv")}
              >
                Export CSV
              </button>
              <button
                className="rounded-lg border border-zinc-200 px-3 py-1 text-sm text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-200"
                onClick={() => handleCreateExport("pdf")}
              >
                Export PDF
              </button>
            </div>
            {reportStatus || exportStatus ? (
              <Text className="text-sm text-amber-600">{reportStatus ?? exportStatus}</Text>
            ) : null}
          </div>
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

      <div className="rounded-xl border border-zinc-950/10 bg-white p-6 text-zinc-950 shadow-xs dark:border-white/10 dark:bg-zinc-900 dark:text-white">
        <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Recent exports</div>
        {exports.length === 0 ? (
          <Text className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No exports yet.</Text>
        ) : (
          <Table className="mt-3">
            <TableHead>
              <TableRow>
                <TableHeader>Format</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Created</TableHeader>
                <TableHeader>Download</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {exports.map((reportExport) => (
                <TableRow key={reportExport.id}>
                  <TableCell>{reportExport.format.toUpperCase()}</TableCell>
                  <TableCell>{reportExport.status}</TableCell>
                  <TableCell>{new Date(reportExport.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    {reportExport.signed_url ? (
                      <a
                        className="text-zinc-700 underline dark:text-zinc-300"
                        href={reportExport.signed_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
