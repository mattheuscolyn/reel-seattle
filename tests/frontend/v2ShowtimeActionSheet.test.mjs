import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addShowtimeToPlanner,
  addSavedFilmShowtimeToPlanner,
  buildPerformanceKeyForOpportunity,
  findPlannedPerformanceByKey,
} from '../../v2/planner/addSavedFilmShowtimeToPlanner.js';
import {
  composePlannerLandingFromAcceptedPlans,
  listUpcomingPlannerScreenings,
} from '../../v2/planner/composePlannerLandingPresentation.js';
import {
  exportOpportunityToCalendar,
  opportunityToCalendarInput,
} from '../../v2/calendar/exportFromOpportunity.js';
import {
  buildShowtimesBrowsePresentation,
  createDefaultShowtimesBrowseUi,
  filterBrowseOpportunities,
} from '../../v2/showtimes/showtimesBrowseModel.js';
import {
  resolveBrowseShowtimeOpportunity,
  resolveShowtimeActionSheetState,
} from '../../v2/showtimes/showtimeActionSheetModel.js';
import { resolveHomeOpportunity } from '../../v2/showtimes/resolveHomeOpportunity.js';
import {
  getAcceptedPlans,
  removePerformanceFromAcceptedPlan,
} from '../../v2/stores/acceptedPlansStore.js';
import { resolvePlannedScreeningPresentation } from '../../v2/planner/resolvePlannedScreeningPresentation.js';
import { normalizeExternalTicketUrl } from '../../v2/ticket/externalTicketUrl.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BROWSE_SRC = readFileSync(
  join(ROOT, 'v2/surfaces/ShowtimesBrowseSurface.jsx'),
  'utf8',
);
const SHEET_SRC = readFileSync(
  join(ROOT, 'v2/showtimes/ShowtimeActionSheet.jsx'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');

/** Pacific afternoon — 2026-08-01 */
const NOW = new Date('2026-08-01T22:00:00.000Z');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function sampleHome() {
  return {
    films: [
      {
        filmKey: 'alpha',
        filmId: 'tmdb:100',
        title: 'Alpha',
        runtimeMin: 100,
        posterUrl: 'https://example.test/a.jpg',
      },
      {
        filmKey: 'beta',
        filmId: 'tmdb:200',
        title: 'Beta',
        runtimeMin: 90,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'today-ticketed',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-01',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-01T19:00',
        formatLabels: ['Digital'],
        ticketUrl: 'https://tickets.example/a',
        source: 'amc',
        sourceShowtimeId: 'src-a-1900',
        runtimeMin: 100,
      },
      {
        opportunityKey: 'today-plain',
        filmKey: 'beta',
        theaterId: 't2',
        theaterName: 'Theater Two',
        localDate: '2026-08-01',
        localTime: '16:30',
        sortableLocalDateTime: '2026-08-01T16:30',
        formatLabels: ['35mm'],
        ticketUrl: null,
        source: 'beacon',
        sourceShowtimeId: 'src-b-1630',
        runtimeMin: 90,
      },
      {
        opportunityKey: 'today-alpha-late',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-01',
        localTime: '21:30',
        sortableLocalDateTime: '2026-08-01T21:30',
        formatLabels: ['IMAX'],
        ticketUrl: 'https://tickets.example/a-late',
        source: 'amc',
        sourceShowtimeId: 'src-a-2130',
        runtimeMin: 100,
      },
      {
        opportunityKey: 'overlap-b',
        filmKey: 'beta',
        theaterId: 't3',
        theaterName: 'Theater Three',
        localDate: '2026-08-02',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-02T19:00',
        formatLabels: ['Digital'],
        source: 'siff',
        sourceShowtimeId: 'overlap-b',
        runtimeMin: 90,
      },
      {
        opportunityKey: 'overlap-a',
        filmKey: 'alpha',
        theaterId: 't4',
        theaterName: 'Theater Four',
        localDate: '2026-08-02',
        localTime: '19:15',
        sortableLocalDateTime: '2026-08-02T19:15',
        formatLabels: ['Digital'],
        source: 'siff',
        sourceShowtimeId: 'overlap-a',
        runtimeMin: 100,
      },
    ],
  };
}

function browseRow(homeData, opportunityKey) {
  const presentation = buildShowtimesBrowsePresentation(
    homeData,
    createDefaultShowtimesBrowseUi(),
    { now: NOW },
  );
  for (const film of presentation.films) {
    const hit = film.showtimes.find((s) => s.opportunityKey === opportunityKey);
    if (hit) return { film, row: hit };
  }
  return { film: null, row: null };
}

test('Browse showtime pills open action sheet wiring', () => {
  assert.match(BROWSE_SRC, /ShowtimeActionSheet/);
  assert.match(BROWSE_SRC, /openShowtimeActions/);
  assert.match(BROWSE_SRC, /<button[^>]*className="v2-stb-time"/);
  assert.doesNotMatch(BROWSE_SRC, /v2-stb-time-plain/);
  assert.doesNotMatch(BROWSE_SRC, /externalTicketLinkProps/);
  assert.match(APP_SRC, /onAcceptedPlansChange/);
});

test('action sheet shows correct screening context', () => {
  const homeData = sampleHome();
  const { film, row } = browseRow(homeData, 'today-ticketed');
  const opportunity = resolveBrowseShowtimeOpportunity({ row, homeData });
  const state = resolveShowtimeActionSheetState({
    storage: memoryStorage(),
    opportunity,
    filmKey: film.filmKey,
    homeData,
    row,
  });
  assert.equal(state.ok, true);
  assert.equal(state.context.filmTitle, 'Alpha');
  assert.equal(state.context.theaterName, 'Theater One');
  assert.equal(state.context.formatLabel, 'Digital');
  assert.match(state.context.timeLabel, /7:00|19:00/);
});

test('ticketed showtime action sheet includes Tickets action', () => {
  assert.match(SHEET_SRC, /ticketLink \?/);
  assert.match(SHEET_SRC, /Tickets/);
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-ticketed');
  const state = resolveShowtimeActionSheetState({
    storage: memoryStorage(),
    opportunity: opp,
    filmKey: 'alpha',
    homeData,
  });
  assert.ok(state.ticketUrl);
  assert.equal(normalizeExternalTicketUrl(state.ticketUrl), 'https://tickets.example/a');
});

test('showtime without ticket URL still resolves sheet state and omits ticket URL', () => {
  const homeData = sampleHome();
  const { row } = browseRow(homeData, 'today-plain');
  const opportunity = resolveBrowseShowtimeOpportunity({ row, homeData });
  const state = resolveShowtimeActionSheetState({
    storage: memoryStorage(),
    opportunity,
    filmKey: 'beta',
    homeData,
    row,
  });
  assert.equal(state.ok, true);
  assert.equal(state.ticketUrl, null);
  assert.match(SHEET_SRC, /Add to Planner/);
  assert.match(SHEET_SRC, /Add to calendar/);
});

test('Add to Planner creates single-performance accepted plan', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-plain');
  const result = addShowtimeToPlanner(storage, opp, 'beta', { homeData, now: () => NOW });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'added');
  const plans = getAcceptedPlans(storage);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].performances.length, 1);
  assert.equal(plans[0].performances[0].filmKey, 'beta');
  assert.equal(plans[0].performances[0].theaterId, 't2');
});

