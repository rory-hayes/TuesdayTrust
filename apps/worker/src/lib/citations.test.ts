import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildChunkLocator, validateGeneratedCitations } from './citations';

test('buildChunkLocator prefers page, then paragraph, then section, then sheet/cell, then chunk index', () => {
  assert.equal(
    buildChunkLocator({
      chunkIndex: 7,
      citationPage: 12,
      citationParagraph: 55,
      citationSection: 'Section A',
      citationSheet: 'Controls',
      citationCell: 'D4'
    }),
    'p.12'
  );

  assert.equal(
    buildChunkLocator({
      chunkIndex: 7,
      citationPage: null,
      citationParagraph: 55,
      citationSection: 'Section A',
      citationSheet: 'Controls',
      citationCell: 'D4'
    }),
    'para 55'
  );

  assert.equal(
    buildChunkLocator({
      chunkIndex: 7,
      citationPage: null,
      citationParagraph: null,
      citationSection: 'Section A',
      citationSheet: 'Controls',
      citationCell: 'D4'
    }),
    'Section A'
  );

  assert.equal(
    buildChunkLocator({
      chunkIndex: 7,
      citationPage: null,
      citationParagraph: null,
      citationSection: null,
      citationSheet: 'Controls',
      citationCell: 'D4'
    }),
    'Controls!D4'
  );

  assert.equal(
    buildChunkLocator({
      chunkIndex: 7,
      citationPage: null,
      citationParagraph: null,
      citationSection: null,
      citationSheet: null,
      citationCell: null
    }),
    'chunk 7'
  );
});

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

test('validateGeneratedCitations trims quotes and applies fallback document metadata', () => {
  const validation = validateGeneratedCitations(
    [
      {
        kbChunkId: 'chunk_1',
        quote: '  explicit control language  '
      },
      {
        kbChunkId: 'chunk_1',
        quote: '   '
      }
    ],
    [
      {
        id: 'chunk_1',
        text: 'The policy includes explicit control language and review cadence.',
        chunkIndex: 3,
        citationDoc: null,
        citationPage: null,
        citationParagraph: null,
        citationSection: null,
        citationSheet: null,
        citationCell: null,
        kbDocumentId: ''
      }
    ]
  );

  assert.equal(validation.valid.length, 1);
  assert.equal(validation.invalidCount, 1);
  assert.deepEqual(validation.valid[0], {
    kbChunkId: 'chunk_1',
    docName: 'KB Document',
    locator: 'chunk 3',
    quote: 'explicit control language'
  });
});
