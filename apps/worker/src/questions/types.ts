export interface ParsedQuestion {
  index: number
  section: string | null
  prompt: string
  rawPrompt: string
  responseType: string
  sourceRef: { sheet?: string; row?: number; col?: number; paragraph?: number; page?: number }
}

export interface ParsedWorkbook {
  questions: ParsedQuestion[]
  totalQuestions: number
  sheets: string[]
}
