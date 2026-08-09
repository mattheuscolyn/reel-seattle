import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCEPTED_PLANS_STORAGE_KEY,
  acceptPlan,
  getAcceptedPlanById,
  getAcceptedPlans,
  removeAcceptedPlan,
} from '../../v2/stores/acceptedPlansStore.js';
import { acceptResultsPlan } from '../../v2/planner/acceptPlanFromResults.js';
import { composePlannerLandingFromAcceptedPlans } from '../../v2/planner/composePlannerLandingPresentation.js';
import { acceptedPlanToPlanDetailsPlan } from '../../v2/planner/acceptedPlanToPlanDetails.js';
import { derivePlanDetailsViewModel } from '../../v2/planner/derivePlanDetailsViewModel.js';
import {
  createInitialNavState,
  navigateBack,
  openBuildPlanPlanDetails,
  openMyScheduleWeek,
} from '../../v2/navigation/navState.js';
import {
  formatLongPlanDateLabel,
  isAcceptedPlanUpcoming,
  isSavedPlanDetailsPlan,
  partitionAcceptedPlans,
  resolveSavedPlanDetailsPlan,
} from '../../v2/planner/planLifecycle.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

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
    title: 'Blue Hour',
    theaterId: 'the-beacon',
    theaterName: 'The Beacon',
    theater: 'The Beacon',
    localDate: '2026-08-10',
    date: '2026-08-10',
    localTime: '19:40',
    time: '19:40',
    startTime: '7:40 PM',
    endTime: '9:25 PM',
    runtimeMin: 105,
    runtime: 105,
    format: '35mm',
    filmKey: 'src:beacon:blue-hour',
    filmId: 'tmdb:101',
    posterUrl: 'https://example.com/blue.jpg',
    source: 'beacon',
    sourceShowtimeId: 'bh-1',
    opportunityKey: 'opp-blue',
    addressLabel: '3505 Fremont Ave N',
    provenance: 'live',
    ...overrides,
  };
}

function acceptTwoFilmPlan(storage, date = '2026-08-10') {
  const plan = {
    id: `live-beacon-1-${date}`,
    provenance: 'live',
    source: 'live',
    date,
    items: [
      liveFilm({
        localDate: date,
        date,
        localTime: '14:00',
        time: '14:00',
        title: 'Saltwater Road',
        filmKey: 'src:beacon:saltwater',
        filmId: 'tmdb:202',
        sourceShowtimeId: 'sw-1',
        posterUrl: 'https://example.com/salt.jpg',
      }),
      { type: 'break', label: 'Break 45m', durationMin: 45 },
      liveFilm({
        localDate: date,
        date,
        localTime: '16:30',
        time: '16:30',
        title: 'Blue Hour',
        filmKey: 'src:beacon:blue-hour',
        filmId: 'tmdb:101',
        sourceShowtimeId: 'bh-2',
      }),
    ],
  };
  return acceptResultsPlan(plan, [], {
    storage,
    provenance: 'live',
    label: 'Your Movie Day Plan',
  });
}

test('accepting a generated result creates a persistent saved plan with stable id', () => {
  const storage = memoryStorage();
  const result = acceptTwoFilmPlan(storage);
  assert.equal(result.ok, true);
  assert.ok(result.plan?.planId?.startsWith('accepted:2026-08-10:'));
  const saved = getAcceptedPlanById(storage, result.plan.planId);
  assert.ok(saved);
  assert.equal(saved.performances.length, 2);
  assert.equal(saved.performances[0].title, 'Saltwater Road');
  assert.equal(saved.performances[0].posterUrl, 'https://example.com/salt.jpg');
  assert.equal(saved.performances[1].theaterName, 'The Beacon');
  assert.ok(saved.performances[0].startsAt);
  assert.ok(saved.performances[0].expectedEndsAt);
  assert.equal(saved.performances[0].runtimeMin, 105);
});

