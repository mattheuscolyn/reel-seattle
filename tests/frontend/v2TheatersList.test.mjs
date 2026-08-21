import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THEATERS_MOCKUP_FIXTURE,
  THEATERS_SECTION_ORDER,
  getTheatersMockupPresentation,
  resolveTheatersPresentation,
} from '../../v2/fixtures/theatersMockupFixture.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  PRIMARY_DESTINATIONS,
  resolveActivePrimaryId,
  REJECTED_PRIMARY_NAV_LABELS,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  getFavoriteTheaters,
} from '../../v2/stores/favoriteTheatersStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
} from '../../v2/stores/savedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const THEATERS_SRC = readFileSync(
  join(ROOT, 'v2/theaters/TheatersSurface.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/theatersMockupFixture.js'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const NAV_SRC = readFileSync(join(ROOT, 'v2/PrimaryNav.jsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('Theaters fixture matches canonical mockup regions', () => {
  const p = getTheatersMockupPresentation();
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p, THEATERS_MOCKUP_FIXTURE);
  assert.equal(resolveTheatersPresentation(), p);
  assert.equal(p.pageTitle, 'Theaters');
  assert.equal(p.pageTagline, 'Seattle theaters showing the films you love.');
  assert.equal(p.countLabel, '8 theaters');
  assert.equal(p.filtersLabel, 'Filters');
  assert.equal(p.theaters.length, 8);
  assert.equal(p.theaters[0].name, 'SIFF Cinema Downtown');
  assert.equal(p.theaters[0].initiallyExpanded, false);
  assert.equal(p.theaters[0].nowShowing.length, 5);
  assert.equal(p.theaters[0].nowShowing[0].title, 'Blue Hour');
  assert.equal(p.theaters[1].name, 'The Beacon Cinema');
  assert.deepEqual([...THEATERS_SECTION_ORDER], [
    'header',
    'controls',
    'theaterList',
  ]);
});

test('Theaters designed page replaces CollectionSurface scaffold', () => {
  assert.match(APP_SRC, /TheatersSurface/);
  assert.match(APP_SRC, /isTheatersList/);
  assert.match(THEATERS_SRC, /data-theaters-source/);
  assert.match(THEATERS_SRC, /data-theaters-section="header"/);
  assert.match(THEATERS_SRC, /data-theaters-section="controls"/);
  assert.match(THEATERS_SRC, /data-theaters-section="theaterList"/);
  assert.equal(THEATERS_SRC.includes('Explore · scaffold'), false);
  assert.match(CSS, /\.v2-theaters-page\b/);
  assert.match(CSS, /\.v2-theaters-card\b/);
  assert.match(CSS, /\.v2-theaters-now\b/);
});

test('Theaters page starts with all cards collapsed', () => {
  assert.match(THEATERS_SRC, /useState\(null\)/);
  assert.equal(THEATERS_SRC.includes('theaters[0]?.id'), false);
  assert.equal(THEATERS_SRC.includes('initiallyExpanded'), false);
  const p = getTheatersMockupPresentation();
  assert.ok(p.theaters.every((theater) => theater.initiallyExpanded === false));
});

test('Theaters list does not offer theater Save', () => {
  assert.equal(THEATERS_SRC.includes('saveLabel'), false);
  assert.equal(THEATERS_SRC.includes('IconBookmark'), false);
  assert.equal(THEATERS_SRC.includes('`save-${theater.id}`'), false);
  assert.equal(Object.hasOwn(resolveTheatersPresentation(), 'saveLabel'), false);
});

test('Expanded Now showing is unified; rejected section labels absent', () => {
  assert.match(THEATERS_SRC, /data-theaters-region="nowShowing"/);
  assert.match(THEATERS_SRC, /nowShowingLabel/);
  assert.equal(THEATERS_SRC.includes('Next showing'), false);
  assert.equal(THEATERS_SRC.includes('This week'), false);
  assert.equal(THEATERS_SRC.includes('See this week'), false);
  const blob = JSON.stringify(resolveTheatersPresentation());
  assert.equal(blob.includes('Next showing'), false);
  assert.equal(blob.includes('See this week'), false);
});

test('Theaters is not a primary bottom-nav tab', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.id),
    ['home', 'explore', 'planner', 'profile'],
  );
  assert.ok(REJECTED_PRIMARY_NAV_LABELS.includes('Theaters'));
  assert.equal(NAV_SRC.includes(">Theaters<"), false);
  assert.equal(NAV_SRC.includes("'theaters'"), false);
});

test('Expand controls and stubs are accessible buttons', () => {
  assert.match(THEATERS_SRC, /aria-expanded/);
  assert.match(THEATERS_SRC, /aria-controls/);
  assert.match(THEATERS_SRC, /favoriteLabel\} \$\{theater\.name\}/);
  assert.match(THEATERS_SRC, /moreDetailsLabel\} for \$\{theater\.name\}/);
  assert.match(THEATERS_SRC, /toggleExpand/);
});

test('Beacon More details opens Theater Detail; list favorite still stubbed', () => {
  assert.match(THEATERS_SRC, /onOpenTheaterDetail/);
  assert.match(THEATERS_SRC, /THEATER_DETAIL_DEFAULT_THEATER_ID/);
  assert.equal(/localStorage/.test(THEATERS_SRC), false);
  assert.equal(THEATERS_SRC.includes('favoriteTheatersStore'), false);
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
  assert.equal(FIXTURE_SRC.includes('theaters.json'), false);
  const storage = memoryStorage();
  assert.equal(getFavoriteTheaters(storage).length, 0);
  assert.equal(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY), null);
});

test('Explore → Theaters keeps Explore active; Back restores Explore', () => {
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.theaters,
    originPrimary: 'explore',
  });
  assert.equal(nav.surface?.collectionId, 'theaters');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'explore',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'explore');
});

test('Opening This Week and Search Film Detail paths unchanged', () => {
  let nav = createInitialNavState();
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.openingThisWeek,
    originPrimary: 'home',
  });
  assert.equal(nav.surface?.collectionId, 'opening-this-week');
  nav = openCollection(createInitialNavState(), {
    collectionId: COLLECTION_IDS.searchResults,
    originPrimary: 'explore',
    query: 'siff',
  });
  nav = openFilmDetail(nav, {
    filmKey: 'alpha',
    opportunityKey: null,
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'film-detail');
  nav = navigateBack(nav);
  assert.equal(nav.surface?.collectionId, 'search-results');
});
