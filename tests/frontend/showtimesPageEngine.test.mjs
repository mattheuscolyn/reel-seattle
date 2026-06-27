import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShowtimesFilterOptions,
  buildShowtimesPageResults,
  filterShowtimeRows,
  groupShowtimesForDisplay,
  sortGroupedMovies,
} from '../../src/utils/showtimesPageEngine.js';

function csvDateFromOffset(dayOffset) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
}

const FUTURE_DATE_A = csvDateFromOffset(10);
const FUTURE_DATE_B = csvDateFromOffset(20);
const PAST_DATE = csvDateFromOffset(-30);

function row({
  film,
  date = FUTURE_DATE_A,
  theater = 'Theater A',
  time = '7:30PM',
  runtime = '120',
  poster = 'https://example.com/poster.jpg',
  premiumFormat = '',
  isCanceled = 'False',
}) {
  return {
    Date: date,
    Time: time,
    Theater: theater,
    Film: film,
    Runtime: runtime,
    posterDynamic: poster,
    premiumFormat,
    isCanceled,
  };
}

const sampleRows = [
  row({
    film: 'Alpha',
    date: FUTURE_DATE_A,
    theater: 'Theater A',
    time: '7:30PM',
    premiumFormat: 'IMAX',
  }),
  row({
    film: 'Alpha',
    date: FUTURE_DATE_B,
    theater: 'Theater B',
    time: '5:00PM',
    premiumFormat: 'Dolby Cinema',
  }),
  row({
    film: 'Beta',
    date: FUTURE_DATE_A,
    theater: 'Theater A',
    time: '8:00PM',
    runtime: '90',
    poster: 'https://example.com/beta.jpg',
  }),
  row({ film: 'Past Film', date: PAST_DATE, theater: 'Theater A' }),
  row({ film: 'Canceled Film', date: FUTURE_DATE_A, isCanceled: 'True' }),
];

test('buildShowtimesFilterOptions builds theater and date options', () => {
  const { theaters, dates } = buildShowtimesFilterOptions(sampleRows);
  assert.deepEqual(theaters, ['Theater A', 'Theater B']);
  assert.deepEqual(dates, [FUTURE_DATE_A, FUTURE_DATE_B]);
  assert.ok(!dates.includes(PAST_DATE));
});

test('filterShowtimeRows keeps today-or-future rows when no dates selected', () => {
  const filtered = filterShowtimeRows(sampleRows, {});
  assert.ok(filtered.every((entry) => entry.Film !== 'Past Film'));
  assert.ok(filtered.every((entry) => entry.Film !== 'Canceled Film'));
  assert.equal(filtered.length, 3);
});

test('filterShowtimeRows filters by one selected date', () => {
  const filtered = filterShowtimeRows(sampleRows, { selectedDates: [FUTURE_DATE_A] });
  assert.deepEqual(
    filtered.map((entry) => entry.Film),
    ['Alpha', 'Beta'],
  );
});

test('filterShowtimeRows filters by multiple selected dates', () => {
  const filtered = filterShowtimeRows(sampleRows, {
    selectedDates: [FUTURE_DATE_A, FUTURE_DATE_B],
  });
  assert.equal(filtered.length, 3);
  assert.ok(filtered.some((entry) => entry.Date === FUTURE_DATE_B));
});

test('filterShowtimeRows filters by selected theater', () => {
  const filtered = filterShowtimeRows(sampleRows, { selectedTheaters: ['Theater B'] });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].Film, 'Alpha');
  assert.equal(filtered[0].Theater, 'Theater B');
});

test('groupShowtimesForDisplay preserves poster and premium format metadata', () => {
  const grouped = groupShowtimesForDisplay(filterShowtimeRows(sampleRows, {}));
  const alpha = grouped.find((movie) => movie.film === 'Alpha');
  assert.equal(alpha.poster, 'https://example.com/poster.jpg');
  assert.equal(alpha.showtimes[FUTURE_DATE_A]['Theater A'][0].premiumFormat, 'IMAX');
  assert.equal(alpha.showtimes[FUTURE_DATE_B]['Theater B'][0].premiumFormat, 'Dolby Cinema');
});