test('saved plan snapshots remain renderable without showtimes_current enrichment', () => {
  const storage = memoryStorage();
  const result = acceptTwoFilmPlan(storage, '2026-07-01');
  const resolved = resolveSavedPlanDetailsPlan(result.plan.planId, {
    storage,
    enrichmentIndex: null,
    homeData: null,
  });
  assert.ok(resolved);
  assert.equal(resolved.source, 'accepted-plan');
  assert.equal(resolved.mode, 'saved');
  assert.match(resolved.dateLabel, /July/);
  const view = derivePlanDetailsViewModel(resolved);
  assert.equal(view.title, 'Your Movie Day Plan');
  assert.ok(view.itinerary.some((row) => row.kind === 'film'));
  assert.ok(view.itinerary.some((row) => row.kind === 'break'));
  assert.equal(view.movieCount, 2);
  assert.ok(Number(view.stats.breaksValue) >= 1);
  assert.match(view.summaryLine, /July/);
});

test('Planner landing upcoming list reads saved plans and excludes past plans', () => {
  const storage = memoryStorage();
  acceptTwoFilmPlan(storage, '2026-08-20');
  acceptTwoFilmPlan(storage, '2026-06-01');
  const now = new Date('2026-08-08T18:00:00-07:00');
  const landing = composePlannerLandingFromAcceptedPlans({ storage, now });
  assert.equal(landing.summary.upcomingCount, 1);
  assert.equal(landing.upcoming.plans.length, 1);
  assert.equal(landing.upcoming.plans[0].planId.startsWith('accepted:2026-08-20:'), true);
  assert.equal(landing.past.plans.length, 1);
  assert.equal(landing.past.sectionTitle, 'Past Plans');
  assert.ok(!landing.upcoming.plans[0].title.includes('Results'));
});

test('openBuildPlanPlanDetails supports planId and returns to Planner by default', () => {
  const storage = memoryStorage();
  const accepted = acceptTwoFilmPlan(storage);
  const plan = resolveSavedPlanDetailsPlan(accepted.plan.planId, { storage });
  let state = createInitialNavState();
  state = {
    ...state,
    primaryDestinationId: 'planner',
    surface: null,
  };
  state = openBuildPlanPlanDetails(state, {
    plan,
    planId: accepted.plan.planId,
    originPrimary: 'planner',
    returnSurface: null,
  });
  assert.equal(state.surface.type, 'build-plan-plan-details');
  assert.equal(state.surface.planId, accepted.plan.planId);
  assert.equal(state.surface.returnSurface, null);
  state = navigateBack(state);
  assert.equal(state.surface, null);
  assert.equal(state.primaryDestinationId, 'planner');
});

test('multiple saved plans remain distinct and open independently', () => {
  const storage = memoryStorage();
  const a = acceptTwoFilmPlan(storage, '2026-08-11');
  const b = acceptResultsPlan(
    {
      id: 'live-other',
      provenance: 'live',
      items: [
        liveFilm({
          localDate: '2026-08-12',
          date: '2026-08-12',
          localTime: '18:00',
          time: '18:00',
          title: 'After the Storm',
          filmKey: 'src:beacon:storm',
          filmId: 'tmdb:303',
          sourceShowtimeId: 'st-1',
          theaterId: 'siff-uptown',
          theaterName: 'SIFF Uptown',
        }),
      ],
    },
    [],
    { storage, provenance: 'live' },
  );
  assert.notEqual(a.plan?.planId, b.plan?.planId);
  assert.equal(getAcceptedPlans(storage).length, 2);
  const planA = resolveSavedPlanDetailsPlan(a.plan.planId, { storage });
  const planB = resolveSavedPlanDetailsPlan(b.plan.planId, { storage });
  assert.equal(planA.items.filter((i) => i.type !== 'break').length, 2);
  assert.equal(planB.items.filter((i) => i.type !== 'break').length, 1);
  assert.equal(planB.items[0].title, 'After the Storm');
});

test('upcoming/past classification uses plan end time', () => {
  const storage = memoryStorage();
  acceptTwoFilmPlan(storage, '2026-08-08');
  const plan = getAcceptedPlans(storage)[0];
  const beforeEnd = new Date('2026-08-08T12:00:00-07:00');
  const afterEnd = new Date('2026-08-09T12:00:00-07:00');
  assert.equal(isAcceptedPlanUpcoming(plan, beforeEnd), true);
  assert.equal(isAcceptedPlanUpcoming(plan, afterEnd), false);
  const parts = partitionAcceptedPlans([plan], afterEnd);
  assert.equal(parts.past.length, 1);
  assert.equal(parts.upcoming.length, 0);
});

