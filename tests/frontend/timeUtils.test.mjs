import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMinutesToTime,
  getMovieEndTime,
  parseRuntimeMinutes,
  parseTimeToMinutes,
} from '../../src/utils/timeUtils.js';

test('parseRuntimeMinutes accepts integer strings and whole numbers', () => {
  assert.equal(parseRuntimeMinutes('90'), 90);
  assert.equal(parseRuntimeMinutes(90), 90);
  assert.equal(parseRuntimeMinutes('137'), 137);
  assert.equal(parseRuntimeMinutes(137), 137);
});

test('parseRuntimeMinutes rejects empty, unknown, and non-numeric values', () => {
  for (const runtime of ['', 'Unknown', 'None', 'N/A', 'abc', '90 min', null, undefined]) {
    assert.equal(parseRuntimeMinutes(runtime), null, `expected null for ${String(runtime)}`);
  }
});

test('parseRuntimeMinutes rejects zero, negative, NaN, and decimal values', () => {
  assert.equal(parseRuntimeMinutes(0), null);
  assert.equal(parseRuntimeMinutes(-10), null);
  assert.equal(parseRuntimeMinutes(NaN), null);
  assert.equal(parseRuntimeMinutes('0'), null);
  assert.equal(parseRuntimeMinutes('-10'), null);
  assert.equal(parseRuntimeMinutes('90.5'), null);
  assert.equal(parseRuntimeMinutes(90.5), null);
});

test('parseTimeToMinutes accepts compact legacy Time strings', () => {
  assert.equal(parseTimeToMinutes('7:30PM'), 19 * 60 + 30);
  assert.equal(parseTimeToMinutes('12:00AM'), 0);
  assert.equal(parseTimeToMinutes('12:00PM'), 12 * 60);
});

test('parseTimeToMinutes rejects spaced 12-hour and 24-hour formats', () => {
  // Adapter normalizes pipeline time_display to compact "7:30PM"; parser does not accept these.
  assert.equal(parseTimeToMinutes('7:30 PM'), null);
  assert.equal(parseTimeToMinutes('19:30'), null);
});

test('parseTimeToMinutes rejects empty, unknown, and malformed values', () => {
  for (const time of ['', 'Unknown', '25:99', '7ish', null, undefined]) {
    assert.equal(parseTimeToMinutes(time), null, `expected null for ${String(time)}`);
  }
});

test('getMovieEndTime returns finite end minutes for valid start and runtime', () => {
  const end = getMovieEndTime('7:00PM', '100');
  assert.equal(end, 19 * 60 + 100);
  assert.ok(Number.isFinite(end));
});

test('getMovieEndTime returns null for invalid start time', () => {
  assert.equal(getMovieEndTime('7ish', '100'), null);
  assert.equal(getMovieEndTime('', '100'), null);
  assert.equal(getMovieEndTime(null, '100'), null);
});

test('getMovieEndTime returns null for invalid runtime', () => {
  assert.equal(getMovieEndTime('7:00PM', 'Unknown'), null);
  assert.equal(getMovieEndTime('7:00PM', '90 min'), null);
  assert.equal(getMovieEndTime('7:00PM', '0'), null);
  assert.equal(getMovieEndTime('7:00PM', null), null);
});

test('formatMinutesToTime formats midnight and afternoon', () => {
  assert.equal(formatMinutesToTime(0), '12:00AM');
  assert.equal(formatMinutesToTime(19 * 60 + 30), '7:30PM');
});
