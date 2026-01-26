import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { normalizeText, detectResponseType } from "../processors/normalize"
import type { ParsedQuestion, ParsedWorkbook } from "../questions/types"

export async function parseQuestionsFromPdf(
  buffer: Uint8Array
): Promise<ParsedWorkbook> {
  const document = await getDocument({ data: buffer }).promise
  const questions: ParsedQuestion[] = []
  let index = 0

  const pages = document.numPages
  for (let pageIndex = 1; pageIndex <= pages; pageIndex += 1) {
    const page = await document.getPage(pageIndex)
    const content = await page.getTextContent()
    const textItems = (content.items as Array<{ str: string }>).map((item) => item.str)
    const lines = textItems
      .join("\n")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)

    for (const rawPrompt of lines) {
      const prompt = normalizeText(rawPrompt)
      questions.push({
        index,
        section: `Page ${pageIndex}`,
        prompt,
        rawPrompt,
        responseType: detectResponseType(prompt),
        sourceRef: { page: pageIndex }
      })
      index += 1
    }
  }

  return {
    questions,
    totalQuestions: questions.length,
    sheets: Array.from({ length: pages }, (_, i) => `Page ${i + 1}`)
  }
}
