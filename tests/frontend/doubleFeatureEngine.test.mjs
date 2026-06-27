import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DOUBLE_FEATURE_GAP_MINUTES,
  filterDoubleFeatureRows,
  findDoubleFeaturePairs,
  sortDoubleFeaturePairs,
} from '../../src/utils/doubleFeatureEngine.js';
import { parseRuntimeMinutes, parseTimeToMinutes } from '../../src/utils/timeUtils.js';

const DATE = '06/28/2026';
const THEATER_A = 'Theater A';
const THEATER_B = 'Theater B';

function row({ film, time, runtime = '90', theater = THEATER_A, date = DATE }) {
  return {
    Date: date,
    Time: time,
    Theater: theater,
    Film: film,
    Runtime: runtime,
    posterDynamic: `https://example.com/${film.replace(/\s+/g, '-').toLowerCase()}.jpg`,
  };
}

function assertPairsHaveNoNan(pairs) {
  for (const pair of pairs) {
    assert.ok(Number.isFinite(pair.gap), 'gap must be finite');
    assert.ok(Number.isFinite(pair.movieA.runtime), 'movieA runtime must be finite');
    assert.ok(Number.isFinite(pair.movieB.runtime), 'movieB runtime must be finite');

    const startA = parseTimeToMinutes(pair.movieA.showtime);
    const startB = parseTimeToMinutes(pair.movieB.showtime);
    assert.ok(Number.isFinite(startA), 'movieA start_min must be finite');
    assert.ok(Number.isFinite(startB), 'movieB start_min must be finite');

    const endA = startA + pair.movieA.runtime;
    const endB = startB + pair.movieB.runtime;
    assert.ok(Number.isFinite(endA), 'movieA end_min must be finite');
    assert.ok(Number.isFinite(endB), 'movieB end_min must be finite');
  }
}

const baseFilters = {
  selectedDate: DATE,
  selectedTheaters: [],
  earliestStartTime: '',
  earliestEndTime: '',
  movieFilterType: 'none',
  selectedMovies: [],
};

test('findDoubleFeaturePairs creates a valid pair when two showtimes fit', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: '90' }),
    row({ film: 'Beta', time: '7:00PM', runtime: '100' }),
  ];
  const pairs = findDoubleFeaturePairs(rows, baseFilters);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].movieA.film, 'Alpha');
  assert.equal(pairs[0].movieB.film, 'Beta');
  assert.equal(pairs[0].gap, 30);
});

test('findDoubleFeaturePairs rejects pairs with the same film', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM' }),
    row({ film: 'Alpha', time: '7:00PM' }),
  ];
  const pairs = findDoubleFeaturePairs(rows, baseFilters);
  assert.equal(pairs.length, 0);
});

test('findDoubleFeaturePairs rejects pairs with overlapping showtimes', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: '120' }),
    row({ film: 'Beta', time: '6:30PM', runtime: '90' }),
  ];
  const pairs = findDoubleFeaturePairs(rows, baseFilters);
  assert.equal(pairs.length, 0);
});

test('findDoubleFeaturePairs rejects pairs when gap is at or above max', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: '90' }),
    row({ film: 'Beta', time: '7:30PM', runtime: '90' }),
  ];
  const pairs = findDoubleFeaturePairs(rows, baseFilters);
  assert.equal(pairs.length, 0);
  assert.equal(MAX_DOUBLE_FEATURE_GAP_MINUTES, 60);
});

test('findDoubleFeaturePairs skips rows with missing or unknown runtime', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM' }),
    row({ film: 'Beta', time: '7:00PM', runtime: 'Unknown' }),
    { ...row({ film: 'Gamma', time: '7:00PM' }), Runtime: '' },
  ];
  const pairs = findDoubleFeaturePairs(rows, baseFilters);
  assert.equal(pairs.length, 0);
});

test('findDoubleFeaturePairs skips showtimes with invalid time', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM' }),
    row({ film: 'Beta', time: 'bad-time' }),
  ];
  const pairs = findDoubleFeaturePairs(rows, baseFilters);
  assert.equal(pairs.length, 0);
});

test('filterDoubleFeatureRows respects selected date', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM' }),
    row({ film: 'Beta', time: '7:00PM', date: '06/29/2026' }),
  ];
  const filtered = filterDoubleFeatureRows(rows, baseFilters);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].Film, 'Alpha');
});

test('filterDoubleFeatureRows respects selected theaters', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', theater: THEATER_A }),
    row({ film: 'Beta', time: '7:00PM', theater: THEATER_B }),
  ];
  const filtered = filterDoubleFeatureRows(rows, {
    ...baseFilters,
    selectedTheaters: [THEATER_B],
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].Film, 'Beta');
});

