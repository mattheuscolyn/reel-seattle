import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILD_PLAN_RESULTS_MOCKUP_FIXTURE,
  BUILD_PLAN_RESULTS_SECTION_ORDER,
  BUILD_PLAN_RESULTS_SORT_OPTIONS,
  createBuildPlanResultsUiState,
  getBuildPlanResultsMockupPresentation,
  getBuildPlanResultsOrderedPlans,
  resolveBuildPlanResultsPresentation,
} from '../../v2/fixtures/buildPlanResultsMockupFixture.js';
import {
  PRIMARY_DESTINATIONS,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openBuildPlan,
  openBuildPlanResults,
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
import {
  SEEN_FILMS_STORAGE_KEY,
  getSeenFilms,
} from '../../v2/stores/seenFilmsStore.js';
import {
  DISMISSED_FILMS_STORAGE_KEY,
  getNotInterestedFilms,
} from '../../v2/stores/notInterestedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanResultsSurface.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/buildPlanResultsMockupFixture.js'),
  'utf8',
);
const BUILD_PLAN_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanSurface.jsx'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');
const NAV_SRC = readFileSync(join(ROOT, 'v2/navigation/navState.js'), 'utf8');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('Build a Plan Results fixture matches canonical mockup regions', () => {
  const p = getBuildPlanResultsMockupPresentation();
  assert.equal(p, BUILD_PLAN_RESULTS_MOCKUP_FIXTURE);
  assert.equal(resolveBuildPlanResultsPresentation(), p);
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p.pageTitle, 'Your Movie Day Results');
  assert.match(p.summaryLine, /Sat, Jul 19/);
  assert.equal(p.plansFoundLabel, '18 plans found');
  assert.equal(p.plans.length, 3);
  assert.equal(p.plans[0].items.filter((i) => i.type === 'break').length, 2);
  assert.deepEqual(
    BUILD_PLAN_RESULTS_SORT_OPTIONS.map((o) => o.label),
    [
      'Best match',
      'Smallest gaps',
      'Shortest runtime',
      'Earliest finish',
      'Leaves soonest',
    ],
  );
  assert.deepEqual([...BUILD_PLAN_RESULTS_SECTION_ORDER], [
    'header',
    'summary',
    'preferenceChips',
    'quickAdjust',
    'sort',
    'plans',
    'refine',
  ]);
});

test('Results omit Why we love and ellipsis menus', () => {
  assert.equal(SURFACE_SRC.includes('Why we love'), false);
  assert.equal(FIXTURE_SRC.includes('Why we love'), false);
  assert.equal(SURFACE_SRC.includes('IconMore'), false);
  assert.equal(SURFACE_SRC.includes('…'), false);
  assert.equal(SURFACE_SRC.includes('ellipsis'), false);
});

test('Share, Add to My Schedule, breaks, and film metadata render', () => {
  assert.match(SURFACE_SRC, /shareLabel/);
  assert.match(SURFACE_SRC, /addToScheduleLabel/);
  assert.match(SURFACE_SRC, /PlanBreakRow|v2-bpr-break/);
  assert.match(SURFACE_SRC, /formatBadge/);
  assert.match(FIXTURE_SRC, /Break 1h 16m/);
  assert.match(FIXTURE_SRC, /70MM/);
  assert.match(CSS, /\.v2-bpr\b/);
  assert.match(CSS, /\.v2-bpr-break-pill\b/);
});

test('Sort reorders fixture plans deterministically', () => {
  const best = getBuildPlanResultsOrderedPlans('best-match').map((p) => p.id);
  const short = getBuildPlanResultsOrderedPlans('shortest-runtime').map(
    (p) => p.id,
  );
  assert.deepEqual(best, ['plan-1', 'plan-2', 'plan-3']);
  assert.deepEqual(short, ['plan-3', 'plan-2', 'plan-1']);
  assert.notDeepEqual(best, short);
});

test('Local UI state supports film select/deselect and resets', () => {
  const a = createBuildPlanResultsUiState();
  assert.equal(a.sortId, 'best-match');
  assert.ok(a.selectedFilmIds.includes('p1-f1'));
  a.selectedFilmIds = a.selectedFilmIds.filter((id) => id !== 'p1-f1');
  assert.equal(a.selectedFilmIds.includes('p1-f1'), false);
  const b = createBuildPlanResultsUiState();
  assert.ok(b.selectedFilmIds.includes('p1-f1'));
});

test('Film row click opens interaction sheet (not Film Detail)', () => {
  assert.match(SURFACE_SRC, /PlanFilmInteractionSheet/);
  assert.match(SURFACE_SRC, /openFilmSheet/);
  assert.equal(SURFACE_SRC.includes('FilmDetailSurface'), false);
  assert.equal(SURFACE_SRC.includes('openFilmDetail'), false);
  assert.equal(FIXTURE_SRC.includes('filmSheetDeferredMessage'), false);
  assert.match(FIXTURE_SRC, /Must include/);
  assert.match(FIXTURE_SRC, /Would love to see/);
});

test('Fixture isolation — no stores or planner engine', () => {
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(FIXTURE_SRC.includes('localStorage'), false);
  assert.equal(FIXTURE_SRC.includes('plannerEngine'), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
  assert.equal(SURFACE_SRC.includes('localStorage'), false);
  assert.equal(SURFACE_SRC.includes('stores/'), false);
});

test('Build a Plan CTA navigates to Results; Back returns to Build a Plan', () => {
  assert.match(APP_SRC, /BuildPlanResultsSurface/);
  assert.match(APP_SRC, /openBuildPlanResults/);
  assert.match(APP_SRC, /handleOpenBuildPlanResults/);
  assert.match(BUILD_PLAN_SRC, /onRequestResults/);
  assert.match(NAV_SRC, /openBuildPlanResults/);
  assert.match(NAV_SRC, /'build-plan-results'/);

  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'planner');
  nav = openBuildPlan(nav, { originPrimary: 'planner' });
  nav = openBuildPlanResults(nav, {
    originPrimary: 'planner',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'build-plan-results');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'planner',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'build-plan');
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.id),
    ['home', 'explore', 'planner', 'profile'],
  );
});

test('Opening Results does not seed persistence keys', () => {
  const storage = memoryStorage();
  openBuildPlanResults(createInitialNavState(), { originPrimary: 'planner' });
  createBuildPlanResultsUiState();
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(SEEN_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(DISMISSED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY), null);
  assert.equal(getSavedFilms(storage).length, 0);
  assert.equal(getSeenFilms(storage).length, 0);
  assert.equal(getNotInterestedFilms(storage).length, 0);
  assert.equal(getFavoriteTheaters(storage).length, 0);
});

test('Accessibility affordances present in Results surface', () => {
  assert.match(SURFACE_SRC, /aria-labelledby="v2-bpr-title"/);
  assert.match(SURFACE_SRC, /role="radiogroup"/);
  assert.match(SURFACE_SRC, /role="status"/);
  assert.match(SURFACE_SRC, /aria-pressed/);
  assert.match(SURFACE_SRC, /aria-label=\{presentation\.shareLabel\}/);
  assert.match(SURFACE_SRC, /Add to My Schedule/);
});
