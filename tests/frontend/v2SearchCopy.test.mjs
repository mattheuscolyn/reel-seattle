import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEARCH_CAPABILITY_NOTE,
  SEARCH_EMPTY_BODY,
  SEARCH_EMPTY_QUERY_SUMMARY,
  SEARCH_PLACEHOLDER,
  formatSearchSummary,
  productionSearchCopyPromisesPeople,
} from '../../v2/explore/searchCopy.js';
import {
  buildSearchResultsModel,
  SEARCH_TYPE_FILTERS,
} from '../../v2/explore/searchResultsModel.js';
import {
  addIsoDays,
  normalizeSearchQuery,
  pacificDateString,
  searchExplore,
} from '../../v2/explore/exploreCatalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EXPLORE_SEARCH = readFileSync(
  join(ROOT, 'v2/explore/ExploreSearch.jsx'),
  'utf8',
);
const SEARCH_SURFACE = readFileSync(
  join(ROOT, 'v2/surfaces/SearchResultsSurface.jsx'),
  'utf8',
);

function sampleHome() {
  const today = pacificDateString();
  const tomorrow = addIsoDays(today, 1);
  return {
    films: [
      {
        filmKey: 'alpha',
        title: 'Alpha Night',
        sourceTitle: 'Alpha Night',
        parentDisplayTitle: 'Alpha Night',
        posterUrl: 'https://example.com/a.jpg',
        runtimeMin: 100,
        showtimeCount: 3,
        theaterCount: 2,
      },
      {
        filmKey: 'beta',
        title: 'Beta Dawn',
        sourceTitle: 'Beta Dawn',
        runtimeMin: 110,
        showtimeCount: 1,
        theaterCount: 1,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'o1',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'SIFF Uptown',
        localDate: today,
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: `${today}T19:00`,
        formatLabels: ['imax-at-amc'],
      },
      {
        opportunityKey: 'o2',
        filmKey: 'beta',
        theaterId: 't2',
        theaterName: 'Central Cinema',
        localDate: tomorrow,
        timeDisplay: '8:00 PM',
        sortableLocalDateTime: `${tomorrow}T20:00`,
        formatLabels: ['35mm'],
      },
    ],
    theatersById: {
      t1: {
        id: 't1',
        name: 'SIFF Uptown',
        neighborhood: 'Lower Queen Anne',
        city: 'Seattle',
        opportunityCount: 1,
      },
      t2: {
        id: 't2',
        name: 'Central Cinema',
        neighborhood: 'Central District',
        city: 'Seattle',
        opportunityCount: 1,
      },
    },
  };
}

test('canonical production placeholder excludes person/cast/director promises', () => {
  assert.equal(SEARCH_PLACEHOLDER, 'Search movies, theaters, and formats');
  assert.equal(productionSearchCopyPromisesPeople(SEARCH_PLACEHOLDER), false);
  assert.equal(productionSearchCopyPromisesPeople(SEARCH_CAPABILITY_NOTE), false);
  assert.equal(productionSearchCopyPromisesPeople(SEARCH_EMPTY_BODY), false);
  assert.equal(
    productionSearchCopyPromisesPeople('Search by title, person, or keyword'),
    true,
  );
});

test('Explore and Search Results use the canonical placeholder and labeled input', () => {
  assert.match(EXPLORE_SEARCH, /SEARCH_PLACEHOLDER/);
  assert.match(EXPLORE_SEARCH, /htmlFor=\{inputId\}/);
  assert.match(EXPLORE_SEARCH, /placeholder=\{SEARCH_PLACEHOLDER\}/);
  assert.equal(EXPLORE_SEARCH.includes('person'), false);
  assert.match(SEARCH_SURFACE, /SEARCH_PLACEHOLDER/);
  assert.match(SEARCH_SURFACE, /htmlFor=\{searchInputId\}/);
  assert.equal(SEARCH_SURFACE.includes('person'), false);
  assert.equal(SEARCH_SURFACE.includes('director'), false);
});

