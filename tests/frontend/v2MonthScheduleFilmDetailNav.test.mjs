/**
 * Month schedule → canonical Film Detail navigation.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { resolveFilmDetailNavParams } from '../../v2/identity/filmIdentity.js';
import {
  composeMyScheduleMonthFromAcceptedPlans,
  monthFilmNavFromPerformance,
} from '../../v2/planner/composeMyScheduleMonthFromAcceptedPlans.js';
import {
  ACCEPTED_PLANS_STORAGE_KEY,
  acceptPlan,
  getAcceptedPlans,
} from '../../v2/stores/acceptedPlansStore.js';
import {
  createInitialNavState,
  openFilmDetail,
  openMyScheduleMonth,
  navigateBack,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MONTH_SRC = readFileSync(
  join(ROOT, 'v2/planner/MyScheduleMonthSurface.jsx'),
  'utf8',
);
const COMPOSE_SRC = readFileSync(
  join(ROOT, 'v2/planner/composeMyScheduleMonthFromAcceptedPlans.js'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');

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

test('monthFilmNavFromPerformance preserves identity fields', () => {
  const nav = monthFilmNavFromPerformance(
    livePerformance({
      filmKey: 'batman-2022-sensory',
      parentFilmKey: 'batman-2022',
      opportunityKey: 'opp-sensory',
    }),
  );
  assert.equal(nav.filmId, 'tmdb:414906');
  assert.equal(nav.filmKey, 'batman-2022-sensory');
  assert.equal(nav.parentFilmKey, 'batman-2022');
  assert.equal(nav.opportunityKey, 'opp-sensory');
  assert.equal(nav.ticketUrl, 'https://example.com/tickets');
});

test('Month upcoming and selected-day cells carry film identity', () => {
  const storage = memoryStorage();
  assert.equal(
    acceptPlan(storage, {
      performances: [
        livePerformance({
          localTime: '14:00',
          sourceShowtimeId: 's2',
          opportunityKey: 'opp-sensory',
          filmKey: 'batman-2022-sensory',
          parentFilmKey: 'batman-2022',
          title: 'The Batman (Sensory Friendly)',
          format: 'Sensory Friendly',
        }),
        livePerformance(),
      ],
      date: '2026-08-10',
      provenance: 'live',
    }).ok,
    true,
  );
  assert.equal(
    acceptPlan(storage, {
      performances: [
        livePerformance({
          title: 'The Batman',
          filmId: 'tmdb:268',
          filmKey: 'batman-1989',
          localDate: '2026-08-11',
          localTime: '20:00',
          sourceShowtimeId: 's3',
          opportunityKey: 'opp-89',
          ticketUrl: null,
        }),
      ],
      date: '2026-08-11',
      provenance: 'live',
    }).ok,
    true,
  );
  assert.equal(
    acceptPlan(storage, {
      performances: [
        livePerformance({
          title: 'Local Shorts Night',
          filmId: null,
          filmKey: 'shorts-night',
          localDate: '2026-08-12',
          localTime: '18:00',
          sourceShowtimeId: 's4',
          opportunityKey: null,
          ticketUrl: null,
          format: null,
        }),
      ],
      date: '2026-08-12',
      provenance: 'live',
    }).ok,
    true,
  );

  const month = composeMyScheduleMonthFromAcceptedPlans({
    storage,
    now: () => new Date('2026-08-10T12:00:00-07:00'),
    hideCompleted: false,
  });

  const cell = month.heatmapGrid.find((c) => c.id === '2026-08-10');
  assert.equal(cell.films.length, 2);
  assert.ok(cell.films.some((f) => f.filmKey === 'batman-2022'));
  assert.ok(
    cell.films.some(
      (f) =>
        f.filmKey === 'batman-2022-sensory' && f.parentFilmKey === 'batman-2022',
    ),
  );

  const upcomingMulti = month.upcomingHighlights.find(
    (r) => r.dateId === '2026-08-10',
  );
  assert.ok(upcomingMulti);
  assert.equal(upcomingMulti.films.length, 2);

  const upcomingSingle = month.upcomingHighlights.find(
    (r) => r.dateId === '2026-08-11',
  );
  assert.equal(upcomingSingle.filmKey, 'batman-1989');
  assert.equal(upcomingSingle.filmId, 'tmdb:268');
  assert.equal(upcomingSingle.opportunityKey, 'opp-89');

  const home = makeHomeData();
  const variantFilm = cell.films.find(
    (f) => f.filmKey === 'batman-2022-sensory',
  );
  const variantParams = resolveFilmDetailNavParams(variantFilm, home);
  assert.equal(variantParams.filmKey, 'batman-2022');
  assert.equal(variantParams.opportunityKey, 'opp-sensory');

  const remakeParams = resolveFilmDetailNavParams(upcomingSingle, home);
  assert.equal(remakeParams.filmKey, 'batman-1989');

  const sourceRow = month.upcomingHighlights.find(
    (r) => r.dateId === '2026-08-12',
  );
  assert.equal(
    resolveFilmDetailNavParams(sourceRow, home).filmKey,
    'shorts-night',
  );
});

test('legacy Month plan without filmId remains navigable', () => {
  const storage = memoryStorage({
    [ACCEPTED_PLANS_STORAGE_KEY]: JSON.stringify({
      version: 1,
      items: [
        {
          planId: 'legacy-month',
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
  assert.equal(plans[0].performances[0].filmId, null);
  const month = composeMyScheduleMonthFromAcceptedPlans({
    storage,
    now: () => new Date('2026-08-10T12:00:00-07:00'),
    hideCompleted: false,
  });
  const upcoming = month.upcomingHighlights.find(
    (r) => r.dateId === '2026-08-10',
  );
  assert.equal(upcoming.filmKey, 'legacy-key');
  assert.equal(
    resolveFilmDetailNavParams(upcoming).filmKey,
    'legacy-key',
  );
  assert.match(storage.getItem(ACCEPTED_PLANS_STORAGE_KEY), /"filmId":null/);
});

test('Month Film Detail preserves returnSurface; tickets stay independent', () => {
  let nav = openMyScheduleMonth(createInitialNavState(), {
    originPrimary: 'planner',
  });
  nav = openFilmDetail(nav, {
    filmKey: 'batman-2022',
    opportunityKey: 'opp-1',
    originPrimary: 'planner',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface.type, 'film-detail');
  assert.equal(nav.surface.returnSurface.type, 'my-schedule-month');
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'my-schedule-month');

  assert.match(MONTH_SRC, /Open Film Detail for/);
  assert.match(MONTH_SRC, /resolveFilmDetailNavParams/);
  assert.match(MONTH_SRC, /SelectedDayFilms/);
  assert.match(MONTH_SRC, /onOpenTickets/);
  assert.match(MONTH_SRC, /v2-msw-upcoming-tickets/);
  assert.match(MONTH_SRC, /stopPropagation/);
  assert.equal(MONTH_SRC.includes('film-filter'), false);
  assert.match(APP_SRC, /MyScheduleMonthSurface/);
  assert.match(APP_SRC, /onOpenFilmDetail=\{\(params\) =>/);
  assert.match(COMPOSE_SRC, /monthFilmNavFromPerformance/);
});
