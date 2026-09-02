import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findConflictClusters,
  formatConflictBody,
  screeningsOverlap,
} from '../../v2/planner/plannerScreeningOverlap.js';
import { deriveConflictReviewAlternates } from '../../v2/planner/deriveConflictReviewAlternates.js';
import { recommendConflictBestPath } from '../../v2/planner/plannerConflictBestPath.js';
import {
  alternateToAcceptedPerformanceInput,
  findConflictClusterById,
  isPlannerConflictResolved,
  resolvePlannerConflictReviewPresentation,
} from '../../v2/planner/resolvePlannerConflictReviewPresentation.js';
import { composePlannerLandingFromAcceptedPlans } from '../../v2/planner/composePlannerLandingPresentation.js';
import { acceptResultsPlan } from '../../v2/planner/acceptPlanFromResults.js';
import {
  getAcceptedPlanById,
  removePerformanceFromAcceptedPlan,
  replaceAcceptedPlanPerformance,
} from '../../v2/stores/acceptedPlansStore.js';
import { PLANNER_CONFLICT_REVIEW_MOCKUP_ID } from '../../v2/fixtures/plannerConflictReviewMockupFixture.js';
import { getPlannerLandingMockupPresentation } from '../../v2/fixtures/plannerLandingMockupFixture.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLANNER_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannerDestination.jsx'),
  'utf8',
);
const CONFLICT_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannerConflictReviewSurface.jsx'),
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

function liveFilm(overrides = {}) {
  return {
    type: 'film',
    localDate: '2026-08-20',
    date: '2026-08-20',
    localTime: '19:00',
    time: '19:00',
    title: 'Alpha',
    filmKey: 'src:test:alpha',
    filmId: 'tmdb:1',
    source: 'fixture-test',
    sourceShowtimeId: 'oa1',
    theaterId: 'theater-a',
    theaterName: 'Theater A',
    runtimeMin: 90,
    runtime: 90,
    format: '35mm',
    ...overrides,
  };
}

function screening(id, startMs, endMs, extra = {}) {
  return {
    id,
    planId: `plan-${id}`,
    performanceKey: `perf-${id}`,
    title: id,
    startMs,
    endMs,
    dateKey: '2026-08-20',
    localDate: '2026-08-20',
    localTime: '19:00',
    theaterId: 'theater-a',
    filmKey: `film-${id}`,
    ...extra,
  };
}

function homeDataWithOpportunities(opportunities) {
  return {
    opportunities,
    films: [],
  };
}

test('Review options opens PlannerConflictReviewSurface from landing', () => {
  assert.match(PLANNER_SRC, /PlannerConflictReviewSurface/);
  assert.match(PLANNER_SRC, /openReviewOptions/);
  assert.match(PLANNER_SRC, /setActiveConflictId/);
  assert.match(PLANNER_SRC, /data-planner-view="conflict-review"/);
  assert.match(CONFLICT_SRC, /data-planner-conflict-review="open"/);
});

test('conflict clusters identify members by stable screening ids', () => {
  const a = screening('a', 100, 200);
  const b = screening('b', 150, 250);
  const clusters = findConflictClusters([a, b]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].members.length, 2);
  assert.equal(clusters[0].id, 'conflict-a__b');
  const found = findConflictClusterById(clusters[0].id, [a, b]);
  assert.equal(found?.members.length, 2);
});

test('3+ overlapping screenings form one conflict cluster', () => {
  const a = screening('a', 100, 250);
  const b = screening('b', 150, 300);
  const c = screening('c', 200, 350);
  const clusters = findConflictClusters([a, b, c]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].members.length, 3);
  assert.match(formatConflictBody(clusters[0].members), /a, b, and c overlap/);
});

test('conflict review presentation exposes current screening details', () => {
  const resolved = resolvePlannerConflictReviewPresentation({
    conflictId: PLANNER_CONFLICT_REVIEW_MOCKUP_ID,
    mockupMode: true,
  });
  assert.equal(resolved.ok, true);
  const bottoms = resolved.presentation.members.find((m) => m.title === 'Bottoms');
  const mysterious = resolved.presentation.members.find(
    (m) => m.title === 'Mysterious Skin',
  );
  assert.equal(bottoms.currentScreeningLabel, '7:00 PM • NWFF');
  assert.equal(mysterious.currentScreeningLabel, '7:30 PM • The Beacon');
  assert.equal(bottoms.planId, 'mock-plan-bottoms');
  assert.equal(bottoms.performanceKey, 'mock-perf-bottoms');
});

