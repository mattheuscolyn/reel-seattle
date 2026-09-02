/**
 * Planner / My Schedule product-alignment cleanup tests.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptResultsPlan } from '../../v2/planner/acceptPlanFromResults.js';
import { getAcceptedPlans } from '../../v2/stores/acceptedPlansStore.js';
import { composePlannerLandingFromAcceptedPlans } from '../../v2/planner/composePlannerLandingPresentation.js';
import {
  createInitialNavState,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import { PRIMARY_DESTINATIONS } from '../../v2/destinations.js';
import {
  MY_SCHEDULE_WEEK_QUERY,
} from '../../v2/fixtures/myScheduleWeekMockupFixture.js';
import { MY_SCHEDULE_MONTH_QUERY } from '../../v2/fixtures/myScheduleMonthMockupFixture.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const PLANNER_SRC = readFileSync(join(ROOT, 'v2/planner/PlannerDestination.jsx'), 'utf8');
const DETAILS_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanPlanDetailsSurface.jsx'),
  'utf8',
);
const RESULTS_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanResultsSurface.jsx'),
  'utf8',
);
const ACCEPT_SRC = readFileSync(
  join(ROOT, 'v2/planner/acceptPlanFromResults.js'),
  'utf8',
);
const DEST_PLACEHOLDER_SRC = readFileSync(
  join(ROOT, 'v2/DestinationPlaceholder.jsx'),
  'utf8',
);

const NOW = new Date('2026-07-28T12:00:00-07:00');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function livePlanItem(overrides = {}) {
  return {
    type: 'film',
    id: 'film-1',
    title: 'Test Film',
    filmKey: 'src:test:film-1',
    filmId: 'tmdb:99',
    source: 'fixture-test',
    sourceShowtimeId: 'st-1',
    theaterId: 'theater-a',
    theaterName: 'Theater A',
    localDate: '2026-07-28',
    date: '2026-07-28',
    localTime: '19:00',
    time: '19:00',
    runtimeMin: 100,
    runtime: 100,
    ...overrides,
  };
}

test('primary navigation has Planner and no My Schedule destination', () => {
  const labels = PRIMARY_DESTINATIONS.map((d) => d.label);
  assert.ok(labels.includes('Planner'));
  assert.equal(labels.includes('My Schedule'), false);
});

test('Planner landing does not expose My Schedule week navigation', () => {
  assert.equal(PLANNER_SRC.includes('onOpenMyScheduleWeek'), false);
  assert.doesNotMatch(PLANNER_SRC, /openMyScheduleWeek/);
  assert.match(PLANNER_SRC, /timelineExpanded/);
});

test('Build a Plan surfaces use Planner acceptance terminology', () => {
  assert.match(ACCEPT_SRC, /Added to Planner/);
  assert.doesNotMatch(ACCEPT_SRC, /Add to My Schedule/);
  assert.match(RESULTS_SRC, /Add to Planner/);
  assert.doesNotMatch(RESULTS_SRC, /Add to My Schedule/);
  assert.match(DETAILS_SRC, /View in Planner/);
  assert.doesNotMatch(DETAILS_SRC, /View in My Schedule/);
  assert.match(DETAILS_SRC, /Add to Planner/);
  assert.doesNotMatch(DETAILS_SRC, /Add to My Schedule/);
});

test('Plan Details routes to Planner primary destination, not My Schedule week', () => {
  assert.match(APP_SRC, /onViewInPlanner/);
  assert.match(APP_SRC, /selectPrimaryDestination\(current, 'planner'\)/);
  assert.doesNotMatch(APP_SRC, /onViewInSchedule/);
});

test('DestinationPlaceholder does not wire stale My Schedule week callback', () => {
  assert.equal(DEST_PLACEHOLDER_SRC.includes('onOpenMyScheduleWeek'), false);
});

test('accepting a live plan persists screenings visible in Planner Upcoming', () => {
  const storage = memoryStorage();
  const plan = {
    id: 'plan-live-1',
    provenance: 'live',
    source: 'live',
    date: '2026-07-28',
    items: [livePlanItem()],
  };
  const result = acceptResultsPlan(plan, [], {
    storage,
    provenance: 'live',
  });
  assert.equal(result.ok, true);
  assert.equal(result.message, 'Added to Planner.');
  const landing = composePlannerLandingFromAcceptedPlans({ storage, now: NOW });
  assert.equal(landing.upcoming.dateGroups.length, 1);
  assert.equal(landing.upcoming.dateGroups[0].items[0].kind, 'screening');
  assert.equal(getAcceptedPlans(storage).length, 1);
});

test('View in Planner selects planner tab and clears deep surface', () => {
  let state = createInitialNavState();
  state = selectPrimaryDestination(state, 'planner');
  assert.equal(state.primaryDestinationId, 'planner');
  assert.equal(state.surface, null);
});

test('legacy My Schedule dev query params remain defined', () => {
  assert.equal(MY_SCHEDULE_WEEK_QUERY, 'myScheduleWeek');
  assert.equal(MY_SCHEDULE_MONTH_QUERY, 'myScheduleMonth');
  assert.match(APP_SRC, /isMyScheduleWeekQueryOpen/);
  assert.match(APP_SRC, /isMyScheduleMonthQueryOpen/);
});
