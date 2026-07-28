import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import { resolveFilmDetailPresentation } from '../../v2/fixtures/resolveFilmDetailPresentation.js';
import { toFilmDetailView } from '../../v2/filmDetail/toFilmDetailView.js';
import {
  filmRefFromHomeFilm,
  resolveSavedShowtimeFilmKey,
} from '../../v2/save/filmRefFromFilm.js';
import {
  applySaveToggle,
  buildSaveActionState,
} from '../../v2/save/saveActionState.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
  isFilmSaved,
  saveFilm,
} from '../../v2/stores/savedFilmsStore.js';
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
const HEADER = readFileSync(join(ROOT, 'v2/home/AppHeader.jsx'), 'utf8');
const SEARCH = readFileSync(
  join(ROOT, 'v2/surfaces/SearchResultsSurface.jsx'),
  'utf8',
);

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

test('filmRef prefers parentFilmKey when present', () => {
  assert.equal(
    resolveSavedShowtimeFilmKey({
      filmKey: 'dune-imax',
      parentFilmKey: 'dune',
    }),
    'dune',
  );
  const ref = filmRefFromHomeFilm({
    filmKey: 'dune-imax',
    parentFilmKey: 'dune',
    sourceFilmId: 'amc-1',
    source: 'amc',
    title: 'Dune IMAX',
    posterUrl: 'https://example.com/d.jpg',
  });
  assert.deepEqual(
    {
      filmId: ref.filmId,
      showtimeFilmKey: ref.showtimeFilmKey,
      sourceFilmId: ref.sourceFilmId,
      source: ref.source,
    },
    {
      filmId: null,
      showtimeFilmKey: 'dune',
      sourceFilmId: 'amc-1',
      source: 'amc',
    },
  );
  assert.equal(ref.title, 'Dune IMAX');
});

test('filmRef never uses opportunity or showtime performance ids', () => {
  const ref = filmRefFromHomeFilm({
    filmKey: 'sinners',
    opportunityKey: 'opp-should-not-win',
    sourceShowtimeId: 'perf-should-not-win',
    title: 'Sinners',
  });
  assert.equal(ref.showtimeFilmKey, 'sinners');
  assert.notEqual(ref.showtimeFilmKey, 'opp-should-not-win');
  assert.notEqual(ref.showtimeFilmKey, 'perf-should-not-win');
  assert.equal(filmRefFromHomeFilm({ title: 'No Key' }), null);
  assert.equal(filmRefFromHomeFilm(null), null);
});

test('production Save action is available for real films and unavailable without identity', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const storage = memoryStorage();
  const ready = buildSaveActionState({
    mode: 'production',
    film,
    storage,
  });
  assert.equal(ready.available, true);
  assert.equal(ready.isSaved, false);
  assert.equal(ready.label, 'Save');
  assert.equal(ready.persist, true);
  assert.equal(ready.filmRef.showtimeFilmKey, 'sinners');

  const missing = buildSaveActionState({
    mode: 'production',
    film: null,
    storage,
  });
  assert.equal(missing.available, false);
  assert.equal(missing.persist, false);
});

test('save toggle persists, labels Saved, and remount simulation restores state', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const storage = memoryStorage();

  let state = buildSaveActionState({ mode: 'production', film, storage });
  assert.equal(state.label, 'Save');
  assert.equal(state.isSaved, false);

  const saved = applySaveToggle({
    storage,
    filmRef: state.filmRef,
    persist: true,
    currentIsSaved: state.isSaved,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.isSaved, true);
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(
    getSavedFilms(storage)[0].filmRef.showtimeFilmKey,
    'sinners',
  );

  state = buildSaveActionState({ mode: 'production', film, storage });
  assert.equal(state.isSaved, true);
  assert.equal(state.label, 'Saved');

  // Remount / reload simulation: new action state from same storage.
  const remounted = buildSaveActionState({
    mode: 'production',
    film,
    storage,
  });
  assert.equal(remounted.isSaved, true);

  const unsaved = applySaveToggle({
    storage,
    filmRef: remounted.filmRef,
    persist: true,
    currentIsSaved: remounted.isSaved,
  });
  assert.equal(unsaved.ok, true);
  assert.equal(unsaved.isSaved, false);
  assert.equal(getSavedFilms(storage).length, 0);
});

test('navigating between films resolves independent saved state', () => {
  const home = homeData();
  const sinners = home.films.find((f) => f.filmKey === 'sinners');
  const indie = home.films.find((f) => f.filmKey === 'indie-film');
  const storage = memoryStorage();

  const saveSinners = buildSaveActionState({
    mode: 'production',
    film: sinners,
    storage,
  });
  assert.equal(
    applySaveToggle({
      storage,
      filmRef: saveSinners.filmRef,
      persist: true,
    }).isSaved,
    true,
  );

  assert.equal(
    buildSaveActionState({ mode: 'production', film: indie, storage }).isSaved,
    false,
  );
  assert.equal(
    buildSaveActionState({ mode: 'production', film: sinners, storage })
      .isSaved,
    true,
  );

  let nav = createInitialNavState();
  nav = openFilmDetail(nav, {
    filmKey: 'sinners',
    originPrimary: 'home',
  });
  assert.equal(nav.surface.filmKey, 'sinners');
  nav = openFilmDetail(navigateBack(nav), {
    filmKey: 'indie-film',
    originPrimary: 'home',
  });
  assert.equal(nav.surface.filmKey, 'indie-film');
  nav = openFilmDetail(navigateBack(nav), {
    filmKey: 'sinners',
    originPrimary: 'home',
  });
  assert.equal(nav.surface.filmKey, 'sinners');
  assert.equal(
    buildSaveActionState({
      mode: 'production',
      film: sinners,
      storage,
    }).isSaved,
    true,
  );
});