test('sortDoubleFeaturePairs orders by popularity then gap then title', () => {
  const rows = [
    row({ film: 'Popular A', time: '1:00PM' }),
    row({ film: 'Popular A', time: '3:00PM' }),
    row({ film: 'Popular B', time: '1:00PM' }),
    row({ film: 'Rare C', time: '5:00PM' }),
    row({ film: 'Rare D', time: '7:00PM' }),
  ];

  const highPopPair = {
    theater: THEATER_A,
    movieA: { film: 'Popular A', showtime: '1:00PM', runtime: 90, poster: '', showtimes: [] },
    movieB: { film: 'Popular B', showtime: '3:00PM', runtime: 90, poster: '', showtimes: [] },
    gap: 30,
    popularity: 3,
  };
  const lowPopTightGap = {
    theater: THEATER_A,
    movieA: { film: 'Rare C', showtime: '5:00PM', runtime: 90, poster: '', showtimes: [] },
    movieB: { film: 'Rare D', showtime: '7:00PM', runtime: 90, poster: '', showtimes: [] },
    gap: 15,
    popularity: 2,
  };
  const lowPopWideGap = {
    theater: THEATER_A,
    movieA: { film: 'Rare C', showtime: '5:00PM', runtime: 90, poster: '', showtimes: [] },
    movieB: { film: 'Rare D', showtime: '7:15PM', runtime: 90, poster: '', showtimes: [] },
    gap: 45,
    popularity: 2,
  };

  const sorted = sortDoubleFeaturePairs([lowPopWideGap, highPopPair, lowPopTightGap]);
  assert.deepEqual(sorted.map((pair) => pair.gap), [30, 15, 45]);
  assert.equal(sorted[0].popularity, 3);
});

test('findDoubleFeaturePairs returns empty array when no valid pairs exist', () => {
  const rows = [row({ film: 'Solo', time: '5:00PM' })];
  assert.deepEqual(findDoubleFeaturePairs(rows, baseFilters), []);
  assert.deepEqual(findDoubleFeaturePairs(rows, { ...baseFilters, selectedDate: '' }), []);
});

test('parseRuntimeMinutes rejects non-numeric runtime strings', () => {
  for (const runtime of ['abc', 'None', 'N/A', '']) {
    assert.equal(parseRuntimeMinutes(runtime), null);
  }
  assert.equal(
    filterDoubleFeatureRows([row({ film: 'Alpha', time: '5:00PM', runtime: 'abc' })], baseFilters)
      .length,
    0,
  );
});

test('parseRuntimeMinutes rejects runtime strings with extra text', () => {
  assert.equal(parseRuntimeMinutes('90 min'), null);
  const pairs = findDoubleFeaturePairs(
    [
      row({ film: 'Alpha', time: '5:00PM', runtime: '90 min' }),
      row({ film: 'Beta', time: '7:00PM', runtime: '90' }),
    ],
    baseFilters,
  );
  assert.equal(pairs.length, 0);
});

test('parseRuntimeMinutes rejects zero and negative runtime', () => {
  assert.equal(parseRuntimeMinutes('0'), null);
  assert.equal(parseRuntimeMinutes(0), null);
  assert.equal(parseRuntimeMinutes('-10'), null);
  assert.equal(parseRuntimeMinutes(-10), null);

  const pairs = findDoubleFeaturePairs(
    [
      row({ film: 'Alpha', time: '5:00PM', runtime: '0' }),
      row({ film: 'Beta', time: '7:00PM', runtime: '-10' }),
      row({ film: 'Gamma', time: '5:00PM', runtime: '90' }),
    ],
    baseFilters,
  );
  assert.equal(pairs.length, 0);
});

test('parseRuntimeMinutes accepts numeric string and number runtime', () => {
  assert.equal(parseRuntimeMinutes('90'), 90);
  assert.equal(parseRuntimeMinutes('137'), 137);
  assert.equal(parseRuntimeMinutes(90), 90);
  assert.equal(parseRuntimeMinutes(137), 137);

  const stringPairs = findDoubleFeaturePairs(
    [
      row({ film: 'Alpha', time: '5:00PM', runtime: '90' }),
      row({ film: 'Beta', time: '7:00PM', runtime: '100' }),
    ],
    baseFilters,
  );
  assert.equal(stringPairs.length, 1);

  const numberPairs = findDoubleFeaturePairs(
    [
      row({ film: 'Alpha', time: '5:00PM', runtime: 90 }),
      row({ film: 'Beta', time: '7:00PM', runtime: 100 }),
    ],
    baseFilters,
  );
  assert.equal(numberPairs.length, 1);
});

test('findDoubleFeaturePairs skips additional invalid time strings', () => {
  for (const time of ['', 'Unknown', '25:99', '7ish', null, undefined]) {
    const pairs = findDoubleFeaturePairs(
      [row({ film: 'Alpha', time: '5:00PM' }), row({ film: 'Beta', time, runtime: '90' })],
      baseFilters,
    );
    assert.equal(pairs.length, 0);
  }
});

test('findDoubleFeaturePairs never returns pairs containing NaN values', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: '90' }),
    row({ film: 'Beta', time: '7:00PM', runtime: '100' }),
    row({ film: 'Bad Runtime', time: '5:00PM', runtime: 'abc' }),
    row({ film: 'Bad Time', time: '7ish', runtime: '90' }),
    row({ film: 'Zero Runtime', time: '5:00PM', runtime: '0' }),
    row({ film: 'Gamma', time: 'bad-time', runtime: '90 min' }),
  ];
  const pairs = findDoubleFeaturePairs(rows, baseFilters);
  assertPairsHaveNoNan(pairs);
  assert.equal(pairs.length, 1);
});