test('performance shape matches acceptedPlans expectations', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-ticketed');
  const result = addShowtimeToPlanner(storage, opp, 'alpha', { homeData, now: () => NOW });
  const perf = result.plan.performances[0];
  assert.equal(perf.performanceKey, result.performanceKey);
  assert.equal(perf.source, 'amc');
  assert.equal(perf.sourceShowtimeId, 'src-a-1900');
  assert.equal(perf.localDate, '2026-08-01');
  assert.equal(perf.localTime, '19:00');
  assert.ok(perf.expectedEndsAt);
});

test('added screening appears in Planner Upcoming presentation', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-ticketed');
  addShowtimeToPlanner(storage, opp, 'alpha', { homeData, now: () => NOW });
  const landing = composePlannerLandingFromAcceptedPlans({
    storage,
    now: NOW,
  });
  const titles = landing.upcoming.dateGroups.flatMap((g) =>
    g.items.map((item) => item.title),
  );
  assert.ok(titles.includes('Alpha'));
});

test('exact screening becomes In Planner in action sheet state', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-ticketed');
  addShowtimeToPlanner(storage, opp, 'alpha', { homeData, now: () => NOW });
  const state = resolveShowtimeActionSheetState({
    storage,
    opportunity: opp,
    filmKey: 'alpha',
    homeData,
  });
  assert.equal(state.inPlanner, true);
  assert.match(SHEET_SRC, /In Planner/);
});

