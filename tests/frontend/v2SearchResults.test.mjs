import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchResultsModel,
  countAdvancedFilters,
  rankSearchFilms,
  searchFormats,
} from '../../v2/explore/searchResultsModel.js';
import {
  addIsoDays,
  normalizeSearchQuery,
  pacificDateString,
} from '../../v2/explore/exploreCatalog.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  selectPrimaryDestination,
  updateSearchUi,
} from '../../v2/navigation/navState.js';
import {
  PRIMARY_DESTINATIONS,
  REJECTED_PRIMARY_NAV_LABELS,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import { addRecentSearch } from '../../v2/explore/recentSearchesStore.js';
import { dismissFilm } from '../../v2/explore/dismissedFilmsStore.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function sampleHome() {
  const today = pacificDateString();
  const tomorrow = addIsoDays(today, 1);
  return {
    films: [
      {
        filmKey: 'alpha',
        title: 'Alpha Night',
        sourceTitle: 'Alpha Night',
        posterUrl: 'https://example.com/a.jpg',
        runtimeMin: 100,
        showtimeCount: 3,
        theaterCount: 2,
      },
      {
        filmKey: 'alphabet',
        title: 'Alphabet City',
        sourceTitle: 'Alphabet City',
        posterUrl: null,
        runtimeMin: 90,
        showtimeCount: 1,
        theaterCount: 1,
      },
      {
        filmKey: 'beta',
        title: 'Beta Dawn',
        sourceTitle: 'Beta Dawn',
        posterUrl: null,
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
        filmKey: 'alphabet',
        theaterId: 't2',
        theaterName: 'Central Cinema',
        localDate: tomorrow,
        timeDisplay: '8:00 PM',
        sortableLocalDateTime: `${tomorrow}T20:00`,
        formatLabels: ['70mm'],
      },
      {
        opportunityKey: 'o3',
        filmKey: 'beta',
        theaterId: 't2',
        theaterName: 'Central Cinema',
        localDate: tomorrow,
        timeDisplay: '9:00 PM',
        sortableLocalDateTime: `${tomorrow}T21:00`,
        formatLabels: [],
      },
    ],
    theatersById: {
      t1: {
        id: 't1',
        name: 'SIFF Uptown',
        city: 'Seattle',
        neighborhood: 'Queen Anne',
        opportunityCount: 1,
      },
      t2: {
        id: 't2',
        name: 'Central Cinema',
        city: 'Seattle',
        neighborhood: 'Central District',
        opportunityCount: 2,
      },
    },
  };
}

test('primary nav remains Home / Explore / Planner / Profile; Saved absent', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.label),
    ['Home', 'Explore', 'Planner', 'Profile'],
  );
  assert.ok(REJECTED_PRIMARY_NAV_LABELS.includes('Saved'));
});

test('empty submission does not produce search matches', () => {
  assert.equal(normalizeSearchQuery('  '), '');
  const model = buildSearchResultsModel(sampleHome(), '   ');
  assert.equal(model.totalCount, 0);
  assert.equal(model.emptyReason, 'empty-query');
});

test('result summary uses actual total across categories', () => {
  const model = buildSearchResultsModel(sampleHome(), 'Central');
  assert.ok(model.theaters.length >= 1);
  assert.equal(
    model.totalCount,
    model.films.length + model.theaters.length + model.formats.length,
  );
  assert.match(model.summary, /result/);
  assert.match(model.summary, /Central/);
});

test('All / Movies / Theaters / Formats filters scope categories', () => {
  const all = buildSearchResultsModel(sampleHome(), 'a', { typeFilter: 'all' });
  assert.ok(all.films.length >= 1);
  const movies = buildSearchResultsModel(sampleHome(), 'a', {
    typeFilter: 'movies',
  });
  assert.equal(movies.theaters.length, 0);
  assert.equal(movies.formats.length, 0);
  const theaters = buildSearchResultsModel(sampleHome(), 'Cinema', {
    typeFilter: 'theaters',
  });
  assert.equal(theaters.films.length, 0);
  assert.ok(theaters.theaters.length >= 1);
  const formats = buildSearchResultsModel(sampleHome(), 'imax', {
    typeFilter: 'formats',
  });
  assert.equal(formats.films.length, 0);
  assert.ok(formats.formats.length >= 1);
});

test('Today and This week use Pacific date semantics', () => {
  const today = pacificDateString();
  const todayModel = buildSearchResultsModel(sampleHome(), 'Alpha', {
    typeFilter: 'movies',
    timeFilter: 'today',
  });
  assert.equal(todayModel.films.length, 1);
  assert.equal(todayModel.films[0].filmKey, 'alpha');
  assert.ok(todayModel.films[0].showtimeChip);
  assert.match(todayModel.films[0].showtimeChip.label, /Tonight|PM|AM/i);

  const week = buildSearchResultsModel(sampleHome(), 'Alpha', {
    typeFilter: 'movies',
    timeFilter: 'this-week',
  });
  assert.ok(week.films.some((f) => f.filmKey === 'alpha'));
  assert.equal(today, pacificDateString());
});

