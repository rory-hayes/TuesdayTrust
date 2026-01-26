import { Document, Packer, Paragraph, TextRun } from "docx"

export interface DocxExportEntry {
  questionText: string
  answerText: string
}

export async function applySuggestionsToDocx(
  entries: DocxExportEntry[]
): Promise<Uint8Array> {
  const paragraphs: Paragraph[] = []

  entries.forEach((entry, index) => {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Question: ", bold: true }),
          new TextRun({ text: entry.questionText })
        ]
      })
    )
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Answer: ", bold: true }),
          new TextRun({ text: entry.answerText })
        ]
      })
    )
    if (index < entries.length - 1) {
      paragraphs.push(new Paragraph(""))
    }
  })

  const document = new Document({
    sections: [{ children: paragraphs }]
  })

  const output = await Packer.toBuffer(document)
  return new Uint8Array(output)
}
