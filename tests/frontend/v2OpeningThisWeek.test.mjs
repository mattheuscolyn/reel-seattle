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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OPENING_SRC = readFileSync(
  join(ROOT, 'v2/opening/OpeningThisWeekSurface.jsx'),
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
  assert.equal(
    p.countLabel,
    '18 films opening in theaters across Seattle.',
  );
  assert.equal(p.sortValue, 'Opening date');
  assert.equal(p.filtersLabel, 'Filters');
  assert.equal(p.films.length, 5);
  assert.equal(p.films[0].title, 'The Long Horizon');
  assert.equal(p.films[0].initiallyExpanded, false);
  assert.equal(p.films[0].formatLabel, '70MM');
  assert.match(p.films[0].whySeeIt, /70mm/);
  assert.equal(p.films[1].title, 'Quiet City');
  assert.equal(p.films[4].title, 'Saltwater Road');
  assert.deepEqual([...OPENING_THIS_WEEK_SECTION_ORDER], [
    'header',
    'controls',
    'filmList',
  ]);
});

test('Opening designed page replaces CollectionSurface scaffold', () => {
  assert.match(APP_SRC, /OpeningThisWeekSurface/);
  assert.match(APP_SRC, /isOpeningThisWeek/);
  assert.match(OPENING_SRC, /data-opening-source/);
  assert.match(OPENING_SRC, /data-opening-section="header"/);
  assert.match(OPENING_SRC, /data-opening-section="controls"/);
  assert.match(OPENING_SRC, /data-opening-section="filmList"/);
  assert.equal(OPENING_SRC.includes('Explore · scaffold'), false);
  assert.equal(
    COLLECTION_SRC.includes('opening-this-week') &&
      COLLECTION_SRC.includes('buildOpeningThisWeekShelf'),
    false,
  );
  assert.match(CSS, /\.v2-opening-page\b/);
  assert.match(CSS, /\.v2-opening-card\b/);
});

test('Opening page starts with all cards collapsed', () => {
  assert.match(OPENING_SRC, /useState\(null\)/);
  assert.equal(OPENING_SRC.includes('films[0]?.filmKey'), false);
  assert.equal(OPENING_SRC.includes('initiallyExpanded'), false);
  const p = getOpeningThisWeekMockupPresentation();
  assert.ok(p.films.every((film) => film.initiallyExpanded === false));
});

test('Opening page renders filters and expand affordances', () => {
  assert.match(OPENING_SRC, /v2-opening-page-sort/);
  assert.match(OPENING_SRC, /v2-opening-page-filters/);
  assert.match(OPENING_SRC, /aria-expanded/);
  assert.match(OPENING_SRC, /toggleExpand/);
  assert.match(OPENING_SRC, /Why see it/);
  assert.match(OPENING_SRC, /Also playing at/);
  assert.match(OPENING_SRC, /More details/);
});

test('More details wires to Film Detail without mutating stores', () => {
  assert.match(OPENING_SRC, /onOpenFilmDetail/);
  assert.equal(/localStorage/.test(OPENING_SRC), false);
  assert.equal(OPENING_SRC.includes('savedFilmsStore'), false);
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
    'explore',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'home');
});

test('Home shelf still uses provisional opening helper', () => {
  assert.match(HOME_SRC, /buildOpeningThisWeekShelf/);
  assert.equal(FIXTURE_SRC.includes('newly_added'), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
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
