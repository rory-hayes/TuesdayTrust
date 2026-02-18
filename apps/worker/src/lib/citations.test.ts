import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateGeneratedCitations } from './citations';

test('validateGeneratedCitations keeps only citations with retrieved chunk ids and matching quotes', () => {
  const validation = validateGeneratedCitations(
    [
      {
        kbChunkId: 'chunk_1',
        quote: 'exact quoted control statement'
      },
      {
        kbChunkId: 'chunk_2',
        quote: 'not present in source text'
      },
      {
        kbChunkId: 'chunk_missing',
        quote: 'anything'
      }
    ],
    [
      {
        id: 'chunk_1',
        text: 'This contains exact quoted control statement for evidence.',
        chunkIndex: 7,
        citationDoc: 'SOC2_2025.pdf',
        citationPage: 17,
        citationParagraph: null,
        citationSection: null,
        citationSheet: null,
        citationCell: null,
        kbDocumentId: 'doc_1'
      },
      {
        id: 'chunk_2',
        text: 'This text does not include the requested quote.',
        chunkIndex: 8,
        citationDoc: 'IR Policy.docx',
        citationPage: null,
        citationParagraph: 42,
        citationSection: null,
        citationSheet: null,
        citationCell: null,
        kbDocumentId: 'doc_2'
      }
    ]
  );

  assert.equal(validation.valid.length, 1);
  assert.equal(validation.invalidCount, 2);
  assert.equal(validation.valid[0]?.kbChunkId, 'chunk_1');
  assert.equal(validation.valid[0]?.docName, 'SOC2_2025.pdf');
  assert.equal(validation.valid[0]?.locator, 'p.17');
  assert.equal(validation.valid[0]?.sourceFileId, 'doc_1');
});
