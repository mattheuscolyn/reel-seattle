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
  applySeenToggle,
  buildSeenActionState,
} from '../../v2/save/seenActionState.js';
import {
  SEEN_FILMS_STORAGE_KEY,
  getSeenFilms,
  isFilmSeen,
  markFilmSeen,
} from '../../v2/stores/seenFilmsStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
  isFilmSaved,
  saveFilm,
} from '../../v2/stores/savedFilmsStore.js';
import {
  DISMISSED_FILMS_STORAGE_KEY,
  dismissFilm,
  loadDismissedFilmKeys,
  saveDismissedFilmKeys,
} from '../../v2/explore/dismissedFilmsStore.js';
import { loadSeenFilmKeys } from '../../v2/explore/seenFilmsStore.js';
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

test('production Seen action available for real films; unavailable without identity', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const storage = memoryStorage();
  const ready = buildSeenActionState({
    mode: 'production',
    film,
    storage,
  });
  assert.equal(ready.available, true);
  assert.equal(ready.isSeen, false);
  assert.equal(ready.label, 'Seen');
  assert.equal(ready.persist, true);
  assert.equal(ready.filmRef.showtimeFilmKey, 'sinners');

  const missing = buildSeenActionState({
    mode: 'production',
    film: null,
    storage,
  });
  assert.equal(missing.available, false);
  assert.equal(missing.persist, false);
});

test('Seen toggle persists, remounts, and navigates per film', () => {
  const home = homeData();
  const sinners = home.films.find((f) => f.filmKey === 'sinners');
  const indie = home.films.find((f) => f.filmKey === 'indie-film');
  const storage = memoryStorage();

  let state = buildSeenActionState({
    mode: 'production',
    film: sinners,
    storage,
  });
  const marked = applySeenToggle({
    storage,
    filmRef: state.filmRef,
    persist: true,
    currentIsSeen: false,
  });
  assert.equal(marked.ok, true);
  assert.equal(marked.isSeen, true);
  assert.equal(getSeenFilms(storage).length, 1);
  assert.equal(getSeenFilms(storage)[0].seenAtSource, 'user-recorded');
  assert.equal(getSeenFilms(storage)[0].showtimeRef ?? null, null);

  state = buildSeenActionState({ mode: 'production', film: sinners, storage });
  assert.equal(state.isSeen, true);

  assert.equal(
    buildSeenActionState({ mode: 'production', film: indie, storage }).isSeen,
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
    buildSeenActionState({ mode: 'production', film: sinners, storage }).isSeen,
    true,
  );

  const unseen = applySeenToggle({
    storage,
    filmRef: state.filmRef,
    persist: true,
    currentIsSeen: true,
  });
  assert.equal(unseen.ok, true);
  assert.equal(unseen.isSeen, false);
});

test('parent variants share Seen via filmRefFromHomeFilm', () => {
  const storage = memoryStorage();
  const imax = filmRefFromHomeFilm({
    filmKey: 'dune-imax',
    parentFilmKey: 'dune',
  });
  applySeenToggle({
    storage,
    filmRef: imax,
    persist: true,
  });
  const digital = filmRefFromHomeFilm({
    filmKey: 'dune-digital',
    parentFilmKey: 'dune',
  });
  assert.equal(isFilmSeen(storage, digital), true);
  assert.equal(getSeenFilms(storage).length, 1);
});

test('repeated mark does not duplicate; remount restores', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const storage = memoryStorage();
  const ref = filmRefFromHomeFilm(film);
  markFilmSeen(storage, ref, { now: fixedNow('2026-07-24T20:00:00.000Z') });
  markFilmSeen(storage, ref, { now: fixedNow('2026-07-24T21:00:00.000Z') });
  assert.equal(getSeenFilms(storage).length, 1);
  assert.equal(getSeenFilms(storage)[0].seenAt, '2026-07-24T20:00:00.000Z');
  assert.equal(
    buildSeenActionState({ mode: 'production', film, storage }).isSeen,
    true,
  );
});

test('failed Seen writes preserve prior state', () => {
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
  const failedMark = applySeenToggle({
    storage: failingWrite,
    filmRef: ref,
    persist: true,
    currentIsSeen: false,
  });
  assert.equal(failedMark.ok, false);
  assert.equal(failedMark.isSeen, false);

  const storage = memoryStorage();
  markFilmSeen(storage, ref, { now: fixedNow('2026-07-24T20:00:00.000Z') });
  const failingUnseen = {
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
  const failedUnseen = applySeenToggle({
    storage: failingUnseen,
    filmRef: ref,
    persist: true,
    currentIsSeen: true,
  });
  assert.equal(failedUnseen.ok, false);
  assert.equal(failedUnseen.isSeen, true);
  assert.equal(isFilmSeen(storage, ref), true);
});

test('Seen does not change Saved or Not Interested; Film Activity keys update', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const storage = memoryStorage();
  saveFilm(storage, filmRefFromHomeFilm(film), {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  saveDismissedFilmKeys(storage, dismissFilm('indie-film', []));

  const state = buildSeenActionState({
    mode: 'production',
    film,
    storage,
  });
  applySeenToggle({
    storage,
    filmRef: state.filmRef,
    persist: true,
  });

  assert.equal(isFilmSaved(storage, filmRefFromHomeFilm(film)), true);
  assert.equal(getSavedFilms(storage).length, 1);
  assert.deepEqual(loadDismissedFilmKeys(storage), ['indie-film']);
  assert.ok(loadSeenFilmKeys(storage).includes('sinners'));
  assert.ok(storage.getItem(SAVED_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(DISMISSED_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(SEEN_FILMS_STORAGE_KEY));
});

test('QC modes do not persist fixture Seen state', () => {
  const storage = memoryStorage();
  const mockup = buildSeenActionState({
    mode: 'mockup-fixture',
    film: { filmKey: 'mockup-2001', title: '2001' },
    storage,
    fixtureIsSeen: false,
  });
  assert.equal(mockup.persist, false);
  const toggled = applySeenToggle({
    storage,
    filmRef: mockup.filmRef,
    persist: mockup.persist,
    currentIsSeen: mockup.isSeen,
  });
  assert.equal(toggled.isSeen, true);
  assert.equal(storage.getItem(SEEN_FILMS_STORAGE_KEY), null);
  assert.deepEqual(getSeenFilms(storage), []);
});

test('Film Detail wires Seen through shared helpers; no new Search/inline Seen', () => {
  assert.match(APP, /buildSeenActionState/);
  assert.match(APP, /applySeenToggle/);
  assert.match(APP, /onToggleSeen/);
  assert.match(SURFACE, /aria-pressed=\{isSeen\}/);
  assert.match(SURFACE, />Seen</);
  assert.equal(SURFACE.includes('setSeenOn'), false);
  assert.equal(SEARCH.includes('onToggleSeen'), false);
  assert.equal(INLINE.includes('Seen'), false);
  assert.match(QC, /seenFilms/);
});

test('production view marks Seen available for resolved films', () => {
  const home = homeData();
  const view = toFilmDetailView(
    resolveFilmDetailPresentation({
      homeData: home,
      filmKey: 'sinners',
      forceMode: 'production',
    }),
  );
  assert.equal(view.actions.seenAvailable, true);
  assert.equal(view.actions.seenAction.available, true);

  const missing = toFilmDetailView(
    resolveFilmDetailPresentation({
      homeData: home,
      filmKey: 'missing',
      forceMode: 'production',
    }),
  );
  assert.equal(missing.actions.seenAvailable, false);
});
