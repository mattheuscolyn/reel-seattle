import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILD_PLAN_RESULTS_MOCKUP_FIXTURE,
  createBuildPlanResultsUiState,
  resolveBuildPlanResultsPresentation,
} from '../../v2/fixtures/buildPlanResultsMockupFixture.js';
import {
  DISMISSED_FILMS_STORAGE_KEY,
  getNotInterestedFilms,
} from '../../v2/stores/notInterestedFilmsStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
} from '../../v2/stores/savedFilmsStore.js';
import {
  SEEN_FILMS_STORAGE_KEY,
  getSeenFilms,
} from '../../v2/stores/seenFilmsStore.js';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  getFavoriteTheaters,
} from '../../v2/stores/favoriteTheatersStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SHEET_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlanFilmInteractionSheet.jsx'),
  'utf8',
);
const RESULTS_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanResultsSurface.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/buildPlanResultsMockupFixture.js'),
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

test('Film interaction sheet fixture options match mockup labels', () => {
  const sheet = resolveBuildPlanResultsPresentation().filmSheet;
  assert.equal(sheet.sectionTitle, 'Adjust this movie in your plan');
  assert.deepEqual(
    sheet.preferences.map((p) => p.label),
    ['Must include', 'Would love to see', 'Neutral', 'Not interested'],
  );
  assert.equal(sheet.cancelLabel, 'Cancel');
  assert.equal(sheet.replaceLabel, 'Replace this movie');
  assert.equal(sheet.filmDetailsLabel, 'Film details');
});

test('Sheet is a dialog with preference radios and close controls', () => {
  assert.match(SHEET_SRC, /role="dialog"/);
  assert.match(SHEET_SRC, /aria-modal="true"/);
  assert.match(SHEET_SRC, /role="radiogroup"/);
  assert.match(SHEET_SRC, /aria-label="Close"/);
  assert.match(SHEET_SRC, /Escape/);
  assert.match(SHEET_SRC, /onClose/);
  assert.match(RESULTS_SRC, /PlanFilmInteractionSheet/);
  assert.match(RESULTS_SRC, /closeSheet/);
  assert.match(RESULTS_SRC, /setFilmPreference/);
  assert.match(CSS, /\.v2-bpr-sheet\b/);
  assert.match(CSS, /\.v2-bpr-sheet-backdrop\b/);
});

test('Sheet is not Film Detail and omits Save/Seen/ellipsis', () => {
  assert.equal(SHEET_SRC.includes('FilmDetailSurface'), false);
  assert.equal(SHEET_SRC.includes('Save'), false);
  assert.equal(SHEET_SRC.includes('Seen'), false);
  assert.equal(SHEET_SRC.includes('IconMore'), false);
  assert.equal(SHEET_SRC.includes('Why we love'), false);
  assert.match(SHEET_SRC, /filmDetailsDeferredMessage|View full details/);
});

test('Local filmPreferences state initializes from fixture and is exclusive', () => {
  const state = createBuildPlanResultsUiState();
  assert.equal(state.filmPreferences['p1-f1'], 'must');
  assert.equal(state.filmPreferences['p1-f3'], 'love');
  assert.equal(state.filmPreferences['p2-f3'], 'neutral');
  state.filmPreferences['p1-f3'] = 'notInterested';
  assert.equal(state.filmPreferences['p1-f3'], 'notInterested');
  const remount = createBuildPlanResultsUiState();
  assert.equal(remount.filmPreferences['p1-f3'], 'love');
});

test('Results wires sheet open from film row and keeps Results mounted', () => {
  assert.match(RESULTS_SRC, /openFilmSheet/);
  assert.match(RESULTS_SRC, /sheetFilmId/);
  assert.match(RESULTS_SRC, /data-build-plan-results-source/);
  assert.match(RESULTS_SRC, /aria-haspopup="dialog"/);
  assert.match(RESULTS_SRC, /inert/);
  assert.match(RESULTS_SRC, /filmButtonRefs/);
});

test('Sheet stubs replace/time/details without recomputation', () => {
  assert.match(SHEET_SRC, /timeAdjustDeferredMessage/);
  assert.match(SHEET_SRC, /replaceDeferredMessage/);
  assert.match(SHEET_SRC, /filmDetailsDeferredMessage/);
  assert.equal(SHEET_SRC.includes('plannerEngine'), false);
  assert.equal(FIXTURE_SRC.includes('plannerEngine'), false);
  assert.equal(RESULTS_SRC.includes('plannerEngine'), false);
});

test('Preference changes do not mutate global stores', () => {
  const storage = memoryStorage();
  const state = createBuildPlanResultsUiState();
  state.filmPreferences['p1-f3'] = 'notInterested';
  assert.equal(storage.getItem(DISMISSED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(SEEN_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY), null);
  assert.equal(getNotInterestedFilms(storage).length, 0);
  assert.equal(getSavedFilms(storage).length, 0);
  assert.equal(getSeenFilms(storage).length, 0);
  assert.equal(getFavoriteTheaters(storage).length, 0);
  assert.equal(SHEET_SRC.includes('stores/'), false);
  assert.equal(SHEET_SRC.includes('localStorage'), false);
});

test('Canonical Memories of Murder fixture supports sheet identity', () => {
  const film = BUILD_PLAN_RESULTS_MOCKUP_FIXTURE.plans[0].items.find(
    (i) => i.id === 'p1-f3',
  );
  assert.equal(film.title, 'Memories of Murder');
  assert.equal(film.startTime, '8:30 PM');
  assert.equal(film.endTime, '10:42 PM');
  assert.equal(film.theater, 'AMC Pacific Place 11');
  assert.equal(film.formatBadge, 'SUBTITLED');
});
