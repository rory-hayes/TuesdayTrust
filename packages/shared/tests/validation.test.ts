import { describe, expect, it } from "vitest"
import { validateCreateQuestionnaireInput } from "../src/validation"

describe("validateCreateQuestionnaireInput", () => {
  it("rejects invalid payload", () => {
    const result = validateCreateQuestionnaireInput(null)
    expect(result.valid).toBe(false)
  })

  it("requires required fields", () => {
    const result = validateCreateQuestionnaireInput({})
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("requires file metadata fields", () => {
    const result = validateCreateQuestionnaireInput({
      workspace_id: "workspace-1",
      title: "Acme",
      input_file: {
        bucket: "",
        path: "",
        file_name: "",
        mime_type: "",
        size_bytes: 0,
        checksum_sha256: ""
      }
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("input_file.bucket is required")
    expect(result.errors).toContain("input_file.size_bytes must be a positive number")
  })

  it("accepts valid payload", () => {
    const result = validateCreateQuestionnaireInput({
      questionnaire_id: "questionnaire-1",
      workspace_id: "workspace-1",
      title: "Acme",
      input_file: {
        bucket: "uploads",
        path: "org/123/input.xlsx",
        file_name: "input.xlsx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes: 123,
        checksum_sha256: "abc123"
      }
    })

    expect(result.valid).toBe(true)
  })

  it("accepts DOCX payload", () => {
    const result = validateCreateQuestionnaireInput({
      questionnaire_id: "questionnaire-2",
      workspace_id: "workspace-1",
      title: "Docx Questionnaire",
      input_file: {
        bucket: "uploads",
        path: "org/123/input.docx",
        file_name: "input.docx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size_bytes: 123,
        checksum_sha256: "abc123"
      }
    })

    expect(result.valid).toBe(true)
  })

  it("accepts PDF payload", () => {
    const result = validateCreateQuestionnaireInput({
      questionnaire_id: "questionnaire-3",
      workspace_id: "workspace-1",
      title: "PDF Questionnaire",
      input_file: {
        bucket: "uploads",
        path: "org/123/input.pdf",
        file_name: "input.pdf",
        mime_type: "application/pdf",
        size_bytes: 123,
        checksum_sha256: "abc123"
      }
    })

    expect(result.valid).toBe(true)
  })

  it("rejects unsupported mime types", () => {
    const result = validateCreateQuestionnaireInput({
      workspace_id: "workspace-1",
      title: "Acme",
      input_file: {
        bucket: "uploads",
        path: "org/123/input.txt",
        file_name: "input.txt",
        mime_type: "text/plain",
        size_bytes: 123,
        checksum_sha256: "abc123"
      }
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("input_file.mime_type must be XLSX, DOCX, or PDF")
  })

  it("rejects invalid questionnaire_id", () => {
    const result = validateCreateQuestionnaireInput({
      questionnaire_id: "",
      workspace_id: "workspace-1",
      title: "Acme",
      input_file: {
        bucket: "uploads",
        path: "org/123/input.xlsx",
        file_name: "input.xlsx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes: 123,
        checksum_sha256: "abc123"
      }
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("questionnaire_id must be a non-empty string")
  })

  it("rejects oversized payload", () => {
    const result = validateCreateQuestionnaireInput({
      workspace_id: "workspace-1",
      title: "Acme",
      input_file: {
        bucket: "uploads",
        path: "org/123/input.xlsx",
        file_name: "input.xlsx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes: 1024 * 1024 * 20,
        checksum_sha256: "abc123"
      }
    })

    expect(result.valid).toBe(false)
  })
})