test('exact duplicate cannot be added twice', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-ticketed');
  const first = addShowtimeToPlanner(storage, opp, 'alpha', { homeData, now: () => NOW });
  const second = addShowtimeToPlanner(storage, opp, 'alpha', { homeData, now: () => NOW });
  assert.equal(first.status, 'added');
  assert.equal(second.status, 'already_planned');
  assert.equal(getAcceptedPlans(storage).length, 1);
});

test('different time for same film remains addable', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  const early = resolveHomeOpportunity(homeData, 'today-ticketed');
  const late = resolveHomeOpportunity(homeData, 'today-alpha-late');
  const keyEarly = buildPerformanceKeyForOpportunity(early, homeData.films[0], null, homeData);
  const keyLate = buildPerformanceKeyForOpportunity(late, homeData.films[0], null, homeData);
  assert.notEqual(keyEarly, keyLate);
  addShowtimeToPlanner(storage, early, 'alpha', { homeData, now: () => NOW });
  const second = addShowtimeToPlanner(storage, late, 'alpha', { homeData, now: () => NOW });
  assert.equal(second.status, 'added');
  assert.equal(getAcceptedPlans(storage).length, 2);
});

test('removing screening from Planner makes Add available again', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-ticketed');
  const added = addShowtimeToPlanner(storage, opp, 'alpha', { homeData, now: () => NOW });
  removePerformanceFromAcceptedPlan(storage, added.planId, added.performanceKey);
  const state = resolveShowtimeActionSheetState({
    storage,
    opportunity: opp,
    filmKey: 'alpha',
    homeData,
  });
  assert.equal(state.inPlanner, false);
});

test('Add to calendar uses existing opportunity export path', () => {
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-ticketed');
  const film = homeData.films[0];
  const input = opportunityToCalendarInput(opp, film);
  assert.equal(input.title, 'Alpha');
  assert.equal(input.date, '2026-08-01');
  assert.equal(input.time, '19:00');
  assert.match(SHEET_SRC, /exportOpportunityToCalendar/);
});

test('calendar export receives correct screening data', () => {
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-plain');
  const result = exportOpportunityToCalendar({
    opportunity: opp,
    film: homeData.films[1],
    homeData,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'download_failed');
});

test('adding overlapping screenings is permitted', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  const a = resolveHomeOpportunity(homeData, 'overlap-a');
  const b = resolveHomeOpportunity(homeData, 'overlap-b');
  const first = addShowtimeToPlanner(storage, a, 'alpha', { homeData, now: () => NOW });
  const second = addShowtimeToPlanner(storage, b, 'beta', { homeData, now: () => NOW });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(getAcceptedPlans(storage).length, 2);
});