test('alternates exclude the current screening', () => {
  const homeData = homeDataWithOpportunities([
    {
      opportunityKey: 'opp-current',
      filmKey: 'film-a',
      theaterId: 'beacon',
      theaterName: 'The Beacon',
      localDate: '2026-08-20',
      localTime: '19:30',
      sortableLocalDateTime: '2026-08-20T19:30',
      runtimeMin: 99,
      source: 'beacon',
      sourceShowtimeId: 'st-current',
    },
    {
      opportunityKey: 'opp-alt',
      filmKey: 'film-a',
      theaterId: 'beacon',
      theaterName: 'The Beacon',
      localDate: '2026-08-22',
      localTime: '21:15',
      sortableLocalDateTime: '2026-08-22T21:15',
      runtimeMin: 99,
      source: 'beacon',
      sourceShowtimeId: 'st-alt',
    },
  ]);
  const result = deriveConflictReviewAlternates(homeData, {
    filmKey: 'film-a',
    theaterId: 'beacon',
    performanceKey: 'perf-current',
    localDate: '2026-08-20',
    localTime: '19:30',
    source: 'beacon',
    sourceShowtimeId: 'st-current',
    runtimeMin: 99,
    referenceDate: '2026-08-20',
    plannedWindows: [],
    now: new Date('2026-08-01T12:00:00-07:00'),
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].opportunityKey, 'opp-alt');
});

test('alternates filter against other planned screenings', () => {
  const homeData = homeDataWithOpportunities([
    {
      opportunityKey: 'opp-bad',
      filmKey: 'film-a',
      theaterId: 'beacon',
      theaterName: 'The Beacon',
      localDate: '2026-08-20',
      localTime: '19:15',
      sortableLocalDateTime: '2026-08-20T19:15',
      runtimeMin: 99,
      source: 'beacon',
      sourceShowtimeId: 'st-bad',
    },
    {
      opportunityKey: 'opp-good',
      filmKey: 'film-a',
      theaterId: 'beacon',
      theaterName: 'The Beacon',
      localDate: '2026-08-22',
      localTime: '21:15',
      sortableLocalDateTime: '2026-08-22T21:15',
      runtimeMin: 99,
      source: 'beacon',
      sourceShowtimeId: 'st-good',
    },
  ]);
  const otherPlanned = {
    startMs: Date.parse('2026-08-20T19:00:00-07:00'),
    endMs: Date.parse('2026-08-20T20:30:00-07:00'),
  };
  const result = deriveConflictReviewAlternates(homeData, {
    filmKey: 'film-a',
    theaterId: 'beacon',
    localDate: '2026-08-20',
    localTime: '19:30',
    runtimeMin: 99,
    referenceDate: '2026-08-20',
    plannedWindows: [otherPlanned],
    now: new Date('2026-08-01T12:00:00-07:00'),
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].opportunityKey, 'opp-good');
  assert.equal(
    screeningsOverlap(
      { startMs: Date.parse('2026-08-20T19:15:00-07:00'), endMs: Date.parse('2026-08-20T21:00:00-07:00') },
      otherPlanned,
    ),
    true,
  );
});

test('no-alternatives state in mockup conflict review', () => {
  const resolved = resolvePlannerConflictReviewPresentation({
    conflictId: PLANNER_CONFLICT_REVIEW_MOCKUP_ID,
    mockupMode: true,
  });
  const bottoms = resolved.presentation.members.find((m) => m.title === 'Bottoms');
  assert.equal(bottoms.hasAlternatives, false);
  assert.equal(bottoms.visibleAlternates.length, 0);
  assert.match(CONFLICT_SRC, /No other showtimes currently scheduled/);
});

test('best path recommends moving the side with viable alternates', () => {
  const recommendation = recommendConflictBestPath([
    {
      planId: 'p1',
      performanceKey: 'k1',
      title: 'Bottoms',
      weekdayLabel: 'Thursday',
      viableAlternates: [],
    },
    {
      planId: 'p2',
      performanceKey: 'k2',
      title: 'Mysterious Skin',
      weekdayLabel: 'Thursday',
      viableAlternates: [
        { dayShort: 'Sat', localDate: '2025-05-31', theaterId: 'beacon', startMs: 1 },
        { dayShort: 'Sun', localDate: '2025-06-01', theaterId: 'beacon', startMs: 2 },
      ],
    },
  ]);
  assert.equal(recommendation.kind, 'move-one');
  assert.match(recommendation.text, /Keep Bottoms on Thursday/);
  assert.match(recommendation.text, /move Mysterious Skin to Saturday or Sunday/);
});

