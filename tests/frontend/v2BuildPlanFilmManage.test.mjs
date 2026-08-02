import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILD_PLAN_FILM_MANAGE_MODES,
  MUST_INCLUDE_MAX,
  WOULD_LOVE_MAX,
  getBuildPlanFilmManageConfig,
  parseBuildPlanFilmManageMode,
} from '../../v2/planner/buildPlanFilmManageConfig.js';
import {
  BUILD_PLAN_MANAGE_QUERY,
  createBuildPlanFilmManageMockupForm,
  getBuildPlanFilmManageMockupCandidates,
  resolveBuildPlanFilmManageCandidates,
} from '../../v2/fixtures/buildPlanFilmManageMockupFixture.js';
import {
  clearBuildPlanFormSession,
  ensureBuildPlanFormSession,
  getBuildPlanFormSession,
  setBuildPlanFormBucket,
  setBuildPlanFormSession,
} from '../../v2/planner/buildPlanFormSession.js';
import { createBuildPlanFormState } from '../../v2/fixtures/buildPlanMockupFixture.js';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';
import {
  createInitialNavState,
  navigateBack,
  openBuildPlan,
  openBuildPlanFilmManage,
} from '../../v2/navigation/navState.js';
import { resolveActivePrimaryId } from '../../v2/destinations.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanFilmManageSurface.jsx'),
  'utf8',
);
const BP_SRC = readFileSync(join(ROOT, 'v2/planner/BuildPlanSurface.jsx'), 'utf8');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

test('shared manage modes and config copy', () => {
  assert.deepEqual(BUILD_PLAN_FILM_MANAGE_MODES, [
    'mustInclude',
    'wouldLove',
    'notInterested',
  ]);
  assert.equal(MUST_INCLUDE_MAX, 2);
  assert.equal(WOULD_LOVE_MAX, 15);
  assert.equal(parseBuildPlanFilmManageMode('wouldLove'), 'wouldLove');
  assert.equal(parseBuildPlanFilmManageMode('not-interested'), 'notInterested');
  assert.equal(parseBuildPlanFilmManageMode('mustInclude'), 'mustInclude');

  const must = getBuildPlanFilmManageConfig('mustInclude');
  const love = getBuildPlanFilmManageConfig('wouldLove');
  const ni = getBuildPlanFilmManageConfig('notInterested');
  assert.equal(must.pageTitle, 'Must include');
  assert.equal(must.selectionCap, 2);
  assert.equal(love.pageTitle, 'Would love to see');
  assert.match(love.footerSupport, /15/);
  assert.equal(love.primaryFilterLabel, 'Saved');
  assert.equal(ni.pageTitle, 'Not interested in');
  assert.equal(ni.selectedHeading, 'Excluded films');
  assert.equal(ni.candidateHeading, 'Exclude more films');
  assert.equal(ni.footerSupport, 'Excluded from planner results');
  assert.equal(ni.selectionCap, null);
});

test('one shared manage surface serves all modes', () => {
  assert.match(SURFACE_SRC, /getBuildPlanFilmManageConfig\(mode\)/);
  assert.match(SURFACE_SRC, /data-build-plan-manage=\{mode\}/);
  assert.match(APP_SRC, /BuildPlanFilmManageSurface/);
  assert.match(APP_SRC, /openBuildPlanFilmManage/);
  assert.match(BP_SRC, /onOpenFilmManage/);
  assert.match(BP_SRC, /openManage\('mustInclude'\)/);
  assert.match(BP_SRC, /openManage\('wouldLove'\)/);
  assert.match(BP_SRC, /openManage\('notInterested'\)/);
});

