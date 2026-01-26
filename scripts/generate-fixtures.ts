import * as XLSX from "xlsx"
import { Document, Packer, Paragraph } from "docx"
import PDFDocument from "pdfkit"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const questionnairesDir = join(process.cwd(), "fixtures", "questionnaires")
mkdirSync(questionnairesDir, { recursive: true })

async function generateFixtures() {
  const simpleWorkbook = XLSX.utils.book_new()
  const simpleSheet = XLSX.utils.aoa_to_sheet([
    ["Question"],
    ["Do you enforce MFA for admin access?"],
    ["Describe your incident response process."],
    ["Do you encrypt data at rest?"]
  ])
  XLSX.utils.book_append_sheet(simpleWorkbook, simpleSheet, "Sheet1")
  const simpleBuffer = XLSX.write(simpleWorkbook, { type: "buffer", bookType: "xlsx" })
  writeFileSync(join(questionnairesDir, "simple.xlsx"), simpleBuffer)

  const complexWorkbook = XLSX.utils.book_new()
  const sheetA = XLSX.utils.aoa_to_sheet([
    ["Section", "Question"],
    ["Access", "Do you enforce MFA for admin access?"],
    ["Access", "Describe access review cadence."],
    ["Data", "Do you encrypt data at rest?"]
  ])
  const sheetB = XLSX.utils.aoa_to_sheet([
    ["Question"],
    ["Describe your incident response process."],
    ["What is your RTO for critical services?"]
  ])
  XLSX.utils.book_append_sheet(complexWorkbook, sheetA, "Security Controls")
  XLSX.utils.book_append_sheet(complexWorkbook, sheetB, "Operations")
  const complexBuffer = XLSX.write(complexWorkbook, { type: "buffer", bookType: "xlsx" })
  writeFileSync(join(questionnairesDir, "complex.xlsx"), complexBuffer)

  const docxDocument = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Do you enforce MFA for admin access?" }),
          new Paragraph({ text: "Describe your incident response process." }),
          new Paragraph({ text: "Do you encrypt data at rest?" })
        ]
      }
    ]
  })
  const docxBuffer = await Packer.toBuffer(docxDocument)
  writeFileSync(join(questionnairesDir, "simple.docx"), docxBuffer)

  await new Promise<void>((resolve, reject) => {
    const pdf = new PDFDocument()
    const chunks: Uint8Array[] = []

    pdf.on("data", (chunk: Uint8Array) => chunks.push(chunk))
    pdf.on("end", () => {
      const output = Buffer.concat(chunks)
      writeFileSync(join(questionnairesDir, "simple.pdf"), output)
      resolve()
    })
    pdf.on("error", (error) => reject(error))

    pdf.text("Do you enforce MFA for admin access?")
    pdf.moveDown()
    pdf.text("Describe your incident response process.")
    pdf.moveDown()
    pdf.text("Do you encrypt data at rest?")
    pdf.end()
  })

  console.log("Fixtures generated")
}

generateFixtures().catch((error) => {
  console.error(error)
  process.exit(1)
})
