import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLANNER_LANDING_MOCKUP_FIXTURE,
  PLANNER_LANDING_SECTION_ORDER,
  PLANNER_MOCKUP_QUERY,
  getPlannerLandingMockupPresentation,
  isPlannerMockupMode,
} from '../../v2/fixtures/plannerLandingMockupFixture.js';
import { composePlannerLandingFromAcceptedPlans } from '../../v2/planner/composePlannerLandingPresentation.js';
import {
  PRIMARY_DESTINATIONS,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  openFilmDetail,
  selectPrimaryDestination,
  startPlannerFromFilm,
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
const PLANNER_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannerDestination.jsx'),
  'utf8',
);
const PLACEHOLDER_SRC = readFileSync(
  join(ROOT, 'v2/DestinationPlaceholder.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/plannerLandingMockupFixture.js'),
  'utf8',
);
const COMPOSE_SRC = readFileSync(
  join(ROOT, 'v2/planner/composePlannerLandingPresentation.js'),
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

test('Planner Landing fixture matches canonical mockup sections', () => {
  const p = getPlannerLandingMockupPresentation();
  assert.equal(p.source, 'planner-landing-mockup');
  assert.equal(p, PLANNER_LANDING_MOCKUP_FIXTURE);
  assert.equal(p.pageTitle, 'Planner');
  assert.match(p.pageTagline, /See what/);
  assert.equal(p.summary.upcomingCount, 5);
  assert.equal(p.summary.draftCount, 1);
  assert.equal(p.summary.nextPlanValue, 'Tonight');
  assert.equal(p.upcoming.plans.length, 3);
  assert.equal(p.upcoming.plans[0].title, 'The Long Horizon');
  assert.equal(p.upcoming.plans[2].badges[0].label, '2-film plan');
  assert.equal(p.entries[0].title, 'My Schedule');
  assert.equal(p.entries[1].title, 'Build a Plan');
  assert.equal(p.draft.visible, true);
  assert.equal(p.draft.title, 'Saturday movie day');
  assert.deepEqual([...PLANNER_LANDING_SECTION_ORDER], [
    'header',
    'summary',
    'entryCards',
    'upcomingPlans',
    'draft',
  ]);
  assert.equal(PLANNER_MOCKUP_QUERY, 'plannerMockup');
  assert.equal(typeof isPlannerMockupMode, 'function');
});

test('Planner fixture does not import stores or planner persistence', () => {
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(FIXTURE_SRC.includes('plannerEngine'), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
  // localStorage is only used for optional mockup-mode detection.
  assert.match(FIXTURE_SRC, /PLANNER_MOCKUP_STORAGE_KEY/);
});

test('production Planner compose stays honest without fixture films', () => {
  const storage = memoryStorage();
  const p = composePlannerLandingFromAcceptedPlans({ storage });
  assert.equal(p.source, 'accepted-plans');
  assert.equal(p.upcoming.plans.length, 0);
  assert.equal(p.draft.visible, false);
  assert.equal(p.summary.upcomingCount, 0);
  assert.equal(p.summary.draftCount, 0);
  assert.match(p.upcoming.emptyTitle, /No upcoming plans/i);
  assert.equal(p.pageTitle, 'Planner');
  assert.equal(COMPOSE_SRC.includes('Long Horizon'), false);
  assert.equal(COMPOSE_SRC.includes('Blue Hour'), false);
});

test('Planner destination replaces placeholder shell', () => {
  assert.match(PLACEHOLDER_SRC, /PlannerDestination/);
  assert.match(PLANNER_SRC, /data-planner-source/);
  assert.match(PLANNER_SRC, /data-planner-section="header"/);
  assert.match(PLANNER_SRC, /data-planner-section="summary"/);
  assert.match(PLANNER_SRC, /data-planner-section="upcomingPlans"/);
  assert.match(PLANNER_SRC, /data-planner-section="entryCards"/);
  assert.match(PLANNER_SRC, /data-planner-section="draft"/);
  assert.equal(PLANNER_SRC.includes('recentActivity'), false);
  assert.equal(PLANNER_SRC.includes('v2 shell · placeholder'), false);
  assert.match(PLANNER_SRC, /isPlannerMockupMode/);
});

test('Planner landing keeps interactive controls as buttons', () => {
  assert.match(PLANNER_SRC, /v2-planner-plan-row/);
  assert.match(PLANNER_SRC, /v2-planner-entry-card/);
  assert.match(PLANNER_SRC, /v2-planner-draft-card/);
  assert.match(PLANNER_SRC, /type="button"/);
  assert.match(PLANNER_SRC, /aria-labelledby="v2-planner-title"/);
  assert.match(PLANNER_SRC, /onOpenMyScheduleWeek/);
  assert.match(PLANNER_SRC, /onOpenBuildPlan/);
});

test('Planner landing CSS covers summary entries plans and draft', () => {
  assert.match(CSS, /\.v2-planner\b/);
  assert.match(CSS, /\.v2-planner-summary\b/);
  assert.match(CSS, /\.v2-planner-plan-row\b/);
  assert.match(CSS, /\.v2-planner-entry-card\b/);
  assert.match(CSS, /\.v2-planner-draft-card\b/);
  assert.match(CSS, /\.v2-planner-entry-purple\b/);
  assert.match(CSS, /\.v2-planner-entry-teal\b/);
  assert.match(CSS, /--v2-nav-clearance/);
  assert.match(
    CSS,
    /padding-bottom:\s*calc\(\s*var\(--v2-nav-height\)\s*\+\s*var\(--v2-nav-clearance\)/,
  );
});

test('Planner tab activates correctly and nav unchanged', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.id),
    ['home', 'explore', 'planner', 'profile'],
  );
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'planner');
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'planner',
  );
});

test('Film Detail planner seed still reaches Planner destination', () => {
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, {
    filmKey: 'alpha',
    opportunityKey: null,
    originPrimary: 'home',
  });
  nav = startPlannerFromFilm(nav, {
    filmKey: 'alpha',
    opportunityKey: null,
    mode: 'multi',
  });
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.equal(nav.plannerSeed?.filmKey, 'alpha');
  assert.equal(nav.plannerSeed?.mode, 'multi');
});

test('Planner landing interactions do not mutate storage', () => {
  assert.equal(PLANNER_SRC.includes('localStorage'), false);
  assert.equal(PLANNER_SRC.includes('savedFilmsStore'), false);
  assert.equal(PLANNER_SRC.includes('getSavedFilms'), false);
  const storage = memoryStorage();
  assert.equal(getSavedFilms(storage).length, 0);
  assert.equal(getFavoriteTheaters(storage).length, 0);
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY), null);
});

test('mockup mode isolation stays behind plannerMockup query', () => {
  assert.match(FIXTURE_SRC, /PLANNER_MOCKUP_QUERY/);
  assert.match(PLANNER_SRC, /isPlannerMockupMode/);
  assert.match(PLANNER_SRC, /getPlannerLandingMockupPresentation/);
  assert.match(PLANNER_SRC, /composePlannerLandingFromAcceptedPlans/);
});
