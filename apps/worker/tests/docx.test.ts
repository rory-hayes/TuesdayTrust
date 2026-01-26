import { describe, expect, it } from "vitest"
import { Document, Packer, Paragraph } from "docx"
import * as mammoth from "mammoth"
import { parseQuestionsFromDocx } from "../src/docx/parser"
import { applySuggestionsToDocx } from "../src/docx/exporter"

async function buildDocxBuffer() {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Do you enforce MFA for admin access?" }),
          new Paragraph({ text: "Describe your incident response process." })
        ]
      }
    ]
  })
  const buffer = await Packer.toBuffer(document)
  return new Uint8Array(buffer)
}

describe("docx parser and exporter", () => {
  it("extracts questions from DOCX paragraphs", async () => {
    const buffer = await buildDocxBuffer()
    const parsed = await parseQuestionsFromDocx(buffer)

    expect(parsed.totalQuestions).toBe(2)
    expect(parsed.questions[0]?.rawPrompt).toBe("Do you enforce MFA for admin access?")
  })

  it("writes DOCX output with Q/A format", async () => {
    const output = await applySuggestionsToDocx([
      {
        questionText: "Do you enforce MFA for admin access?",
        answerText: "We enforce MFA for all administrator access."
      }
    ])

    const extracted = await mammoth.extractRawText({ buffer: Buffer.from(output) })
    expect(extracted.value).toContain("Question: Do you enforce MFA for admin access?")
    expect(extracted.value).toContain("Answer: We enforce MFA for all administrator access.")
  })
})
