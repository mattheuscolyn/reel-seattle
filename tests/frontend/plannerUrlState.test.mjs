import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarathonPlannerLink,
  buildPlannerPathFromDoubleFeature,
  buildPlannerPathFromMarathon,
  buildPlannerSearchString,
  decodePlannerFilters,
  encodePlannerFilters,
  hasActivePlannerQuery,
  mapDoubleFeatureFiltersToPlanner,
  mapMarathonFiltersToPlanner,
  normalizePlannerTime,
  parseMarathonStoredFilters,
  plannerFiltersDiffer,
} from '../../src/utils/plannerUrlState.js';
import { decodeDoubleFeatureFilters } from '../../src/utils/legacyDoubleFeatureUrlMigration.js';

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

test('encodePlannerFilters encodes preferred film arrays', () => {
  const params = encodePlannerFilters({
    preferredFilms: ['Toy Story 5', 'Sinners'],
  });
  assert.deepEqual(params.getAll('preferred'), ['Toy Story 5', 'Sinners']);
});

test('decodePlannerFilters decodes preferred film arrays', () => {
  const decoded = decodePlannerFilters('preferred=Toy+Story+5&preferred=Sinners');
  assert.deepEqual(decoded.preferredFilms, ['Toy Story 5', 'Sinners']);
});

test('decodePlannerFilters opens advanced panel when preferred is present', () => {
  const decoded = decodePlannerFilters('preferred=Sinners');
  assert.equal(decoded.advancedOpen, true);
});

test('buildPlannerSearchString round-trips preferred films', () => {
  const query = buildPlannerSearchString({
    preferredFilms: ['Toy Story 5', 'Sinners'],
    filmCount: 'max',
  });
  const decoded = decodePlannerFilters(query);
  assert.deepEqual(decoded.preferredFilms, ['Toy Story 5', 'Sinners']);
  assert.equal(decoded.filmCount, 'max');
});

test('hasActivePlannerQuery detects preferred films', () => {
  assert.equal(hasActivePlannerQuery({ preferredFilms: ['Sinners'] }), true);
});