test('best path handles neither side movable', () => {
  const recommendation = recommendConflictBestPath([
    {
      planId: 'p1',
      performanceKey: 'k1',
      title: 'Alpha',
      viableAlternates: [],
    },
    {
      planId: 'p2',
      performanceKey: 'k2',
      title: 'Beta',
      viableAlternates: [],
    },
  ]);
  assert.equal(recommendation.kind, 'none');
  assert.match(recommendation.text, /No conflict-free alternate/);
});

test('best path can return tie when both sides are equally movable', () => {
  const recommendation = recommendConflictBestPath([
    {
      planId: 'p1',
      performanceKey: 'k1',
      title: 'Alpha',
      weekdayLabel: 'Thursday',
      localDate: '2026-08-20',
      theaterId: 'theater-a',
      startMs: Date.parse('2026-08-20T19:00:00-07:00'),
      viableAlternates: [
        {
          localDate: '2026-08-20',
          theaterId: 'theater-a',
          startMs: Date.parse('2026-08-20T21:00:00-07:00'),
        },
      ],
    },
    {
      planId: 'p2',
      performanceKey: 'k2',
      title: 'Beta',
      weekdayLabel: 'Thursday',
      localDate: '2026-08-20',
      theaterId: 'theater-a',
      startMs: Date.parse('2026-08-20T19:30:00-07:00'),
      viableAlternates: [
        {
          localDate: '2026-08-20',
          theaterId: 'theater-a',
          startMs: Date.parse('2026-08-20T21:30:00-07:00'),
        },
      ],
    },
  ]);
  assert.equal(recommendation.kind, 'tie');
});

test('remove one screening preserves stable planId for multi-performance plan', () => {
  const storage = memoryStorage();
  acceptResultsPlan(
    {
      id: 'live-double',
      provenance: 'live',
      source: 'live',
      date: '2026-08-20',
      items: [
        liveFilm({
          title: 'Saltwater Road',
          filmKey: 'salt',
          localTime: '14:00',
          time: '14:00',
          sourceShowtimeId: 'sw-1',
        }),
        liveFilm({
          title: 'Blue Hour',
          filmKey: 'blue',
          localTime: '19:40',
          time: '19:40',
          sourceShowtimeId: 'bh-1',
        }),
      ],
    },
    [],
    { storage, provenance: 'live' },
  );
  const plans = JSON.parse(storage.getItem('reel-seattle.v2.acceptedPlans'));
  const planId = plans.items[0].planId;
  const removeKey = plans.items[0].performances[0].performanceKey;
  const result = removePerformanceFromAcceptedPlan(storage, planId, removeKey);
  assert.equal(result.ok, true);
  assert.equal(result.plan?.planId, planId);
  assert.equal(result.plan?.performances.length, 1);
});

test('replace performance updates only selected screening and resets tickets', () => {
  const storage = memoryStorage();
  acceptResultsPlan(
    {
      id: 'live-double',
      provenance: 'live',
      source: 'live',
      date: '2026-08-20',
      items: [
        liveFilm({
          title: 'Saltwater Road',
          filmKey: 'salt',
          localTime: '14:00',
          time: '14:00',
          sourceShowtimeId: 'sw-1',
        }),
        liveFilm({
          title: 'Blue Hour',
          filmKey: 'blue',
          localTime: '19:40',
          time: '19:40',
          sourceShowtimeId: 'bh-1',
        }),
      ],
    },
    [],
    { storage, provenance: 'live' },
  );
  const plans = JSON.parse(storage.getItem('reel-seattle.v2.acceptedPlans'));
  const planId = plans.items[0].planId;
  const target = plans.items[0].performances[1];
  const sibling = plans.items[0].performances[0];
  const result = replaceAcceptedPlanPerformance(storage, planId, target.performanceKey, {
    ...target,
    localTime: '20:30',
    time: '20:30',
    sourceShowtimeId: 'bh-2',
    ticketsPurchased: true,
  });
  assert.equal(result.ok, true);
  assert.notEqual(result.newPerformanceKey, target.performanceKey);
  const updated = getAcceptedPlanById(storage, planId);
  assert.equal(updated.planId, planId);
  assert.equal(updated.performances.length, 2);
  assert.equal(updated.performances[0].performanceKey, sibling.performanceKey);
  const replaced = updated.performances.find(
    (p) => p.performanceKey === result.newPerformanceKey,
  );
  assert.equal(replaced.localTime, '20:30');
  assert.notEqual(replaced.ticketsPurchased, true);
});

