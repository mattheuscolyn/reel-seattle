import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPENING_THIS_WEEK_MOCKUP_FIXTURE,
  OPENING_THIS_WEEK_SECTION_ORDER,
  getOpeningThisWeekMockupPresentation,
  resolveOpeningThisWeekPresentation,
} from '../../v2/fixtures/openingThisWeekMockupFixture.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import { resolveActivePrimaryId } from '../../v2/destinations.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
} from '../../v2/stores/savedFilmsStore.js';
import {
  aggregateOpeningTheaters,
  formatCompactTheaterLine,
} from '../../v2/opening/buildLiveOpeningPresentation.js';
import {
  filterOpeningFilms,
  sortOpeningFilms,
} from '../../v2/opening/openingListControls.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OPENING_SRC = readFileSync(
  join(ROOT, 'v2/opening/OpeningThisWeekSurface.jsx'),
  'utf8',
);
const SHELL_SRC = readFileSync(
  join(ROOT, 'v2/homeShelfDetail/HomeShelfDetailSurface.jsx'),
  'utf8',
);
const CARD_SRC = readFileSync(
  join(ROOT, 'v2/homeShelfDetail/HomeShelfDetailFilmCard.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/openingThisWeekMockupFixture.js'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const COLLECTION_SRC = readFileSync(
  join(ROOT, 'v2/surfaces/CollectionSurface.jsx'),
  'utf8',
);
const HOME_SRC = readFileSync(join(ROOT, 'v2/HomeDestination.jsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('Opening This Week fixture matches canonical mockup regions', () => {
  const p = getOpeningThisWeekMockupPresentation();
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p, OPENING_THIS_WEEK_MOCKUP_FIXTURE);
  assert.equal(resolveOpeningThisWeekPresentation(), p);
  assert.equal(p.pageTitle, 'Opening This Week');
  assert.equal(p.pageSubtitle, null);
  assert.equal(p.countLabel, null);
  assert.equal(p.sortValue, 'Opening date');
  assert.equal(p.filtersLabel, 'Filters');
  assert.equal(p.films.length, 4);
  assert.equal(p.films[0].title, 'The Long Horizon');
  assert.equal(p.films[0].badge, 'New');
  assert.equal(p.films[0].initiallyExpanded, false);
  assert.equal(p.films[0].formatLabel, '70MM');
  assert.match(p.films[0].whySeeIt, /70mm/);
  assert.equal(
    p.films[0].theaterName,
    'Paramount Theatre · SIFF Cinema Uptown',
  );
  assert.equal(p.films[0].theaters.length, 2);
  assert.equal(p.films[1].badge, 'Revival');
  assert.equal(p.films[2].badge, 'Special Event');
  assert.deepEqual([...OPENING_THIS_WEEK_SECTION_ORDER], [
    'header',
    'categories',
    'controls',
    'filmList',
  ]);
});

test('Opening This Week omits redundant Seattle intro copy', () => {
  assert.equal(FIXTURE_SRC.includes('Films opening in Seattle this week'), false);
  assert.equal(OPENING_SRC.includes('Films opening in Seattle this week'), false);
  assert.equal(OPENING_SRC.includes('pageSubtitle'), false);
  assert.equal(SHELL_SRC.includes('Films opening in Seattle this week'), false);
});

test('Opening This Week renders through shared Home shelf-detail surface', () => {
  assert.match(OPENING_SRC, /HomeShelfDetailSurface/);
  assert.match(OPENING_SRC, /HomeShelfDetailFilmCard/);
  assert.match(OPENING_SRC, /from '\.\.\/homeShelfDetail\/HomeShelfDetailSurface\.jsx'/);
  assert.match(SHELL_SRC, /data-shelf-detail-surface/);
  assert.match(SHELL_SRC, /data-shelf-detail-section="header"/);
  assert.match(SHELL_SRC, /data-shelf-detail-section="categories"/);
  assert.match(SHELL_SRC, /data-shelf-detail-section="controls"/);
  assert.match(SHELL_SRC, /data-shelf-detail-section="filmList"/);
  // No duplicated legacy page shell left in the OTW wrapper.
  assert.equal(OPENING_SRC.includes('className="v2-opening-page"'), false);
  assert.equal(OPENING_SRC.includes('className="v2-shelf-detail-page"'), false);
  assert.equal(OPENING_SRC.includes('function OpeningFilmCard'), false);
});

test('Opening designed page replaces CollectionSurface scaffold', () => {
  assert.match(APP_SRC, /OpeningThisWeekSurface/);
  assert.match(APP_SRC, /isOpeningThisWeek/);
  assert.match(OPENING_SRC, /data-opening-source/);
  assert.equal(OPENING_SRC.includes('Explore · scaffold'), false);
  assert.equal(
    COLLECTION_SRC.includes('opening-this-week') &&
      COLLECTION_SRC.includes('buildOpeningThisWeekShelf'),
    false,
  );
  assert.match(CSS, /\.v2-shelf-detail-page\b/);
  assert.match(CSS, /\.v2-shelf-detail-card\b/);
  assert.equal(CSS.includes('.v2-opening-card {'), false);
  assert.equal(CSS.includes('.v2-opening-page {'), false);
});

test('Opening page starts with all cards collapsed', () => {
  assert.match(OPENING_SRC, /useState\(null\)/);
  assert.equal(OPENING_SRC.includes('films[0]?.filmKey'), false);
  assert.equal(OPENING_SRC.includes('initiallyExpanded'), false);
  const p = getOpeningThisWeekMockupPresentation();
  assert.ok(p.films.every((film) => film.initiallyExpanded === false));
});

test('Opening page keeps title, pills, sort, filters, and film cards', () => {
  assert.match(OPENING_SRC, /pageTitle/);
  assert.match(OPENING_SRC, /showCategoryChips|categoryChips/);
  assert.match(OPENING_SRC, /v2-shelf-detail-page-sort/);
  assert.match(OPENING_SRC, /v2-shelf-detail-page-filters/);
  assert.match(OPENING_SRC, /OPENING_SORT_OPTIONS/);
  assert.match(SHELL_SRC, /v2-shelf-detail-chip-row/);
  assert.match(CARD_SRC, /aria-expanded/);
  assert.match(CARD_SRC, /Why see it/);
  assert.match(CARD_SRC, /Also playing at/);
  assert.match(CARD_SRC, /More details/);
  assert.match(CARD_SRC, /Showtimes/);
  assert.match(OPENING_SRC, /toggleExpand/);
});

test('shared shelf-detail surface omits optional controls without broken markers', () => {
  assert.match(SHELL_SRC, /showCategories/);
  assert.match(SHELL_SRC, /controls \?/);
  assert.match(SHELL_SRC, /categoryChips/);
  // Optional rows are gated; no forced empty chip/control chrome.
  assert.match(SHELL_SRC, /chips\.length > 0/);
  assert.equal(SHELL_SRC.includes('must render categories'), false);
});

test('theater aggregation and sort/filter behavior remain OTW-owned', () => {
  const theaters = aggregateOpeningTheaters(
    [
      { theaterId: 'a', theaterName: 'AMC Pacific Place 11' },
      { theaterId: 'a', theaterName: 'AMC Pacific Place 11' },
      { theaterId: 'b', theaterName: 'SIFF Cinema Uptown' },
      { theaterId: 'c', theaterName: 'The Beacon Cinema' },
    ],
    [],
    {},
  );
  assert.equal(theaters.length, 3);
  assert.equal(
    formatCompactTheaterLine(theaters.map((t) => t.name)),
    'AMC Pacific Place 11 · SIFF Cinema Uptown · +1 more',
  );

  const films = getOpeningThisWeekMockupPresentation().films;
  assert.equal(sortOpeningFilms(films, 'most-showtimes')[0].title, 'The Long Horizon');
  const filtered = filterOpeningFilms(films, {
    theaterId: 'the-beacon-cinema',
    formatLabel: '35MM',
    openingDate: '2025-05-24',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].title, 'The Cabinet of Dr. Caligari');
  assert.match(OPENING_SRC, /filterOpeningFilms/);
  assert.match(OPENING_SRC, /sortOpeningFilms/);
});

test('More details wires to Film Detail; Save/NI use shared film stores', () => {
  assert.match(OPENING_SRC, /onOpenFilmDetail/);
  assert.match(CARD_SRC, /onOpenFilmDetail/);
  assert.match(OPENING_SRC, /savedFilmsStore/);
  assert.match(OPENING_SRC, /notInterestedFilmsStore/);
  assert.match(OPENING_SRC, /toggleSavedFilm/);
  assert.match(CARD_SRC, /Showtimes/);
  assert.equal(OPENING_SRC.includes('applySaveToggle'), false);
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  const storage = memoryStorage();
  assert.equal(getSavedFilms(storage).length, 0);
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), null);
});

