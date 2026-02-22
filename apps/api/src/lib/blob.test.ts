import assert from 'node:assert/strict';
import { test } from 'node:test';

import { blobUrlToPathname } from './blob';

test('blobUrlToPathname extracts hostname + pathname for valid URLs', () => {
  const result = blobUrlToPathname('https://public.blob.vercel-storage.com/docs/evidence.pdf');
  assert.equal(result, 'public.blob.vercel-storage.com/docs/evidence.pdf');
});

test('blobUrlToPathname returns the original value for malformed URLs', () => {
  const raw = 'not-a-valid-url-value';
  assert.equal(blobUrlToPathname(raw), raw);
});
