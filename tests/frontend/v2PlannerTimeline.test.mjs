import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composePlannerLandingFromAcceptedPlans } from '../../v2/planner/composePlannerLandingPresentation.js';
import { PLANNER_UPCOMING_COMPACT_DATE_GROUP_LIMIT } from '../../v2/planner/plannerLandingConfig.js';
import { getPlannerLandingMockupPresentation } from '../../v2/fixtures/plannerLandingMockupFixture.js';
import { acceptResultsPlan } from '../../v2/planner/acceptPlanFromResults.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLANNER_SRC = readFileSync(join(ROOT, 'v2/planner/PlannerDestination.jsx'), 'utf8');

const NOW = new Date('2026-05-10T12:00:00-07:00');

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
    filmKey: 'src:test:alpha',
    filmId: 'tmdb:1',
    source: 'fixture-test',
    sourceShowtimeId: 'oa1',
    theaterId: 'theater-a',
    theaterName: 'Theater A',
    localDate: '2026-08-20',
    date: '2026-08-20',
    localTime: '19:00',
    time: '19:00',
    runtimeMin: 90,
    runtime: 90,
    format: '35mm',
    ...overrides,
  };
}

function seedManyScreenings(storage, count) {
  for (let i = 0; i < count; i += 1) {
    const day = String(20 + i).padStart(2, '0');
    acceptResultsPlan(
      {
        id: `live-${i + 1}`,
        provenance: 'live',
        source: 'live',
        date: `2026-08-${day}`,
        items: [
          liveFilm({
            title: `Film ${i + 1}`,
            filmKey: `film-${i + 1}`,
            filmId: `tmdb:${i + 100}`,
            localDate: `2026-08-${day}`,
            date: `2026-08-${day}`,
            sourceShowtimeId: `st-${i + 1}`,
          }),
        ],
      },
      [],
      { storage, provenance: 'live' },
    );
  }
}

test('View full timeline no longer invokes My Schedule navigation', () => {
  assert.equal(PLANNER_SRC.includes('onOpenMyScheduleWeek'), false);
  assert.match(PLANNER_SRC, /timelineExpanded/);
  assert.match(PLANNER_SRC, /setTimelineExpanded\(true\)/);
  assert.doesNotMatch(PLANNER_SRC, /openMyScheduleWeek/);
});

test('PlannerDestination exposes expanded timeline state attributes', () => {
  assert.match(PLANNER_SRC, /data-planner-timeline-expanded/);
  assert.match(PLANNER_SRC, /showLessTimelineLabel/);
  assert.match(PLANNER_SRC, /visibleDateGroups/);
});

test('landing compose exposes compact and total date group counts', () => {
  const storage = memoryStorage();
  seedManyScreenings(storage, 5);
  const landing = composePlannerLandingFromAcceptedPlans({ storage, now: NOW });
  assert.equal(landing.upcoming.totalDateGroupCount, 5);
  assert.equal(landing.upcoming.compactDateGroupLimit, PLANNER_UPCOMING_COMPACT_DATE_GROUP_LIMIT);
  assert.equal(landing.upcoming.dateGroups.length, 5);
  assert.equal(landing.upcoming.showLessTimelineLabel, 'Show less');
});

test('mockup landing includes more date groups than compact limit', () => {
  const mock = getPlannerLandingMockupPresentation();
  assert.ok(mock.upcoming.totalDateGroupCount > mock.upcoming.compactDateGroupLimit);
  assert.equal(mock.upcoming.dateGroups.length, mock.upcoming.totalDateGroupCount);
});

test('compact slice would hide later date groups', () => {
  const mock = getPlannerLandingMockupPresentation();
  const compact = mock.upcoming.dateGroups.slice(0, mock.upcoming.compactDateGroupLimit);
  const expanded = mock.upcoming.dateGroups;
  assert.ok(compact.length < expanded.length);
  assert.equal(compact[0].dateKey, '2025-05-26');
  assert.equal(expanded[expanded.length - 1].dateKey, '2025-06-03');
});

test('conflict groups remain in composed upcoming date groups', () => {
  const mock = getPlannerLandingMockupPresentation();
  const conflictDay = mock.upcoming.dateGroups.find((g) => g.dateKey === '2025-05-29');
  assert.ok(conflictDay);
  assert.equal(conflictDay.items[0].kind, 'conflict-group');
});

test('per-screening sheet remains wired on Planner landing', () => {
  assert.match(PLANNER_SRC, /PlannedScreeningSheet/);
  assert.match(PLANNER_SRC, /openScreening/);
});
