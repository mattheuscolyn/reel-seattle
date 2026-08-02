/**
 * Build a Plan — Plan Details (narrow regression suite).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  BUILD_PLAN_PLAN_DETAILS_MOCKUP_PLAN,
  isPlanDetailsMockupMode,
} from '../../v2/fixtures/buildPlanPlanDetailsMockupFixture.js';
import {
  buildPlanDetailsItinerary,
  derivePlanDetailsViewModel,
  formatDurationMinutes,
  parseClockToMinutes,
} from '../../v2/planner/derivePlanDetailsViewModel.js';
import {
  createInitialNavState,
  navigateBack,
  openBuildPlanPlanDetails,
  openBuildPlanResults,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanPlanDetailsSurface.jsx'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const HEADER_SRC = readFileSync(join(ROOT, 'v2/home/AppHeader.jsx'), 'utf8');
const CSS_SRC = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');
const NAV_SRC = readFileSync(join(ROOT, 'v2/PrimaryNav.jsx'), 'utf8');

test('correct Results plan is stored on Plan Details surface', () => {
  let nav = createInitialNavState();
  nav = openBuildPlanResults(nav, { originPrimary: 'planner' });
  const plan = { id: 'plan-2', rank: 2, items: [] };
  nav = openBuildPlanPlanDetails(nav, {
    plan,
    origin: { sortId: 'smallest-gaps', scrollY: 240 },
  });
  assert.equal(nav.surface.type, 'build-plan-plan-details');
  assert.equal(nav.surface.plan.id, 'plan-2');
  assert.equal(nav.surface.returnSurface.sortId, 'smallest-gaps');
  assert.equal(nav.surface.returnSurface.scrollY, 240);
  assert.equal(nav.surface.returnSurface.activePlanId, 'plan-2');
});

test('header structure uses Plan Details chrome without wordmark', () => {
  assert.match(HEADER_SRC, /headerMode === 'plan-details'/);
  assert.match(HEADER_SRC, /Plan Details/);
  assert.match(HEADER_SRC, /v2-header-pd-share/);
  assert.match(APP_SRC, /isBuildPlanPlanDetails\s*\?\s*'plan-details'/);
  assert.doesNotMatch(
    SURFACE_SRC,
    /REEL\s*SEATTLE|v2-wordmark/,
  );
});

test('mockup fixture itinerary is chronological film/break/film', () => {
  const rows = buildPlanDetailsItinerary(BUILD_PLAN_PLAN_DETAILS_MOCKUP_PLAN);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['film', 'break', 'film', 'break', 'film'],
  );
  assert.equal(rows[0].title, '2001: A Space Odyssey');
  assert.equal(rows[2].title, 'Perfect Blue');
  assert.equal(rows[4].title, 'Jurassic Park');
  assert.ok(rows[0].startMin < rows[2].startMin);
  assert.ok(rows[2].startMin < rows[4].startMin);
});

test('film rows expose poster, theater, badge, and range', () => {
  const view = derivePlanDetailsViewModel(BUILD_PLAN_PLAN_DETAILS_MOCKUP_PLAN);
  const film = view.itinerary.find((r) => r.kind === 'film');
  assert.ok(film.imageUrl);
  assert.equal(film.theater, 'Central Cinema');
  assert.equal(film.formatBadge, '70MM');
  assert.match(film.rangeLine, /2:15 PM/);
  assert.match(film.rangeLine, /4:31 PM/);
  assert.match(SURFACE_SRC, /v2-bpd-poster/);
  assert.match(SURFACE_SRC, /alt=""/);
});

test('break rows label transfers only when theaters differ', () => {
  const rows = buildPlanDetailsItinerary(BUILD_PLAN_PLAN_DETAILS_MOCKUP_PLAN);
  const transfers = rows.filter((r) => r.kind === 'break');
  assert.equal(transfers.length, 2);
  assert.equal(transfers[0].isTransfer, true);
  assert.match(transfers[0].transferLabel, /Central Cinema → SIFF Film Center/);
  assert.match(transfers[1].transferLabel, /SIFF Film Center → Central Cinema/);

  const sameTheaterPlan = {
    items: [
      {
        id: 'a',
        title: 'A',
        startTime: '1:00 PM',
        endTime: '2:00 PM',
        theater: 'Central Cinema',
        runtimeMin: 60,
      },
      { id: 'b', type: 'break', label: '30m break', durationMin: 30 },
      {
        id: 'c',
        title: 'B',
        startTime: '2:30 PM',
        endTime: '3:30 PM',
        theater: 'Central Cinema',
        runtimeMin: 60,
      },
    ],
  };
  const same = buildPlanDetailsItinerary(sameTheaterPlan).find(
    (r) => r.kind === 'break',
  );
  assert.equal(same.isTransfer, false);
  assert.equal(same.transferLabel, 'Central Cinema');
});

test('derived statistics and plan summary agree with itinerary', () => {
  const view = derivePlanDetailsViewModel(BUILD_PLAN_PLAN_DETAILS_MOCKUP_PLAN);
  assert.equal(view.stats.breaksValue, '2');
  assert.equal(view.stats.theatersValue, '2');
  assert.equal(view.summary.earliestStart, '2:15 PM');
  assert.equal(view.summary.latestFinish, '10:07 PM');
  assert.equal(view.summary.totalMovieRuntime, '6h 33m');
  assert.equal(view.summary.totalBreakTime, '1h 19m');
  assert.equal(view.summary.totalGaps, '~20 min');
  const start = parseClockToMinutes('2:15 PM');
  const end = parseClockToMinutes('10:07 PM');
  assert.equal(view.summary.totalTimeOut, formatDurationMinutes(end - start));
  assert.equal(view.stats.totalLabel, view.summary.totalTimeOut);
});

test('back returns to Results with preserved sort context', () => {
  let nav = createInitialNavState();
  nav = openBuildPlanResults(nav, { originPrimary: 'planner' });
  nav = openBuildPlanPlanDetails(nav, {
    plan: { id: 'plan-1', items: [] },
    origin: { sortId: 'earliest-finish', scrollY: 120 },
  });
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'build-plan-results');
  assert.equal(nav.surface.sortId, 'earliest-finish');
  assert.equal(nav.surface.scrollY, 120);
});

test('share and schedule controls are real buttons', () => {
  assert.match(SURFACE_SRC, /onShareReady/);
  assert.match(SURFACE_SRC, /handleAddToSchedule/);
  assert.match(SURFACE_SRC, /aria-pressed=\{scheduled\}/);
  assert.match(SURFACE_SRC, /actionBusyRef/);
  assert.match(APP_SRC, /planDetailsShareHandler/);
  assert.equal(SURFACE_SRC.includes('handleSave'), false);
  assert.equal(SURFACE_SRC.includes('v2-bpd-save'), false);
});

test('duplicate prevention guards schedule acceptance', () => {
  assert.match(SURFACE_SRC, /Already in My Schedule/);
  assert.equal(SURFACE_SRC.includes('Plan already saved'), false);
});

test('missing-plan state is polished and routes back', () => {
  assert.match(SURFACE_SRC, /Plan unavailable/);
  assert.match(SURFACE_SRC, /Back to results/);
  assert.doesNotMatch(SURFACE_SRC, /storage key|developer|DEBUG/i);
});

test('mockup isolation flag does not leak into production default', () => {
  assert.equal(typeof isPlanDetailsMockupMode, 'function');
  assert.match(SURFACE_SRC, /isPlanDetailsMockupMode/);
  assert.match(SURFACE_SRC, /mockup-fixture/);
  assert.match(APP_SRC, /isPlanDetailsMockupMode/);
});

test('four-item bottom navigation remains Home Explore Planner Profile', () => {
  const destSrc = readFileSync(join(ROOT, 'v2/destinations.js'), 'utf8');
  assert.match(destSrc, /Home/);
  assert.match(destSrc, /Explore|Search/);
  assert.match(destSrc, /Planner/);
  assert.match(destSrc, /Profile/);
  assert.match(NAV_SRC, /PRIMARY_DESTINATIONS/);
  assert.match(CSS_SRC, /\.v2-bpd/);
  assert.match(CSS_SRC, /\.v2-shell/);
});

test('surface markup keeps chronological list order', () => {
  assert.match(SURFACE_SRC, /<ol className="v2-bpd-timeline">/);
  assert.match(SURFACE_SRC, /view\.itinerary\.map/);
});
