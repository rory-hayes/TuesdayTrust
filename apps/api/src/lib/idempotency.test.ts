import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildExportIdempotencyKey, isActiveJobStatus } from './idempotency';

test('buildExportIdempotencyKey is deterministic for same inputs', () => {
  const first = buildExportIdempotencyKey('project_1', 3, 'kb_hash_1');
  const second = buildExportIdempotencyKey('project_1', 3, 'kb_hash_1');

  assert.equal(first, second);
  assert.equal(first, 'export-xlsx:project_1:v3:kb_hash_1');
});

test('isActiveJobStatus only returns true for queued/running', () => {
  assert.equal(isActiveJobStatus('QUEUED'), true);
  assert.equal(isActiveJobStatus('RUNNING'), true);
  assert.equal(isActiveJobStatus('SUCCEEDED'), false);
  assert.equal(isActiveJobStatus('FAILED'), false);
  assert.equal(isActiveJobStatus(null), false);
});
