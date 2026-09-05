import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import { buildSuggestedStarts } from '../../v2/explore/exploreSuggestedStarts.js';
import { buildLeavingSoonShelf } from '../../v2/home/shelfData.js';
import {
  createInitialNavState,
  navigateBack,
  openShowtimesBrowse,
  openTheaterDetail,
} from '../../v2/navigation/navState.js';
import { createDefaultShowtimesBrowseUi } from '../../v2/showtimes/showtimesBrowseModel.js';
import { filmRefFromHomeFilm } from '../../v2/save/filmRefFromFilm.js';
import {
  getSavedFilms,
  isFilmSaved,
  toggleSavedFilm,
} from '../../v2/stores/savedFilmsStore.js';
import {
  getNotInterestedFilms,
  isFilmNotInterested,
  toggleFilmNotInterested,
} from '../../v2/stores/notInterestedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const TD_SRC = readFileSync(
  join(ROOT, 'v2/theaters/TheaterDetailSurface.jsx'),
  'utf8',
);
const OPENING_SRC = readFileSync(
  join(ROOT, 'v2/opening/OpeningThisWeekSurface.jsx'),
  'utf8',
);
const EXPLORE_SRC = readFileSync(
  join(ROOT, 'v2/explore/ExploreDestination.jsx'),
  'utf8',
);
const COLLECTION_SRC = readFileSync(
  join(ROOT, 'v2/surfaces/CollectionSurface.jsx'),
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

test('Theater Detail View all uses shared browse helper with theater + back', () => {
  assert.match(TD_SRC, /onOpenShowtimesBrowse/);
  assert.match(APP_SRC, /isTheaterDetail[\s\S]*onOpenShowtimesBrowse/);
  assert.match(APP_SRC, /handleBrowseTheaterShowtimes/);
  assert.equal(TD_SRC.includes("'view-all'"), true);
  assert.match(TD_SRC, /onOpenShowtimesBrowse\(\{\s*theaterId:\s*id\s*\}\)/);

  let nav = openTheaterDetail(createInitialNavState(), {
    theaterId: 'the-beacon-cinema',
    originPrimary: 'explore',
  });
  const detailSurface = nav.surface;
  nav = openShowtimesBrowse(nav, {
    originPrimary: 'explore',
    returnSurface: detailSurface,
    browseUi: {
      ...createDefaultShowtimesBrowseUi(),
      dateMode: 'week',
      theaterIds: ['the-beacon-cinema'],
    },
  });
  assert.equal(nav.surface?.type, 'showtimes-browse');
  assert.deepEqual(nav.surface.browseUi.theaterIds, ['the-beacon-cinema']);
  assert.equal(nav.surface.browseUi.dateMode, 'week');
  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'theater-detail');
  assert.equal(nav.surface?.theaterId, 'the-beacon-cinema');
});

test('Opening Save / Not Interested use shared stores (not stubs)', () => {
  assert.match(OPENING_SRC, /toggleSavedFilm/);
  assert.match(OPENING_SRC, /toggleFilmNotInterested/);
  assert.match(OPENING_SRC, /isFilmSaved/);
  assert.match(OPENING_SRC, /isFilmNotInterested/);
  assert.match(OPENING_SRC, /aria-pressed/);
  assert.equal(OPENING_SRC.includes('`save-${film.filmKey}`'), false);
  assert.equal(OPENING_SRC.includes('`ni-${film.filmKey}`'), false);

  const storage = memoryStorage();
  const film = {
    filmKey: 'cleanup-opening-film',
    filmId: 'tmdb:42',
    title: 'Cleanup Opening Film',
    posterUrl: 'https://example.com/p.jpg',
  };
  const ref = filmRefFromHomeFilm(film);
  assert.ok(ref);

  assert.equal(isFilmSaved(storage, ref), false);
  const savedOn = toggleSavedFilm(storage, ref, { title: film.title });
  assert.equal(savedOn.ok, true);
  assert.equal(savedOn.saved, true);
  assert.equal(isFilmSaved(storage, ref), true);
  assert.equal(getSavedFilms(storage).length, 1);
  const savedOff = toggleSavedFilm(storage, ref);
  assert.equal(savedOff.saved, false);
  assert.equal(isFilmSaved(storage, ref), false);

  assert.equal(isFilmNotInterested(storage, ref), false);
  const niOn = toggleFilmNotInterested(storage, ref, { title: film.title });
  assert.equal(niOn.ok, true);
  assert.equal(niOn.notInterested, true);
  assert.equal(isFilmNotInterested(storage, ref), true);
  assert.equal(getNotInterestedFilms(storage).length, 1);
  const niOff = toggleFilmNotInterested(storage, ref);
  assert.equal(niOff.notInterested, false);
  assert.equal(isFilmNotInterested(storage, ref), false);
});

test('Browse showtimes theater link drops default underline treatment', () => {
  assert.match(
    CSS,
    /\.v2-stb-theater-name[\s\S]*?text-decoration:\s*none/,
  );
  assert.match(CSS, /\.v2-stb-theater-name:hover\s*\{[^}]*text-decoration:\s*underline/s);
  assert.match(CSS, /\.v2-stb-theater-name:focus-visible/);
});

test('Leaving Soon collection removes scaffold eyebrow and uses honest copy', () => {
  assert.match(COLLECTION_SRC, /isLeavingSoon/);
  assert.match(COLLECTION_SRC, /v2-collection-leaving-soon/);
  assert.match(COLLECTION_SRC, /emptyBody/);
  assert.match(
    COLLECTION_SRC,
    /isLeavingSoon \? null : \(\s*<p className="v2-destination-eyebrow">Explore · scaffold<\/p>/,
  );
  const shelf = buildLeavingSoonShelf(null);
  assert.match(shelf.emptyTitle, /Leaving Soon isn’t ready/i);
  assert.match(shelf.emptyBody, /showtimes finish loading/i);
  assert.equal(shelf.emptyBody.includes('scaffold'), false);
});

test('Explore landing no longer renders Suggested Starts', () => {
  assert.equal(EXPLORE_SRC.includes('ExploreSuggestedStarts'), false);
  assert.equal(EXPLORE_SRC.includes('<ExploreSuggestedStarts'), false);
  assert.match(EXPLORE_SRC, /ExploreQuickStart/);
  assert.match(EXPLORE_SRC, /ExploreBrowseBy/);
  assert.match(EXPLORE_SRC, /ExploreFilmActivity/);
  // Helper retained for collection/deep-link catalog; landing section removed.
  const items = buildSuggestedStarts();
  assert.equal(items.length, 4);
  assert.equal(COLLECTION_IDS.suggestedStarts, 'suggested-starts');
});
