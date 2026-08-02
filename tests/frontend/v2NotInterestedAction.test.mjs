import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import { resolveFilmDetailPresentation } from '../../v2/fixtures/resolveFilmDetailPresentation.js';
import { toFilmDetailView } from '../../v2/filmDetail/toFilmDetailView.js';
import { filmRefFromHomeFilm } from '../../v2/save/filmRefFromFilm.js';
import {
  applyNotInterestedToggle,
  buildNotInterestedActionState,
} from '../../v2/save/notInterestedActionState.js';
import {
  NOT_INTERESTED_FILMS_STORAGE_KEY,
  getNotInterestedFilms,
  isFilmNotInterested,
  markFilmNotInterested,
} from '../../v2/stores/notInterestedFilmsStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
  isFilmSaved,
  saveFilm,
} from '../../v2/stores/savedFilmsStore.js';
import {
  SEEN_FILMS_STORAGE_KEY,
  getSeenFilms,
  isFilmSeen,
  markFilmSeen,
} from '../../v2/stores/seenFilmsStore.js';
import {
  DISMISSED_FILMS_STORAGE_KEY,
  dismissFilm,
  loadDismissedFilmKeys,
  saveDismissedFilmKeys,
} from '../../v2/explore/dismissedFilmsStore.js';
import {
  createInitialNavState,
  navigateBack,
  openFilmDetail,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');
const SURFACE = readFileSync(
  join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'),
  'utf8',
);
const APP = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const SEARCH = readFileSync(
  join(ROOT, 'v2/surfaces/SearchResultsSurface.jsx'),
  'utf8',
);
const INLINE = readFileSync(
  join(ROOT, 'v2/home/InlineQuickDetail.jsx'),
  'utf8',
);
const QC = readFileSync(join(ROOT, 'scripts/capture_film_detail_qc.mjs'), 'utf8');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function fixedNow(iso) {
  return () => new Date(iso);
}

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

function homeData() {
  return buildHomeData({
    showtimesCurrent: loadFixture('v2_showtimes_home_mini.json'),
    theatersRegistry: loadFixture('v2_theaters_home_mini.json'),
    newlyAdded: loadFixture('v2_newly_added_home_mini.json'),
    pipelineReport: loadFixture('pipeline_report_mini.json'),
  });
}

test('production Not Interested available for real films; unavailable without identity', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const storage = memoryStorage();
  const ready = buildNotInterestedActionState({
    mode: 'production',
    film,
    storage,
  });
  assert.equal(ready.available, true);
  assert.equal(ready.isNotInterested, false);
  assert.equal(ready.label, 'Not interested');
  assert.equal(ready.persist, true);
  assert.equal(ready.filmRef.showtimeFilmKey, 'sinners');

  const missing = buildNotInterestedActionState({
    mode: 'production',
    film: null,
    storage,
  });
  assert.equal(missing.available, false);
  assert.equal(missing.persist, false);
});

test('Not Interested toggle persists, remounts, and navigates per film', () => {
  const home = homeData();
  const sinners = home.films.find((f) => f.filmKey === 'sinners');
  const indie = home.films.find((f) => f.filmKey === 'indie-film');
  const storage = memoryStorage();

  let state = buildNotInterestedActionState({
    mode: 'production',
    film: sinners,
    storage,
  });
  const marked = applyNotInterestedToggle({
    storage,
    filmRef: state.filmRef,
    persist: true,
    currentIsNotInterested: false,
  });
  assert.equal(marked.ok, true);
  assert.equal(marked.isNotInterested, true);
  assert.equal(getNotInterestedFilms(storage).length, 1);
  assert.equal(getNotInterestedFilms(storage)[0].markedAtSource, 'user-recorded');
  assert.equal(getNotInterestedFilms(storage)[0].reason, null);

  state = buildNotInterestedActionState({
    mode: 'production',
    film: sinners,
    storage,
  });
  assert.equal(state.isNotInterested, true);

  assert.equal(
    buildNotInterestedActionState({ mode: 'production', film: indie, storage })
      .isNotInterested,
    false,
  );

  let nav = createInitialNavState();
  nav = openFilmDetail(nav, { filmKey: 'sinners', originPrimary: 'home' });
  nav = openFilmDetail(navigateBack(nav), {
    filmKey: 'indie-film',
    originPrimary: 'home',
  });
  nav = openFilmDetail(navigateBack(nav), {
    filmKey: 'sinners',
    originPrimary: 'home',
  });
  assert.equal(nav.surface.filmKey, 'sinners');
  assert.equal(
    buildNotInterestedActionState({ mode: 'production', film: sinners, storage })
      .isNotInterested,
    true,
  );

  const cleared = applyNotInterestedToggle({
    storage,
    filmRef: state.filmRef,
    persist: true,
    currentIsNotInterested: true,
  });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.isNotInterested, false);
});

test('parent variants share Not Interested via filmRefFromHomeFilm', () => {
  const storage = memoryStorage();
  const imax = filmRefFromHomeFilm({
    filmKey: 'dune-imax',
    parentFilmKey: 'dune',
  });
  applyNotInterestedToggle({
    storage,
    filmRef: imax,
    persist: true,
  });
  const digital = filmRefFromHomeFilm({
    filmKey: 'dune-digital',
    parentFilmKey: 'dune',
  });
  assert.equal(isFilmNotInterested(storage, digital), true);
  assert.equal(getNotInterestedFilms(storage).length, 1);
});

