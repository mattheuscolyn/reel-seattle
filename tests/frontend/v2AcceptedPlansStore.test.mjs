import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCEPTED_PLANS_MAX,
  ACCEPTED_PLANS_STORAGE_KEY,
  ACCEPTED_PLANS_VERSION,
  acceptPlan,
  acceptedPlanToCalendarFilms,
  buildAcceptedPerformanceKey,
  buildAcceptedPlanId,
  buildAcceptedPlanItem,
  clearAcceptedPlans,
  getAcceptedPlans,
  normalizeAcceptedPerformance,
  readAcceptedPlansStore,
  removeAcceptedPlan,
} from '../../v2/stores/acceptedPlansStore.js';
import { acceptResultsPlan } from '../../v2/planner/acceptPlanFromResults.js';
import { composeMyScheduleWeekFromAcceptedPlans } from '../../v2/planner/composeMyScheduleWeekFromAcceptedPlans.js';
import { resolveMyScheduleWeekPagePresentation } from '../../v2/fixtures/resolveMyScheduleWeekPresentation.js';
import { exportPlanToCalendar } from '../../v2/calendar/exportFromOpportunity.js';
import { buildPlanCalendarDownload } from '../../src/utils/calendarExport.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const STORE_SRC = readFileSync(
  join(ROOT, 'v2/stores/acceptedPlansStore.js'),
  'utf8',
);
const RESULTS_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanResultsSurface.jsx'),
  'utf8',
);
const WEEK_SRC = readFileSync(
  join(ROOT, 'v2/planner/MyScheduleWeekSurface.jsx'),
  'utf8',
);

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const LIVE_PERF_A = Object.freeze({
  title: 'Sinners',
  filmKey: 'sinners',
  filmId: 'tmdb:123',
  theaterId: 'the-beacon',
  theaterName: 'The Beacon',
  localDate: '2026-08-01',
  localTime: '19:00',
  runtimeMin: 137,
  source: 'beacon',
  sourceShowtimeId: 'beacon-1',
  format: '35mm',
  ticketUrl: 'https://example.com/t/1',
  addressLabel: '4405 Rainier Ave S, Seattle, WA 98118',
});

const LIVE_PERF_B = Object.freeze({
  title: 'Perfect Blue',
  filmKey: 'perfect-blue',
  theaterId: 'siff-film-center',
  theaterName: 'SIFF Film Center',
  localDate: '2026-08-01',
  localTime: '22:00',
  runtimeMin: 81,
  source: 'siff',
  sourceShowtimeId: 'siff-2',
  format: 'Subtitled',
});

test('accepted plans store starts empty and is versioned', () => {
  const storage = memoryStorage();
  const read = readAcceptedPlansStore(storage);
  assert.equal(read.status, 'empty');
  assert.equal(read.store.version, ACCEPTED_PLANS_VERSION);
  assert.deepEqual(read.store.items, []);
  assert.equal(ACCEPTED_PLANS_STORAGE_KEY, 'reel-seattle.v2.acceptedPlans');
  assert.equal(ACCEPTED_PLANS_MAX, 50);
});

