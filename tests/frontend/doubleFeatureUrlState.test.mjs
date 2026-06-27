import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDoubleFeatureSearchString,
  decodeDoubleFeatureFilters,
  encodeDoubleFeatureFilters,
  hasActivePlannerQuery,
  hasActivePlannerQueryString,
  intersectWithOptions,
  normalizePlannerTime,
} from '../../src/utils/doubleFeatureUrlState.js';

test('encodeDoubleFeatureFilters encodes selected date', () => {
  const params = encodeDoubleFeatureFilters({ selectedDate: '06/26/2026' });
  assert.equal(params.get('date'), '06/26/2026');
});

test('decodeDoubleFeatureFilters decodes selected date', () => {
  const decoded = decodeDoubleFeatureFilters('date=06/26/2026');
  assert.equal(decoded.selectedDate, '06/26/2026');
});

test('encodeDoubleFeatureFilters encodes one selected theater', () => {
  const params = encodeDoubleFeatureFilters({
    selectedTheaters: ['SIFF Cinema Downtown'],
  });
  assert.deepEqual(params.getAll('theaters'), ['SIFF Cinema Downtown']);
});

test('encodeDoubleFeatureFilters encodes multiple selected theaters', () => {
  const params = encodeDoubleFeatureFilters({
    selectedTheaters: ['SIFF Cinema Downtown', 'The Beacon'],
  });
  assert.deepEqual(params.getAll('theaters'), ['SIFF Cinema Downtown', 'The Beacon']);
});

test('encodeDoubleFeatureFilters encodes whitelist movie filters', () => {
  const params = encodeDoubleFeatureFilters({
    movieFilterType: 'whitelist',
    selectedMovies: ['Sinners', 'Materialists'],
  });
  assert.equal(params.get('filter'), 'whitelist');
  assert.deepEqual(params.getAll('movies'), ['Sinners', 'Materialists']);
  assert.equal(params.getAll('exclude').length, 0);
});

test('encodeDoubleFeatureFilters encodes blacklist movie filters', () => {
  const params = encodeDoubleFeatureFilters({
    movieFilterType: 'blacklist',
    selectedMovies: ['Sinners'],
  });
  assert.equal(params.get('filter'), 'blacklist');
  assert.deepEqual(params.getAll('exclude'), ['Sinners']);
  assert.equal(params.getAll('movies').length, 0);
});

test('encodeDoubleFeatureFilters encodes movie filter mode without selected movies', () => {
  const params = encodeDoubleFeatureFilters({ movieFilterType: 'whitelist' });
  assert.equal(params.get('filter'), 'whitelist');
  assert.equal(params.getAll('movies').length, 0);
});

test('encodeDoubleFeatureFilters encodes start and end times', () => {
  const params = encodeDoubleFeatureFilters({
    earliestStartTime: '7:30PM',
    earliestEndTime: '10:00PM',
  });
  assert.equal(params.get('start'), '7:30PM');
  assert.equal(params.get('end'), '10:00PM');
});

test('encodeDoubleFeatureFilters omits default empty values', () => {
  const params = encodeDoubleFeatureFilters({});
  assert.equal(params.toString(), '');
});

test('decodeDoubleFeatureFilters handles invalid and blank values safely', () => {
  const decoded = decodeDoubleFeatureFilters(
    'date=%20&start=7ish&end=&theaters=+&movies=',
  );
  assert.equal(decoded.selectedDate, '');
  assert.equal(decoded.earliestStartTime, '7ish');
  assert.equal(decoded.earliestEndTime, '');
  assert.deepEqual(decoded.selectedTheaters, []);
  assert.equal(decoded.movieFilterType, 'none');
});

test('decodeDoubleFeatureFilters restores movie filter mode without movies', () => {
  const decoded = decodeDoubleFeatureFilters('filter=whitelist');
  assert.equal(decoded.movieFilterType, 'whitelist');
  assert.deepEqual(decoded.selectedMovies, []);
});

test('double feature URL helpers round-trip combined planner state', () => {
  const filters = {
    selectedDate: '06/26/2026',
    selectedTheaters: ['SIFF Cinema Downtown', 'The Beacon'],
    earliestStartTime: '7:30PM',
    earliestEndTime: '10:00PM',
    movieFilterType: 'whitelist',
    selectedMovies: ['Sinners', 'Materialists'],
  };
  const query = buildDoubleFeatureSearchString(filters);
  const decoded = decodeDoubleFeatureFilters(query);
  assert.deepEqual(decoded, filters);
});

test('intersectWithOptions prunes stale dates theaters and movies', () => {
  assert.deepEqual(
    intersectWithOptions(['06/26/2026', '01/01/2000'], ['06/26/2026', '06/27/2026']),
    ['06/26/2026'],
  );
  assert.deepEqual(
    intersectWithOptions(['Sinners', 'Missing'], ['Sinners', 'Beta']),
    ['Sinners'],
  );
});

test('normalizePlannerTime rejects invalid compact times', () => {
  assert.equal(normalizePlannerTime('7:30PM'), '7:30PM');
  assert.equal(normalizePlannerTime('7ish'), '');
});

test('decodeDoubleFeatureFilters prefers exclude when both movie params present', () => {
  const decoded = decodeDoubleFeatureFilters('movies=Alpha&exclude=Beta');
  assert.equal(decoded.movieFilterType, 'blacklist');
  assert.deepEqual(decoded.selectedMovies, ['Beta']);
});

test('hasActivePlannerQuery returns false for default planner state', () => {
  assert.equal(hasActivePlannerQuery({}), false);
  assert.equal(hasActivePlannerQuery(decodeDoubleFeatureFilters('')), false);
});

test('hasActivePlannerQuery returns true for date theater movies filter and times', () => {
  assert.equal(hasActivePlannerQuery({ selectedDate: '06/26/2026' }), true);
  assert.equal(hasActivePlannerQuery({ selectedTheaters: ['The Beacon'] }), true);
  assert.equal(
    hasActivePlannerQuery(decodeDoubleFeatureFilters('movies=Sinners&filter=whitelist')),
    true,
  );
  assert.equal(hasActivePlannerQuery(decodeDoubleFeatureFilters('filter=whitelist')), true);
  assert.equal(hasActivePlannerQuery({ earliestStartTime: '7:30PM' }), true);
  assert.equal(hasActivePlannerQuery({ earliestEndTime: '10:00PM' }), true);
});

test('hasActivePlannerQuery returns false for blank values and unknown params', () => {
  assert.equal(
    hasActivePlannerQuery({
      selectedDate: '   ',
      earliestStartTime: '',
      movieFilterType: 'none',
    }),
    false,
  );
  assert.equal(hasActivePlannerQuery(decodeDoubleFeatureFilters('foo=bar&sort=bad')), false);
  assert.equal(hasActivePlannerQueryString('foo=bar'), false);
});
