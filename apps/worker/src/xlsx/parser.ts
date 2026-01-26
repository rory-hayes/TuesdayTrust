import * as XLSX from "xlsx"
import { normalizeText, detectResponseType } from "../processors/normalize"
import type { ParsedQuestion, ParsedWorkbook } from "../questions/types"

export function parseQuestionsFromXlsx(buffer: Uint8Array): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const questions: ParsedQuestion[] = []
  let index = 0

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as Array<
      Array<string | number | boolean | null>
    >

    rows.forEach((row, rowIndex) => {
      const cell = row?.[0]
      if (cell === null || cell === undefined) return
      const rawPrompt = String(cell).trim()
      if (!rawPrompt) return

      const prompt = normalizeText(rawPrompt)
      questions.push({
        index,
        section: sheetName,
        prompt,
        rawPrompt,
        responseType: detectResponseType(prompt),
        sourceRef: { sheet: sheetName, row: rowIndex, col: 0 }
      })
      index += 1
    })
  }

  return { questions, totalQuestions: questions.length, sheets: workbook.SheetNames }
}
