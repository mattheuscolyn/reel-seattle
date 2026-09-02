import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getAcceptedPlanById,
  getAcceptedPlans,
  removePerformanceFromAcceptedPlan,
  setAcceptedPlanPerformanceTicketsPurchased,
} from '../../v2/stores/acceptedPlansStore.js';
import { acceptResultsPlan } from '../../v2/planner/acceptPlanFromResults.js';
import { composePlannerLandingFromAcceptedPlans } from '../../v2/planner/composePlannerLandingPresentation.js';
import { resolvePlannedScreeningPresentation } from '../../v2/planner/resolvePlannedScreeningPresentation.js';
import { deriveOtherShowtimesAtTheater } from '../../v2/planner/deriveOtherShowtimesAtTheater.js';
import {
  PLANNER_SCREENING_MOCKUP_IDS,
  resolvePlannedScreeningMockupPresentation,
} from '../../v2/fixtures/plannerScreeningSheetMockupFixture.js';
import {
  createInitialNavState,
  openBuildPlanPlanDetails,
} from '../../v2/navigation/navState.js';
import { resolveSavedPlanDetailsPlan } from '../../v2/planner/planLifecycle.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLANNER_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannerDestination.jsx'),
  'utf8',
);
const SHEET_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannedScreeningSheet.jsx'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

const DATE = '2026-08-20';
const NOW = new Date('2026-08-08T18:00:00-07:00');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function liveFilm(overrides = {}) {
  return {
    type: 'film',
    title: 'Alpha',
    theaterId: 'theater-a',
    theaterName: 'Theater A',
    localDate: DATE,
    date: DATE,
    localTime: '19:00',
    time: '19:00',
    runtimeMin: 90,
    runtime: 90,
    format: '35mm',
    filmKey: 'alpha',
    filmId: 'tmdb:1',
    source: 'fixture-test',
    sourceShowtimeId: 'oa1',
    opportunityKey: 'oa1',
    ticketUrl: 'https://example.com/t/oa1',
    posterUrl: 'https://example.com/a.jpg',
    provenance: 'live',
    ...overrides,
  };
}

function homeDataWithShowtimes() {
  return {
    films: [
      {
        filmKey: 'alpha',
        filmId: 'tmdb:1',
        title: 'Alpha',
        runtimeMin: 90,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'oa1',
        filmKey: 'alpha',
        title: 'Alpha',
        theaterId: 'theater-a',
        theaterName: 'Theater A',
        localDate: DATE,
        localTime: '19:00',
        runtimeMin: 90,
        source: 'fixture-test',
        sourceShowtimeId: 'oa1',
        sortableLocalDateTime: `${DATE}T19:00`,
        ticketUrl: 'https://example.com/t/oa1',
        formatLabels: ['35mm'],
      },
      {
        opportunityKey: 'oa2',
        filmKey: 'alpha',
        title: 'Alpha',
        theaterId: 'theater-a',
        theaterName: 'Theater A',
        localDate: DATE,
        localTime: '21:30',
        runtimeMin: 90,
        source: 'fixture-test',
        sourceShowtimeId: 'oa2',
        sortableLocalDateTime: `${DATE}T21:30`,
        ticketUrl: 'https://example.com/t/oa2',
        formatLabels: ['35mm'],
      },
      {
        opportunityKey: 'oa3',
        filmKey: 'alpha',
        title: 'Alpha',
        theaterId: 'theater-a',
        theaterName: 'Theater A',
        localDate: DATE,
        localTime: '16:00',
        runtimeMin: 90,
        source: 'fixture-test',
        sourceShowtimeId: 'oa3',
        sortableLocalDateTime: `${DATE}T16:00`,
        ticketUrl: 'https://example.com/t/oa3',
        formatLabels: ['35mm'],
      },
      {
        opportunityKey: 'oa-b',
        filmKey: 'alpha',
        title: 'Alpha',
        theaterId: 'theater-b',
        theaterName: 'Theater B',
        localDate: DATE,
        localTime: '20:00',
        runtimeMin: 90,
        source: 'fixture-test',
        sourceShowtimeId: 'oa-b',
        sortableLocalDateTime: `${DATE}T20:00`,
      },
    ],
  };
}

