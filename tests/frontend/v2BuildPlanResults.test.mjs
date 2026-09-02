/**
 * Build a Plan Results — structure, overlays, mockup isolation.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  BUILD_PLAN_RESULTS_SECTION_ORDER,
  createBuildPlanResultsUiState,
  getBuildPlanResultsInteraction,
  getBuildPlanResultsMockupPresentation,
  getBuildPlanResultsOrderedPlans,
  PLAN_RESULTS_INTERACTION_QUERY,
  resolveBuildPlanResultsPresentation,
} from '../../v2/fixtures/buildPlanResultsMockupFixture.js';
import {
  isValidTimeWindow,
  addMinutesToClock,
  parseClockToMinutes,
} from '../../v2/planner/planTimeWindow.js';
import {
  isValidBreakRange,
  parseBreakLabelToMinutes,
  formatBreakMinutes,
  stepBreakMinutes,
} from '../../v2/planner/planBreakRange.js';
import {
  openBuildPlanResults,
  openBuildPlanPlanDetails,
  createInitialNavState,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanResultsSurface.jsx'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');
const NAV_SRC = readFileSync(join(ROOT, 'v2/navigation/navState.js'), 'utf8');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');

test('results section order is summary/sort/plans', () => {
  assert.deepEqual(BUILD_PLAN_RESULTS_SECTION_ORDER, [
    'summary',
    'sort',
    'plans',
  ]);
});

test('fixture presentation exposes canonical chrome labels', () => {
  const p = getBuildPlanResultsMockupPresentation();
  assert.equal(p.pageTitle, 'Your Movie Day Results');
  assert.match(p.summaryLine, /Sat, Jul 19/);
  assert.equal(p.viewPlanLabel, 'View plan details');
  assert.equal(p.savePlanLabel, 'Add to Planner');
  assert.equal(p.savedPlanLabel, 'Added to Planner');
  assert.equal(resolveBuildPlanResultsPresentation(), p);
});

test('sort reorder is deterministic', () => {
  const best = getBuildPlanResultsOrderedPlans('best-match').map((p) => p.id);
  const short = getBuildPlanResultsOrderedPlans('shortest-runtime').map(
    (p) => p.id,
  );
  assert.deepEqual(best, ['plan-1', 'plan-2', 'plan-3']);
  assert.notDeepEqual(best, short);
});

test('surface wires shared adjustment overlays', () => {
  assert.match(SURFACE_SRC, /AdjustTimeWindowOverlay/);
  assert.match(SURFACE_SRC, /AdjustFilmInPlansOverlay/);
  assert.match(SURFACE_SRC, /AdjustBreakLengthOverlay/);
  assert.match(SURFACE_SRC, /activeAdjustment/);
  assert.match(CSS, /v2-bpr-adj-dialog/);
});

test('time / film / break are button triggers', () => {
  assert.match(SURFACE_SRC, /className="v2-bpr-film-time"/);
  assert.match(SURFACE_SRC, /className="v2-bpr-film-main"/);
  assert.match(SURFACE_SRC, /className="v2-bpr-break-pill"/);
  assert.match(SURFACE_SRC, /Adjust time window/);
  assert.match(SURFACE_SRC, /Adjust \$\{film\.title\} in plans/);
  assert.match(SURFACE_SRC, /Adjust break length/);
});

test('only one overlay kind is rendered at a time', () => {
  assert.match(
    SURFACE_SRC,
    /activeAdjustment === 'time'[\s\S]*activeAdjustment === 'film'[\s\S]*activeAdjustment === 'break'/,
  );
});

test('film preferences are require/prefer/exclude exclusive', () => {
  assert.match(SURFACE_SRC, /preference === 'require'/);
  assert.match(SURFACE_SRC, /'prefer'/);
  assert.match(SURFACE_SRC, /'exclude'/);
  const overlay = readFileSync(
    join(ROOT, 'v2/planner/AdjustFilmInPlansOverlay.jsx'),
    'utf8',
  );
  assert.match(overlay, /id: 'require'/);
  assert.match(overlay, /id: 'prefer'/);
  assert.match(overlay, /id: 'exclude'/);
});

test('time window validation rejects end before start', () => {
  assert.equal(isValidTimeWindow('2:00 PM', '11:00 PM'), true);
  assert.equal(isValidTimeWindow('11:00 PM', '2:00 PM'), false);
  assert.equal(parseClockToMinutes('2:15 PM'), 14 * 60 + 15);
  assert.equal(addMinutesToClock('2:00 PM', 30), '2:30 PM');
});

test('break min/max validation', () => {
  assert.equal(isValidBreakRange(45, 150), true);
  assert.equal(isValidBreakRange(120, 60), false);
  assert.equal(isValidBreakRange(45, null), true);
  assert.equal(parseBreakLabelToMinutes('2h 30m'), 150);
  assert.equal(formatBreakMinutes(90), '1h 30m');
  assert.equal(stepBreakMinutes(45, 15), 60);
});

test('interaction query constant exists', () => {
  assert.equal(PLAN_RESULTS_INTERACTION_QUERY, 'interaction');
  assert.equal(typeof getBuildPlanResultsInteraction, 'function');
});

test('save and view plan details are wired', () => {
  assert.match(SURFACE_SRC, /Add to Planner|savePlanLabel/);
  assert.match(SURFACE_SRC, /onViewPlanDetails|View plan details/);
  assert.match(APP_SRC, /openBuildPlanPlanDetails|BuildPlanPlanDetailsSurface/);
  assert.match(NAV_SRC, /openBuildPlanPlanDetails/);
});

test('nav opens results and plan details', () => {
  let nav = openBuildPlanResults(createInitialNavState(), {
    originPrimary: 'planner',
    formConfig: { startAfter: '2:00 PM' },
  });
  assert.equal(nav.surface.type, 'build-plan-results');
  nav = openBuildPlanPlanDetails(nav, {
    plan: { id: 'plan-1', rank: 1, items: [] },
  });
  assert.equal(nav.surface.type, 'build-plan-plan-details');
  assert.equal(nav.surface.returnSurface.type, 'build-plan-results');
});

test('four-item nav chrome preserved in CSS/app shell', () => {
  assert.match(APP_SRC, /PrimaryNav/);
  assert.doesNotMatch(SURFACE_SRC, /Watchlist|Theaters bottom/);
});

test('adjustment dialog CSS is centered modal above nav', () => {
  assert.match(CSS, /\.v2-bpr-adj-backdrop\s*\{[^}]*z-index:\s*60/s);
  assert.match(CSS, /\.v2-bpr-adj-dialog\s*\{[^}]*width:\s*min\(100%,\s*13\.75rem\)/s);
  assert.match(CSS, /\[data-bpr-adjustment='film'\][\s\S]*15\.625rem/);
  assert.match(CSS, /\[data-bpr-adjustment='break'\][\s\S]*17\.75rem/);
  assert.match(CSS, /prefers-reduced-motion/);
});

test('ui state helper still seeds', () => {
  const a = createBuildPlanResultsUiState();
  assert.equal(a.sortId, 'best-match');
  assert.ok(a.selectedFilmIds.length > 0);
});

test('mockup isolation: fixture source marker in surface', () => {
  assert.match(SURFACE_SRC, /data-build-plan-results-source/);
  assert.match(SURFACE_SRC, /isPlanResultsMockupMode|mockup-fixture/);
});
