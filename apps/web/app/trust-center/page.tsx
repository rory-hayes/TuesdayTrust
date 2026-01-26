"use client"

import React from "react"
import {
  Button,
  Checkbox,
  CheckboxField,
  CheckboxGroup,
  Field,
  FieldGroup,
  Heading,
  Input,
  Text,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@tuesdaytrust/ui"
import {
  fetchTrustCenterOverview,
  fetchTrustCenterAllowlist,
  updateTrustCenterAllowlist,
  fetchTrustCenterAccessRequests,
  updateTrustCenterAccessRequest,
  fetchTrustCenterShares,
  createTrustCenterShare,
  revokeTrustCenterShare,
  type TrustCenterOverviewResponse,
  type TrustCenterShare,
  type TrustCenterAccessRequest,
  type TrustCenterAllowlistResponse
} from "../../lib/api"
import { useWorkspace } from "../../lib/use-workspace"

export default function TrustCenterPage() {
  const { features, workspaceId, role } = useWorkspace()
  const enabled = features?.trust_center_enabled ?? false
  const [overview, setOverview] = React.useState<TrustCenterOverviewResponse | null>(null)
  const [status, setStatus] = React.useState<string | null>(null)
  const [shares, setShares] = React.useState<TrustCenterShare[]>([])
  const [shareStatus, setShareStatus] = React.useState<string | null>(null)
  const [allowlistData, setAllowlistData] = React.useState<TrustCenterAllowlistResponse | null>(null)
  const [allowlistStatus, setAllowlistStatus] = React.useState<string | null>(null)
  const [accessRequests, setAccessRequests] = React.useState<TrustCenterAccessRequest[]>([])
  const [accessRequestStatus, setAccessRequestStatus] = React.useState<string | null>(null)
  const [allowlistSelection, setAllowlistSelection] = React.useState({
    answerIds: new Set<string>(),
    evidenceIds: new Set<string>()
  })
  const [shareForm, setShareForm] = React.useState({
    includeAnswers: true,
    includeEvidence: true,
    expiresInDays: "30"
  })

  React.useEffect(() => {
    if (!enabled || !workspaceId) return
    void (async () => {
      const baseRequests = [
        fetchTrustCenterOverview(workspaceId),
        fetchTrustCenterShares(workspaceId)
      ] as const
      const adminRequests =
        role === "ADMIN"
          ? ([fetchTrustCenterAllowlist(workspaceId), fetchTrustCenterAccessRequests(workspaceId)] as const)
          : ([] as const)

      const results = await Promise.all([...baseRequests, ...adminRequests])
      const [overviewResult, sharesResult] = results
      const allowlistResult = role === "ADMIN" ? results[2] : null
      const accessRequestResult = role === "ADMIN" ? results[3] : null
      if (overviewResult.error) {
        setStatus(overviewResult.error.message)
      } else {
        setStatus(null)
        setOverview(overviewResult.data)
      }
      if (sharesResult.error) {
        setShareStatus(sharesResult.error.message)
      } else {
        setShareStatus(null)
        setShares(sharesResult.data?.shares ?? [])
      }
      if (role === "ADMIN" && allowlistResult) {
        if (allowlistResult.error) {
          setAllowlistStatus(allowlistResult.error.message)
        } else {
          setAllowlistStatus(null)
          setAllowlistData(allowlistResult.data)
          setAllowlistSelection({
            answerIds: new Set(allowlistResult.data?.allowlist.answer_ids ?? []),
            evidenceIds: new Set(allowlistResult.data?.allowlist.evidence_ids ?? [])
          })
        }
      }
      if (role === "ADMIN" && accessRequestResult) {
        if (accessRequestResult.error) {
          setAccessRequestStatus(accessRequestResult.error.message)
        } else {
          setAccessRequestStatus(null)
          setAccessRequests(accessRequestResult.data?.requests ?? [])
        }
      }
    })()
  }, [enabled, workspaceId, role])

  async function handleCreateShare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspaceId) return
    setShareStatus(null)
    const expires = Number(shareForm.expiresInDays)
    const result = await createTrustCenterShare({
      workspace_id: workspaceId,
      include_answers: shareForm.includeAnswers,
      include_evidence: shareForm.includeEvidence,
      expires_in_days: Number.isNaN(expires) ? undefined : expires
    })
    if (result.error) {
      setShareStatus(result.error.message)
      return
    }
    if (result.data?.share) {
      setShares((prev) => [result.data!.share, ...prev])
    }
    setShareStatus("Share link created.")
  }

  async function handleRevokeShare(shareId: string) {
    setShareStatus(null)
    const result = await revokeTrustCenterShare(shareId)
    if (result.error) {
      setShareStatus(result.error.message)
      return
    }
    if (result.data?.share) {
      setShares((prev) =>
        prev.map((share) => (share.id === shareId ? result.data!.share : share))
      )
    }
    setShareStatus("Share link revoked.")
  }

  function toggleAllowlistAnswer(answerId: string) {
    setAllowlistSelection((prev) => {
      const next = new Set(prev.answerIds)
      if (next.has(answerId)) {
        next.delete(answerId)
      } else {
        next.add(answerId)
      }
      return { ...prev, answerIds: next }
    })
  }

  function toggleAllowlistEvidence(evidenceId: string) {
    setAllowlistSelection((prev) => {
      const next = new Set(prev.evidenceIds)
      if (next.has(evidenceId)) {
        next.delete(evidenceId)
      } else {
        next.add(evidenceId)
      }
      return { ...prev, evidenceIds: next }
    })
  }

  async function handleSaveAllowlist() {
    if (!workspaceId) return
    setAllowlistStatus(null)
    const result = await updateTrustCenterAllowlist({
      workspace_id: workspaceId,
      answer_ids: Array.from(allowlistSelection.answerIds),
      evidence_ids: Array.from(allowlistSelection.evidenceIds)
    })
    if (result.error) {
      setAllowlistStatus(result.error.message)
      return
    }
    setAllowlistStatus("Allowlist updated.")
    if (result.data) {
      setAllowlistData(result.data)
    }
  }

  async function handleAccessRequestDecision(requestId: string, status: "APPROVED" | "DENIED") {
    setAccessRequestStatus(null)
    const result = await updateTrustCenterAccessRequest(requestId, { status })
    if (result.error) {
      setAccessRequestStatus(result.error.message)
      return
    }
    if (result.data?.request) {
      setAccessRequests((prev) =>
        prev.map((request) => (request.id === requestId ? result.data!.request : request))
      )
    }
    setAccessRequestStatus(`Request ${status.toLowerCase()}.`)
  }

  function getShareStatus(share: TrustCenterShare) {
    if (share.revoked_at) return "Revoked"
    if (share.expires_at) {
      const expiresAt = new Date(share.expires_at)
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        return "Expired"
      }
    }
    return "Active"
  }

  function buildShareUrl(token: string) {
    if (typeof window === "undefined") return `/trust-center/public/${token}`
    return `${window.location.origin}/trust-center/public/${token}`
  }

  if (!enabled) {
    return (
      <div className="space-y-4">
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Trust Center
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Trust Center is not enabled for this organization.
        </Text>
        <Button outline href="/settings">
          Enable in settings
        </Button>
      </div>
    )
  }

  if (!workspaceId) {
    return (
      <div className="space-y-4">
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Trust Center
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Select a workspace to view Trust Center details.
        </Text>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Heading level={1} className="text-zinc-950 dark:text-white">
        Trust Center
      </Heading>
      <Text className="text-zinc-500 dark:text-zinc-400">
        Internal Trust Center preview. Shareable evidence links only.
      </Text>
      {status ? (
        <Text className="text-sm text-amber-600">{status}</Text>
      ) : null}

      {overview ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-zinc-950/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-zinc-900">
              <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Approved answers</Text>
              <Text className="text-xl text-zinc-950 dark:text-white">{overview.summary.approved_answers}</Text>
            </div>
            <div className="rounded-xl border border-zinc-950/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-zinc-900">
              <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Answers w/ evidence</Text>
              <Text className="text-xl text-zinc-950 dark:text-white">{overview.summary.answers_with_evidence}</Text>
            </div>
            <div className="rounded-xl border border-zinc-950/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-zinc-900">
              <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Evidence total</Text>
              <Text className="text-xl text-zinc-950 dark:text-white">{overview.summary.evidence_total}</Text>
            </div>
            <div className="rounded-xl border border-zinc-950/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-zinc-900">
              <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Shareable evidence</Text>
              <Text className="text-xl text-zinc-950 dark:text-white">{overview.summary.evidence_shareable}</Text>
            </div>
          </div>

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
                {overview.answers.map((answer) => (
                  <TableRow key={answer.id}>
                    <TableCell>{answer.title}</TableCell>
                    <TableCell>{answer.last_reviewed_at}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

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
                {overview.evidence.map((item) => (
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

          {role === "ADMIN" ? (
            <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <Text className="text-sm font-semibold text-zinc-950 dark:text-white">Trust Center allowlist</Text>
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                    Choose approved answers and evidence to include in public shares.
                  </Text>
                </div>
                <div className="flex items-center gap-3">
                  {allowlistStatus ? (
                    <Text className="text-sm text-amber-600">{allowlistStatus}</Text>
                  ) : null}
                  <Button outline onClick={handleSaveAllowlist}>
                    Save allowlist
                  </Button>
                </div>
              </div>

              {!allowlistData ? (
                <Text className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                  Allowlist is unavailable.
                </Text>
              ) : (
                <div className="mt-4 grid gap-6 md:grid-cols-2">
                  <div>
                    <Text className="text-sm font-semibold text-zinc-950 dark:text-white">Answers</Text>
                    <Table className="mt-3">
                      <TableHead>
                        <TableRow>
                          <TableHeader>Include</TableHeader>
                          <TableHeader>Title</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {allowlistData.answers.map((answer) => (
                          <TableRow key={answer.id}>
                            <TableCell>
                              <Checkbox
                                checked={allowlistSelection.answerIds.has(answer.id)}
                                onChange={() => toggleAllowlistAnswer(answer.id)}
                              />
                            </TableCell>
                            <TableCell>{answer.title}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <Text className="text-sm font-semibold text-zinc-950 dark:text-white">Evidence</Text>
                    <Table className="mt-3">
                      <TableHead>
                        <TableRow>
                          <TableHeader>Include</TableHeader>
                          <TableHeader>Title</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {allowlistData.evidence.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Checkbox
                                checked={allowlistSelection.evidenceIds.has(item.id)}
                                onChange={() => toggleAllowlistEvidence(item.id)}
                              />
                            </TableCell>
                            <TableCell>{item.title}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {role === "ADMIN" ? (
            <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <Text className="text-sm font-semibold text-zinc-950 dark:text-white">
                    Access requests
                  </Text>
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                    Review requests for additional Trust Center access.
                  </Text>
                </div>
                {accessRequestStatus ? (
                  <Text className="text-sm text-amber-600">{accessRequestStatus}</Text>
                ) : null}
              </div>

              {accessRequests.length === 0 ? (
                <Text className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                  No access requests yet.
                </Text>
              ) : (
                <Table className="mt-3">
                  <TableHead>
                    <TableRow>
                      <TableHeader>Requester</TableHeader>
                      <TableHeader>Message</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader>Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accessRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div className="text-sm text-zinc-950 dark:text-white">
                            {request.requester_name ?? "Anonymous"}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {request.requester_email ?? "No email"}
                          </div>
                        </TableCell>
                        <TableCell>{request.message ?? "—"}</TableCell>
                        <TableCell>{request.status}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              outline
                              disabled={request.status !== "PENDING"}
                              onClick={() => handleAccessRequestDecision(request.id, "APPROVED")}
                            >
                              Approve
                            </Button>
                            <Button
                              outline
                              disabled={request.status !== "PENDING"}
                              onClick={() => handleAccessRequestDecision(request.id, "DENIED")}
                            >
                              Deny
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : null}

          <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <Text className="text-sm font-semibold text-zinc-950 dark:text-white">Public share links</Text>
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  Generate a shareable Trust Center snapshot for clients.
                </Text>
              </div>
              {shareStatus ? (
                <Text className="text-sm text-amber-600">{shareStatus}</Text>
              ) : null}
            </div>

            <form className="mt-4" onSubmit={handleCreateShare}>
              <FieldGroup>
                <Field>
                  <label className="text-sm font-medium text-zinc-950 dark:text-white">Expires in days</label>
                  <Input
                    value={shareForm.expiresInDays}
                    onChange={(event) =>
                      setShareForm((prev) => ({ ...prev, expiresInDays: event.target.value }))
                    }
                    placeholder="30"
                  />
                </Field>
                <CheckboxGroup className="sm:col-span-2">
                  <CheckboxField>
                    <Checkbox
                      checked={shareForm.includeAnswers}
                      onChange={(value) =>
                        setShareForm((prev) => ({ ...prev, includeAnswers: Boolean(value) }))
                      }
                    />
                    <Text data-slot="label" className="text-sm font-medium text-zinc-950 dark:text-white">
                      Include answer titles
                    </Text>
                  </CheckboxField>
                  <CheckboxField>
                    <Checkbox
                      checked={shareForm.includeEvidence}
                      onChange={(value) =>
                        setShareForm((prev) => ({ ...prev, includeEvidence: Boolean(value) }))
                      }
                    />
                    <Text data-slot="label" className="text-sm font-medium text-zinc-950 dark:text-white">
                      Include shareable evidence
                    </Text>
                  </CheckboxField>
                </CheckboxGroup>
                <Button outline type="submit">Create share link</Button>
              </FieldGroup>
            </form>

            {shares.length === 0 ? (
              <Text className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No share links yet.</Text>
            ) : (
              <Table className="mt-4">
                <TableHead>
                  <TableRow>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Expires</TableHeader>
                    <TableHeader>Includes</TableHeader>
                    <TableHeader>Share link</TableHeader>
                    <TableHeader>Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shares.map((share) => {
                    const url = buildShareUrl(share.token)
                    return (
                      <TableRow key={share.id}>
                        <TableCell>{getShareStatus(share)}</TableCell>
                        <TableCell>{share.expires_at ?? "—"}</TableCell>
                        <TableCell>
                          {[share.include_answers ? "Answers" : null, share.include_evidence ? "Evidence" : null]
                            .filter(Boolean)
                            .join(", ") || "None"}
                        </TableCell>
                        <TableCell>
                          <a className="text-zinc-700 underline dark:text-zinc-300" href={url} target="_blank" rel="noreferrer">
                            {url}
                          </a>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              outline
                              onClick={() => {
                                void navigator.clipboard.writeText(url)
                                setShareStatus("Share link copied.")
                              }}
                            >
                              Copy
                            </Button>
                            <Button
                              outline
                              onClick={() => handleRevokeShare(share.id)}
                              disabled={Boolean(share.revoked_at)}
                            >
                              Revoke
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
