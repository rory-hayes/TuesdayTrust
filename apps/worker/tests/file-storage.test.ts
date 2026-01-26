import { describe, expect, it } from "vitest"
import { MemoryFileStorage } from "../src/storage/memory"


describe("MemoryFileStorage", () => {
  it("throws when file is missing", async () => {
    const storage = new MemoryFileStorage(() => null)
    await expect(storage.download("uploads", "missing"))
      .rejects
      .toThrow("file not found")
  })
})