function acceptSingleFilm(storage, overrides = {}) {
  return acceptResultsPlan(
    {
      id: 'live-single',
      provenance: 'live',
      source: 'live',
      date: DATE,
      items: [liveFilm(overrides)],
    },
    [],
    { storage, provenance: 'live' },
  );
}

function acceptTwoFilmPlan(storage) {
  return acceptResultsPlan(
    {
      id: 'live-double',
      provenance: 'live',
      source: 'live',
      date: DATE,
      items: [
        liveFilm({
          title: 'Saltwater Road',
          filmKey: 'salt',
          filmId: 'tmdb:2',
          localTime: '14:00',
          time: '14:00',
          sourceShowtimeId: 'sw-1',
          opportunityKey: 'sw-1',
        }),
        liveFilm({
          title: 'Blue Hour',
          filmKey: 'blue',
          filmId: 'tmdb:3',
          localTime: '19:40',
          time: '19:40',
          sourceShowtimeId: 'bh-1',
          opportunityKey: 'bh-1',
        }),
      ],
    },
    [],
    { storage, provenance: 'live' },
  );
}

test('Planner Upcoming screening rows open screening sheet, not plan details', () => {
  assert.match(PLANNER_SRC, /PlannedScreeningSheet/);
  assert.match(PLANNER_SRC, /openScreening/);
  assert.match(PLANNER_SRC, /data-performance-key/);
  assert.doesNotMatch(PLANNER_SRC, /onOpenSavedPlan/);
  assert.match(SHEET_SRC, /data-planned-screening-sheet/);
});