test('result summary singular plural and empty grammar', () => {
  assert.equal(formatSearchSummary('', 0), SEARCH_EMPTY_QUERY_SUMMARY);
  assert.equal(formatSearchSummary('Alien', 0), 'No results for ‘Alien’');
  assert.equal(formatSearchSummary('Alien', 1), '1 result for ‘Alien’');
  assert.equal(formatSearchSummary('Alien', 18), '18 results for ‘Alien’');

  const home = sampleHome();
  const one = buildSearchResultsModel(home, 'Alpha Night');
  assert.equal(one.totalCount, 1);
  assert.equal(one.summary, '1 result for ‘Alpha Night’');
  assert.equal(one.emptyBody, null);
  assert.deepEqual(one.people, []);
  assert.deepEqual(one.collections, []);
  assert.equal(one.personSearchSupported, false);

  const many = buildSearchResultsModel(home, 'a');
  assert.ok(many.totalCount > 1);
  assert.match(many.summary, /^\d+ results for ‘a’$/);
  assert.equal(many.totalCount, many.films.length + many.theaters.length + many.formats.length);
  assert.equal(many.people.length, 0);

  const none = buildSearchResultsModel(home, 'Kubrick');
  assert.equal(none.totalCount, 0);
  assert.equal(none.summary, 'No results for ‘Kubrick’');
  assert.equal(none.emptyBody, SEARCH_EMPTY_BODY);
  assert.match(none.emptyBody, /movie, theater, or format/i);
});

test('searchable fields: title theater format case whitespace; not directors', () => {
  const home = sampleHome();
  assert.equal(normalizeSearchQuery('  Alpha   Night  '), 'Alpha Night');

  const title = buildSearchResultsModel(home, '  alpha  ');
  assert.ok(title.films.some((f) => f.filmKey === 'alpha'));

  const theater = buildSearchResultsModel(home, 'SIFF');
  assert.ok(theater.theaters.some((t) => t.id === 't1'));

  const format = buildSearchResultsModel(home, 'imax');
  assert.ok(format.formats.some((f) => /imax/i.test(f.name) || /imax/i.test(f.tag)));

  const director = buildSearchResultsModel(home, 'Kubrick');
  assert.equal(director.films.length, 0);
  assert.equal(director.people.length, 0);

  const actor = buildSearchResultsModel(home, 'Tom Cruise');
  assert.equal(actor.totalCount, 0);

  const empty = buildSearchResultsModel(home, '   ');
  assert.equal(empty.emptyReason, 'empty-query');
  assert.equal(empty.summary, SEARCH_EMPTY_QUERY_SUMMARY);
  assert.equal(empty.totalCount, 0);

  const explore = searchExplore(home, '35mm');
  assert.ok(explore.formats.length >= 1);
  assert.equal(explore.personSearchSupported, false);
});

test('type chips are movies theaters formats only; no People chip', () => {
  const ids = SEARCH_TYPE_FILTERS.map((f) => f.id);
  assert.deepEqual(ids, ['all', 'movies', 'theaters', 'formats']);
  assert.equal(ids.includes('people'), false);

  const home = sampleHome();
  const movies = buildSearchResultsModel(home, 'a', { typeFilter: 'movies' });
  assert.equal(movies.theaters.length, 0);
  assert.equal(movies.formats.length, 0);
  assert.ok(movies.films.length > 0);

  const theaters = buildSearchResultsModel(home, 'Cinema', {
    typeFilter: 'theaters',
  });
  assert.equal(theaters.films.length, 0);
  assert.equal(theaters.formats.length, 0);

  const formats = buildSearchResultsModel(home, 'imax', {
    typeFilter: 'formats',
  });
  assert.equal(formats.films.length, 0);
  assert.equal(formats.theaters.length, 0);
  assert.ok(formats.formats.length > 0);
});

test('hidden future groups do not inflate totals or render in production source', () => {
  const home = sampleHome();
  const model = buildSearchResultsModel(home, 'Alpha');
  assert.equal(
    model.totalCount,
    model.films.length + model.theaters.length + model.formats.length,
  );
  assert.equal(model.people.length, 0);
  assert.equal(model.collections.length, 0);
  assert.equal(SEARCH_SURFACE.includes('model.people'), false);
  assert.equal(/People/.test(SEARCH_SURFACE), false);
  assert.equal(/aria-labelledby="v2-search-people/.test(SEARCH_SURFACE), false);
  assert.equal(/aria-labelledby="v2-search-collections/.test(SEARCH_SURFACE), false);
});
