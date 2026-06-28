import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlannerSearchString,
  decodePlannerFilters,
  encodePlannerFilters,
  hasActivePlannerQuery,
  plannerFiltersDiffer,
} from '../../src/utils/plannerUrlState.js';

test('encodePlannerFilters encodes basic filters', () => {
  const params = encodePlannerFilters({
    selectedDate: '06/27/2026',
    startAfter: '2:00PM',
    finishBy: '10:00PM',
  });
  assert.equal(params.get('date'), '06/27/2026');
  assert.equal(params.get('start'), '2:00PM');
  assert.equal(params.get('finish'), '10:00PM');
  assert.equal(params.get('count'), null);
});

test('decodePlannerFilters decodes basic filters', () => {
  const decoded = decodePlannerFilters('date=06/27/2026&start=2%3A00PM&finish=10%3A00PM&count=3');
  assert.equal(decoded.selectedDate, '06/27/2026');
  assert.equal(decoded.startAfter, '2:00PM');
  assert.equal(decoded.finishBy, '10:00PM');
  assert.equal(decoded.filmCount, 3);
});

test('encodePlannerFilters encodes theater arrays', () => {
  const params = encodePlannerFilters({
    selectedTheaters: ['AMC Pacific Place 11', 'The Beacon'],
  });
  assert.deepEqual(params.getAll('theaters'), ['AMC Pacific Place 11', 'The Beacon']);
});

test('decodePlannerFilters decodes theater arrays', () => {
  const decoded = decodePlannerFilters(
    'theaters=AMC+Pacific+Place+11&theaters=The+Beacon',
  );
  assert.deepEqual(decoded.selectedTheaters, ['AMC Pacific Place 11', 'The Beacon']);
});

test('encodePlannerFilters encodes include and exclude movie arrays', () => {
  const params = encodePlannerFilters({
    includeFilms: ['Toy Story 5', 'Sinners'],
    excludeFilms: ['Jackass: Best and Last'],
  });
  assert.deepEqual(params.getAll('movies'), ['Toy Story 5', 'Sinners']);
  assert.deepEqual(params.getAll('exclude'), ['Jackass: Best and Last']);
});

test('decodePlannerFilters decodes include and exclude movie arrays', () => {
  const decoded = decodePlannerFilters('movies=Toy+Story+5&exclude=Sinners');
  assert.deepEqual(decoded.includeFilms, ['Toy Story 5']);
  assert.deepEqual(decoded.excludeFilms, ['Sinners']);
});

test('encodePlannerFilters encodes first and last film anchors', () => {
  const params = encodePlannerFilters({
    firstFilm: 'Toy Story 5',
    lastFilm: 'Sinners',
  });
  assert.equal(params.get('first'), 'Toy Story 5');
  assert.equal(params.get('last'), 'Sinners');
});

test('encodePlannerFilters encodes gap values when explicit', () => {
  const params = encodePlannerFilters({
    minGapMin: '15',
    maxGapMin: '45',
    maxGapExplicit: true,
  });
  assert.equal(params.get('mingap'), '15');
  assert.equal(params.get('maxgap'), '45');
});

test('decodePlannerFilters decodes invalid numeric values safely', () => {
  const decoded = decodePlannerFilters('mingap=abc&maxgap=-5&count=9&sort=invalid');
  assert.equal(decoded.minGapMin, '');
  assert.equal(decoded.maxGapMin, '');
  assert.equal(decoded.filmCount, 2);
  assert.equal(decoded.sort, '');
});

test('encodePlannerFilters omits defaults', () => {
  const params = encodePlannerFilters({});
  assert.equal(params.toString(), '');
});

test('encodePlannerFilters preserves non-default sort mode', () => {
  const params = encodePlannerFilters({ sort: 'shortest_span' });
  assert.equal(params.get('sort'), 'shortest_span');
  const decoded = decodePlannerFilters(params);
  assert.equal(decoded.sort, 'shortest_span');
});

test('decodePlannerFilters handles empty query string', () => {
  const decoded = decodePlannerFilters('');
  assert.equal(decoded.selectedDate, '');
  assert.deepEqual(decoded.selectedTheaters, []);
  assert.equal(decoded.filmCount, 2);
  assert.equal(decoded.advancedOpen, false);
});

test('buildPlannerSearchString round-trips combined filters', () => {
  const filters = {
    selectedDate: '06/27/2026',
    selectedTheaters: ['The Beacon'],
    filmCount: 'max',
    sort: 'most_films',
    advancedOpen: true,
  };
  const query = buildPlannerSearchString(filters);
  const decoded = decodePlannerFilters(query);
  assert.equal(decoded.selectedDate, '06/27/2026');
  assert.deepEqual(decoded.selectedTheaters, ['The Beacon']);
  assert.equal(decoded.filmCount, 'max');
  assert.equal(decoded.sort, 'most_films');
  assert.equal(decoded.advancedOpen, true);
});

test('hasActivePlannerQuery detects meaningful planner params', () => {
  assert.equal(hasActivePlannerQuery({}), false);
  assert.equal(hasActivePlannerQuery({ selectedDate: '06/27/2026' }), true);
  assert.equal(hasActivePlannerQuery({ filmCount: 'max' }), true);
  assert.equal(hasActivePlannerQuery({ maxGapExplicit: true, maxGapMin: '' }), true);
});

test('plannerFiltersDiffer compares encoded params', () => {
  const a = encodePlannerFilters({ selectedDate: '06/27/2026' });
  const b = encodePlannerFilters({ selectedDate: '06/28/2026' });
  assert.equal(plannerFiltersDiffer(a, b), true);
  assert.equal(plannerFiltersDiffer(a, a), false);
});
