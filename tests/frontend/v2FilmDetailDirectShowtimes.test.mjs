/**
 * Film Detail direct showtime selection → canonical ShowtimeActionSheet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addShowtimeToPlanner,
  buildPerformanceKeyForOpportunity,
} from '../../v2/planner/addSavedFilmShowtimeToPlanner.js';
import { buildTodaysShowtimes } from '../../v2/filmDetail/filmDetailModel.js';
import { resolveHomeOpportunity } from '../../v2/showtimes/resolveHomeOpportunity.js';
import { resolveShowtimeActionSheetState } from '../../v2/showtimes/showtimeActionSheetModel.js';
import {
  createInitialNavState,
  navigateBack,
  openFilmDetail,
  openShowtimes,
} from '../../v2/navigation/navState.js';
import { getAcceptedPlans } from '../../v2/stores/acceptedPlansStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FD = readFileSync(
  join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'),
  'utf8',
);
const APP = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const SHEET = readFileSync(
  join(ROOT, 'v2/showtimes/ShowtimeActionSheet.jsx'),
  'utf8',
);

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
    ],
    opportunities: [
      {
        opportunityKey: 'today-south-early',
        filmKey: 'alpha',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-08-01',
        localTime: '16:30',
        sortableLocalDateTime: '2026-08-01T16:30',
        formatLabels: ['Digital'],
        ticketUrl: 'https://tickets.example/early',
        source: 'amc',
        sourceShowtimeId: 'src-south-1630',
        runtimeMin: 100,
      },
      {
        opportunityKey: 'today-south-late',
        filmKey: 'alpha',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-08-01',
        localTime: '21:30',
        sortableLocalDateTime: '2026-08-01T21:30',
        formatLabels: ['IMAX'],
        ticketUrl: 'https://tickets.example/late',
        source: 'amc',
        sourceShowtimeId: 'src-south-2130',
        runtimeMin: 100,
      },
      {
        opportunityKey: 'today-beacon',
        filmKey: 'alpha',
        theaterId: 'beacon',
        theaterName: 'The Beacon',
        localDate: '2026-08-01',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-01T19:00',
        formatLabels: ['35mm'],
        ticketUrl: null,
        source: 'beacon',
        sourceShowtimeId: 'src-beacon-1900',
        runtimeMin: 100,
      },
    ],
  };
}

test('Film Detail renders actionable today times as buttons, not passive spans only', () => {
  assert.match(FD, /openFilmShowtimeActions\(row, time\)/);
  assert.match(FD, /data-opportunity-key=\{time\.opportunityKey/);
  assert.match(FD, /onClick=\{\(\) => openFilmShowtimeActions\(row, time\)\}/);
  assert.match(FD, /'v2-fd-today-time v2-fd-today-time-on'/);
  assert.match(FD, /: 'v2-fd-today-time'/);
  // Theater card chrome is a container; theater header is its own button.
  assert.match(FD, /<div\s+className=\{`v2-fd-today-row v2-fd-today-accent-\$\{row\.accent\}`\}/);
  assert.doesNotMatch(FD, /<button[^>]*className=\{`v2-fd-today-row/);
  assert.match(FD, /v2-fd-today-theater-btn/);
  assert.match(FD, /<div className="v2-fd-today-times"/);
});

test('exact Film Detail time opens canonical ShowtimeActionSheet with opportunity identity', () => {
  assert.match(FD, /from '\.\.\/showtimes\/ShowtimeActionSheet\.jsx'/);
  assert.match(FD, /resolveHomeOpportunity\(homeData, time\.opportunityKey\)/);
  assert.match(FD, /<ShowtimeActionSheet/);
  assert.match(FD, /opportunity=\{actionSheet\?\.opportunity/);
  assert.match(FD, /filmKey=\{actionSheet\?\.filmKey/);
  assert.match(FD, /onViewPlanner=\{onViewPlanner\}/);
  assert.match(APP, /isFilmDetail[\s\S]*onViewPlanner=\{\(\) => handleSelectDestination\('planner'\)\}/);
  assert.match(APP, /isFilmDetail[\s\S]*onAcceptedPlansChange/);
  assert.match(SHEET, /addShowtimeToPlanner/);
});

test('selected Film Detail time preserves exact performance identity into Planner', () => {
  const homeData = sampleHome();
  const today = buildTodaysShowtimes(homeData, 'alpha', null, { now: NOW });
  const south = today.rows.find((r) => r.theaterId === 'amc-south');
  assert.ok(south);
  const late = south.times.find((t) => t.opportunityKey === 'today-south-late');
  assert.ok(late);
  assert.equal(late.actionable, true);

  const opportunity = resolveHomeOpportunity(homeData, late.opportunityKey);
  assert.equal(opportunity.opportunityKey, 'today-south-late');
  const state = resolveShowtimeActionSheetState({
    storage: memoryStorage(),
    opportunity,
    filmKey: 'alpha',
    homeData,
    row: {
      opportunityKey: late.opportunityKey,
      filmKey: 'alpha',
      filmTitle: 'Alpha',
      localDate: today.localDate,
      localTime: late.localTime,
      timeDisplay: late.timeDisplay,
      theaterName: south.theaterName,
      formatLabels: late.formatLabel ? [late.formatLabel] : [],
      ticketUrl: late.ticketUrl,
    },
  });
  assert.equal(state.ok, true);
  assert.equal(state.context.theaterName, 'AMC Southcenter 16');
  assert.equal(state.context.formatLabel, 'IMAX');
  assert.match(state.context.timeLabel, /9:30|21:30/);

  const expectedKey = buildPerformanceKeyForOpportunity(
    opportunity,
    homeData.films[0],
    null,
    homeData,
  );
  assert.equal(state.performanceKey, expectedKey);

  const storage = memoryStorage();
  const added = addShowtimeToPlanner(storage, opportunity, 'alpha', {
    homeData,
    now: () => NOW,
  });
  assert.equal(added.status, 'added');
  assert.equal(added.performanceKey, expectedKey);
  assert.equal(added.plan.performances[0].localTime, '21:30');
  assert.equal(added.plan.performances[0].sourceShowtimeId, 'src-south-2130');
  // Not the earlier same-theater screening.
  assert.notEqual(added.plan.performances[0].localTime, '16:30');
});

test('theater row opens film Showtimes filtered to that theater', () => {
  assert.match(FD, /openTheaterShowtimes\(row\)/);
  assert.match(
    FD,
    /onOpenShowtimes\?\.\(\{[\s\S]*theaterId: row\.theaterId/,
  );

  let nav = createInitialNavState();
  nav = openFilmDetail(nav, {
    filmKey: 'alpha',
    originPrimary: 'explore',
  });
  nav = openShowtimes(nav, {
    filmKey: 'alpha',
    theaterId: 'amc-south',
    opportunityKey: 'today-south-late',
  });
  assert.equal(nav.surface.type, 'showtimes');
  assert.equal(nav.surface.filmKey, 'alpha');
  assert.equal(nav.surface.theaterId, 'amc-south');
  assert.equal(nav.surface.returnSurface?.type, 'film-detail');

  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'film-detail');
  assert.equal(nav.surface.filmKey, 'alpha');
});

test('See all showtimes opens unfiltered film-specific Showtimes', () => {
  assert.match(FD, /const openAllShowtimes = \(\) => \{/);
  assert.match(
    FD,
    /openAllShowtimes[\s\S]*onOpenShowtimes\?\.\(\{[\s\S]*filmKey: view\.filmKey,[\s\S]*opportunityKey: bestWay\?\.opportunityKey \?\? null,[\s\S]*\}\)/,
  );
  // See all path must not pass theaterId.
  const seeAllBtn = FD.match(
    /See all showtimes[\s\S]{0,80}/,
  )?.[0];
  assert.ok(seeAllBtn);
  assert.match(FD, /onClick=\{openAllShowtimes\}/);

  let nav = createInitialNavState();
  nav = openFilmDetail(nav, { filmKey: 'alpha', originPrimary: 'home' });
  nav = openShowtimes(nav, {
    filmKey: 'alpha',
    opportunityKey: 'today-beacon',
  });
  assert.equal(nav.surface.type, 'showtimes');
  assert.equal(nav.surface.theaterId, null);
  assert.equal(nav.surface.returnSurface?.type, 'film-detail');
});

test('film-level Find a time does not create a Planner performance', () => {
  assert.match(FD, />\s*Find a time\s*</);
  assert.match(FD, /v2-fd-action-planner[\s\S]*onClick=\{openAllShowtimes\}/);
  assert.doesNotMatch(FD, /setPlannerOpen\(true\)/);
  assert.doesNotMatch(FD, /Add to planner/);
  // Film Detail no longer calls onStartPlanner from the action toolbar.
  const plannerAction = FD.match(
    /v2-fd-action-planner[\s\S]*?<\/button>/,
  )?.[0];
  assert.ok(plannerAction);
  assert.doesNotMatch(plannerAction, /onStartPlanner/);
  assert.doesNotMatch(plannerAction, /addShowtimeToPlanner/);

  const storage = memoryStorage();
  assert.equal(getAcceptedPlans(storage).length, 0);
  // Navigating to showtimes alone does not mutate accepted plans.
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, { filmKey: 'alpha', originPrimary: 'explore' });
  nav = openShowtimes(nav, { filmKey: 'alpha' });
  assert.equal(nav.surface.type, 'showtimes');
  assert.equal(getAcceptedPlans(storage).length, 0);
});

test('Film Detail keeps theater grouping while times stay independent targets', () => {
  const homeData = sampleHome();
  const today = buildTodaysShowtimes(homeData, 'alpha', null, { now: NOW });
  assert.equal(today.rows.length, 2);
  assert.ok(today.rows.every((r) => r.theaterName && r.times.length >= 1));
  assert.match(FD, /today\.rows\.map\(\(row\) =>/);
  assert.match(FD, /row\.times\.map\(\(time\) =>/);
  assert.match(FD, /openFilmShowtimeActions\(row, time\)/);
  assert.match(FD, /openTheaterShowtimes\(row\)/);
});
