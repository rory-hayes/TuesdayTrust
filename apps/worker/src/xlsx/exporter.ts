import * as XLSX from "xlsx"

export interface ExportSuggestion {
  questionIndex: number
  answerText: string
  sourceRef: { sheet: string; row: number; col: number }
}

const SUGGESTED_HEADER = "TuesdayTrust Suggested Answer"

export function applySuggestionsToWorkbook(
  buffer: Uint8Array,
  suggestions: ExportSuggestion[]
) {
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const suggestionsBySheet = new Map<string, ExportSuggestion[]>()

  for (const suggestion of suggestions) {
    const group = suggestionsBySheet.get(suggestion.sourceRef.sheet) ?? []
    group.push(suggestion)
    suggestionsBySheet.set(suggestion.sourceRef.sheet, group)
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    if (!sheet["!ref"]) {
      sheet["!ref"] = "A1"
    }
    const range = XLSX.utils.decode_range(sheet["!ref"])
    const targetCol = range.e.c + 1

    XLSX.utils.sheet_add_aoa(sheet, [[SUGGESTED_HEADER]], {
      origin: { r: 0, c: targetCol }
    })

    const sheetSuggestions = suggestionsBySheet.get(sheetName) ?? []
    for (const suggestion of sheetSuggestions) {
      XLSX.utils.sheet_add_aoa(sheet, [[suggestion.answerText]], {
        origin: { r: suggestion.sourceRef.row, c: targetCol }
      })
    }

    const newRange = XLSX.utils.decode_range(sheet["!ref"])
    newRange.e.c = Math.max(newRange.e.c, targetCol)
    sheet["!ref"] = XLSX.utils.encode_range(newRange)
  }

  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return new Uint8Array(output)
}
