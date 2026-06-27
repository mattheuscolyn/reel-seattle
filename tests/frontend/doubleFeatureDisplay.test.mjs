import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePairTotalMinutes,
  formatFilmEndTime,
  formatRuntimeMinutes,
  formatScheduleDuration,
  formatShowtime,
  getGapLabel,
  TIGHT_GAP_THRESHOLD_MINUTES,
} from '../../src/utils/doubleFeatureDisplay.js';

test('formatScheduleDuration formats total duration under 1 hour', () => {
  assert.equal(formatScheduleDuration(45), '45m');
  assert.equal(formatScheduleDuration(0), '0m');
});

test('formatScheduleDuration formats total duration over 1 hour', () => {
  assert.equal(formatScheduleDuration(272), '4h 32m');
  assert.equal(formatScheduleDuration(120), '2h');
});

test('getGapLabel returns Tight gap for short gaps', () => {
  const label = getGapLabel(TIGHT_GAP_THRESHOLD_MINUTES - 1);
  assert.equal(label.text, 'Tight gap');
  assert.equal(label.variant, 'tight');
});

test('getGapLabel returns Comfortable gap for larger gaps', () => {
  const atThreshold = getGapLabel(TIGHT_GAP_THRESHOLD_MINUTES);
  assert.equal(atThreshold.text, 'Comfortable gap');
  assert.equal(atThreshold.variant, 'comfortable');

  const above = getGapLabel(30);
  assert.equal(above.text, 'Comfortable gap');
  assert.equal(above.variant, 'comfortable');
});

test('formatScheduleDuration and related helpers fall back for missing values', () => {
  assert.equal(formatScheduleDuration(null), 'Unknown');
  assert.equal(formatScheduleDuration(undefined), 'Unknown');
  assert.equal(formatRuntimeMinutes(null), 'Unknown');
  assert.equal(formatShowtime(''), 'Unknown');
  assert.equal(computePairTotalMinutes({ movieA: {}, movieB: {} }), null);

  const unknownGap = getGapLabel(null);
  assert.equal(unknownGap.text, 'Unknown gap');
  assert.equal(unknownGap.variant, 'unknown');
});

test('computePairTotalMinutes uses first start and second end', () => {
  const total = computePairTotalMinutes({
    movieA: { showtime: '7:00PM', runtime: 90 },
    movieB: { showtime: '9:00PM', runtime: 120 },
  });
  assert.equal(total, 240);
});

test('formatFilmEndTime computes end time from start and runtime', () => {
  assert.equal(formatFilmEndTime('7:00PM', 90), '8:30PM');
  assert.equal(formatFilmEndTime('', 90), 'Unknown');
  assert.equal(formatFilmEndTime('7:00PM', null), 'Unknown');
});
