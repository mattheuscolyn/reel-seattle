import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateRange, parseIsoDateLocal } from '../../src/utils/dateUtils.js';

const LOCALE = 'en-US';

test('parseIsoDateLocal parses calendar dates without UTC shift', () => {
  const date = parseIsoDateLocal('2026-06-26');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 5);
  assert.equal(date.getDate(), 26);
});

test('formatDateRange formats same-month range', () => {
  assert.equal(formatDateRange('2026-06-26', '2026-06-30', LOCALE), 'June 26–30');
});

test('formatDateRange formats cross-month range', () => {
  assert.equal(formatDateRange('2026-06-26', '2026-07-10', LOCALE), 'June 26–July 10');
});

test('formatDateRange formats cross-year range', () => {
  assert.equal(
    formatDateRange('2025-12-30', '2026-01-05', LOCALE),
    'December 30, 2025–January 5, 2026',
  );
});

test('formatDateRange handles missing dates', () => {
  assert.equal(formatDateRange(null, '2026-07-10', LOCALE), '');
  assert.equal(formatDateRange('2026-06-26', 'bad', LOCALE), '');
  assert.equal(formatDateRange('', ''), '');
});
