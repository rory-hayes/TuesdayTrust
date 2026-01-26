import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from "./limits"

export interface UploadFileInput {
  bucket: string
  path: string
  file_name: string
  mime_type: string
  size_bytes: number
  checksum_sha256: string
}

export interface CreateQuestionnaireInput {
  questionnaire_id?: string
  workspace_id: string
  title: string
  input_file: UploadFileInput
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
}

export function validateCreateQuestionnaireInput(
  payload: unknown
): ValidationResult {
  const errors: string[] = []
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["payload must be an object"] }
  }

  const input = payload as Partial<CreateQuestionnaireInput>

  if (
    input.questionnaire_id !== undefined &&
    !isNonEmptyString(input.questionnaire_id)
  ) {
    errors.push("questionnaire_id must be a non-empty string")
  }

  if (!isNonEmptyString(input.workspace_id)) {
    errors.push("workspace_id is required")
  }

  if (!isNonEmptyString(input.title)) {
    errors.push("title is required")
  }

  if (!input.input_file || typeof input.input_file !== "object") {
    errors.push("input_file is required")
    return { valid: errors.length === 0, errors }
  }

  const file = input.input_file as Partial<UploadFileInput>
  if (!isNonEmptyString(file.bucket)) errors.push("input_file.bucket is required")
  if (!isNonEmptyString(file.path)) errors.push("input_file.path is required")
  if (!isNonEmptyString(file.file_name))
    errors.push("input_file.file_name is required")
  if (!isNonEmptyString(file.mime_type))
    errors.push("input_file.mime_type is required")
  if (isNonEmptyString(file.mime_type) && !ALLOWED_UPLOAD_MIME_TYPES.includes(file.mime_type)) {
    errors.push("input_file.mime_type must be XLSX, DOCX, or PDF")
  }
  if (typeof file.size_bytes !== "number" || file.size_bytes <= 0)
    errors.push("input_file.size_bytes must be a positive number")
  if (typeof file.size_bytes === "number" && file.size_bytes > MAX_UPLOAD_BYTES) {
    errors.push("input_file.size_bytes exceeds max file size")
  }
  if (!isNonEmptyString(file.checksum_sha256))
    errors.push("input_file.checksum_sha256 is required")

  return { valid: errors.length === 0, errors }
}
