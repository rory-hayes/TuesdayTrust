import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatEvidenceLines, isDuplicateExportVersion, sanitizeExcelCell } from './export-safety';

test('sanitizeExcelCell prefixes dangerous formula-leading values', () => {
  assert.equal(sanitizeExcelCell('=SUM(A1:A3)'), "'=SUM(A1:A3)");
  assert.equal(sanitizeExcelCell('+1+2'), "'+1+2");
  assert.equal(sanitizeExcelCell('-42'), "'-42");
  assert.equal(sanitizeExcelCell('@cmd'), "'@cmd");
});

test('sanitizeExcelCell leaves normal text unchanged', () => {
  assert.equal(sanitizeExcelCell('Policy response text'), 'Policy response text');
  assert.equal(sanitizeExcelCell(''), '');
  assert.equal(sanitizeExcelCell(undefined as unknown as string), '');
});

test('formatEvidenceLines joins document + locator + quote and truncates long quotes', () => {
  const longQuote = 'A'.repeat(250);
  const output = formatEvidenceLines([
    {
      kbChunkId: 'chunk_1',
      docName: 'SOC2_2025.pdf',
      locator: 'p.11',
      quote: 'Encryption controls reviewed quarterly.'
    },
    {
      kbChunkId: 'chunk_2',
      docName: 'ISMS.xlsx',
      locator: 'Sheet1!B4',
      quote: longQuote
    }
  ]);

  const lines = output.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'SOC2_2025.pdf p.11: Encryption controls reviewed quarterly.');
  assert.equal(lines[1]?.startsWith('ISMS.xlsx Sheet1!B4: '), true);
  assert.equal(lines[1]?.endsWith('...'), true);
  assert.equal(lines[1]?.length, 'ISMS.xlsx Sheet1!B4: '.length + 203);
});

test('formatEvidenceLines returns empty string for empty citations', () => {
  assert.equal(formatEvidenceLines([]), '');
});

test('isDuplicateExportVersion detects duplicate export writes', () => {
  assert.equal(isDuplicateExportVersion(4, 4), true);
  assert.equal(isDuplicateExportVersion(3, 4), false);
  assert.equal(isDuplicateExportVersion(null, 4), false);
});