test('buildPlannerPathFromDoubleFeature does not emit preferred films', () => {
  const path = buildPlannerPathFromDoubleFeature('movies=Sinners&exclude=Jackass');
  assert.doesNotMatch(path, /preferred=/);
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

test('mapDoubleFeatureFiltersToPlanner preserves safe params and sets 2-film mode', () => {
  const params = mapDoubleFeatureFiltersToPlanner({
    selectedDate: '06/27/2026',
    selectedTheaters: ['The Beacon'],
    earliestStartTime: '2:00PM',
    earliestEndTime: '10:00PM',
    movieFilterType: 'whitelist',
    selectedMovies: ['Toy Story 5'],
  });

  assert.equal(params.get('date'), '06/27/2026');
  assert.deepEqual(params.getAll('theaters'), ['The Beacon']);
  assert.equal(params.get('start'), '2:00PM');
  assert.equal(params.get('finish'), null);
  assert.equal(params.get('end'), null);
  assert.deepEqual(params.getAll('movies'), ['Toy Story 5']);
  assert.equal(params.get('advanced'), '1');
});

test('mapDoubleFeatureFiltersToPlanner omits Double Feature end param', () => {
  const params = mapDoubleFeatureFiltersToPlanner({
    selectedDate: '06/27/2026',
    earliestEndTime: '10:00PM',
    movieFilterType: 'none',
    selectedMovies: [],
  });
  assert.equal(params.get('finish'), null);
});

test('buildPlannerPathFromDoubleFeature maps share URL params with count=2', () => {
  const path = buildPlannerPathFromDoubleFeature(
    'date=06/27/2026&theaters=The+Beacon&start=2%3A00PM&movies=Toy+Story+5',
  );
  assert.match(path, /^\/planner\?/);
  assert.match(path, /count=2/);
  assert.match(path, /date=06%2F27%2F2026/);
  assert.match(path, /theaters=The\+Beacon/);
  assert.match(path, /start=2%3A00PM/);
  assert.match(path, /movies=Toy\+Story\+5/);
  assert.doesNotMatch(path, /finish=/);
  assert.doesNotMatch(path, /end=/);
});

test('buildPlannerPathFromDoubleFeature maps blacklist exclude films', () => {
  const path = buildPlannerPathFromDoubleFeature('exclude=Sinners');
  assert.match(path, /count=2/);
  assert.match(path, /exclude=Sinners/);
  assert.match(path, /advanced=1/);
});

test('buildPlannerPathFromDoubleFeature maps movies with advanced=1', () => {
  const path = buildPlannerPathFromDoubleFeature('movies=Sinners');
  assert.match(path, /count=2/);
  assert.match(path, /movies=Sinners/);
  assert.match(path, /advanced=1/);
});

test('buildPlannerPathFromDoubleFeature omits mode-only filter without films', () => {
  const path = buildPlannerPathFromDoubleFeature('filter=whitelist');
  assert.match(path, /count=2/);
  assert.doesNotMatch(path, /filter=/);
  assert.doesNotMatch(path, /advanced=/);
});

test('buildPlannerPathFromDoubleFeature drops invalid start time on migration', () => {
  const path = buildPlannerPathFromDoubleFeature('date=06/28/2026&start=7ish');
  assert.match(path, /date=06%2F28%2F2026/);
  assert.doesNotMatch(path, /start=/);
});

test('decodeDoubleFeatureFilters decodes legacy share URL fields', () => {
  const decoded = decodeDoubleFeatureFilters(
    'date=06/26/2026&theaters=SIFF+Cinema+Downtown&start=7%3A30PM&movies=Sinners',
  );
  assert.equal(decoded.selectedDate, '06/26/2026');
  assert.deepEqual(decoded.selectedTheaters, ['SIFF Cinema Downtown']);
  assert.equal(decoded.earliestStartTime, '7:30PM');
  assert.equal(decoded.movieFilterType, 'whitelist');
  assert.deepEqual(decoded.selectedMovies, ['Sinners']);
});

test('decodeDoubleFeatureFilters prefers exclude when both movie params present', () => {
  const decoded = decodeDoubleFeatureFilters('movies=Alpha&exclude=Beta');
  assert.equal(decoded.movieFilterType, 'blacklist');
  assert.deepEqual(decoded.selectedMovies, ['Beta']);
});

test('decodeDoubleFeatureFilters restores movie filter mode without films', () => {
  const decoded = decodeDoubleFeatureFilters('filter=whitelist');
  assert.equal(decoded.movieFilterType, 'whitelist');
  assert.deepEqual(decoded.selectedMovies, []);
});

test('normalizePlannerTime rejects invalid compact times', () => {
  assert.equal(normalizePlannerTime('7:30PM'), '7:30PM');
  assert.equal(normalizePlannerTime('7ish'), '');
});

test('buildMarathonPlannerLink points to max mode', () => {
  assert.equal(buildMarathonPlannerLink(), '/planner?count=max');
});

test('buildPlannerPathFromMarathon redirects to max mode with from=marathon', () => {
  const storage = { getItem: () => null };
  const path = buildPlannerPathFromMarathon(storage);
  assert.match(path, /^\/planner\?/);
  assert.match(path, /count=max/);
  assert.match(path, /from=marathon/);
  assert.doesNotMatch(path, /advanced=/);
});

test('buildPlannerPathFromMarathon maps preferred films to repeatable params', () => {
  const path = buildPlannerPathFromMarathon({
    blacklist: [],
    preferredMovies: ['Disclosure Day'],
  });
  const decoded = decodePlannerFilters(path.split('?')[1]);
  assert.deepEqual(decoded.preferredFilms, ['Disclosure Day']);
  assert.equal(decoded.filmCount, 'max');
  assert.equal(decoded.advancedOpen, true);
  assert.match(path, /from=marathon/);
});

test('buildPlannerPathFromMarathon maps blacklist to exclude params', () => {
  const path = buildPlannerPathFromMarathon({
    blacklist: ['Project Hail Mary'],
    preferredMovies: ['Sinners'],
  });
  const decoded = decodePlannerFilters(path.split('?')[1]);
  assert.deepEqual(decoded.excludeFilms, ['Project Hail Mary']);
  assert.deepEqual(decoded.preferredFilms, ['Sinners']);
  assert.equal(decoded.advancedOpen, true);
});

test('parseMarathonStoredFilters reads legacy localStorage shape', () => {
  const parsed = parseMarathonStoredFilters(
    JSON.stringify({
      blacklist: ['Project Hail Mary'],
      preferred_movies: ['Sinners'],
    }),
  );
  assert.deepEqual(parsed.blacklist, ['Project Hail Mary']);
  assert.deepEqual(parsed.preferredMovies, ['Sinners']);
});

test('buildPlannerPathFromMarathon handles malformed localStorage safely', () => {
  const storage = { getItem: () => '{not json' };
  const path = buildPlannerPathFromMarathon(storage);
  assert.match(path, /count=max/);
  assert.match(path, /from=marathon/);
});

test('mapMarathonFiltersToPlanner includes advanced=1 only when filters exist', () => {
  const empty = mapMarathonFiltersToPlanner(null);
  assert.equal(empty.get('advanced'), null);
  assert.equal(empty.get('from'), 'marathon');

  const withFilters = mapMarathonFiltersToPlanner({
    blacklist: ['Sinners'],
    preferredMovies: [],
  });
  assert.equal(withFilters.get('advanced'), '1');
  assert.deepEqual(withFilters.getAll('exclude'), ['Sinners']);
});
