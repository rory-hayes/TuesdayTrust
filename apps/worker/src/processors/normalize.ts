import { ResponseType } from "@tuesdaytrust/shared"

export function normalizeText(input: string) {
  return input.replace(/\s+/g, " ").trim()
}

export function detectResponseType(prompt: string) {
  const lowered = prompt.toLowerCase()
  if (/(yes|no)\b/.test(lowered) && /(\?|yes\/no)/.test(lowered)) {
    return ResponseType.YESNO
  }
  if (/\bhow many\b|\bnumber of\b/.test(lowered)) {
    return ResponseType.NUMERIC
  }
  if (/\bdate\b|\bwhen\b/.test(lowered)) {
    return ResponseType.DATE
  }
  return ResponseType.FREE_TEXT
}