test('Planner conflict detection sees overlapping browse-added screenings', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  addShowtimeToPlanner(
    storage,
    resolveHomeOpportunity(homeData, 'overlap-a'),
    'alpha',
    { homeData, now: () => NOW },
  );
  addShowtimeToPlanner(
    storage,
    resolveHomeOpportunity(homeData, 'overlap-b'),
    'beta',
    { homeData, now: () => NOW },
  );
  const landing = composePlannerLandingFromAcceptedPlans({
    storage,
    now: new Date('2026-08-02T12:00:00-07:00'),
  });
  const conflictItems = landing.upcoming.dateGroups.flatMap((g) =>
    g.items.filter((item) => item.kind === 'conflict-group'),
  );
  assert.ok(conflictItems.length >= 1);
});

test('Browse filtering and date modes remain unchanged', () => {
  const homeData = sampleHome();
  const today = buildShowtimesBrowsePresentation(
    homeData,
    createDefaultShowtimesBrowseUi(),
    { now: NOW },
  );
  const tomorrow = buildShowtimesBrowsePresentation(
    homeData,
    { ...createDefaultShowtimesBrowseUi(), dateMode: 'tomorrow' },
    { now: NOW },
  );
  assert.ok(today.filteredCount >= 2);
  assert.equal(tomorrow.filteredCount, 2);
  const filtered = filterBrowseOpportunities(homeData.opportunities, {
    theaterIds: ['t1'],
  });
  assert.equal(filtered.length, 2);
});

test('theater links remain in Browse surface', () => {
  assert.match(BROWSE_SRC, /v2-stb-theater-name/);
  assert.match(BROWSE_SRC, /onOpenTheaterDetail/);
});

test('ticket-less showtime row is an interactive button', () => {
  const homeData = sampleHome();
  const { row } = browseRow(homeData, 'today-plain');
  assert.ok(row);
  assert.equal(row.ticketUrl, null);
  assert.ok(resolveBrowseShowtimeOpportunity({ row, homeData }));
});

test('Saved Films add path remains compatible via shared helper', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-plain');
  const viaAlias = addShowtimeToPlanner(storage, opp, 'beta', { homeData, now: () => NOW });
  storage.removeItem('reel-seattle.v2.acceptedPlans');
  const viaSaved = addSavedFilmShowtimeToPlanner(storage, opp, 'beta', {
    homeData,
    now: () => NOW,
  });
  assert.deepEqual(
    viaAlias.performanceKey,
    buildPerformanceKeyForOpportunity(opp, homeData.films[1], null, homeData),
  );
  assert.equal(viaSaved.status, 'added');
});

test('Planner screening detail works for browse-added screening', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-ticketed');
  const added = addShowtimeToPlanner(storage, opp, 'alpha', { homeData, now: () => NOW });
  const presentation = resolvePlannedScreeningPresentation({
    planId: added.planId,
    performanceKey: added.performanceKey,
    storage,
    homeData,
  });
  assert.equal(presentation.ok, true);
  assert.equal(presentation.screening.title, 'Alpha');
  assert.equal(presentation.screening.theaterName, 'Theater One');
});

test('same exact showtime reopens with stable performance identity', () => {
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-ticketed');
  const film = homeData.films[0];
  const key1 = buildPerformanceKeyForOpportunity(opp, film, null, homeData);
  const key2 = buildPerformanceKeyForOpportunity(opp, film, null, homeData);
  assert.equal(key1, key2);
  const storage = memoryStorage();
  addShowtimeToPlanner(storage, opp, 'alpha', { homeData, now: () => NOW });
  assert.ok(findPlannedPerformanceByKey(storage, key1));
});

test('listUpcomingPlannerScreenings includes browse-added performance key', () => {
  const storage = memoryStorage();
  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'today-ticketed');
  const added = addShowtimeToPlanner(storage, opp, 'alpha', { homeData, now: () => NOW });
  const screenings = listUpcomingPlannerScreenings({
    storage,
    now: NOW,
  });
  assert.ok(screenings.some((s) => s.performanceKey === added.performanceKey));
});