test('repeated saves do not create duplicates', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const storage = memoryStorage();
  const ref = filmRefFromHomeFilm(film);
  saveFilm(storage, ref);
  saveFilm(storage, ref);
  saveFilm(storage, ref);
  assert.equal(getSavedFilms(storage).length, 1);
});

test('parent variants share one saved identity', () => {
  const storage = memoryStorage();
  const imax = {
    filmKey: 'dune-imax',
    parentFilmKey: 'dune',
    title: 'Dune',
  };
  const digital = {
    filmKey: 'dune-digital',
    parentFilmKey: 'dune',
    title: 'Dune',
  };
  const a = buildSaveActionState({ mode: 'production', film: imax, storage });
  applySaveToggle({ storage, filmRef: a.filmRef, persist: true });
  const b = buildSaveActionState({
    mode: 'production',
    film: digital,
    storage,
  });
  assert.equal(b.isSaved, true);
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(getSavedFilms(storage)[0].filmRef.showtimeFilmKey, 'dune');
});

test('failed save leaves Unsaved; failed unsave leaves Saved', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const failingWrite = {
    getItem: () => null,
    setItem: () => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem: () => {},
  };
  const ready = buildSaveActionState({
    mode: 'production',
    film,
    storage: failingWrite,
  });
  const failedSave = applySaveToggle({
    storage: failingWrite,
    filmRef: ready.filmRef,
    persist: true,
    currentIsSaved: false,
  });
  assert.equal(failedSave.ok, false);
  assert.equal(failedSave.isSaved, false);
  assert.equal(failedSave.error, 'quota_exceeded');

  const storage = memoryStorage();
  saveFilm(storage, filmRefFromHomeFilm(film));
  assert.equal(isFilmSaved(storage, filmRefFromHomeFilm(film)), true);

  const failingUnsave = {
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
  const failedUnsave = applySaveToggle({
    storage: failingUnsave,
    filmRef: filmRefFromHomeFilm(film),
    persist: true,
    currentIsSaved: true,
  });
  assert.equal(failedUnsave.ok, false);
  assert.equal(failedUnsave.isSaved, true);
  assert.ok(isFilmSaved(storage, filmRefFromHomeFilm(film)));
});

test('QC fixture modes never persist to production Saved store', () => {
  const storage = memoryStorage();
  const mockup = buildSaveActionState({
    mode: 'mockup-fixture',
    film: { filmKey: 'mockup-2001', title: '2001: A Space Odyssey' },
    storage,
    fixtureIsSaved: false,
  });
  assert.equal(mockup.available, true);
  assert.equal(mockup.persist, false);
  const toggled = applySaveToggle({
    storage,
    filmRef: mockup.filmRef,
    persist: mockup.persist,
    currentIsSaved: mockup.isSaved,
  });
  assert.equal(toggled.ok, true);
  assert.equal(toggled.isSaved, true);
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), null);
  assert.deepEqual(getSavedFilms(storage), []);

  const visual = buildSaveActionState({
    mode: 'visual-fixture',
    storage,
    fixtureIsSaved: true,
  });
  assert.equal(visual.persist, false);
  assert.equal(visual.isSaved, true);
});

test('production view marks Save available for resolved films', () => {
  const home = homeData();
  const resolved = resolveFilmDetailPresentation({
    homeData: home,
    filmKey: 'sinners',
    forceMode: 'production',
  });
  const view = toFilmDetailView(resolved);
  assert.equal(view.actions.saveAvailable, true);
  assert.equal(view.actions.saveAction.available, true);

  const missing = toFilmDetailView(
    resolveFilmDetailPresentation({
      homeData: home,
      filmKey: 'missing',
      forceMode: 'production',
    }),
  );
  assert.equal(missing.actions.saveAvailable, false);
});

test('Film Detail and header wire Save through shared action helpers', () => {
  assert.match(APP, /buildSaveActionState/);
  assert.match(APP, /applySaveToggle/);
  assert.match(APP, /onToggleSave/);
  assert.match(SURFACE, /aria-pressed=\{isSaved\}/);
  assert.match(SURFACE, /\{saveLabel\}/);
  assert.match(HEADER, /aria-pressed=\{savePressed\}/);
  assert.match(HEADER, /aria-label=\{saveLabel\}/);
  assert.match(SEARCH, /filmRefFromHomeFilm/);
  assert.match(SEARCH, /applySaveToggle/);
  assert.match(SEARCH, /aria-pressed=\{isSaved\}/);
  assert.equal(SEARCH.includes('Save is not available yet'), false);
});

test('accessibility contract remains button + aria-pressed', () => {
  assert.match(SURFACE, /type="button"/);
  assert.match(SURFACE, /aria-pressed=\{isSaved\}/);
  assert.match(HEADER, /type="button"/);
  assert.match(HEADER, /aria-pressed=\{savePressed\}/);
  assert.match(SEARCH, /type="button"/);
});

test('Seen and Not interested controls remain present on Film Detail', () => {
  assert.match(SURFACE, />Seen</);
  assert.match(SURFACE, /Not interested/);
  assert.match(SURFACE, /onToggleSeen/);
  assert.match(SURFACE, /onToggleNotInterested/);
  assert.match(SURFACE, /aria-pressed=\{isNotInterested\}/);
  assert.equal(SURFACE.includes('setHideOn'), false);
});