test('Home See all opens Opening with Home origin and Back restores', () => {
  assert.match(HOME_SRC, /originPrimary: 'home'/);
  assert.match(HOME_SRC, /COLLECTION_IDS\.openingThisWeek/);
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'home');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.openingThisWeek,
    originPrimary: 'home',
  });
  assert.equal(nav.surface?.collectionId, 'opening-this-week');
  assert.equal(nav.surface?.originPrimary, 'home');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'home',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'home');
});

test('Home shelf still uses verified opening helper', () => {
  assert.match(HOME_SRC, /buildOpeningThisWeekShelf/);
  assert.equal(FIXTURE_SRC.includes('newly-added-provisional'), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
});

test('no new shelf-detail routes were added for unimplemented Home shelves', () => {
  assert.match(APP_SRC, /OpeningThisWeekSurface/);
  assert.match(APP_SRC, /LeavingSoonSurface/);
  assert.match(APP_SRC, /JustAnnouncedSurface/);
  assert.match(APP_SRC, /SpecialPresentationsSurface/);
});

test('Opening does not change Search Results Film Detail path', () => {
  let nav = createInitialNavState();
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.searchResults,
    originPrimary: 'explore',
    query: 'horizon',
  });
  nav = openFilmDetail(nav, {
    filmKey: 'alpha',
    opportunityKey: null,
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'film-detail');
  assert.equal(nav.surface?.returnSurface?.collectionId, 'search-results');
  nav = navigateBack(nav);
  assert.equal(nav.surface?.collectionId, 'search-results');
});
