import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toSlug } from './slug';

test('toSlug normalizes casing, spaces, and symbols', () => {
  assert.equal(toSlug('  SOC 2 Type II Controls  '), 'soc-2-type-ii-controls');
  assert.equal(toSlug('PCI_DSS&ISO27001'), 'pci-dss-iso27001');
});

test('toSlug trims leading/trailing separators and enforces max length', () => {
  const value = '*'.repeat(3) + 'A'.repeat(80) + '*'.repeat(3);
  const slug = toSlug(value);

  assert.equal(slug.startsWith('-'), false);
  assert.equal(slug.endsWith('-'), false);
  assert.equal(slug.length, 64);
});

test('toSlug can return empty output when no slug-safe characters exist', () => {
  assert.equal(toSlug('!!!@@@###'), '');
});
