import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SORT } from '../../src/utils/showtimesPageEngine.js';
import {
  buildShowtimesSearchString,
  decodeShowtimesFilters,
  encodeShowtimesFilters,
  intersectWithOptions,
  normalizeSort,
} from '../../src/utils/showtimesUrlState.js';

test('encodeShowtimesFilters encodes search text', () => {
  const params = encodeShowtimesFilters({ searchText: 'sinners' });
  assert.equal(params.get('search'), 'sinners');
});

test('decodeShowtimesFilters decodes search text', () => {
  const decoded = decodeShowtimesFilters('search=sinners');
  assert.equal(decoded.searchText, 'sinners');
});

test('encodeShowtimesFilters encodes one selected date', () => {
  const params = encodeShowtimesFilters({ selectedDates: ['06/26/2026'] });
  assert.deepEqual(params.getAll('dates'), ['06/26/2026']);
});

test('encodeShowtimesFilters encodes multiple selected dates', () => {
  const params = encodeShowtimesFilters({
    selectedDates: ['06/26/2026', '06/27/2026'],
  });
  assert.deepEqual(params.getAll('dates'), ['06/26/2026', '06/27/2026']);
});

test('encodeShowtimesFilters encodes one selected theater', () => {
  const params = encodeShowtimesFilters({
    selectedTheaters: ['SIFF Cinema Downtown'],
  });
  assert.deepEqual(params.getAll('theaters'), ['SIFF Cinema Downtown']);
});

test('encodeShowtimesFilters encodes multiple selected theaters', () => {
  const params = encodeShowtimesFilters({
    selectedTheaters: ['SIFF Cinema Downtown', 'The Beacon'],
  });
  assert.deepEqual(params.getAll('theaters'), ['SIFF Cinema Downtown', 'The Beacon']);
});

test('encodeShowtimesFilters encodes non-default sort', () => {
  const params = encodeShowtimesFilters({ sort: 'runtime-desc' });
  assert.equal(params.get('sort'), 'runtime-desc');
});

test('encodeShowtimesFilters omits default sort', () => {
  const params = encodeShowtimesFilters({ sort: DEFAULT_SORT });
  assert.equal(params.get('sort'), null);
});

test('decodeShowtimesFilters maps invalid sort to default', () => {
  assert.equal(decodeShowtimesFilters('sort=not-a-sort').sort, DEFAULT_SORT);
  assert.equal(decodeShowtimesFilters('sort=').sort, DEFAULT_SORT);
});

test('buildShowtimesSearchString returns empty string for default filters', () => {
  assert.equal(buildShowtimesSearchString({}), '');
  assert.equal(
    buildShowtimesSearchString({
      searchText: '   ',
      selectedDates: [],
      selectedTheaters: [],
      sort: DEFAULT_SORT,
    }),
    '',
  );
});

test('showtimes URL helpers round-trip combined filters', () => {
  const filters = {
    searchText: 'sinners',
    selectedDates: ['06/26/2026', '07/01/2026'],
    selectedTheaters: ['SIFF Cinema Downtown', 'The Beacon'],
    sort: 'runtime-desc',
  };
  const query = buildShowtimesSearchString(filters);
  const decoded = decodeShowtimesFilters(query);
  assert.deepEqual(decoded, filters);
});

test('decodeShowtimesFilters handles blank query values defensively', () => {
  const decoded = decodeShowtimesFilters('search=%20%20&dates=&theaters=+&sort=+');
  assert.equal(decoded.searchText, '');
  assert.deepEqual(decoded.selectedDates, []);
  assert.deepEqual(decoded.selectedTheaters, []);
  assert.equal(decoded.sort, DEFAULT_SORT);
});

test('intersectWithOptions filters unknown dates and theaters', () => {
  assert.deepEqual(
    intersectWithOptions(['06/26/2026', '01/01/2000'], ['06/26/2026', '06/27/2026']),
    ['06/26/2026'],
  );
});

test('normalizeSort accepts known sort modes', () => {
  assert.equal(normalizeSort('showtimes-asc'), 'showtimes-asc');
});
