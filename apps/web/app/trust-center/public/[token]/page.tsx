"use client"

import React from "react"
import { Heading, Text, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tuesdaytrust/ui"

interface PublicTrustCenterResponse {
  share_id: string
  workspace_id: string
  summary: {
    approved_answers: number
    answers_with_evidence: number
    evidence_total: number
    evidence_shareable: number
  }
  answers: Array<{ id: string; title: string; last_reviewed_at: string }>
  evidence: Array<{ id: string; title: string; url: string | null; expires_at: string | null }>
}

export default function PublicTrustCenterPage({ params }: { params: { token: string } }) {
  const [data, setData] = React.useState<PublicTrustCenterResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ?? ""
    if (!baseUrl) {
      setError("Missing API base URL")
      return
    }
    void (async () => {
      const response = await fetch(
        `${baseUrl}/api/trust-center/public?token=${encodeURIComponent(params.token)}`,
        { cache: "no-store" }
      )
      const payload = (await response.json()) as { error?: { message?: string } } & PublicTrustCenterResponse
      if (!response.ok || payload.error) {
        setError(payload.error?.message ?? "Unable to load Trust Center")
        return
      }
      setError(null)
      setData(payload)
    })()
  }, [params.token])

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Trust Center
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          {error ?? "Unable to load the shared Trust Center."}
        </Text>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Trust Center
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Shared summary of approved answers and evidence.
        </Text>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-zinc-950/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-zinc-900">
          <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Approved answers</Text>
          <Text className="text-xl text-zinc-950 dark:text-white">{data.summary.approved_answers}</Text>
        </div>
        <div className="rounded-xl border border-zinc-950/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-zinc-900">
          <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Answers w/ evidence</Text>
          <Text className="text-xl text-zinc-950 dark:text-white">{data.summary.answers_with_evidence}</Text>
        </div>
        <div className="rounded-xl border border-zinc-950/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-zinc-900">
          <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Evidence total</Text>
          <Text className="text-xl text-zinc-950 dark:text-white">{data.summary.evidence_total}</Text>
        </div>
        <div className="rounded-xl border border-zinc-950/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-zinc-900">
          <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Shareable evidence</Text>
          <Text className="text-xl text-zinc-950 dark:text-white">{data.summary.evidence_shareable}</Text>
        </div>
      </div>

      {data.answers.length > 0 ? (
        <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <Text className="text-sm font-semibold text-zinc-950 dark:text-white">Approved answers</Text>
          <Table className="mt-3">
            <TableHead>
              <TableRow>
                <TableHeader>Title</TableHeader>
                <TableHeader>Last reviewed</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.answers.map((answer) => (
                <TableRow key={answer.id}>
                  <TableCell>{answer.title}</TableCell>
                  <TableCell>{answer.last_reviewed_at}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {data.evidence.length > 0 ? (
        <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <Text className="text-sm font-semibold text-zinc-950 dark:text-white">Shareable evidence</Text>
          <Table className="mt-3">
            <TableHead>
              <TableRow>
                <TableHeader>Title</TableHeader>
                <TableHeader>Link</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.evidence.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.title}</TableCell>
                  <TableCell>
                    {item.url ? (
                      <a className="text-zinc-700 underline dark:text-zinc-300" href={item.url}>
                        View
                      </a>
                    ) : (
                      "Upload"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}
