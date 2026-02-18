import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isDuplicateExportVersion, sanitizeExcelCell } from './export-safety';

test('sanitizeExcelCell prefixes dangerous formula-leading values', () => {
  assert.equal(sanitizeExcelCell('=SUM(A1:A3)'), "'=SUM(A1:A3)");
  assert.equal(sanitizeExcelCell('+1+2'), "'+1+2");
  assert.equal(sanitizeExcelCell('-42'), "'-42");
  assert.equal(sanitizeExcelCell('@cmd'), "'@cmd");
});

test('sanitizeExcelCell leaves normal text unchanged', () => {
  assert.equal(sanitizeExcelCell('Policy response text'), 'Policy response text');
  assert.equal(sanitizeExcelCell(''), '');
});

test('isDuplicateExportVersion detects duplicate export writes', () => {
  assert.equal(isDuplicateExportVersion(4, 4), true);
  assert.equal(isDuplicateExportVersion(3, 4), false);
  assert.equal(isDuplicateExportVersion(null, 4), false);
});
