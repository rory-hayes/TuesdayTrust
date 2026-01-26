import { describe, expect, it } from "vitest"
import PDFDocument from "pdfkit"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { parseQuestionsFromPdf } from "../src/pdf/parser"
import { applySuggestionsToPdf } from "../src/pdf/exporter"

function buildPdfBuffer() {
  return new Promise<Uint8Array>((resolve, reject) => {
    const doc = new PDFDocument()
    const chunks: Uint8Array[] = []

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk))
    doc.on("end", () => {
      const output = Buffer.concat(chunks)
      resolve(new Uint8Array(output))
    })
    doc.on("error", (error) => reject(error))

    doc.text("Do you enforce MFA for admin access?")
    doc.moveDown()
    doc.text("Describe your incident response process.")
    doc.end()
  })
}

describe("pdf parser and exporter", () => {
  it("extracts questions from PDF content", async () => {
    const buffer = await buildPdfBuffer()
    const parsed = await parseQuestionsFromPdf(buffer)

    expect(parsed.totalQuestions).toBeGreaterThan(0)
    expect(parsed.questions[0]?.rawPrompt).toContain("MFA")
  })

  it("writes PDF output with Q/A format", async () => {
    const output = await applySuggestionsToPdf([
      {
        questionText: "Do you enforce MFA for admin access?",
        answerText: "We enforce MFA for all administrator access."
      }
    ])

    const document = await getDocument({ data: output }).promise
    const page = await document.getPage(1)
    const content = await page.getTextContent()
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ")

    expect(text).toContain("Question:")
    expect(text).toContain("Answer:")
  })
})