test('repeated mark does not duplicate; remount restores; reason stays null', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const storage = memoryStorage();
  const ref = filmRefFromHomeFilm(film);
  markFilmNotInterested(storage, ref, {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  markFilmNotInterested(storage, ref, {
    now: fixedNow('2026-07-24T21:00:00.000Z'),
  });
  assert.equal(getNotInterestedFilms(storage).length, 1);
  assert.equal(
    getNotInterestedFilms(storage)[0].markedAt,
    '2026-07-24T20:00:00.000Z',
  );
  assert.equal(getNotInterestedFilms(storage)[0].reason, null);
  assert.equal(
    buildNotInterestedActionState({ mode: 'production', film, storage })
      .isNotInterested,
    true,
  );
});

test('failed Not Interested writes preserve prior state', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const ref = filmRefFromHomeFilm(film);
  const failingWrite = {
    getItem: () => null,
    setItem: () => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem: () => {},
  };
  const failedMark = applyNotInterestedToggle({
    storage: failingWrite,
    filmRef: ref,
    persist: true,
    currentIsNotInterested: false,
  });
  assert.equal(failedMark.ok, false);
  assert.equal(failedMark.isNotInterested, false);

  const storage = memoryStorage();
  markFilmNotInterested(storage, ref, {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  const failingClear = {
    getItem: (key) => storage.getItem(key),
    setItem: () => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem: () => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    },
  };
  const failedClear = applyNotInterestedToggle({
    storage: failingClear,
    filmRef: ref,
    persist: true,
    currentIsNotInterested: true,
  });
  assert.equal(failedClear.ok, false);
  assert.equal(failedClear.isNotInterested, true);
  assert.equal(isFilmNotInterested(storage, ref), true);
});

test('Not Interested does not change Saved or Seen; Film Activity keys update', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const storage = memoryStorage();
  saveFilm(storage, filmRefFromHomeFilm(film), {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  markFilmSeen(storage, filmRefFromHomeFilm(film), {
    now: fixedNow('2026-07-24T20:30:00.000Z'),
  });

  const state = buildNotInterestedActionState({
    mode: 'production',
    film,
    storage,
  });
  applyNotInterestedToggle({
    storage,
    filmRef: state.filmRef,
    persist: true,
  });

  assert.equal(isFilmSaved(storage, filmRefFromHomeFilm(film)), true);
  assert.equal(isFilmSeen(storage, filmRefFromHomeFilm(film)), true);
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(getSeenFilms(storage).length, 1);
  assert.ok(loadDismissedFilmKeys(storage).includes('sinners'));
  assert.ok(storage.getItem(SAVED_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(SEEN_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY));
});

test('compatibility writes remain visible to Film Detail after remount', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'indie-film');
  const storage = memoryStorage();
  saveDismissedFilmKeys(storage, dismissFilm('indie-film', []));
  assert.equal(
    buildNotInterestedActionState({ mode: 'production', film, storage })
      .isNotInterested,
    true,
  );
  assert.equal(DISMISSED_FILMS_STORAGE_KEY, NOT_INTERESTED_FILMS_STORAGE_KEY);
});

test('QC modes do not persist fixture Not Interested state', () => {
  const storage = memoryStorage();
  const mockup = buildNotInterestedActionState({
    mode: 'mockup-fixture',
    film: { filmKey: 'mockup-2001', title: '2001' },
    storage,
    fixtureIsNotInterested: true,
  });
  assert.equal(mockup.persist, false);
  assert.equal(mockup.isNotInterested, true);
  const toggled = applyNotInterestedToggle({
    storage,
    filmRef: mockup.filmRef,
    persist: mockup.persist,
    currentIsNotInterested: mockup.isNotInterested,
  });
  assert.equal(toggled.isNotInterested, false);
  assert.equal(storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY), null);
  assert.deepEqual(getNotInterestedFilms(storage), []);
});

test('Film Detail wires Not Interested through shared helpers; Search stays shim-based', () => {
  assert.match(APP, /buildNotInterestedActionState/);
  assert.match(APP, /applyNotInterestedToggle/);
  assert.match(APP, /onToggleNotInterested/);
  assert.match(SURFACE, /aria-pressed=\{isNotInterested\}/);
  assert.match(SURFACE, /Not interested/);
  assert.equal(SURFACE.includes('setHideOn'), false);
  assert.equal(SURFACE.includes('hideOn'), false);
  assert.match(SEARCH, /handleNotInterested/);
  assert.match(SEARCH, /saveDismissedFilmKeys/);
  assert.equal(SEARCH.includes('buildNotInterestedActionState'), false);
  assert.match(INLINE, /Not interested/);
  assert.match(INLINE, /onToggleNotInterested/);
  assert.match(QC, /dismissedFilms/);
});

test('production view marks Not Interested available for resolved films', () => {
  const home = homeData();
  const view = toFilmDetailView(
    resolveFilmDetailPresentation({
      homeData: home,
      filmKey: 'sinners',
      forceMode: 'production',
    }),
  );
  assert.equal(view.actions.notInterestedAvailable, true);
  assert.equal(view.actions.notInterestedAction.available, true);

  const missing = toFilmDetailView(
    resolveFilmDetailPresentation({
      homeData: home,
      filmKey: 'missing',
      forceMode: 'production',
    }),
  );
  assert.equal(missing.actions.notInterestedAvailable, false);
});
