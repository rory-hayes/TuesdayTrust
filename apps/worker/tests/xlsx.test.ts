import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { parseQuestionsFromXlsx } from "../src/xlsx/parser"
import { applySuggestionsToWorkbook } from "../src/xlsx/exporter"

function buildWorkbookBuffer() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Question"],
    ["Do you encrypt data at rest?"],
    ["Describe access controls."]
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1")
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return new Uint8Array(buffer)
}

describe("xlsx parser and exporter", () => {
  it("parses questions from workbook", () => {
    const buffer = buildWorkbookBuffer()
    const parsed = parseQuestionsFromXlsx(buffer)
    expect(parsed.totalQuestions).toBe(3)
    expect(parsed.questions[1]?.prompt).toContain("encrypt")
  })

  it("skips empty and null cells", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Question"],
      [""],
      [null],
      [],
      ["Valid prompt"]
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1")
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
    const parsed = parseQuestionsFromXlsx(new Uint8Array(buffer))
    expect(parsed.questions.some((q) => q.prompt === "Valid prompt")).toBe(true)
  })

  it("handles missing sheets", () => {
    const workbook = XLSX.utils.book_new()
    workbook.SheetNames.push("MissingSheet")
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
    const parsed = parseQuestionsFromXlsx(new Uint8Array(buffer))
    expect(parsed.totalQuestions).toBe(0)
  })

  it("applies suggestions to workbook", () => {
    const buffer = buildWorkbookBuffer()
    const output = applySuggestionsToWorkbook(buffer, [
      {
        questionIndex: 0,
        answerText: "We encrypt data at rest.",
        sourceRef: { sheet: "Sheet1", row: 1, col: 0 }
      }
    ])

    const workbook = XLSX.read(output, { type: "buffer" })
    const sheet = workbook.Sheets["Sheet1"]
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1")
    expect(range.e.c).toBeGreaterThan(0)
  })

  it("adds multiple suggestions to the same sheet", () => {
    const buffer = buildWorkbookBuffer()
    const output = applySuggestionsToWorkbook(buffer, [
      {
        questionIndex: 0,
        answerText: "We encrypt data at rest.",
        sourceRef: { sheet: "Sheet1", row: 1, col: 0 }
      },
      {
        questionIndex: 1,
        answerText: "Access is restricted by role.",
        sourceRef: { sheet: "Sheet1", row: 2, col: 0 }
      }
    ])

    const workbook = XLSX.read(output, { type: "buffer" })
    const sheet = workbook.Sheets["Sheet1"]
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1")
    expect(range.e.c).toBeGreaterThan(0)
  })

  it("handles empty sheets and missing refs", () => {
    const workbook = XLSX.utils.book_new()
    const emptySheet = XLSX.utils.aoa_to_sheet([])
    delete emptySheet["!ref"]
    workbook.SheetNames.push("EmptySheet")
    workbook.Sheets["EmptySheet"] = emptySheet
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
    const output = applySuggestionsToWorkbook(new Uint8Array(buffer), [])
    expect(output.byteLength).toBeGreaterThan(0)
  })

  it("skips missing sheets during export", () => {
    const workbook = XLSX.utils.book_new()
    workbook.SheetNames.push("MissingSheet")
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
    const output = applySuggestionsToWorkbook(new Uint8Array(buffer), [])
    expect(output.byteLength).toBeGreaterThan(0)
  })
})
