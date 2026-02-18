import { read, utils } from 'xlsx';

export type MappingPayload = {
  sheetName: string;
  headerRowIndex: number;
  questionCol: string;
  answerCol: string;
  evidenceCol: string;
};

export type ParsedQuestion = {
  rowIndex: number;
  questionText: string;
  answerCellRef: string;
  evidenceCellRef: string;
};

export type ProjectPreview = {
  sheetNames: string[];
  selectedSheetName: string;
  previewRows: string[][];
};

export function parseWorkbookPreview(
  input: Buffer,
  sheetName?: string,
  rowLimit = 10
): ProjectPreview {
  const workbook = read(input, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    throw new Error('Workbook has no sheets');
  }

  const selectedSheetName = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];

  if (!selectedSheetName) {
    throw new Error('Unable to determine selected sheet');
  }

  const worksheet = workbook.Sheets[selectedSheetName];

  if (!worksheet) {
    throw new Error(`Sheet not found: ${selectedSheetName}`);
  }

  const rows = utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false
  }) as unknown[][];

  const previewRows = rows.slice(0, rowLimit).map((row) => row.map((cell) => String(cell ?? '')));

  return {
    sheetNames,
    selectedSheetName,
    previewRows
  };
}

function normalizeColumn(column: string): number {
  const label = column.trim().toUpperCase();

  if (!/^[A-Z]+$/.test(label)) {
    throw new Error(`Invalid column label: ${column}`);
  }

  let index = 0;

  for (const char of label) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }

  return index - 1;
}

export function parseQuestionsFromWorkbook(input: Buffer, mapping: MappingPayload): ParsedQuestion[] {
  const workbook = read(input, { type: 'buffer' });
  const worksheet = workbook.Sheets[mapping.sheetName];

  if (!worksheet) {
    throw new Error(`Sheet not found: ${mapping.sheetName}`);
  }

  const rows = utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false
  }) as unknown[][];

  const questionColIndex = normalizeColumn(mapping.questionCol);
  const answerColIndex = normalizeColumn(mapping.answerCol);
  const evidenceColIndex = normalizeColumn(mapping.evidenceCol);
  const headerIndex = Math.max(1, mapping.headerRowIndex);

  const results: ParsedQuestion[] = [];

  for (let rowCursor = headerIndex; rowCursor < rows.length; rowCursor += 1) {
    const row = rows[rowCursor] ?? [];
    const questionText = String(row[questionColIndex] ?? '').trim();

    if (!questionText) {
      continue;
    }

    results.push({
      rowIndex: rowCursor + 1,
      questionText,
      answerCellRef: utils.encode_cell({ c: answerColIndex, r: rowCursor }),
      evidenceCellRef: utils.encode_cell({ c: evidenceColIndex, r: rowCursor })
    });
  }

  return results;
}