test('film ordering is deterministic: exact/prefix before contains', () => {
  const ranked = rankSearchFilms(
    sampleHome().films.filter((f) => /alpha/i.test(f.title)),
    'Alpha',
    sampleHome(),
  );
  assert.equal(ranked[0].filmKey, 'alpha');
});

test('unsupported person search produces no fictional person results', () => {
  const model = buildSearchResultsModel(sampleHome(), 'Kurosawa');
  assert.equal(model.personSearchSupported, false);
  // Sample fixtures lack filmId + enrichmentIndex — no fabricated person/metadata hits.
  assert.equal(model.films.every((f) => f.director == null), true);
  assert.equal(model.films.every((f) => f.year == null), true);
  assert.equal(model.films.every((f) => f.synopsis == null), true);
});

test('null filmId keeps search result without enrichment fields', () => {
  const model = buildSearchResultsModel(sampleHome(), 'Alpha Night');
  const row = model.films.find((f) => f.filmKey === 'alpha');
  assert.ok(row);
  assert.equal(row.filmId, null);
  assert.equal(row.year, null);
  assert.equal(row.genre, null);
  assert.equal(row.synopsis, null);
  assert.equal(row.rating, null);
  assert.ok(row.metaLine); // runtime remains
  assert.equal(row.posterUrl, 'https://example.com/a.jpg');
});

test('Search Results surface reuses shared enrichmentIndex (no second fetch)', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const source = readFileSync(
    join(root, 'v2/surfaces/SearchResultsSurface.jsx'),
    'utf8',
  );
  assert.equal(source.includes('loadFilmEnrichment'), false);
  assert.equal(source.includes('enrichmentIndex'), true);
  assert.equal(source.includes('v2-search-expand-synopsis'), true);
});

test('search results surface uses restrained violet class names', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const css = readFileSync(join(root, 'v2/v2.css'), 'utf8');
  assert.match(css, /\.v2-search-chip-active[\s\S]*?--v2-accent/);
  assert.match(css, /\.v2-search-more[\s\S]*?--v2-accent/);
  assert.match(css, /\.v2-search-showtime-chip\s*\{[^}]*border:\s*1px solid var\(--v2-border\)/);
  assert.equal(css.includes('background: var(--v2-accent)'), true);
  // Showtime chips must not use accent fill
  const chipBlock = css.match(/\.v2-search-showtime-chip\s*\{[^}]+\}/)?.[0] ?? '';
  assert.equal(chipBlock.includes('--v2-accent'), false);
});

test('advanced filters count and format search work', () => {
  assert.equal(countAdvancedFilters({ theaterIds: ['t1'], formatTags: [] }), 1);
  const formats = searchFormats(sampleHome(), 'imax');
  assert.ok(formats.some((f) => /imax/i.test(f.tag) || /imax/i.test(f.name)));
});

test('Not interested keys remove films from search model', () => {
  const dismissed = dismissFilm('alpha', []);
  const model = buildSearchResultsModel(sampleHome(), 'Alpha', {
    dismissedKeys: dismissed,
  });
  assert.equal(model.films.some((f) => f.filmKey === 'alpha'), false);
});

test('Search Results nav keeps Explore active; Film Detail restores searchUi', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.searchResults,
    query: 'Alpha',
    searchUi: { typeFilter: 'movies', expandedFilmKey: 'alpha' },
  });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  nav = updateSearchUi(nav, { timeFilter: 'today', scrollY: 120 });
  assert.equal(nav.surface.searchUi.timeFilter, 'today');
  nav = openFilmDetail(nav, {
    filmKey: 'alpha',
    opportunityKey: 'o1',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  const back = navigateBack(nav);
  assert.equal(back.surface?.collectionId, COLLECTION_IDS.searchResults);
  assert.equal(back.surface?.query, 'Alpha');
  assert.equal(back.surface?.searchUi?.expandedFilmKey, 'alpha');
});

test('recent searches still update on successful submission helper', () => {
  const list = addRecentSearch('Alpha', addRecentSearch('IMAX', []));
  assert.deepEqual(list, ['Alpha', 'IMAX']);
});

test('Search Results Save uses shared store helpers', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const source = readFileSync(
    join(root, 'v2/surfaces/SearchResultsSurface.jsx'),
    'utf8',
  );
  assert.match(source, /filmRefFromHomeFilm/);
  assert.match(source, /applySaveToggle/);
  assert.match(source, /aria-pressed=\{isSaved\}/);
  assert.match(source, /Not interested/);
  assert.equal(source.includes('Save is not available yet'), false);
});
