import { describe, expect, it, vi, afterEach } from "vitest"
import {
  createQuestionnaire,
  createSignedUploadUrl,
  createLiveQuestionMapping,
  fetchMe,
  createOnboarding,
  createWorkspace,
  fetchOrgMembers,
  fetchOrgUsage,
  fetchWorkspaceMembers,
  addWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  fetchOrgInvites,
  createOrgInvite,
  acceptOrgInvite,
  fetchOrgSettings,
  updateOrgSettings,
  updateOrgMemberRole,
  removeOrgMember,
  fetchOrgWorkspaceReports,
  fetchDuplicateAnswers,
  fetchExpiringAnswers,
  fetchRoiAnalytics,
  getLiveQuestionAnswer,
  mergeAnswer,
  reviewAnswer,
  fetchTrustCenterOverview,
  fetchTrustCenterShares,
  createTrustCenterShare,
  revokeTrustCenterShare
} from "../lib/api"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("api client", () => {
  it("returns error payload when response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: "VALIDATION_ERROR", message: "bad" } })
    })

    vi.stubGlobal("fetch", fetchMock)

    const result = await createQuestionnaire({
      workspace_id: "workspace",
      title: "Acme",
      input_file: {
        bucket: "uploads",
        path: "org/1/input.xlsx",
        file_name: "input.xlsx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes: 10,
        checksum_sha256: "abc"
      }
    })

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe("VALIDATION_ERROR")
  })

  it("returns data payload when response is ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ questionnaire_id: "q1", status: "QUEUED", job_id: "j1" })
    })

    vi.stubGlobal("fetch", fetchMock)

    const result = await createQuestionnaire({
      workspace_id: "workspace",
      title: "Acme",
      input_file: {
        bucket: "uploads",
        path: "org/1/input.xlsx",
        file_name: "input.xlsx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes: 10,
        checksum_sha256: "abc"
      }
    })

    expect(result.error).toBeNull()
    expect(result.data?.questionnaire_id).toBe("q1")
  })

  it("returns internal error when response lacks error payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({})
    })

    vi.stubGlobal("fetch", fetchMock)

    const result = await createQuestionnaire({
      workspace_id: "workspace",
      title: "Acme",
      input_file: {
        bucket: "uploads",
        path: "org/1/input.xlsx",
        file_name: "input.xlsx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes: 10,
        checksum_sha256: "abc"
      }
    })

    expect(result.error?.code).toBe("INTERNAL_ERROR")
  })

  it("returns signed upload info when response is ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        questionnaire_id: "q1",
        input_file: {
          bucket: "uploads",
          path: "org/1/questionnaires/q1/input.xlsx",
          file_name: "input.xlsx",
          mime_type:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: 10,
          signed_url: "https://upload.test",
          expires_in: 600
        }
      })
    })

    vi.stubGlobal("fetch", fetchMock)

    const result = await createSignedUploadUrl({
      workspace_id: "workspace",
      input_file: {
        file_name: "input.xlsx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes: 10
      }
    })

    expect(result.error).toBeNull()
    expect(result.data?.input_file.signed_url).toContain("upload.test")
  })

  it("returns live question response payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        live_question_id: "lq-1",
        confidence_bucket: "NEEDS_REVIEW",
        confidence_score: 0.72,
        suggested: null,
        reasons: {}
      })
    })

    vi.stubGlobal("fetch", fetchMock)

    const result = await getLiveQuestionAnswer({
      workspace_id: "workspace",
      question_text: "Do you encrypt data?"
    })

    expect(result.error).toBeNull()
    expect(result.data?.live_question_id).toBe("lq-1")
  })

  it("returns answers hygiene payloads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mapping: { id: "map-1" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          threshold: 0.78,
          duplicates: [{ answer_id: "a1", duplicate_id: "a2", similarity: 0.8 }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ window_days: 14, answers: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deprecated_answer: { id: "a1" }, target_answer_id: "a2" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ answer: { id: "a1" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workspace_id: "ws-1",
          counts: { total_suggestions: 2, auto_fill: 1, needs_review: 1, manual: 0 },
          auto_fill_rate: 0.5,
          avg_completion_time_hours: 2.1,
          time_saved_hours: 1.2,
          assumptions: { minutes_saved_per_auto_fill: 3, based_on: "auto_fill only" }
        })
      })

    vi.stubGlobal("fetch", fetchMock)

    const mapping = await createLiveQuestionMapping({
      live_question_id: "lq-1",
      action: "accepted",
      selected_answer_id: "a1"
    })
    const duplicates = await fetchDuplicateAnswers("ws-1")
    const expiring = await fetchExpiringAnswers("ws-1", 14)
    const merged = await mergeAnswer("a1", "a2")
    const reviewed = await reviewAnswer("a1")
    const roi = await fetchRoiAnalytics("ws-1")

    expect(mapping.data?.mapping).toBeTruthy()
    expect(duplicates.data?.duplicates.length).toBe(1)
    expect(expiring.data?.window_days).toBe(14)
    expect(merged.data?.target_answer_id).toBe("a2")
    expect(reviewed.data?.answer).toBeTruthy()
    expect(roi.data?.auto_fill_rate).toBe(0.5)
  })

  it("returns onboarding and settings payloads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: "user-1", email: "user@example.com" },
          memberships: [],
          orgs: [],
          workspaces: [],
          features: {}
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          org: { id: "org-1", name: "Acme" },
          workspace: { id: "ws-1", org_id: "org-1", name: "Primary" },
          role: "ADMIN"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workspace: { id: "ws-2", org_id: "org-1", name: "Client A" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ members: [{ user_id: "user-1", role: "ADMIN" }] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invites: [{ id: "inv-1", email: "a@b.com", role: "EDITOR", token: "tok", expires_at: "2026-02-01", created_at: "2026-01-01" }] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invite: { id: "inv-2", email: "c@d.com", role: "VIEWER", token: "tok2", expires_at: "2026-02-01", created_at: "2026-01-01" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ org_id: "org-1", role: "VIEWER" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          limits: { max_upload_bytes: 10485760, max_questions: 500, max_active_jobs: 3, monthly_token_budget: 1000 },
          sso: { enabled: false, provider: null, domain: null, metadata_url: null },
          features: { trust_center_enabled: false, consultant_mode_enabled: true }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      })

    vi.stubGlobal("fetch", fetchMock)

    const me = await fetchMe()
    const onboarding = await createOnboarding("Acme", "Primary")
    const workspace = await createWorkspace("org-1", "Client A")
    const members = await fetchOrgMembers("org-1")
    const invites = await fetchOrgInvites("org-1")
    const invite = await createOrgInvite("org-1", "c@d.com", "VIEWER", 3)
    const accepted = await acceptOrgInvite("tok2")
    const settings = await fetchOrgSettings("org-1")
    const updated = await updateOrgSettings("org-1", { limits: { max_questions: 250 } })

    expect(me.data?.user.id).toBe("user-1")
    expect(onboarding.data?.org.name).toBe("Acme")
    expect(workspace.data?.workspace.id).toBe("ws-2")
    expect(members.data?.members.length).toBe(1)
    expect(invites.data?.invites.length).toBe(1)
    expect(invite.data?.invite.token).toBe("tok2")
    expect(accepted.data?.role).toBe("VIEWER")
    expect(settings.data?.limits?.max_active_jobs).toBe(3)
    expect(updated.data?.ok).toBe(true)
  })

  it("returns access management and trust center payloads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          period_start: "2026-01-01",
          tokens_in: 0,
          tokens_out: 0,
          tokens_used: 0,
          monthly_token_budget: 100,
          budget_remaining: 100
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ member: { user_id: "user-2", role: "EDITOR" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ members: [{ user_id: "user-1", role: "ADMIN" }] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ member: { user_id: "user-2", role: "EDITOR" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workspace_id: "ws-1",
          summary: {
            approved_answers: 1,
            answers_with_evidence: 1,
            evidence_total: 1,
            evidence_shareable: 1
          },
          answers: [],
          evidence: []
        })
      })

    vi.stubGlobal("fetch", fetchMock)

    const usage = await fetchOrgUsage("org-1")
    const updated = await updateOrgMemberRole("org-1", "user-2", "EDITOR")
    const removed = await removeOrgMember("org-1", "user-2")
    const workspaceMembers = await fetchWorkspaceMembers("ws-1")
    const addedMember = await addWorkspaceMember("ws-1", "user-2")
    const removedMember = await removeWorkspaceMember("ws-1", "user-2")
    const trustCenter = await fetchTrustCenterOverview("ws-1")

    expect(usage.data?.tokens_used).toBe(0)
    expect(updated.data?.member.role).toBe("EDITOR")
    expect(removed.data?.ok).toBe(true)
    expect(workspaceMembers.data?.members.length).toBe(1)
    expect(addedMember.data?.member.user_id).toBe("user-2")
    expect(removedMember.data?.ok).toBe(true)
    expect(trustCenter.data?.summary.approved_answers).toBe(1)
  })

  it("returns trust center shares and reports", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ member: { user_id: "user-2", role: "REVIEWER" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workspaces: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          shares: [
            {
              id: "share-1",
              token: "token",
              include_answers: true,
              include_evidence: true,
              expires_at: null,
              revoked_at: null,
              created_at: "2026-01-01",
              created_by: "user-1"
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          share: {
            id: "share-1",
            token: "token",
            include_answers: true,
            include_evidence: true,
            expires_at: null,
            revoked_at: null,
            created_at: "2026-01-01",
            created_by: "user-1"
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          share: {
            id: "share-1",
            token: "token",
            include_answers: true,
            include_evidence: true,
            expires_at: null,
            revoked_at: "2026-01-02",
            created_at: "2026-01-01",
            created_by: "user-1"
          }
        })
      })

    vi.stubGlobal("fetch", fetchMock)

    const roleUpdated = await updateWorkspaceMemberRole("ws-1", "user-2", "REVIEWER")
    const reports = await fetchOrgWorkspaceReports("org-1")
    const shares = await fetchTrustCenterShares("ws-1")
    const created = await createTrustCenterShare({
      workspace_id: "ws-1",
      include_answers: true,
      include_evidence: true,
      expires_in_days: 30
    })
    const revoked = await revokeTrustCenterShare("share-1")

    expect(roleUpdated.data?.member.role).toBe("REVIEWER")
    expect(reports.data?.workspaces.length).toBe(0)
    expect(shares.data?.shares.length).toBe(1)
    expect(created.data?.share.id).toBe("share-1")
    expect(revoked.data?.share.revoked_at).toBe("2026-01-02")
  })
})
