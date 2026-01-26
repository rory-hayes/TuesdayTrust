import PDFDocument from "pdfkit"

export interface WorkspaceReportRow {
  workspaceId: string
  name: string
  counts: {
    questionnaires_total: number
    questionnaires_completed: number
    questionnaires_in_review: number
    questionnaires_failed: number
    suggestions_total: number
    auto_fill: number
    needs_review: number
    manual: number
    approved_answers: number
  }
  auto_fill_rate: number
  time_saved_hours: number
  last_activity_at: string | null
}

export function buildReportCsv(rows: WorkspaceReportRow[]): Uint8Array {
  const header = [
    "Workspace",
    "Questionnaires total",
    "Completed",
    "In review",
    "Failed",
    "Suggestions total",
    "Auto fill",
    "Needs review",
    "Manual",
    "Approved answers",
    "Auto-fill rate",
    "Time saved (hours)",
    "Last activity"
  ]

  const lines = [header.join(",")]
  for (const row of rows) {
    const values = [
      row.name,
      row.counts.questionnaires_total,
      row.counts.questionnaires_completed,
      row.counts.questionnaires_in_review,
      row.counts.questionnaires_failed,
      row.counts.suggestions_total,
      row.counts.auto_fill,
      row.counts.needs_review,
      row.counts.manual,
      row.counts.approved_answers,
      row.auto_fill_rate,
      row.time_saved_hours,
      row.last_activity_at ?? ""
    ]
    lines.push(values.map((value) => escapeCsvValue(value)).join(","))
  }

  return new TextEncoder().encode(lines.join("\n"))
}

export async function buildReportPdf(rows: WorkspaceReportRow[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 })
    const chunks: Uint8Array[] = []

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk))
    doc.on("end", () => {
      const output = Buffer.concat(chunks)
      resolve(new Uint8Array(output))
    })
    doc.on("error", (error) => reject(error))

    doc.font("Helvetica-Bold").fontSize(16).text("Client Reports Summary")
    doc.moveDown()

    rows.forEach((row, index) => {
      doc.font("Helvetica-Bold").fontSize(12).text(row.name)
      doc.font("Helvetica").fontSize(10).text(
        `Questionnaires: ${row.counts.questionnaires_completed}/${row.counts.questionnaires_total} completed, ` +
          `${row.counts.questionnaires_in_review} in review, ${row.counts.questionnaires_failed} failed`
      )
      doc.text(
        `Suggestions: ${row.counts.suggestions_total} total, ` +
          `${row.counts.auto_fill} auto-fill, ${row.counts.needs_review} needs review, ${row.counts.manual} manual`
      )
      doc.text(`Approved answers: ${row.counts.approved_answers}`)
      doc.text(
        `Auto-fill rate: ${(row.auto_fill_rate * 100).toFixed(0)}% · Time saved: ${row.time_saved_hours}h`
      )
      doc.text(`Last activity: ${row.last_activity_at ?? "—"}`)
      if (index < rows.length - 1) {
        doc.moveDown()
      }
    })

    doc.end()
  })
}

function escapeCsvValue(value: string | number | null) {
  const stringValue = String(value ?? "")
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}