test('groupShowtimesForDisplay groups showtimes by film and date/theater', () => {
  const grouped = groupShowtimesForDisplay(filterShowtimeRows(sampleRows, {}));
  assert.equal(grouped.length, 2);
  const alpha = grouped.find((movie) => movie.film === 'Alpha');
  assert.deepEqual(Object.keys(alpha.showtimes).sort(), [FUTURE_DATE_A, FUTURE_DATE_B].sort());
  assert.deepEqual(Object.keys(alpha.showtimes[FUTURE_DATE_A]), ['Theater A']);
  assert.deepEqual(Object.keys(alpha.showtimes[FUTURE_DATE_B]), ['Theater B']);
});

test('sortGroupedMovies uses default showtimes-desc ordering', () => {
  const grouped = groupShowtimesForDisplay(filterShowtimeRows(sampleRows, {}));
  const sorted = sortGroupedMovies(grouped, 'showtimes-desc', [], []);
  assert.deepEqual(
    sorted.map((movie) => movie.film),
    ['Alpha', 'Beta'],
  );
});

test('sortGroupedMovies supports alternate sort modes', () => {
  const grouped = groupShowtimesForDisplay(filterShowtimeRows(sampleRows, {}));
  assert.deepEqual(
    sortGroupedMovies(grouped, 'showtimes-asc', [], []).map((movie) => movie.film),
    ['Beta', 'Alpha'],
  );
  assert.deepEqual(
    sortGroupedMovies(grouped, 'runtime-desc', [], []).map((movie) => movie.film),
    ['Alpha', 'Beta'],
  );
  assert.deepEqual(
    sortGroupedMovies(grouped, 'runtime-asc', [], []).map((movie) => movie.film),
    ['Beta', 'Alpha'],
  );
});

test('buildShowtimesPageResults returns empty movies when nothing matches', () => {
  const { movies } = buildShowtimesPageResults(sampleRows, {
    selectedTheaters: ['Missing Theater'],
  });
  assert.deepEqual(movies, []);
});

test('filterShowtimeRows matches film title case-insensitively', () => {
  const rows = [row({ film: 'Sinners' }), row({ film: 'Beta' })];
  const filtered = filterShowtimeRows(rows, { searchText: 'sinners' });
  assert.deepEqual(filtered.map((entry) => entry.Film), ['Sinners']);
});

test('filterShowtimeRows matches partial film titles', () => {
  const rows = [row({ film: 'Sinners' }), row({ film: 'Beta' })];
  const filtered = filterShowtimeRows(rows, { searchText: 'sin' });
  assert.deepEqual(filtered.map((entry) => entry.Film), ['Sinners']);
});

test('filterShowtimeRows trims search whitespace', () => {
  const rows = [row({ film: 'Sinners' })];
  const filtered = filterShowtimeRows(rows, { searchText: '  sinners  ' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].Film, 'Sinners');
});

test('filterShowtimeRows preserves behavior when search is empty', () => {
  const withoutSearch = filterShowtimeRows(sampleRows, {});
  const withEmptySearch = filterShowtimeRows(sampleRows, { searchText: '   ' });
  assert.deepEqual(withoutSearch, withEmptySearch);
});

test('filterShowtimeRows combines search with selected date', () => {
  const filtered = filterShowtimeRows(sampleRows, {
    searchText: 'alpha',
    selectedDates: [FUTURE_DATE_A],
  });
  assert.deepEqual(filtered.map((entry) => entry.Film), ['Alpha']);
  assert.ok(filtered.every((entry) => entry.Date === FUTURE_DATE_A));
});

test('filterShowtimeRows combines search with selected theater', () => {
  const filtered = filterShowtimeRows(sampleRows, {
    searchText: 'alpha',
    selectedTheaters: ['Theater B'],
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].Film, 'Alpha');
  assert.equal(filtered[0].Theater, 'Theater B');
});

test('buildShowtimesPageResults returns empty movies when search matches nothing', () => {
  const { movies } = buildShowtimesPageResults(sampleRows, { searchText: 'xyz' });
  assert.deepEqual(movies, []);
});

test('filterShowtimeRows does not mutate input rows', () => {
  const rows = sampleRows.map((entry) => ({ ...entry }));
  const snapshot = JSON.parse(JSON.stringify(rows));
  filterShowtimeRows(rows, { searchText: 'alpha' });
  assert.deepEqual(rows, snapshot);
});
