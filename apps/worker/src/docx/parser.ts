import * as mammoth from "mammoth"
import { normalizeText, detectResponseType } from "../processors/normalize"
import type { ParsedQuestion, ParsedWorkbook } from "../questions/types"

export async function parseQuestionsFromDocx(
  buffer: Uint8Array
): Promise<ParsedWorkbook> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
  const lines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const questions: ParsedQuestion[] = lines.map((rawPrompt, index) => {
    const prompt = normalizeText(rawPrompt)
    return {
      index,
      section: "Document",
    prompt,
      rawPrompt,
    responseType: detectResponseType(prompt),
      sourceRef: { paragraph: index }
    }
  })

  return { questions, totalQuestions: questions.length, sheets: ["Document"] }
}
