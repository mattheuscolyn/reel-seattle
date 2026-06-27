import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurrentWindowSummary } from '../../src/utils/showtimesSummary.js';

const LOCALE = 'en-US';

const sourceInfo = {
  window: { start_date: '2026-06-26', end_date: '2026-07-10' },
  stats: { showtime_count: 123, theater_count: 4, film_count: 26 },
};

test('buildCurrentWindowSummary shows loading phrase while loading', () => {
  const summary = buildCurrentWindowSummary({ loading: true });
  assert.equal(summary.text, 'Loading current window…');
  assert.equal(summary.loading, true);
});

test('buildCurrentWindowSummary hides summary on load error', () => {
  assert.equal(buildCurrentWindowSummary({ error: 'failed' }), null);
});

test('buildCurrentWindowSummary builds count and theater summary', () => {
  const summary = buildCurrentWindowSummary({ sourceInfo, locale: LOCALE });
  assert.equal(
    summary.text,
    'Showing 123 showtimes across 4 theaters · June 26–July 10',
  );
});

test('buildCurrentWindowSummary uses row count when stats missing', () => {
  const summary = buildCurrentWindowSummary({
    sourceInfo: { window: sourceInfo.window },
    rowCount: 50,
    locale: LOCALE,
  });
  assert.equal(summary.text, 'Showing 50 showtimes from June 26–July 10');
});

test('buildCurrentWindowSummary falls back when metadata missing', () => {
  const summary = buildCurrentWindowSummary({});
  assert.equal(summary.text, 'Showing current showtimes');
});

test('buildCurrentWindowSummary shows date-only phrase without counts', () => {
  const summary = buildCurrentWindowSummary({
    sourceInfo: { window: sourceInfo.window },
    locale: LOCALE,
  });
  assert.equal(summary.text, 'Showing showtimes for June 26–July 10');
});
