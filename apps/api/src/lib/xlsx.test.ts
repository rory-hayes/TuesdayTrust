import assert from 'node:assert/strict';
import { test } from 'node:test';

import { utils, write } from 'xlsx';

import { parseQuestionsFromWorkbook, parseWorkbookPreview } from './xlsx';

function workbookToBuffer(
  sheets: Array<{
    name: string;
    rows: unknown[][];
  }>
): Buffer {
  const workbook = utils.book_new();

  for (const sheet of sheets) {
    utils.book_append_sheet(workbook, utils.aoa_to_sheet(sheet.rows), sheet.name);
  }

  return write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test('parseWorkbookPreview returns first sheet by default and coerces values to strings', () => {
  const input = workbookToBuffer([
    {
      name: 'Controls',
      rows: [
        ['Question', 'Answer', 'Confidence'],
        ['Encryption at rest?', 'Yes', 0.99],
        ['MFA enabled?', true, 1]
      ]
    },
    {
      name: 'Appendix',
      rows: [['Doc', 'Location']]
    }
  ]);

  const preview = parseWorkbookPreview(input, undefined, 2);

  assert.deepEqual(preview.sheetNames, ['Controls', 'Appendix']);
  assert.equal(preview.selectedSheetName, 'Controls');
  assert.deepEqual(preview.previewRows, [
    ['Question', 'Answer', 'Confidence'],
    ['Encryption at rest?', 'Yes', '0.99']
  ]);
});

test('parseWorkbookPreview honors valid sheet selection and falls back when missing', () => {
  const input = workbookToBuffer([
    {
      name: 'Primary',
      rows: [['Q1']]
    },
    {
      name: 'Secondary',
      rows: [['Q2']]
    }
  ]);

  const selected = parseWorkbookPreview(input, 'Secondary', 5);
  assert.equal(selected.selectedSheetName, 'Secondary');
  assert.deepEqual(selected.previewRows, [['Q2']]);

  const fallback = parseWorkbookPreview(input, 'MissingSheet', 5);
  assert.equal(fallback.selectedSheetName, 'Primary');
  assert.deepEqual(fallback.previewRows, [['Q1']]);
});

test('parseQuestionsFromWorkbook extracts rows and cell references', () => {
  const input = workbookToBuffer([
    {
      name: 'Questionnaire',
      rows: [
        ['Question', 'Answer', 'Evidence'],
        ['Describe encryption controls', '', ''],
        ['', '', ''],
        ['Describe MFA controls', '', '']
      ]
    }
  ]);

  const questions = parseQuestionsFromWorkbook(input, {
    sheetName: 'Questionnaire',
    headerRowIndex: 1,
    questionCol: 'A',
    answerCol: 'B',
    evidenceCol: 'C'
  });

  assert.deepEqual(questions, [
    {
      rowIndex: 2,
      questionText: 'Describe encryption controls',
      answerCellRef: 'B2',
      evidenceCellRef: 'C2'
    },
    {
      rowIndex: 4,
      questionText: 'Describe MFA controls',
      answerCellRef: 'B4',
      evidenceCellRef: 'C4'
    }
  ]);
});

test('parseQuestionsFromWorkbook clamps header row index to at least 1', () => {
  const input = workbookToBuffer([
    {
      name: 'Sheet1',
      rows: [
        ['Question', 'Answer', 'Evidence'],
        ['Is backup tested quarterly?', '', '']
      ]
    }
  ]);

  const questions = parseQuestionsFromWorkbook(input, {
    sheetName: 'Sheet1',
    headerRowIndex: 0,
    questionCol: 'A',
    answerCol: 'B',
    evidenceCol: 'C'
  });

  assert.equal(questions.length, 1);
  assert.equal(questions[0]?.rowIndex, 2);
});

test('parseQuestionsFromWorkbook validates sheet and column labels', () => {
  const input = workbookToBuffer([
    {
      name: 'Sheet1',
      rows: [['Question', 'Answer', 'Evidence']]
    }
  ]);

  assert.throws(
    () =>
      parseQuestionsFromWorkbook(input, {
        sheetName: 'Missing',
        headerRowIndex: 1,
        questionCol: 'A',
        answerCol: 'B',
        evidenceCol: 'C'
      }),
    /Sheet not found: Missing/
  );

  assert.throws(
    () =>
      parseQuestionsFromWorkbook(input, {
        sheetName: 'Sheet1',
        headerRowIndex: 1,
        questionCol: 'A',
        answerCol: '1',
        evidenceCol: 'C'
      }),
    /Invalid column label: 1/
  );
});