test('upcoming landing recomposes after conflict member removal', () => {
  const storage = memoryStorage();
  acceptResultsPlan(
    {
      id: 'live-a',
      provenance: 'live',
      source: 'live',
      date: '2026-08-20',
      items: [
        liveFilm({
          title: 'Bottoms',
          filmKey: 'bottoms',
          localTime: '19:00',
          time: '19:00',
          sourceShowtimeId: 'b-1',
        }),
      ],
    },
    [],
    { storage, provenance: 'live' },
  );
  acceptResultsPlan(
    {
      id: 'live-b',
      provenance: 'live',
      source: 'live',
      date: '2026-08-20',
      items: [
        liveFilm({
          title: 'Mysterious Skin',
          filmKey: 'mysterious',
          theaterId: 'beacon',
          theaterName: 'The Beacon',
          localTime: '19:30',
          time: '19:30',
          runtimeMin: 99,
          runtime: 99,
          sourceShowtimeId: 'm-1',
        }),
      ],
    },
    [],
    { storage, provenance: 'live' },
  );
  const now = new Date('2026-08-01T12:00:00-07:00');
  const before = composePlannerLandingFromAcceptedPlans({ storage, now });
  assert.equal(before.needsAttention.count, 1);
  const conflictId = before.needsAttention.items[0].conflictId;
  const planId = before.needsAttention.items[0].planIds[0];
  const perfKey = before.needsAttention.items[0].performanceKeys[0];
  removePerformanceFromAcceptedPlan(storage, planId, perfKey);
  const after = composePlannerLandingFromAcceptedPlans({ storage, now });
  assert.equal(after.needsAttention.count, 0);
  assert.equal(isPlannerConflictResolved(conflictId, storage, now, before.needsAttention.items[0].planIds), true);
});

test('existing whole-plan Plan Details flow remains wired in app shell', () => {
  const appSrc = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
  assert.match(appSrc, /BuildPlanPlanDetailsSurface/);
  assert.match(appSrc, /handleOpenSavedPlan/);
  assert.equal(PLANNER_SRC.includes('BuildPlanPlanDetailsSurface'), false);
});

test('per-screening detail sheet wiring remains on landing', () => {
  assert.match(PLANNER_SRC, /PlannedScreeningSheet/);
  assert.match(PLANNER_SRC, /openScreening/);
  assert.match(PLANNER_SRC, /setSelectedScreening/);
});

test('mockup landing exposes conflictId for review options', () => {
  const landing = getPlannerLandingMockupPresentation();
  assert.equal(
    landing.needsAttention.items[0].conflictId,
    PLANNER_CONFLICT_REVIEW_MOCKUP_ID,
  );
  const resolved = resolvePlannerConflictReviewPresentation({
    conflictId: landing.needsAttention.items[0].conflictId,
    mockupMode: true,
  });
  assert.equal(resolved.ok, true);
  assert.match(resolved.presentation.bestPath.text, /Keep Bottoms on Thursday/);
});

test('conflict review CSS is present', () => {
  assert.match(CSS, /\.v2-pcr\b/);
  assert.match(CSS, /\.v2-pcr-best-path\b/);
  assert.match(CSS, /\.v2-pcr-no-alternates\b/);
});

test('alternateToAcceptedPerformanceInput maps replacement fields', () => {
  const input = alternateToAcceptedPerformanceInput(
    {
      filmKey: 'film-a',
      theaterId: 'beacon',
      theaterName: 'The Beacon',
      localDate: '2026-08-22',
      localTime: '21:15',
      source: 'beacon',
      sourceShowtimeId: 'st-alt',
      runtimeMin: 99,
      formatLabel: '35mm',
      ticketUrl: 'https://example.com/t',
      opportunityKey: 'opp-alt',
    },
    {
      title: 'Mysterious Skin',
      filmId: 'tmdb:2',
      filmKey: 'film-a',
      theaterId: 'beacon',
      theaterName: 'The Beacon',
      formatLabel: null,
      ticketUrl: null,
      posterUrl: 'https://example.com/p.jpg',
    },
  );
  assert.equal(input.title, 'Mysterious Skin');
  assert.equal(input.localTime, '21:15');
  assert.equal(input.sourceShowtimeId, 'st-alt');
  assert.equal(input.posterUrl, 'https://example.com/p.jpg');
});
