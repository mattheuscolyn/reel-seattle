import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlannerSearchFilters,
  formatFilmCountLabel,
  formatPlannerMovieDisplay,
  formatPlannerResultsHeading,
  formatPlannerScheduleSummary,
  formatPlannerTimeLabel,
  parsePlannerTimeInput,
} from '../../src/utils/plannerDisplay.js';

test('formatFilmCountLabel maps numeric and max modes', () => {
  assert.equal(formatFilmCountLabel(2), '2');
  assert.equal(formatFilmCountLabel(3), '3');
  assert.equal(formatFilmCountLabel(4), '4');
  assert.equal(formatFilmCountLabel(8), '8');
  assert.equal(formatFilmCountLabel('max'), 'As many as possible');
  assert.equal(formatFilmCountLabel('invalid'), '2');
});

test('formatPlannerTimeLabel formats minutes and handles missing values', () => {
  assert.equal(formatPlannerTimeLabel(870), '2:30PM');
  assert.equal(formatPlannerTimeLabel(null), 'Unknown');
});

test('parsePlannerTimeInput accepts valid times and rejects invalid input', () => {
  assert.equal(parsePlannerTimeInput('2:30PM'), 870);
  assert.equal(parsePlannerTimeInput(''), null);
  assert.equal(parsePlannerTimeInput('not-a-time'), null);
});

test('buildPlannerSearchFilters applies double-feature max gap for 2-film mode only', () => {
  const twoFilm = buildPlannerSearchFilters({
    date: '06/27/2026',
    theaters: ['AMC Pacific Place 11'],
    filmCount: 2,
    startAfter: '2:00PM',
    finishBy: '10:00PM',
  });
  assert.equal(twoFilm.filmCount, 2);
  assert.equal(twoFilm.maxGapMin, 59);
  assert.equal(twoFilm.startAfterMin, 840);
  assert.equal(twoFilm.finishByMin, 1320);

  const threeFilm = buildPlannerSearchFilters({
    date: '06/27/2026',
    theaters: [],
    filmCount: 3,
    startAfter: '',
    finishBy: '',
  });
  assert.equal(threeFilm.maxGapMin, null);

  const maxMode = buildPlannerSearchFilters({
    date: '06/27/2026',
    theaters: [],
    filmCount: 'max',
    startAfter: '',
    finishBy: '',
  });
  assert.equal(maxMode.filmCount, 'max');
  assert.equal(maxMode.maxGapMin, null);
});

test('formatPlannerScheduleSummary formats theater span and gap metrics', () => {
  const summary = formatPlannerScheduleSummary({
    theater: 'AMC Pacific Place 11',
    filmCount: 3,
    startMin: 720,
    endMin: 990,
    startLabel: '12:00PM',
    endLabel: '4:30PM',
    totalSpanMin: 270,
    filmRuntimeMin: 210,
    gapTimeMin: 60,
  });

  assert.equal(summary.theater, 'AMC Pacific Place 11');
  assert.equal(summary.filmCountLabel, '3');
  assert.equal(summary.startTime, '12:00PM');
  assert.equal(summary.endTime, '4:30PM');
  assert.equal(summary.totalSpan, '4h 30m');
  assert.equal(summary.totalGap, '60 min');
  assert.equal(summary.filmRuntime, '3h 30m');
});

test('formatPlannerResultsHeading uses film count labels', () => {
  assert.equal(formatPlannerResultsHeading(1, 2), '1 2-Film Plan Found');
  assert.equal(formatPlannerResultsHeading(3, 3), '3 3-Film Plans Found');
  assert.equal(formatPlannerResultsHeading(2, 'max'), '2 Schedule Plans Found');
});

test('formatPlannerMovieDisplay formats movie slot details', () => {
  const display = formatPlannerMovieDisplay({
    film: 'Alpha',
    time: '12:00PM',
    startMin: 720,
    endMin: 780,
    runtime: 60,
  });

  assert.equal(display.film, 'Alpha');
  assert.equal(display.startTime, '12:00PM');
  assert.equal(display.endTime, '1:00PM');
  assert.equal(display.runtime, '60 min');
});
