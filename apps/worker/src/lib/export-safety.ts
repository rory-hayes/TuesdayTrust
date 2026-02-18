import type { CitationRecord } from './citations';

const DANGEROUS_EXCEL_PREFIXES = new Set(['=', '+', '-', '@']);

export function sanitizeExcelCell(input: string): string {
  const value = input ?? '';

  if (!value) {
    return value;
  }

  const firstChar = value.charAt(0);

  if (DANGEROUS_EXCEL_PREFIXES.has(firstChar)) {
    return `'${value}`;
  }

  return value;
}

export function formatEvidenceLines(citations: CitationRecord[]): string {
  if (citations.length === 0) {
    return '';
  }

  return citations
    .map((citation) => {
      const quote = citation.quote.length > 200 ? `${citation.quote.slice(0, 200)}...` : citation.quote;
      return `${citation.docName} ${citation.locator}: ${quote}`;
    })
    .join('\n');
}

export function isDuplicateExportVersion(
  existingExportVersion: number | null | undefined,
  requestedExportVersion: number
): boolean {
  return existingExportVersion === requestedExportVersion;
}
