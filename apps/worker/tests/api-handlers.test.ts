import { describe, expect, it } from "vitest"
import { createHandlers } from "../../../supabase/functions/api/handlers"

type TableRow = Record<string, unknown>

function toComparable(value: unknown) {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
    return Number(value)
  }
  if (value instanceof Date) return value.getTime()
  return Number(value ?? 0)
}

class QueryBuilder {
  private filters: Array<{ type: "eq" | "in" | "gte" | "lt"; column: string; value: unknown }> = []
  private pendingInsert: TableRow[] | null = null
  private pendingUpdate: TableRow | null = null
  private pendingDelete = false
  private selectOptions: { count?: "exact"; head?: boolean } | undefined
  private limitCount: number | null = null
  private orderBy: { column: string; ascending: boolean } | null = null

  constructor(
    private table: string,
    private data: Record<string, TableRow[]>
  ) {}

  select(_columns: string, options?: { count?: "exact"; head?: boolean }) {
    this.selectOptions = options
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ type: "eq", column, value })
    return this
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ type: "in", column, value })
    return this
  }

  gte(column: string, value: unknown) {
    this.filters.push({ type: "gte", column, value })
    return this
  }

  lt(column: string, value: unknown) {
    this.filters.push({ type: "lt", column, value })
    return this
  }

  order(column: string, options: { ascending: boolean }) {
    this.orderBy = { column, ascending: options.ascending }
    return this
  }

  limit(count: number) {
    this.limitCount = count
    return this
  }

  insert(values: TableRow | TableRow[]) {
    this.pendingInsert = Array.isArray(values) ? values : [values]
    return this
  }

  update(values: TableRow) {
    this.pendingUpdate = values
    return this
  }

  delete() {
    this.pendingDelete = true
    return this
  }

  private applyFilters(rows: TableRow[]) {
    return rows.filter((row) =>
      this.filters.every((filter) => {
        if (filter.type === "eq") {
          return row[filter.column] === filter.value
        }
        if (filter.type === "gte") {
          return toComparable(row[filter.column]) >= toComparable(filter.value)
        }
        if (filter.type === "lt") {
          return toComparable(row[filter.column]) < toComparable(filter.value)
        }
        return Array.isArray(filter.value)
          ? filter.value.includes(row[filter.column] as string)
          : false
      })
    )
  }

  private applyOrder(rows: TableRow[]) {
    if (!this.orderBy) return rows
    const { column, ascending } = this.orderBy
    return [...rows].sort((a, b) => {
      const left = a[column]
      const right = b[column]
      if (left === right) return 0
      if (left === undefined || left === null) return 1
      if (right === undefined || right === null) return -1
      return ascending ? Number(left > right) : Number(left < right)
    })
  }

  private applyLimit(rows: TableRow[]) {
    if (!this.limitCount) return rows
    return rows.slice(0, this.limitCount)
  }

  private commitInsert() {
    if (!this.pendingInsert) return []
    const rows = this.data[this.table] ?? []
    const inserted = this.pendingInsert.map((row) => {
      if (row.id) return row
      return { ...row, id: crypto.randomUUID() }
    })
    rows.push(...inserted)
    this.data[this.table] = rows
    return inserted
  }

  private commitUpdate() {
    if (!this.pendingUpdate) return []
    const rows = this.data[this.table] ?? []
    const filtered = this.applyFilters(rows)
    for (const row of filtered) {
      Object.assign(row, this.pendingUpdate)
    }
    return filtered
  }

  private async executeList() {
    if (this.pendingInsert) {
      const inserted = this.commitInsert()
      return { data: inserted, error: null, count: inserted.length }
    }
    if (this.pendingUpdate) {
      const updated = this.commitUpdate()
      return { data: updated, error: null, count: updated.length }
    }
    if (this.pendingDelete) {
      const rows = this.data[this.table] ?? []
      const deleted = this.applyFilters(rows)
      this.data[this.table] = rows.filter((row) => !deleted.includes(row))
      return { data: deleted, error: null, count: deleted.length }
    }

    const rows = this.applyLimit(this.applyOrder(this.applyFilters(this.data[this.table] ?? [])))
    if (this.selectOptions?.head) {
      return { data: null, error: null, count: rows.length }
    }
    return { data: rows, error: null, count: rows.length }
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.executeList().then(onfulfilled, onrejected)
  }

  async single() {
    const result = await this.executeList()
    const row = Array.isArray(result.data) ? result.data[0] ?? null : result.data
    return { data: row, error: null, count: result.count }
  }

  async maybeSingle() {
    const result = await this.executeList()
    const row = Array.isArray(result.data) ? result.data[0] ?? null : result.data
    return { data: row, error: null, count: result.count }
  }
}

