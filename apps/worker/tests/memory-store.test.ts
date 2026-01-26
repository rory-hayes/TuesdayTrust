import { describe, expect, it } from "vitest"
import { MemoryDataStore } from "../src/datastore/memory"


describe("MemoryDataStore", () => {
  it("returns nulls when records missing", async () => {
    const store = new MemoryDataStore()
    await expect(store.getQuestionnaire("missing")).resolves.toBeNull()
    await expect(store.getQuestionnaireFile("missing", "input")).resolves.toBeNull()
    await expect(store.getJob("missing")).resolves.toBeNull()
    expect(store.getStoredFile("missing")).toBeNull()
  })

  it("handles updates when records missing", async () => {
    const store = new MemoryDataStore()
    await expect(store.updateQuestionnaireStatus("missing", "FAILED")).resolves.toBeUndefined()
    await expect(store.updateQuestionnaireProgress("missing", 1, 2)).resolves.toBeUndefined()
    await expect(store.updateJobStatus("missing", "FAILED")).resolves.toBeUndefined()
  })

  it("reads seeded data", async () => {
    const questionnaire = {
      id: "q1",
      orgId: "org",
      workspaceId: "ws",
      title: "Test",
      source: "Excel upload",
      status: "QUEUED",
      progressTotal: 0,
      progressDone: 0,
      createdBy: "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failedReason: null
    }
    const store = new MemoryDataStore({
      questionnaires: new Map([[questionnaire.id, questionnaire]]),
      storage: new Map([["path", new Uint8Array([1, 2, 3])]])
    })

    const found = await store.getQuestionnaire("q1")
    expect(found?.id).toBe("q1")
    expect(store.getStoredFile("path")).not.toBeNull()

    await store.updateQuestionnaireStatus("q1", "FAILED")
    await store.updateQuestionnaireProgress("q1", 2, 4)
    const updated = await store.getQuestionnaire("q1")
    expect(updated?.status).toBe("FAILED")
    expect(updated?.progressDone).toBe(2)
  })

  it("stores export files without expires_at", async () => {
    const store = new MemoryDataStore()
    const exportFile = await store.createExportFile({
      orgId: "org",
      questionnaireId: "q1",
      content: new Uint8Array([1, 2, 3]),
      storageBucket: "exports",
      storagePath: "org/org/q1/export.xlsx",
      fileName: "export.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 3,
      checksumSha256: "checksum"
    })

    expect(exportFile.expiresAt).toBeNull()
  })
})