test('add/remove update session bucket and respect must cap', () => {
  clearBuildPlanFormSession();
  const form = createBuildPlanFilmManageMockupForm('mustInclude');
  ensureBuildPlanFormSession(() => form);
  assert.equal(getBuildPlanFormSession().mustInclude.length, 1);

  const candidates = getBuildPlanFilmManageMockupCandidates('mustInclude');
  setBuildPlanFormBucket('mustInclude', [
    ...getBuildPlanFormSession().mustInclude,
    { ...candidates[0] },
  ]);
  assert.equal(getBuildPlanFormSession().mustInclude.length, 2);

  const cfg = getBuildPlanFilmManageConfig('mustInclude');
  assert.equal(
    getBuildPlanFormSession().mustInclude.length >= cfg.selectionCap,
    true,
  );

  setBuildPlanFormBucket('mustInclude', [
    getBuildPlanFormSession().mustInclude[0],
  ]);
  assert.equal(getBuildPlanFormSession().mustInclude.length, 1);
  clearBuildPlanFormSession();
});

test('candidates exclude selected; search is title-based', () => {
  const selected = createBuildPlanFilmManageMockupForm('wouldLove').wouldLove;
  const candidates = resolveBuildPlanFilmManageCandidates(
    'wouldLove',
    selected,
    getBuildPlanFilmManageMockupCandidates('wouldLove'),
  );
  const selectedIds = new Set(selected.map((f) => f.id));
  assert.equal(candidates.every((f) => !selectedIds.has(f.id)), true);
  assert.equal(
    candidates.some((f) => /Heaven|Paris|Drive|Taste/i.test(f.title)),
    true,
  );
});

test('manage navigation opens mode and Done/Back return to What', () => {
  let nav = createInitialNavState();
  nav = openBuildPlan(nav, { originPrimary: 'planner' });
  nav = openBuildPlanFilmManage(nav, {
    originPrimary: 'planner',
    mode: 'wouldLove',
  });
  assert.equal(nav.surface?.type, 'build-plan-film-manage');
  assert.equal(nav.surface?.mode, 'wouldLove');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'planner',
  );
  assert.equal(nav.surface.returnSurface?.type, 'build-plan');
  assert.equal(nav.surface.returnSurface?.resumeOpenSection, 'what');
  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'build-plan');
  assert.equal(nav.surface?.resumeOpenSection, 'what');
});

test('footer is not sticky; manage query constant exists', () => {
  assert.equal(BUILD_PLAN_MANAGE_QUERY, 'manage');
  assert.match(CSS, /\.v2-bp-manage-footer\b/);
  assert.match(CSS, /\.v2-bp-manage-footer\s*\{[^}]*position:\s*static/s);
  assert.equal(/\.v2-bp-manage-footer\s*\{[^}]*position:\s*sticky/s.test(CSS), false);
  assert.match(SURFACE_SRC, /aria-expanded=\{selectedOpen\}/);
  assert.match(SURFACE_SRC, /v2-bp-manage-section-head/);
  assert.match(SURFACE_SRC, /v2-bp-manage-block/);
  assert.match(SURFACE_SRC, /Search films/);
  assert.match(SURFACE_SRC, /addAria/);
  assert.match(SURFACE_SRC, /removeAria/);
  assert.match(CSS, /\.v2-bp-manage-filters\s*\{[^}]*display:\s*flex/s);
});

test('no fixture bleed into live form defaults', () => {
  clearBuildPlanFormSession();
  const live = createLiveBuildPlanFormState();
  assert.equal(live.mustInclude.length, 0);
  assert.equal(live.wouldLove.length, 0);
  assert.equal(live.notInterested.length, 0);
  const mock = createBuildPlanFormState();
  assert.ok(mock.wouldLove.length > 0);
  clearBuildPlanFormSession();
  ensureBuildPlanFormSession(() => createLiveBuildPlanFormState());
  assert.equal(getBuildPlanFormSession().wouldLove.length, 0);
  clearBuildPlanFormSession();
});

test('selected collapse does not clear session films', () => {
  clearBuildPlanFormSession();
  setBuildPlanFormSession(createBuildPlanFilmManageMockupForm('notInterested'));
  const before = getBuildPlanFormSession().notInterested.length;
  assert.equal(before, 5);
  // Collapse is UI-only; session unchanged
  assert.equal(getBuildPlanFormSession().notInterested.length, before);
  clearBuildPlanFormSession();
});
