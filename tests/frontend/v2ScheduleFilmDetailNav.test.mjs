/**
 * Accepted plans / Plan Details → Film Detail navigation wiring.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { resolveFilmDetailNavParams } from '../../v2/identity/filmIdentity.js';
import { acceptedPlanToPlanDetailsPlan } from '../../v2/planner/acceptedPlanToPlanDetails.js';
import { derivePlanDetailsViewModel } from '../../v2/planner/derivePlanDetailsViewModel.js';
import { composePlannerLandingFromAcceptedPlans, listUpcomingPlannerScreenings } from '../../v2/planner/composePlannerLandingPresentation.js';
import {
  ACCEPTED_PLANS_STORAGE_KEY,
  acceptPlan,
  getAcceptedPlans,
} from '../../v2/stores/acceptedPlansStore.js';
import {
  createInitialNavState,
  openBuildPlanPlanDetails,
  openFilmDetail,
  navigateBack,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLANNER_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannerDestination.jsx'),
  'utf8',
);
const DETAILS_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanPlanDetailsSurface.jsx'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const NAV_SRC = readFileSync(join(ROOT, 'v2/navigation/navState.js'), 'utf8');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function makeHomeData() {
  return {
    films: [
      {
        filmKey: 'batman-2022',
        filmId: 'tmdb:414906',
        title: 'The Batman',
        parentFilmKey: null,
      },
      {
        filmKey: 'batman-2022-sensory',
        filmId: 'tmdb:414906',
        title: 'The Batman (Sensory Friendly)',
        parentFilmKey: 'batman-2022',
      },
      {
        filmKey: 'batman-1989',
        filmId: 'tmdb:268',
        title: 'The Batman',
        parentFilmKey: null,
      },
      {
        filmKey: 'shorts-night',
        filmId: null,
        title: 'Local Shorts Night',
        parentFilmKey: null,
        source: 'nwff',
      },
    ],
  };
}

function livePerformance(overrides = {}) {
  return {
    title: 'The Batman',
    filmId: 'tmdb:414906',
    filmKey: 'batman-2022',
    parentFilmKey: null,
    theaterId: 't1',
    theaterName: 'SIFF Uptown',
    localDate: '2026-08-10',
    localTime: '19:00',
    runtimeMin: 176,
    source: 'siiff',
    sourceShowtimeId: 's1',
    opportunityKey: 'opp-1',
    format: 'Standard',
    ticketUrl: 'https://example.com/tickets',
    posterUrl: 'https://example.com/p.png',
    ...overrides,
  };
}

test('resolveFilmDetailNavParams prefers parent for variants and separates remakes', () => {
  const home = makeHomeData();
  const variant = resolveFilmDetailNavParams(
    {
      filmKey: 'batman-2022-sensory',
      filmId: 'tmdb:414906',
      parentFilmKey: 'batman-2022',
      opportunityKey: 'opp-sensory',
    },
    home,
  );
  assert.deepEqual(variant, {
    filmKey: 'batman-2022',
    opportunityKey: 'opp-sensory',
  });

  const remake = resolveFilmDetailNavParams(
    { filmKey: 'batman-1989', filmId: 'tmdb:268' },
    home,
  );
  assert.equal(remake.filmKey, 'batman-1989');

  const source = resolveFilmDetailNavParams(
    { filmKey: 'shorts-night', filmId: null, title: 'Local Shorts Night' },
    home,
  );
  assert.equal(source.filmKey, 'shorts-night');

  assert.equal(
    resolveFilmDetailNavParams({ title: 'The Batman' }, home),
    null,
  );
});

test('legacy accepted plan without filmId remains navigable via filmKey', () => {
  const params = resolveFilmDetailNavParams(
    { filmKey: 'legacy-key', filmId: null, title: 'Legacy' },
    null,
  );
  assert.deepEqual(params, { filmKey: 'legacy-key', opportunityKey: null });
});

test('acceptedPlanToPlanDetailsPlan preserves identity and recomputes breaks', () => {
  const storage = memoryStorage();
  const written = acceptPlan(storage, {
    performances: [
      livePerformance({ localTime: '14:00', sourceShowtimeId: 'a' }),
      livePerformance({
        title: 'The Batman (Sensory Friendly)',
        filmKey: 'batman-2022-sensory',
        parentFilmKey: 'batman-2022',
        localTime: '19:00',
        sourceShowtimeId: 'b',
        opportunityKey: 'opp-sensory',
        format: 'Sensory Friendly',
      }),
    ],
    date: '2026-08-10',
    provenance: 'live',
    label: 'Double feature',
  });
  assert.equal(written.ok, true);
  const plan = getAcceptedPlans(storage)[0];
  assert.equal(plan.performances[1].parentFilmKey, 'batman-2022');

  const adapted = acceptedPlanToPlanDetailsPlan(plan);
  assert.ok(adapted);
  assert.equal(adapted.id, plan.planId);
  assert.equal(adapted.provenance, 'live');
  const films = adapted.items.filter((i) => i.type !== 'break');
  assert.equal(films.length, 2);
  assert.equal(films[0].filmId, 'tmdb:414906');
  assert.equal(films[0].filmKey, 'batman-2022');
  assert.equal(films[1].filmKey, 'batman-2022-sensory');
  assert.equal(films[1].parentFilmKey, 'batman-2022');
  assert.ok(adapted.items.some((i) => i.type === 'break'));

  const view = derivePlanDetailsViewModel(adapted);
  const detailFilm = view.itinerary.find((r) => r.kind === 'film');
  assert.equal(detailFilm.filmKey, 'batman-2022');
  assert.equal(detailFilm.filmId, 'tmdb:414906');
});

test('Planner Upcoming screenings retain navigation identity after accept', () => {
  const storage = memoryStorage();
  acceptPlan(storage, {
    performances: [livePerformance()],
    date: '2026-08-10',
    provenance: 'live',
  });
  const landing = composePlannerLandingFromAcceptedPlans({
    storage,
    now: new Date('2026-08-10T12:00:00-07:00'),
  });
  const screening = landing.upcoming.dateGroups[0].items[0];
  assert.equal(screening.kind, 'screening');
  assert.equal(screening.title, 'The Batman');

  const detailed = listUpcomingPlannerScreenings({
    storage,
    now: new Date('2026-08-10T12:00:00-07:00'),
  })[0];
  assert.equal(detailed.filmKey, 'batman-2022');
  assert.equal(detailed.filmId, 'tmdb:414906');
  assert.equal(detailed.ticketUrl, 'https://example.com/tickets');
  assert.equal(getAcceptedPlans(storage)[0].performances[0].opportunityKey, 'opp-1');

  const params = resolveFilmDetailNavParams(
    getAcceptedPlans(storage)[0].performances[0],
    makeHomeData(),
  );
  assert.equal(params.filmKey, 'batman-2022');
});

test('View Plan Details from results returns to results on back', () => {
  let nav = createInitialNavState();
  nav = openBuildPlanPlanDetails(nav, {
    plan: { id: 'plan-1', items: [] },
    originPrimary: 'planner',
    returnSurface: {
      type: 'build-plan-results',
      originPrimary: 'planner',
      returnSurface: null,
    },
  });
  assert.equal(nav.surface.type, 'build-plan-plan-details');
  assert.equal(nav.surface.returnSurface.type, 'build-plan-results');
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'build-plan-results');
});

test('Film Detail from Plan Details preserves returnSurface', () => {
  let nav = createInitialNavState();
  nav = openBuildPlanPlanDetails(nav, {
    plan: { id: 'plan-1', items: [] },
    originPrimary: 'planner',
    returnSurface: null,
  });
  nav = openFilmDetail(nav, {
    filmKey: 'batman-2022',
    opportunityKey: 'opp-1',
    originPrimary: 'planner',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface.type, 'film-detail');
  assert.equal(nav.surface.filmKey, 'batman-2022');
  assert.equal(nav.surface.returnSurface.type, 'build-plan-plan-details');
  assert.equal(NAV_SRC.includes('film-filter'), false);
  assert.equal(PLANNER_SRC.includes('film-filter'), false);
  assert.equal(DETAILS_SRC.includes('film-filter'), false);
});

test('wiring: Planner and Plan Details open Film Detail', () => {
  assert.match(PLANNER_SRC, /onOpenFilmDetail/);
  assert.match(PLANNER_SRC, /openScreening/);
  assert.match(DETAILS_SRC, /onOpenFilmDetail/);
  assert.match(DETAILS_SRC, /v2-bpd-film-open/);
  assert.match(APP_SRC, /BuildPlanPlanDetailsSurface/);
  assert.match(APP_SRC, /onViewInPlanner/);
  assert.match(APP_SRC, /handleOpenPrimaryRoot\('planner'\)/);
  assert.doesNotMatch(APP_SRC, /MyScheduleWeekSurface/);
});

test('View in Planner clears deep surface', () => {
  let nav = createInitialNavState();
  nav = openBuildPlanPlanDetails(nav, {
    planId: 'accepted:demo',
    originPrimary: 'planner',
    returnSurface: null,
  });
  nav = selectPrimaryDestination(nav, 'planner');
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.equal(nav.surface, null);
});

test('hydration preserves filmKey for navigation without rewriting storage', () => {
  const storage = memoryStorage({
    [ACCEPTED_PLANS_STORAGE_KEY]: JSON.stringify({
      version: 1,
      items: [
        {
          planId: 'legacy-plan',
          acceptedAt: '2026-08-01T00:00:00.000Z',
          label: 'Legacy',
          date: '2026-08-10',
          timezone: 'America/Los_Angeles',
          provenance: 'live',
          settingsSnapshot: null,
          performances: [
            {
              performanceKey: 'comp:legacy-key:t1:2026-08-10:19:00',
              filmId: null,
              filmKey: 'legacy-key',
              title: 'Legacy Film',
              theaterId: 't1',
              theaterName: 'Theater',
              source: 'nwff',
              sourceShowtimeId: 'legacy-1',
              opportunityKey: null,
              localDate: '2026-08-10',
              localTime: '19:00',
              startsAt: '2026-08-11T02:00:00.000Z',
              expectedEndsAt: '2026-08-11T03:55:00.000Z',
              runtimeMin: 100,
              format: null,
              ticketUrl: null,
              addressLabel: null,
              posterUrl: null,
            },
          ],
        },
      ],
    }),
  });
  const plans = getAcceptedPlans(storage);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].performances[0].filmId, null);
  assert.equal(plans[0].performances[0].filmKey, 'legacy-key');
  const params = resolveFilmDetailNavParams(plans[0].performances[0]);
  assert.equal(params.filmKey, 'legacy-key');
  assert.match(
    storage.getItem(ACCEPTED_PLANS_STORAGE_KEY),
    /"filmId":null/,
  );
});
