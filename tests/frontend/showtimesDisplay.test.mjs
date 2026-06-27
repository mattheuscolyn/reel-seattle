import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExpandedFilmSummary,
  buildFilmCardMetadata,
  collectFilmFormats,
  formatCountLabel,
  formatDateSpanLabel,
  formatExpandedShowtimeSummary,
  formatRuntimeLabel,
} from '../../src/utils/showtimesDisplay.js';

const LOCALE = 'en-US';

test('formatRuntimeLabel formats runtime under 1 hour', () => {
  assert.equal(formatRuntimeLabel(45), '45m');
  assert.equal(formatRuntimeLabel('45'), '45m');
});

test('formatRuntimeLabel formats runtime over 1 hour with minutes', () => {
  assert.equal(formatRuntimeLabel(80), '1h 20m');
  assert.equal(formatRuntimeLabel('100'), '1h 40m');
});

test('formatRuntimeLabel formats runtime with zero remaining minutes', () => {
  assert.equal(formatRuntimeLabel(120), '2h');
  assert.equal(formatRuntimeLabel(60), '1h');
});

test('formatRuntimeLabel returns null for missing or invalid runtime', () => {
  assert.equal(formatRuntimeLabel(null), null);
  assert.equal(formatRuntimeLabel(''), null);
  assert.equal(formatRuntimeLabel('Unknown'), null);
  assert.equal(formatRuntimeLabel(0), null);
});

test('formatCountLabel pluralizes theater and showtime counts', () => {
  assert.equal(formatCountLabel(1, 'theater', 'theaters'), '1 theater');
  assert.equal(formatCountLabel(3, 'theater', 'theaters'), '3 theaters');
  assert.equal(formatCountLabel(1, 'showtime', 'showtimes'), '1 showtime');
  assert.equal(formatCountLabel(12, 'showtime', 'showtimes'), '12 showtimes');
  assert.equal(formatCountLabel(0, 'showtime', 'showtimes'), null);
});

test('formatDateSpanLabel formats one-day and multi-day spans', () => {
  assert.equal(formatDateSpanLabel(['06/28/2026'], LOCALE), 'Jun 28');
  assert.equal(
    formatDateSpanLabel(['06/28/2026', '07/03/2026'], LOCALE),
    'Jun 28–Jul 3',
  );
  assert.equal(formatDateSpanLabel(['06/28/2026', '06/30/2026'], LOCALE), 'Jun 28–30');
});

test('collectFilmFormats dedupes premium format labels', () => {
  const formats = collectFilmFormats({
    showtimes: {
      '06/28/2026': {
        'Theater A': [
          { premiumFormat: 'IMAX' },
          { premiumFormat: 'IMAX' },
          { premiumFormat: '70mm' },
        ],
      },
    },
  });
  assert.deepEqual(formats, ['70mm', 'IMAX']);
});

test('buildFilmCardMetadata assembles visible metadata items', () => {
  const metadata = buildFilmCardMetadata(
    {
      runtime: '102',
      showtimes: {
        '06/28/2026': {
          'Theater A': [{ premiumFormat: 'IMAX' }, { premiumFormat: '' }],
          'Theater B': [{ premiumFormat: '' }],
        },
        '07/03/2026': {
          'Theater A': [{ premiumFormat: 'Open Caption' }],
        },
      },
    },
    {},
    LOCALE,
  );

  assert.deepEqual(
    metadata.items.map((item) => item.text),
    ['1h 42m', '2 theaters', '4 showtimes', 'Jun 28–Jul 3'],
  );
  assert.deepEqual(metadata.formats, ['IMAX', 'Open Caption']);
});

test('formatExpandedShowtimeSummary pluralizes visible showtime and theater counts', () => {
  assert.equal(formatExpandedShowtimeSummary(1, 1), 'Showing 1 showtime across 1 theater');
  assert.equal(formatExpandedShowtimeSummary(27, 1), 'Showing 27 showtimes across 1 theater');
  assert.equal(formatExpandedShowtimeSummary(4, 3), 'Showing 4 showtimes across 3 theaters');
  assert.equal(formatExpandedShowtimeSummary(0, 2), null);
});

test('buildExpandedFilmSummary assembles details, summary line, and date groups', () => {
  const summary = buildExpandedFilmSummary(
    {
      runtime: '90',
      showtimes: {
        '06/28/2026': {
          'Theater A': [{ time: '7:00PM', premiumFormat: 'IMAX' }],
          'Theater B': [{ time: '8:00PM', premiumFormat: '' }],
        },
      },
    },
    {},
    LOCALE,
  );

  assert.equal(summary.summaryLine, 'Showing 2 showtimes across 2 theaters');
  assert.deepEqual(
    summary.details.map((item) => item.value),
    ['1h 30m', 'Jun 28', '2 theaters'],
  );
  assert.deepEqual(summary.formats, ['IMAX']);
  assert.equal(summary.dateGroups.length, 1);
  assert.equal(summary.dateGroups[0].theaters.length, 2);
});

test('buildExpandedFilmSummary omits formats when none are present', () => {
  const summary = buildExpandedFilmSummary({
    runtime: '80',
    showtimes: {
      '06/28/2026': {
        'Theater A': [{ time: '7:00PM', premiumFormat: '' }],
      },
    },
  });

  assert.deepEqual(summary.formats, []);
  assert.equal(summary.summaryLine, 'Showing 1 showtime across 1 theater');
});

test('buildExpandedFilmSummary dedupes formats across showtimes', () => {
  const summary = buildExpandedFilmSummary({
    showtimes: {
      '06/28/2026': {
        'Theater A': [
          { premiumFormat: 'IMAX' },
          { premiumFormat: 'IMAX' },
          { premiumFormat: '70mm' },
        ],
      },
    },
  });

  assert.deepEqual(summary.formats, ['70mm', 'IMAX']);
});