test('resolvePlannedScreeningPresentation selects planId + performanceKey', () => {
  const storage = memoryStorage();
  const accepted = acceptSingleFilm(storage);
  const plan = getAcceptedPlanById(storage, accepted.plan.planId);
  const perfKey = plan.performances[0].performanceKey;
  const resolved = resolvePlannedScreeningPresentation({
    planId: plan.planId,
    performanceKey: perfKey,
    storage,
    homeData: homeDataWithShowtimes(),
    now: NOW,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.screening.planId, plan.planId);
  assert.equal(resolved.screening.performanceKey, perfKey);
  assert.equal(resolved.screening.title, 'Alpha');
  assert.equal(resolved.screening.theaterId, 'theater-a');
  assert.equal(resolved.screening.filmKey, 'alpha');
});

test('multi-film plan resolves each screening independently', () => {
  const storage = memoryStorage();
  const accepted = acceptTwoFilmPlan(storage);
  const plan = getAcceptedPlanById(storage, accepted.plan.planId);
  const firstKey = plan.performances[0].performanceKey;
  const secondKey = plan.performances[1].performanceKey;
  const a = resolvePlannedScreeningPresentation({
    planId: plan.planId,
    performanceKey: firstKey,
    storage,
    now: NOW,
  });
  const b = resolvePlannedScreeningPresentation({
    planId: plan.planId,
    performanceKey: secondKey,
    storage,
    now: NOW,
  });
  assert.equal(a.screening.title, 'Saltwater Road');
  assert.equal(b.screening.title, 'Blue Hour');
  assert.equal(a.screening.performanceCount, 2);
  assert.equal(b.screening.performanceCount, 2);
});

test('deriveOtherShowtimesAtTheater filters same film and theater and excludes current', () => {
  const homeData = homeDataWithShowtimes();
  const derived = deriveOtherShowtimesAtTheater(homeData, {
    filmKey: 'alpha',
    theaterId: 'theater-a',
    localDate: DATE,
    localTime: '19:00',
    source: 'fixture-test',
    sourceShowtimeId: 'oa1',
    now: NOW,
  });
  assert.equal(derived.items.length, 2);
  assert.equal(derived.items[0].localTime, '16:00');
  assert.equal(derived.items[1].localTime, '21:30');
  assert.ok(derived.items.every((row) => row.theaterId === 'theater-a'));
  assert.ok(
    derived.items.every(
      (row) => !(row.localTime === '19:00' && row.localDate === DATE),
    ),
  );
});

test('tickets purchased persists per performance', () => {
  const storage = memoryStorage();
  const accepted = acceptSingleFilm(storage);
  const plan = getAcceptedPlanById(storage, accepted.plan.planId);
  const perfKey = plan.performances[0].performanceKey;
  const toggled = setAcceptedPlanPerformanceTicketsPurchased(
    storage,
    plan.planId,
    perfKey,
    true,
  );
  assert.equal(toggled.ok, true);
  assert.equal(toggled.changed, true);
  const reread = getAcceptedPlanById(storage, plan.planId);
  assert.equal(reread.performances[0].ticketsPurchased, true);
});

test('removePerformanceFromAcceptedPlan removes only selected performance in multi-film plan', () => {
  const storage = memoryStorage();
  const accepted = acceptTwoFilmPlan(storage);
  const plan = getAcceptedPlanById(storage, accepted.plan.planId);
  const removeKey = plan.performances[0].performanceKey;
  const removed = removePerformanceFromAcceptedPlan(
    storage,
    plan.planId,
    removeKey,
  );
  assert.equal(removed.ok, true);
  assert.equal(removed.changed, true);
  assert.equal(removed.removedPlanId, null);
  const updated = getAcceptedPlanById(storage, plan.planId);
  assert.ok(updated);
  assert.equal(updated.planId, plan.planId);
  assert.equal(getAcceptedPlans(storage).length, 1);
  assert.equal(updated.performances.length, 1);
  assert.equal(updated.performances[0].title, 'Blue Hour');
});

test('removePerformanceFromAcceptedPlan deletes single-performance plan', () => {
  const storage = memoryStorage();
  const accepted = acceptSingleFilm(storage);
  const planId = accepted.plan.planId;
  const perfKey = accepted.plan.performances[0].performanceKey;
  const removed = removePerformanceFromAcceptedPlan(storage, planId, perfKey);
  assert.equal(removed.ok, true);
  assert.equal(getAcceptedPlans(storage).length, 0);
});

test('Upcoming landing updates after screening removal', () => {
  const storage = memoryStorage();
  const accepted = acceptSingleFilm(storage);
  const perfKey = accepted.plan.performances[0].performanceKey;
  removePerformanceFromAcceptedPlan(storage, accepted.plan.planId, perfKey);
  const landing = composePlannerLandingFromAcceptedPlans({ storage, now: NOW });
  assert.equal(landing.summary.screeningCount, 0);
  assert.equal(landing.upcoming.dateGroups.length, 0);
});

test('Plan Details navigation remains available from nav state', () => {
  const storage = memoryStorage();
  const accepted = acceptSingleFilm(storage);
  const plan = resolveSavedPlanDetailsPlan(accepted.plan.planId, { storage });
  assert.ok(plan);
  let nav = createInitialNavState();
  nav = openBuildPlanPlanDetails(nav, {
    originPrimary: 'planner',
    plan,
    planId: accepted.plan.planId,
    returnSurface: null,
  });
  assert.equal(nav.surface.type, 'build-plan-plan-details');
  assert.equal(nav.surface.planId, accepted.plan.planId);
});

test('plannerMockup fixture opens canonical screening sheet presentation', () => {
  const resolved = resolvePlannedScreeningMockupPresentation(
    PLANNER_SCREENING_MOCKUP_IDS.planId,
    PLANNER_SCREENING_MOCKUP_IDS.performanceKey,
  );
  assert.equal(resolved.ok, true);
  assert.equal(resolved.screening.title, 'The Conversation');
  assert.equal(resolved.screening.theaterName, 'SIFF Uptown');
  assert.equal(resolved.otherShowtimes.visibleItems.length, 2);
  assert.match(resolved.screening.ticketUrl, /^https:\/\//);
});

test('planned screening sheet CSS covers canonical structure', () => {
  assert.match(CSS, /\.v2-pss-sheet\b/);
  assert.match(CSS, /\.v2-pss-tickets-btn\b/);
  assert.match(CSS, /\.v2-pss-remove\b/);
  assert.match(CSS, /\.v2-pss-toggle\b/);
});