test('View in My Schedule opens week with focusDate for the saved plan', () => {
  let state = createInitialNavState();
  state = openMyScheduleWeek(state, {
    originPrimary: 'planner',
    focusDate: '2026-08-10',
    focusPlanId: 'accepted:2026-08-10:demo',
    returnSurface: {
      type: 'build-plan-plan-details',
      originPrimary: 'planner',
      planId: 'accepted:2026-08-10:demo',
      plan: null,
      returnSurface: null,
    },
  });
  assert.equal(state.surface.type, 'my-schedule-week');
  assert.equal(state.surface.focusDate, '2026-08-10');
  assert.equal(state.surface.focusPlanId, 'accepted:2026-08-10:demo');
});

test('removing a saved plan is explicit and clears associated schedule entries', () => {
  const storage = memoryStorage();
  const accepted = acceptTwoFilmPlan(storage);
  assert.equal(getAcceptedPlans(storage).length, 1);
  const removed = removeAcceptedPlan(storage, accepted.plan.planId);
  assert.equal(removed.ok, true);
  assert.equal(removed.changed, true);
  assert.equal(getAcceptedPlans(storage).length, 0);
  assert.equal(
    resolveSavedPlanDetailsPlan(accepted.plan.planId, { storage }),
    null,
  );
});

test('existing acceptedPlans localStorage payload is preserved (no wipe)', () => {
  const storage = memoryStorage({
    [ACCEPTED_PLANS_STORAGE_KEY]: JSON.stringify({
      version: 1,
      items: [
        {
          planId: 'accepted:2026-09-01:comp:src:beacon:x:the-beacon:2026-09-01:20:00',
          acceptedAt: '2026-08-01T00:00:00.000Z',
          label: 'Legacy plan',
          date: '2026-09-01',
          timezone: 'America/Los_Angeles',
          provenance: 'live',
          performances: [
            {
              performanceKey: 'comp:src:beacon:x:the-beacon:2026-09-01:20:00',
              filmId: null,
              filmKey: 'src:beacon:x',
              title: 'Legacy Film',
              theaterId: 'the-beacon',
              theaterName: 'The Beacon',
              source: 'beacon',
              sourceShowtimeId: null,
              opportunityKey: null,
              localDate: '2026-09-01',
              localTime: '20:00',
              startsAt: '2026-09-02T03:00:00.000Z',
              expectedEndsAt: '2026-09-02T05:00:00.000Z',
              runtimeMin: 120,
              format: null,
              ticketUrl: null,
              addressLabel: null,
              posterUrl: null,
            },
          ],
          settingsSnapshot: null,
        },
      ],
    }),
  });
  const plans = getAcceptedPlans(storage);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].label, 'Legacy plan');
  assert.ok(isSavedPlanDetailsPlan(acceptedPlanToPlanDetailsPlan(plans[0])));
});

test('Planner destination opens saved plans rather than My Schedule', () => {
  const src = readFileSync(
    join(ROOT, 'v2/planner/PlannerDestination.jsx'),
    'utf8',
  );
  assert.match(src, /onOpenSavedPlan/);
  assert.match(src, /data-planner-section="pastPlans"/);
  assert.match(src, /openSavedPlan/);
  assert.doesNotMatch(
    src,
    /upcoming\.plans\.map\([\s\S]*onClick=\{openSchedule\}/,
  );
});

test('formatLongPlanDateLabel matches Plan Detail date prominence', () => {
  assert.equal(formatLongPlanDateLabel('2026-08-02'), 'Sunday, August 2');
});

test('acceptPlan idempotency keeps a single saved plan identity', () => {
  const storage = memoryStorage();
  const first = acceptTwoFilmPlan(storage);
  const second = acceptTwoFilmPlan(storage);
  assert.equal(first.plan?.planId, second.plan?.planId);
  assert.equal(getAcceptedPlans(storage).length, 1);
});