test('live itinerary persists; fixture and incomplete rows fail closed', () => {
  const storage = memoryStorage();
  const ok = acceptPlan(storage, {
    performances: [LIVE_PERF_A, LIVE_PERF_B],
    label: 'Capitol Hill night',
    provenance: 'live',
    now: () => new Date('2026-07-28T18:00:00.000Z'),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.changed, true);
  assert.equal(ok.plan.performances.length, 2);
  assert.equal(ok.plan.provenance, 'live');
  assert.equal(getAcceptedPlans(storage).length, 1);

  const fixture = acceptPlan(storage, {
    performances: [LIVE_PERF_A],
    provenance: 'fixture',
  });
  assert.equal(fixture.ok, false);
  assert.equal(fixture.error, 'fixture_plan');
  assert.equal(getAcceptedPlans(storage).length, 1);

  const incomplete = acceptPlan(storage, {
    performances: [{ title: 'Only Title', localDate: '2026-08-01' }],
    provenance: 'live',
  });
  assert.equal(incomplete.ok, false);
  assert.equal(getAcceptedPlans(storage).length, 1);
});

test('performance identity prefers source showtime id; title-only rejected', () => {
  const key = buildAcceptedPerformanceKey(LIVE_PERF_A);
  assert.match(key, /^src:beacon:the-beacon:beacon-1$/);
  assert.equal(
    buildAcceptedPerformanceKey({ title: 'Alone' }),
    null,
  );
  const bad = normalizeAcceptedPerformance({
    title: 'Alone',
    localDate: '2026-08-01',
    localTime: '19:00',
    runtimeMin: 90,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'missing_theater');
});

test('duplicate acceptance is idempotent', () => {
  const storage = memoryStorage();
  const first = acceptPlan(storage, {
    performances: [LIVE_PERF_A],
    provenance: 'live',
  });
  const second = acceptPlan(storage, {
    performances: [LIVE_PERF_A],
    provenance: 'live',
  });
  assert.equal(first.ok && second.ok, true);
  assert.equal(second.changed, false);
  assert.equal(getAcceptedPlans(storage).length, 1);
  assert.equal(first.plan.planId, second.plan.planId);
  assert.equal(
    buildAcceptedPlanId('2026-08-01', [
      buildAcceptedPerformanceKey(LIVE_PERF_A),
    ]),
    first.plan.planId,
  );
});

test('corrupt and future versions fail safely', () => {
  const corrupt = memoryStorage({
    [ACCEPTED_PLANS_STORAGE_KEY]: '{not-json',
  });
  assert.equal(readAcceptedPlansStore(corrupt).status, 'corrupt');

  const future = memoryStorage({
    [ACCEPTED_PLANS_STORAGE_KEY]: JSON.stringify({
      version: 99,
      items: [{ planId: 'x' }],
    }),
  });
  const read = readAcceptedPlansStore(future);
  assert.equal(read.status, 'unsupported_version');
  const write = acceptPlan(future, {
    performances: [LIVE_PERF_A],
    provenance: 'live',
  });
  assert.equal(write.ok, false);
  assert.equal(write.error, 'unsupported_version');
});

test('Results acceptance rejects fixture plans; accepts live rows', () => {
  const storage = memoryStorage();
  const fixturePlan = {
    id: 'plan-1',
    source: 'mockup-fixture',
    items: [
      {
        id: 'f1',
        title: '2001',
        startTime: '2:15 PM',
        theater: 'Central',
        runtimeLabel: '2h 49m',
      },
    ],
  };
  const rejected = acceptResultsPlan(fixturePlan, ['f1'], { storage });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, 'fixture_plan');

  const livePlan = {
    id: 'live-1',
    provenance: 'live',
    date: '2026-08-01',
    items: [
      { id: 'a', ...LIVE_PERF_A },
      { id: 'b', ...LIVE_PERF_B },
    ],
  };
  const accepted = acceptResultsPlan(livePlan, ['a', 'b'], {
    storage,
    provenance: 'live',
  });
  assert.equal(accepted.ok, true);
  assert.equal(getAcceptedPlans(storage).length, 1);
});

test('My Schedule live week renders accepted grouped plan', () => {
  const storage = memoryStorage();
  acceptPlan(storage, {
    performances: [LIVE_PERF_A, LIVE_PERF_B],
    provenance: 'live',
  });
  const week = composeMyScheduleWeekFromAcceptedPlans({
    storage,
    now: () => new Date('2026-07-28T18:00:00.000Z'),
    weekOffset: 0,
  });
  // Aug 1 2026 is a Saturday — find week containing it
  const page = resolveMyScheduleWeekPagePresentation({
    forceMockup: false,
    storage,
    now: () => new Date('2026-08-01T18:00:00.000Z'),
  });
  assert.equal(page.mode, 'accepted-plans');
  assert.equal(page.source, 'accepted-plans');
  const day = page.week.days.find((d) => d.id === '2026-08-01');
  assert.ok(day);
  assert.equal(day.empty, false);
  assert.equal(day.planGroups.length, 1);
  assert.equal(day.planGroups[0].kind, 'multi');
  assert.ok(day.planGroups[0].items.some((i) => i.type === 'break'));
  assert.ok(day.planGroups[0].items.some((i) => i.title === 'Sinners'));
  assert.equal(week.source, 'accepted-plans');
});

test('accepted plan maps to calendar films; fixture Results still fail closed in UI', () => {
  const built = buildAcceptedPlanItem({
    performances: [LIVE_PERF_A, LIVE_PERF_B],
    provenance: 'live',
  });
  assert.equal(built.ok, true);
  const films = acceptedPlanToCalendarFilms(built.plan);
  assert.equal(films.length, 2);
  const download = buildPlanCalendarDownload({
    planId: built.plan.planId,
    title: 'Night',
    films,
  });
  assert.equal(download.ok, true);
  assert.match(download.ics, /BEGIN:VEVENT[\s\S]*BEGIN:VEVENT/);
  assert.equal(download.ics.includes('Break'), false);

  // Node has no document → download helper fails closed
  const exportResult = exportPlanToCalendar({
    planId: built.plan.planId,
    films,
  });
  assert.equal(exportResult.ok, false);

  assert.match(RESULTS_SRC, /acceptResultsPlan/);
  assert.match(RESULTS_SRC, /handleAddToSchedule/);
  assert.match(WEEK_SRC, /acceptedPlansRevision/);
  assert.match(WEEK_SRC, /resolveMyScheduleWeekPagePresentation/);
  assert.equal(STORE_SRC.includes('googleapis'), false);
  assert.equal(/accounts?\.google/i.test(STORE_SRC), false);
});

test('removeAcceptedPlan and clearAcceptedPlans work', () => {
  const storage = memoryStorage();
  const written = acceptPlan(storage, {
    performances: [LIVE_PERF_A],
    provenance: 'live',
  });
  assert.equal(written.ok, true);
  removeAcceptedPlan(storage, written.plan.planId);
  assert.equal(getAcceptedPlans(storage).length, 0);
  acceptPlan(storage, { performances: [LIVE_PERF_A], provenance: 'live' });
  clearAcceptedPlans(storage);
  assert.equal(getAcceptedPlans(storage).length, 0);
});
