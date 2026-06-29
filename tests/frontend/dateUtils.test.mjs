import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPlannerDateLabel, parseLegacyDate } from '../../src/utils/dateUtils.js';

test('formatPlannerDateLabel formats weekday labels', () => {
  const label = formatPlannerDateLabel('06/27/2026');
  assert.match(label, /Jun 27/);
});

test('parseLegacyDate parses MM/DD/YYYY', () => {
  const date = parseLegacyDate('06/27/2026');
  assert.equal(date?.getFullYear(), 2026);
  assert.equal(date?.getMonth(), 5);
  assert.equal(date?.getDate(), 27);
});