class SupabaseStub {
  auth = {
    getUser: async (token: string) => ({
      data: { user: token === "token" ? { id: "user-1", email: "user-1@example.com" } : null }
    })
  }

  storage = {
    from: (_bucket: string) => ({
      createSignedUploadUrl: async (path: string, _ttl: number) => ({
        data: { signedUrl: `https://uploads.test/${path}`, path },
        error: null
      }),
      createSignedUrl: async (path: string, _ttl: number) => ({
        data: { signedUrl: `https://downloads.test/${path}` },
        error: null
      })
    })
  }

  constructor(private data: Record<string, TableRow[]>) {}

  from(table: string) {
    return new QueryBuilder(table, this.data)
  }
}

function buildRequest(path: string, method: string, body?: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      authorization: "Bearer token"
    },
    body: body ? JSON.stringify(body) : undefined
  })
}

describe("edge handlers", () => {
  it("returns unauthorized for missing auth", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({}),
      qstash: { url: "", token: "" }
    })

    const request = new Request("http://localhost/api/uploads/sign", { method: "POST" })
    const response = await handlers.handleRequest(request)
    expect(response.status).toBe(401)
  })

  it("validates signed upload input", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        jobs: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/uploads/sign", "POST", { workspace_id: "ws-1" })
    )
    const payload = await response.json()
    expect(response.status).toBe(400)
    expect(payload.error.code).toBe("VALIDATION_ERROR")
  })

  it("handles invalid JSON payloads", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        jobs: []
      }),
      qstash: { url: "", token: "" }
    })

    const request = new Request("http://localhost/api/uploads/sign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer token"
      },
      body: "not-json"
    })
    const response = await handlers.handleRequest(request)
    expect(response.status).toBe(400)
  })

  it("signs upload URL", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        jobs: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/uploads/sign", "POST", {
        workspace_id: "ws-1",
        questionnaire_id: "questionnaire-1",
        input_file: {
          file_name: "input.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: 100
        }
      })
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.input_file.signed_url).toContain("https://uploads.test")
    expect(payload.questionnaire_id).toBe("questionnaire-1")
  })

  it("rejects unsupported mime type for signed upload", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        jobs: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/uploads/sign", "POST", {
        workspace_id: "ws-1",
        input_file: {
          file_name: "input.txt",
          mime_type: "text/plain",
          size_bytes: 10
        }
      })
    )

    const payload = await response.json()
    expect(response.status).toBe(400)
    expect(payload.error.code).toBe("VALIDATION_ERROR")
  })

  it("blocks signed upload for viewer role", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "VIEWER" }],
        jobs: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/uploads/sign", "POST", {
        workspace_id: "ws-1",
        input_file: {
          file_name: "input.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: 100
        }
      })
    )

    expect(response.status).toBe(403)
  })

  it("rate limits signed upload when org is at capacity", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        jobs: [{ id: "job-1", org_id: "org-1", status: "RUNNING" }]
      }),
      qstash: { url: "", token: "" },
      maxOrgActiveJobs: 1
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/uploads/sign", "POST", {
        workspace_id: "ws-1",
        input_file: {
          file_name: "input.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: 100
        }
      })
    )
    expect(response.status).toBe(429)
  })

  it("rate limits questionnaire creation when org is at capacity", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        jobs: [
          { id: "job-1", org_id: "org-1", status: "QUEUED" },
          { id: "job-2", org_id: "org-1", status: "RUNNING" },
          { id: "job-3", org_id: "org-1", status: "RUNNING" }
        ]
      }),
      qstash: { url: "", token: "" },
      maxOrgActiveJobs: 2
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/questionnaires", "POST", {
        workspace_id: "ws-1",
        title: "Acme Questionnaire",
        input_file: {
          bucket: "uploads",
          path: "org/org-1/input.xlsx",
          file_name: "input.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: 100,
          checksum_sha256: "abc"
        }
      })
    )

    expect(response.status).toBe(429)
  })

  it("rejects duplicate questionnaire id", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        questionnaires: [{ id: "questionnaire-1", workspace_id: "ws-1" }],
        jobs: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/questionnaires", "POST", {
        questionnaire_id: "questionnaire-1",
        workspace_id: "ws-1",
        title: "Acme Questionnaire",
        input_file: {
          bucket: "uploads",
          path: "org/org-1/questionnaires/questionnaire-1/input.xlsx",
          file_name: "input.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: 100,
          checksum_sha256: "abc"
        }
      })
    )
    expect(response.status).toBe(409)
  })

  it("creates questionnaire and job", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        questionnaires: [],
        questionnaire_files: [],
        jobs: [],
        audit_events: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/questionnaires", "POST", {
        questionnaire_id: "questionnaire-1",
        workspace_id: "ws-1",
        title: "Acme Questionnaire",
        input_file: {
          bucket: "uploads",
          path: "org/org-1/questionnaires/questionnaire-1/input.xlsx",
          file_name: "input.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: 100,
          checksum_sha256: "abc"
        }
      })
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.questionnaire_id).toBe("questionnaire-1")
  })

  it("blocks questionnaire creation for viewer role", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "VIEWER" }],
        questionnaires: [],
        questionnaire_files: [],
        jobs: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/questionnaires", "POST", {
        questionnaire_id: "questionnaire-1",
        workspace_id: "ws-1",
        title: "Acme Questionnaire",
        input_file: {
          bucket: "uploads",
          path: "org/org-1/questionnaires/questionnaire-1/input.xlsx",
          file_name: "input.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: 100,
          checksum_sha256: "abc"
        }
      })
    )

    expect(response.status).toBe(403)
  })

  it("returns not found for missing questionnaire", async () => {
    const questionnaireId = "a1b2c3d4-1111-2222-3333-444455556666"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        questionnaires: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/questionnaires/${questionnaireId}`, "GET")
    )
    expect(response.status).toBe(404)
  })

  it("returns questionnaire summary with export file", async () => {
    const questionnaireId = "a1b2c3d4-1111-2222-3333-444455556666"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        questionnaires: [
          {
            id: questionnaireId,
            workspace_id: "ws-1",
            title: "Test Questionnaire",
            status: "READY_FOR_REVIEW",
            progress_done: 1,
            progress_total: 2
          }
        ],
        questionnaire_files: [
          {
            id: "file-1",
            questionnaire_id: questionnaireId,
            storage_bucket: "exports",
            storage_path: `org/org-1/questionnaires/${questionnaireId}/export.xlsx`,
            kind: "export"
          }
        ],
        questions: [{ id: "question-1", questionnaire_id: questionnaireId }],
        suggestions: [{ question_id: "question-1", confidence_bucket: "AUTO_FILL" }]
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/questionnaires/${questionnaireId}`, "GET")
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.export_file.signed_url).toContain("https://downloads.test")
    expect(payload.counts.auto_fill).toBe(1)
  })

  it("lists questions with confidence filter", async () => {
    const questionnaireId = "a1b2c3d4-1111-2222-3333-444455556666"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        questionnaires: [{ id: questionnaireId, workspace_id: "ws-1" }],
        questions: [
          { id: "question-1", questionnaire_id: questionnaireId, index: 1 }
        ],
        suggestions: [
          { question_id: "question-1", confidence_bucket: "AUTO_FILL" }
        ]
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest(
        `/api/questionnaires/${questionnaireId}/questions?bucket=AUTO_FILL&limit=10`,
        "GET"
      )
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.suggestions.length).toBe(1)
  })

  it("requeues questionnaire", async () => {
    const questionnaireId = "a1b2c3d4-1111-2222-3333-444455556666"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        questionnaires: [{ id: questionnaireId, workspace_id: "ws-1" }],
        jobs: [],
        audit_events: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/questionnaires/${questionnaireId}/requeue`, "POST")
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.status).toBe("QUEUED")
  })

  it("requests export job", async () => {
    const questionnaireId = "a1b2c3d4-1111-2222-3333-444455556666"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        questionnaires: [{ id: questionnaireId, workspace_id: "ws-1" }],
        jobs: [],
        audit_events: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/questionnaires/${questionnaireId}/export`, "POST")
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.status).toBe("QUEUED")
  })

  it("requires workspace_id for listing answers", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({}),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/answers", "GET")
    )
    expect(response.status).toBe(400)
  })

  it("creates a draft answer", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        answers: [],
        audit_events: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/answers", "POST", {
        workspace_id: "ws-1",
        title: "MFA Policy",
        body: "We enforce MFA."
      })
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.answer.status).toBe("DRAFT")
  })

  it("blocks answer creation for viewer role", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "VIEWER" }],
        answers: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/answers", "POST", {
        workspace_id: "ws-1",
        title: "MFA Policy",
        body: "We enforce MFA."
      })
    )

    expect(response.status).toBe(403)
  })

  it("rejects approval without reviewer role", async () => {
    const answerId = "b2c3d4e5-1111-2222-3333-444455556666"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "VIEWER" }],
        answers: [{ id: answerId, workspace_id: "ws-1" }]
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/answers/${answerId}/approve`, "POST")
    )
    expect(response.status).toBe(403)
  })

  it("approves answers for reviewer role", async () => {
    const answerId = "b2c3d4e5-1111-2222-3333-444455556666"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "REVIEWER" }],
        answers: [{ id: answerId, workspace_id: "ws-1" }],
        audit_events: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/answers/${answerId}/approve`, "POST")
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.answer.status).toBe("APPROVED")
  })

  it("answers live questions with suggestions", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        answers: [
          {
            id: "a-1",
            org_id: "org-1",
            workspace_id: "ws-1",
            title: "MFA policy",
            body: "We enforce MFA for administrators.",
            status: "APPROVED",
            last_reviewed_at: "2026-01-01T00:00:00Z",
            created_at: "2025-12-01T00:00:00Z"
          }
        ],
        answer_evidence_links: [{ id: "link-1", answer_id: "a-1", evidence_id: "e-1" }],
        evidence: [{ id: "e-1", title: "MFA Policy", url: "https://example.com/mfa" }],
        live_questions: [],
        audit_events: []
      }),
      qstash: { url: "", token: "" },
      now: () => new Date("2026-01-20T00:00:00Z")
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/live-question/answer", "POST", {
        workspace_id: "ws-1",
        question_text: "Do you enforce MFA for admin access?"
      })
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.live_question_id).toBeTruthy()
    expect(payload.suggested.answer_id).toBe("a-1")
  })

  it("blocks live question for viewer role", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "VIEWER" }],
        answers: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/live-question/answer", "POST", {
        workspace_id: "ws-1",
        question_text: "Do you enforce MFA for admin access?"
      })
    )

    expect(response.status).toBe(403)
  })

  it("stores live question mapping feedback", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        live_questions: [
          { id: "lq-1", org_id: "org-1", workspace_id: "ws-1", question_text: "MFA?" }
        ],
        live_question_mappings: [],
        answers: [{ id: "a-1", workspace_id: "ws-1" }],
        audit_events: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/live-question/map", "POST", {
        live_question_id: "lq-1",
        selected_answer_id: "a-1",
        action: "accepted"
      })
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.mapping.id).toBeTruthy()
  })

  it("detects duplicates and merges answers", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "REVIEWER" }],
        answers: [
          {
            id: "a-1",
            org_id: "org-1",
            workspace_id: "ws-1",
            title: "Admin MFA requirement",
            body: "MFA is required for admin access.",
            status: "APPROVED"
          },
          {
            id: "a-2",
            org_id: "org-1",
            workspace_id: "ws-1",
            title: "Admin MFA requirement",
            body: "MFA is required for admin access.",
            status: "APPROVED"
          }
        ],
        suggestions: [{ id: "s-1", selected_answer_id: "a-1" }],
        audit_events: []
      }),
      qstash: { url: "", token: "" }
    })

    const duplicatesResponse = await handlers.handleRequest(
      buildRequest("/api/answers/duplicates?workspace_id=ws-1", "GET")
    )
    const duplicatesPayload = await duplicatesResponse.json()
    expect(duplicatesResponse.status).toBe(200)
    expect(duplicatesPayload.duplicates.length).toBeGreaterThan(0)

    const mergeResponse = await handlers.handleRequest(
      buildRequest("/api/answers/a-1/merge", "POST", { target_answer_id: "a-2" })
    )
    const mergePayload = await mergeResponse.json()
    expect(mergeResponse.status).toBe(200)
    expect(mergePayload.deprecated_answer.status).toBe("DEPRECATED")
  })

  it("lists expiring answers and ROI analytics", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        answers: [
          {
            id: "a-1",
            org_id: "org-1",
            workspace_id: "ws-1",
            title: "Access reviews",
            status: "APPROVED",
            review_interval_days: 30,
            last_reviewed_at: "2026-01-10T00:00:00Z",
            created_at: "2025-12-01T00:00:00Z"
          }
        ],
        suggestions: [
          { id: "s-1", org_id: "org-1", workspace_id: "ws-1", confidence_bucket: "AUTO_FILL" },
          { id: "s-2", org_id: "org-1", workspace_id: "ws-1", confidence_bucket: "NEEDS_REVIEW" }
        ],
        questionnaires: [
          {
            id: "q-1",
            org_id: "org-1",
            workspace_id: "ws-1",
            status: "COMPLETED",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-02T00:00:00Z"
          }
        ]
      }),
      qstash: { url: "", token: "" },
      now: () => new Date("2026-02-01T00:00:00Z")
    })

    const expiringResponse = await handlers.handleRequest(
      buildRequest("/api/answers/expiring?workspace_id=ws-1&window_days=14", "GET")
    )
    const expiringPayload = await expiringResponse.json()
    expect(expiringResponse.status).toBe(200)
    expect(expiringPayload.answers.length).toBe(1)

    const roiResponse = await handlers.handleRequest(
      buildRequest("/api/analytics/roi?workspace_id=ws-1", "GET")
    )
    const roiPayload = await roiResponse.json()
    expect(roiResponse.status).toBe(200)
    expect(roiPayload.auto_fill_rate).toBe(0.5)
  })

  it("marks answers as reviewed", async () => {
    const answerId = "a-99"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        workspaces: [{ id: "ws-1", org_id: "org-1" }],
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "REVIEWER" }],
        answers: [{ id: answerId, workspace_id: "ws-1" }],
        audit_events: []
      }),
      qstash: { url: "", token: "" },
      now: () => new Date("2026-01-20T00:00:00Z")
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/answers/${answerId}/review`, "POST")
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.answer.last_reviewed_at).toBe("2026-01-20T00:00:00.000Z")
  })

  it("returns membership and workspaces for /api/me", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        org_memberships: [{ id: "mem-1", org_id: "org-1", user_id: "user-1", role: "ADMIN" }],
        organizations: [{ id: "org-1", name: "Acme" }],
        workspaces: [{ id: "ws-1", org_id: "org-1", name: "Primary" }],
        workspace_memberships: [{ id: "wsm-1", workspace_id: "ws-1", user_id: "user-1", role: "ADMIN" }],
        org_features: [{ id: "feat-1", org_id: "org-1", trust_center_enabled: false, consultant_mode_enabled: true }]
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(buildRequest("/api/me", "GET"))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.user.id).toBe("user-1")
    expect(payload.workspaces[0].org_name).toBe("Acme")
    expect(payload.features["org-1"].consultant_mode_enabled).toBe(true)
  })

  it("creates org and workspace during onboarding", async () => {
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        organizations: [],
        workspaces: [],
        org_memberships: [],
        workspace_memberships: [],
        org_limits: [],
        org_sso_settings: [],
        org_features: [],
        audit_events: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/onboarding", "POST", {
        org_name: "Acme",
        workspace_name: "Primary Workspace"
      })
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.org.name).toBe("Acme")
    expect(payload.workspace.name).toBe("Primary Workspace")
  })

  it("creates and accepts org invites", async () => {
    const orgId = "11111111-1111-1111-1111-111111111111"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        org_memberships: [{ id: "mem-1", org_id: orgId, user_id: "user-1", role: "ADMIN" }],
        workspaces: [{ id: "ws-1", org_id: orgId, name: "Primary" }],
        org_invites: [],
        workspace_memberships: []
      }),
      qstash: { url: "", token: "" }
    })

    const inviteResponse = await handlers.handleRequest(
      buildRequest(`/api/orgs/${orgId}/invites`, "POST", {
        email: "user-1@example.com",
        role: "EDITOR",
        expires_in_days: 1
      })
    )
    const invitePayload = await inviteResponse.json()
    expect(inviteResponse.status).toBe(200)
    expect(invitePayload.invite.token).toBeTruthy()

    const acceptResponse = await handlers.handleRequest(
      buildRequest("/api/invites/accept", "POST", {
        token: invitePayload.invite.token
      })
    )
    const acceptPayload = await acceptResponse.json()
    expect(acceptResponse.status).toBe(200)
    expect(acceptPayload.role).toBe("EDITOR")
  })

  it("updates org settings", async () => {
    const orgId = "22222222-2222-2222-2222-222222222222"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        org_memberships: [{ id: "mem-1", org_id: orgId, user_id: "user-1", role: "ADMIN" }],
        org_limits: [],
        org_sso_settings: [],
        org_features: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/orgs/${orgId}/settings`, "POST", {
        limits: { max_questions: 250, monthly_token_budget: 1000 },
        sso: { enabled: false, provider: "SAML", domain: "acme.com" },
        features: { trust_center_enabled: true, consultant_mode_enabled: true }
      })
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
  })

  it("reads org settings", async () => {
    const orgId = "33333333-3333-3333-3333-333333333333"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        org_memberships: [{ id: "mem-1", org_id: orgId, user_id: "user-1", role: "ADMIN" }],
        org_limits: [{ id: "lim-1", org_id: orgId, max_questions: 250 }],
        org_sso_settings: [{ id: "sso-1", org_id: orgId, enabled: false }],
        org_features: [{ id: "feat-1", org_id: orgId, trust_center_enabled: false, consultant_mode_enabled: false }]
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/orgs/${orgId}/settings`, "GET")
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.limits.max_questions).toBe(250)
  })

  it("blocks org access when SSO domain mismatches", async () => {
    const orgId = "44444444-4444-4444-4444-444444444444"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        org_memberships: [{ id: "mem-1", org_id: orgId, user_id: "user-1", role: "ADMIN" }],
        org_sso_settings: [{ id: "sso-1", org_id: orgId, enabled: true, domain: "acme.com" }]
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/orgs/${orgId}/members`, "GET")
    )
    const payload = await response.json()
    expect(response.status).toBe(403)
    expect(payload.error.code).toBe("SSO_REQUIRED")
  })

  it("enforces consultant mode workspace membership", async () => {
    const orgId = "55555555-5555-5555-5555-555555555555"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        org_memberships: [{ id: "mem-1", org_id: orgId, user_id: "user-1", role: "ADMIN" }],
        org_features: [{ id: "feat-1", org_id: orgId, trust_center_enabled: false, consultant_mode_enabled: true }],
        workspaces: [{ id: "ws-1", org_id: orgId, name: "Primary" }],
        answers: []
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/answers?workspace_id=ws-1", "GET")
    )
    expect(response.status).toBe(403)
  })

  it("updates org member roles and removes members", async () => {
    const orgId = "66666666-6666-6666-6666-666666666666"
    const memberId = "22222222-2222-2222-2222-222222222222"
    const data = {
      org_memberships: [
        { id: "mem-1", org_id: orgId, user_id: "user-1", role: "ADMIN" },
        { id: "mem-2", org_id: orgId, user_id: memberId, role: "VIEWER" }
      ],
      workspaces: [{ id: "ws-1", org_id: orgId, name: "Primary" }],
      workspace_memberships: [
        { id: "wsm-1", workspace_id: "ws-1", user_id: memberId, role: "VIEWER" }
      ]
    }
    const handlers = createHandlers({
      supabase: new SupabaseStub(data),
      qstash: { url: "", token: "" }
    })

    const updateResponse = await handlers.handleRequest(
      buildRequest(`/api/orgs/${orgId}/members/${memberId}/role`, "POST", { role: "EDITOR" })
    )
    const updatePayload = await updateResponse.json()
    expect(updateResponse.status).toBe(200)
    expect(updatePayload.member.role).toBe("EDITOR")

    const removeResponse = await handlers.handleRequest(
      buildRequest(`/api/orgs/${orgId}/members/${memberId}/remove`, "POST")
    )
    const removePayload = await removeResponse.json()
    expect(removeResponse.status).toBe(200)
    expect(removePayload.ok).toBe(true)
  })

  it("manages workspace members", async () => {
    const orgId = "77777777-7777-7777-7777-777777777777"
    const workspaceId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    const memberId = "33333333-3333-3333-3333-333333333333"
    const data = {
      org_memberships: [
        { id: "mem-1", org_id: orgId, user_id: "user-1", role: "ADMIN" },
        { id: "mem-2", org_id: orgId, user_id: memberId, role: "EDITOR" }
      ],
      workspaces: [{ id: workspaceId, org_id: orgId, name: "Primary" }],
      workspace_memberships: [{ id: "wsm-1", workspace_id: workspaceId, user_id: "user-1", role: "ADMIN" }]
    }
    const handlers = createHandlers({
      supabase: new SupabaseStub(data),
      qstash: { url: "", token: "" }
    })

    const addResponse = await handlers.handleRequest(
      buildRequest(`/api/workspaces/${workspaceId}/members`, "POST", { user_id: memberId })
    )
    expect(addResponse.status).toBe(200)

    const listResponse = await handlers.handleRequest(
      buildRequest(`/api/workspaces/${workspaceId}/members`, "GET")
    )
    const listPayload = await listResponse.json()
    expect(listResponse.status).toBe(200)
    expect(listPayload.members.length).toBe(2)

    const roleResponse = await handlers.handleRequest(
      buildRequest(`/api/workspaces/${workspaceId}/members/${memberId}/role`, "POST", {
        role: "REVIEWER"
      })
    )
    const rolePayload = await roleResponse.json()
    expect(roleResponse.status).toBe(200)
    expect(rolePayload.member.role).toBe("REVIEWER")

    const removeResponse = await handlers.handleRequest(
      buildRequest(`/api/workspaces/${workspaceId}/members/${memberId}/remove`, "POST")
    )
    const removePayload = await removeResponse.json()
    expect(removeResponse.status).toBe(200)
    expect(removePayload.ok).toBe(true)
  })

  it("returns org usage summary", async () => {
    const orgId = "88888888-8888-8888-8888-888888888888"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        org_memberships: [{ id: "mem-1", org_id: orgId, user_id: "user-1", role: "ADMIN" }],
        org_limits: [{ id: "lim-1", org_id: orgId, monthly_token_budget: 1000 }],
        token_usage_events: [
          { id: "evt-1", org_id: orgId, tokens_in: 100, tokens_out: 50, created_at: "2026-01-10T00:00:00Z" }
        ]
      }),
      qstash: { url: "", token: "" },
      now: () => new Date("2026-01-15T00:00:00Z")
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/orgs/${orgId}/usage`, "GET")
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.tokens_used).toBe(150)
    expect(payload.budget_remaining).toBe(850)
  })

  it("returns org workspace reports", async () => {
    const orgId = "12121212-1212-1212-1212-121212121212"
    const workspaceA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    const workspaceB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        org_memberships: [{ id: "mem-1", org_id: orgId, user_id: "user-1", role: "ADMIN" }],
        workspaces: [
          { id: workspaceA, org_id: orgId, name: "Primary" },
          { id: workspaceB, org_id: orgId, name: "Client" }
        ],
        questionnaires: [
          { id: "q1", org_id: orgId, workspace_id: workspaceA, status: "COMPLETED", updated_at: "2026-01-10T00:00:00Z" },
          { id: "q2", org_id: orgId, workspace_id: workspaceA, status: "READY_FOR_REVIEW", updated_at: "2026-01-12T00:00:00Z" },
          { id: "q3", org_id: orgId, workspace_id: workspaceB, status: "FAILED", updated_at: "2026-01-11T00:00:00Z" }
        ],
        suggestions: [
          { id: "s1", org_id: orgId, workspace_id: workspaceA, confidence_bucket: "AUTO_FILL" },
          { id: "s2", org_id: orgId, workspace_id: workspaceA, confidence_bucket: "MANUAL" },
          { id: "s3", org_id: orgId, workspace_id: workspaceB, confidence_bucket: "NEEDS_REVIEW" }
        ],
        answers: [
          { id: "a1", org_id: orgId, workspace_id: workspaceA, status: "APPROVED" }
        ]
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest(`/api/orgs/${orgId}/reports`, "GET")
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.workspaces.length).toBe(2)
    const primary = payload.workspaces.find((row: { workspace_id: string }) => row.workspace_id === workspaceA)
    expect(primary.counts.questionnaires_total).toBe(2)
    expect(primary.counts.auto_fill).toBe(1)
    expect(primary.auto_fill_rate).toBe(0.5)
  })

  it("returns trust center overview", async () => {
    const orgId = "99999999-9999-9999-9999-999999999999"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        org_memberships: [{ id: "mem-1", org_id: orgId, user_id: "user-1", role: "ADMIN" }],
        org_features: [{ id: "feat-1", org_id: orgId, trust_center_enabled: true, consultant_mode_enabled: false }],
        workspaces: [{ id: "ws-1", org_id: orgId, name: "Primary" }],
        workspace_memberships: [{ id: "wsm-1", workspace_id: "ws-1", user_id: "user-1", role: "ADMIN" }],
        answers: [
          { id: "ans-1", org_id: orgId, workspace_id: "ws-1", status: "APPROVED", title: "MFA", created_at: "2026-01-01" }
        ],
        evidence: [
          { id: "ev-1", org_id: orgId, workspace_id: "ws-1", title: "Policy", access_level: "shareable", url: "https://example.com", created_at: "2026-01-01" }
        ],
        answer_evidence_links: [{ id: "link-1", org_id: orgId, answer_id: "ans-1", evidence_id: "ev-1" }]
      }),
      qstash: { url: "", token: "" }
    })

    const response = await handlers.handleRequest(
      buildRequest("/api/trust-center/overview?workspace_id=ws-1", "GET")
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.summary.approved_answers).toBe(1)
    expect(payload.summary.evidence_shareable).toBe(1)
  })

  it("creates and revokes trust center shares", async () => {
    const orgId = "abababab-abab-abab-abab-abababababab"
    const workspaceId = "cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        org_memberships: [{ id: "mem-1", org_id: orgId, user_id: "user-1", role: "ADMIN" }],
        org_features: [{ id: "feat-1", org_id: orgId, trust_center_enabled: true, consultant_mode_enabled: false }],
        workspaces: [{ id: workspaceId, org_id: orgId, name: "Primary" }],
        workspace_memberships: [{ id: "wsm-1", workspace_id: workspaceId, user_id: "user-1", role: "ADMIN" }]
      }),
      qstash: { url: "", token: "" },
      now: () => new Date("2026-01-26T00:00:00Z")
    })

    const createResponse = await handlers.handleRequest(
      buildRequest("/api/trust-center/shares", "POST", {
        workspace_id: workspaceId,
        include_answers: true,
        include_evidence: false,
        expires_in_days: 10
      })
    )
    const createPayload = await createResponse.json()
    expect(createResponse.status).toBe(200)
    expect(createPayload.share.include_evidence).toBe(false)

    const listResponse = await handlers.handleRequest(
      buildRequest(`/api/trust-center/shares?workspace_id=${workspaceId}`, "GET")
    )
    const listPayload = await listResponse.json()
    expect(listResponse.status).toBe(200)
    expect(listPayload.shares.length).toBe(1)

    const revokeResponse = await handlers.handleRequest(
      buildRequest(`/api/trust-center/shares/${createPayload.share.id}/revoke`, "POST")
    )
    const revokePayload = await revokeResponse.json()
    expect(revokeResponse.status).toBe(200)
    expect(revokePayload.share.revoked_at).toBeTruthy()
  })

  it("returns public trust center snapshot", async () => {
    const orgId = "edededed-eded-eded-eded-edededededed"
    const workspaceId = "fefefefe-fefe-fefe-fefe-fefefefefefe"
    const handlers = createHandlers({
      supabase: new SupabaseStub({
        org_features: [{ id: "feat-1", org_id: orgId, trust_center_enabled: true, consultant_mode_enabled: false }],
        trust_center_shares: [
          {
            id: "share-1",
            org_id: orgId,
            workspace_id: workspaceId,
            token: "share-token",
            include_answers: true,
            include_evidence: true,
            expires_at: "2099-01-01T00:00:00Z",
            revoked_at: null,
            created_at: "2026-01-26T00:00:00Z",
            created_by: "user-1"
          }
        ],
        answers: [
          { id: "ans-1", org_id: orgId, workspace_id: workspaceId, status: "APPROVED", title: "MFA", created_at: "2026-01-01" }
        ],
        evidence: [
          { id: "ev-1", org_id: orgId, workspace_id: workspaceId, title: "Policy", access_level: "shareable", url: "https://example.com", created_at: "2026-01-01" }
        ],
        answer_evidence_links: [{ id: "link-1", org_id: orgId, answer_id: "ans-1", evidence_id: "ev-1" }]
      }),
      qstash: { url: "", token: "" },
      now: () => new Date("2026-01-26T00:00:00Z")
    })

    const response = await handlers.handleRequest(
      new Request("http://localhost/api/trust-center/public?token=share-token", {
        method: "GET"
      })
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.summary.approved_answers).toBe(1)
    expect(payload.evidence.length).toBe(1)
  })
})
