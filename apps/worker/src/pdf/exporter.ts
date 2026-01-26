import PDFDocument from "pdfkit"

export interface PdfExportEntry {
  questionText: string
  answerText: string
}

export async function applySuggestionsToPdf(
  entries: PdfExportEntry[]
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 })
    const chunks: Uint8Array[] = []

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk))
    doc.on("end", () => {
      const output = Buffer.concat(chunks)
      resolve(new Uint8Array(output))
    })
    doc.on("error", (error) => reject(error))

    entries.forEach((entry, index) => {
      doc.font("Helvetica-Bold").text("Question:")
      doc.font("Helvetica").text(entry.questionText)
      doc.moveDown(0.5)
      doc.font("Helvetica-Bold").text("Answer:")
      doc.font("Helvetica").text(entry.answerText)
      if (index < entries.length - 1) {
        doc.moveDown()
      }
    })

    doc.end()
  })
}
