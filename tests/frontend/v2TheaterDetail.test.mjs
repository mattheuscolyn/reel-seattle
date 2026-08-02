import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THEATER_DETAIL_DEFAULT_THEATER_ID,
  THEATER_DETAIL_MOCKUP_FIXTURE,
  THEATER_DETAIL_SECTION_ORDER,
  getTheaterDetailMockupPresentation,
  resolveTheaterDetailPresentation,
} from '../../v2/fixtures/theaterDetailMockupFixture.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  PRIMARY_DESTINATIONS,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  openTheaterDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  getFavoriteTheaters,
  isTheaterFavorite,
  toggleFavoriteTheater,
} from '../../v2/stores/favoriteTheatersStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE_SRC = readFileSync(
  join(ROOT, 'v2/theaters/TheaterDetailSurface.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/theaterDetailMockupFixture.js'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const NAV_SRC = readFileSync(join(ROOT, 'v2/navigation/navState.js'), 'utf8');
const THEATERS_SRC = readFileSync(
  join(ROOT, 'v2/theaters/TheatersSurface.jsx'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('Theater Detail fixture matches canonical Beacon regions', () => {
  const p = getTheaterDetailMockupPresentation();
  assert.equal(p, THEATER_DETAIL_MOCKUP_FIXTURE);
  assert.equal(resolveTheaterDetailPresentation(), p);
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p.theaterId, THEATER_DETAIL_DEFAULT_THEATER_ID);
  assert.equal(p.name, 'The Beacon Cinema');
  assert.equal(p.addressLabel, '4405 Rainier Ave S, Seattle, WA 98118');
  assert.equal(p.stats.length, 4);
  assert.equal(p.amenities.length, 5);
  assert.equal(p.pricing.rows.length, 4);
  assert.equal(p.hours.rows.length, 5);
  assert.equal(p.nowShowing.films.length, 4);
  assert.equal(p.nowShowing.films[0].title, 'The Long Horizon');
  assert.equal(p.todaysShowtimes.screens.length, 2);
  assert.deepEqual([...THEATER_DETAIL_SECTION_ORDER], [
    'hero',
    'stats',
    'amenities',
    'pricingHours',
    'nowShowing',
    'todaysShowtimes',
  ]);
});

test('Theater Detail page resolver defaults to live production mode', async () => {
  const { resolveTheaterDetailPagePresentation } = await import(
    '../../v2/theaters/resolveTheatersPagePresentation.js'
  );
  const resolved = resolveTheaterDetailPagePresentation({
    theaterId: THEATER_DETAIL_DEFAULT_THEATER_ID,
    homeData: null,
    forceMode: 'mockup-fixture',
  });
  assert.equal(resolved.mode, 'mockup-fixture');
  assert.equal(resolved.presentation, getTheaterDetailMockupPresentation());

  const live = resolveTheaterDetailPagePresentation({
    theaterId: 'missing-id',
    homeData: { theatersById: {} },
  });
  assert.equal(live.mode, 'production');
  assert.equal(live.presentation.notFound, true);
});

test('Theater Detail surface is designed page, not placeholder', () => {
  assert.match(APP_SRC, /TheaterDetailSurface/);
  assert.match(SURFACE_SRC, /data-theater-detail-source/);
  assert.match(SURFACE_SRC, /data-td-section="hero"/);
  assert.match(SURFACE_SRC, /data-td-section="stats"/);
  assert.match(SURFACE_SRC, /data-td-section="amenities"/);
  assert.match(SURFACE_SRC, /data-td-section="pricingHours"/);
  assert.match(SURFACE_SRC, /data-td-section="nowShowing"/);
  assert.match(SURFACE_SRC, /data-td-section="todaysShowtimes"/);
  assert.match(SURFACE_SRC, /aria-labelledby="v2-td-title"/);
  assert.match(SURFACE_SRC, /toggleFavoriteTheater/);
  assert.equal(SURFACE_SRC.includes('v2 shell · placeholder'), false);
  assert.ok(CSS.includes('.v2-td-page'));
});

test('Theaters list wires More details for Beacon only', () => {
  assert.match(THEATERS_SRC, /THEATER_DETAIL_DEFAULT_THEATER_ID/);
  assert.match(THEATERS_SRC, /onOpenTheaterDetail/);
  assert.match(APP_SRC, /handleOpenTheaterDetail/);
  assert.match(APP_SRC, /theaterDetail/);
  assert.match(NAV_SRC, /openTheaterDetail/);
});

test('Explore → Theaters → Detail keeps Explore active; Back restores list', () => {
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.theaters,
    originPrimary: 'explore',
  });
  nav = openTheaterDetail(nav, {
    theaterId: THEATER_DETAIL_DEFAULT_THEATER_ID,
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'theater-detail');
  assert.equal(nav.surface.theaterId, THEATER_DETAIL_DEFAULT_THEATER_ID);
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'explore',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface?.collectionId, 'theaters');
  assert.equal(nav.primaryDestinationId, 'explore');
});

test('Film Detail from Theater Detail returns to Theater Detail on Back', () => {
  let nav = openTheaterDetail(createInitialNavState(), {
    originPrimary: 'explore',
    theaterId: THEATER_DETAIL_DEFAULT_THEATER_ID,
  });
  nav = openFilmDetail(nav, {
    filmKey: 'fixture-theater-long-horizon',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'film-detail');
  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'theater-detail');
});

test('Fixture does not import stores or use localStorage', () => {
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(/localStorage/.test(FIXTURE_SRC), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
  assert.equal(FIXTURE_SRC.includes('theaters.json'), false);
});

test('Favorite toggle uses favoriteTheatersStore on Theater Detail', () => {
  const storage = memoryStorage();
  assert.equal(isTheaterFavorite(storage, THEATER_DETAIL_DEFAULT_THEATER_ID), false);
  const result = toggleFavoriteTheater(storage, {
    theaterId: THEATER_DETAIL_DEFAULT_THEATER_ID,
    name: 'The Beacon Cinema',
  });
  assert.equal(result.ok, true);
  assert.equal(result.favorite, true);
  assert.equal(getFavoriteTheaters(storage).length, 1);
  assert.equal(
    getFavoriteTheaters(storage)[0].theaterRef.theaterId,
    THEATER_DETAIL_DEFAULT_THEATER_ID,
  );
  assert.ok(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY));
});

test('Primary nav remains four destinations', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.id),
    ['home', 'explore', 'planner', 'profile'],
  );
});
