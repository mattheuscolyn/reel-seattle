import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlannerFilmCatalog,
  filterPlannerFilmsBySearch,
  resolvePlannerFilmToken,
  suggestPlannerFilmMatch,
  validatePlannerFilmTokens,
} from '../../src/utils/plannerFilms.js';

const rows = [
  {
    Date: '06/29/2026',
    Theater: 'The Beacon',
    Film: 'Sinners',
    showtime_film_key: 'sinners',
    posterDynamic: 'https://example.com/sinners.jpg',
    isCanceled: 'False',
  },
  {
    Date: '06/29/2026',
    Theater: 'AMC Pacific Place 11',
    Film: 'Sinners',
    showtime_film_key: 'sinners',
    posterDynamic: '',
    isCanceled: 'False',
  },
  {
    Date: '06/29/2026',
    Theater: 'The Beacon',
    Film: 'Materialists',
    showtime_film_key: 'materialists',
    posterDynamic: '',
    isCanceled: 'False',
  },
  {
    Date: '06/30/2026',
    Theater: 'The Beacon',
    Film: 'Other Day',
    showtime_film_key: 'other-day',
    posterDynamic: '',
    isCanceled: 'False',
  },
];

test('buildPlannerFilmCatalog filters by date and theaters', () => {
  const allTheaters = buildPlannerFilmCatalog(rows, { date: '06/29/2026' });
  assert.equal(allTheaters.length, 2);
  assert.equal(allTheaters[0].title, 'Materialists');

  const beaconOnly = buildPlannerFilmCatalog(rows, {
    date: '06/29/2026',
    theaters: ['The Beacon'],
  });
  assert.equal(beaconOnly.length, 2);
  assert.equal(beaconOnly.find((film) => film.key === 'sinners').theaterCount, 1);
});

test('filterPlannerFilmsBySearch matches partial titles', () => {
  const catalog = buildPlannerFilmCatalog(rows, { date: '06/29/2026' });
  const matches = filterPlannerFilmsBySearch(catalog, 'sin');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].key, 'sinners');
});

test('resolvePlannerFilmToken accepts keys and legacy titles', () => {
  const catalog = buildPlannerFilmCatalog(rows, { date: '06/29/2026' });
  assert.equal(resolvePlannerFilmToken('sinners', catalog)?.title, 'Sinners');
  assert.equal(resolvePlannerFilmToken('Sinners', catalog)?.key, 'sinners');
});

test('validatePlannerFilmTokens reports matched and unmatched tokens', () => {
  const catalog = buildPlannerFilmCatalog(rows, { date: '06/29/2026' });
  const results = validatePlannerFilmTokens(['sinners', 'Dark Knigt'], catalog);
  assert.equal(results[0].status, 'matched');
  assert.equal(results[1].status, 'unmatched');
});

test('suggestPlannerFilmMatch proposes a single near miss', () => {
  const catalog = buildPlannerFilmCatalog(rows, { date: '06/29/2026' });
  assert.equal(suggestPlannerFilmMatch('mater', catalog)?.key, 'materialists');
});
