import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILD_PLAN_CTA_LABEL,
  BUILD_PLAN_MOCKUP_FIXTURE,
  BUILD_PLAN_SECTION_ORDER,
  applyBuildPlanPreset,
  createBuildPlanFormState,
  getBuildPlanMockupPresentation,
  resolveBuildPlanPresentation,
} from '../../v2/fixtures/buildPlanMockupFixture.js';
import {
  PRIMARY_DESTINATIONS,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openBuildPlan,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  getFavoriteTheaters,
} from '../../v2/stores/favoriteTheatersStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
} from '../../v2/stores/savedFilmsStore.js';
import {
  SEEN_FILMS_STORAGE_KEY,
  getSeenFilms,
} from '../../v2/stores/seenFilmsStore.js';
import {
  DISMISSED_FILMS_STORAGE_KEY,
  getNotInterestedFilms,
} from '../../v2/stores/notInterestedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanSurface.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/buildPlanMockupFixture.js'),
  'utf8',
);
const PLANNER_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannerDestination.jsx'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');
const NAV_SRC = readFileSync(join(ROOT, 'v2/navigation/navState.js'), 'utf8');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('Build a Plan fixture matches canonical mockup regions', () => {
  const p = getBuildPlanMockupPresentation();
  assert.equal(p, BUILD_PLAN_MOCKUP_FIXTURE);
  assert.equal(resolveBuildPlanPresentation(), p);
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p.pageTitle, 'Build a Plan');
  assert.equal(p.ctaLabel, BUILD_PLAN_CTA_LABEL);
  assert.equal(p.ctaLabel, 'Build my movie day');
  assert.deepEqual(
    p.presets.map((x) => x.title),
    [
      'After Work',
      'Saturday Marathon',
      'Premium Adventure',
      'Last Chance',
      'Surprise Me',
    ],
  );
  assert.equal(p.customDividerLabel, 'or build custom');
  assert.equal(p.clearAllLabel, 'Clear all');
  assert.equal(p.when.title, 'When?');
  assert.equal(p.what.title, 'What?');
  assert.equal(p.where.title, 'Where?');
  assert.equal(p.fineTuning.title, 'Fine tuning');
  assert.deepEqual([...BUILD_PLAN_SECTION_ORDER], [
    'header',
    'presets',
    'customDivider',
    'when',
    'what',
    'where',
    'fineTuning',
    'summaryCta',
  ]);
});

test('Must include is optional; Save draft and Avoid late ends absent', () => {
  assert.equal(SURFACE_SRC.includes('Save draft'), false);
  assert.equal(SURFACE_SRC.includes('Save Draft'), false);
  assert.equal(SURFACE_SRC.includes('Avoid late ends'), false);
  assert.equal(FIXTURE_SRC.includes('Save draft'), false);
  assert.equal(FIXTURE_SRC.includes('Avoid late ends'), false);
  assert.equal(FIXTURE_SRC.includes('at least one film'), false);
  assert.match(SURFACE_SRC, /mustIncludeLabel/);
  assert.match(FIXTURE_SRC, /mustIncludeLabel: 'Must include'/);
  // Must include is not marked required in copy.
  assert.equal(FIXTURE_SRC.includes('Must include (required)'), false);
  assert.equal(SURFACE_SRC.includes('required'), false);
});

test('Not interested labels omit unnecessary suffixes', () => {
  const titles = BUILD_PLAN_MOCKUP_FIXTURE.defaultForm.notInterested.map(
    (f) => f.title,
  );
  assert.deepEqual(titles, ['Minions & Monsters', 'Moana']);
  assert.equal(titles.some((t) => /\(live action\)/i.test(t)), false);
});

test('Clear all restores fixture defaults; presets apply locally', () => {
  let form = createBuildPlanFormState();
  assert.equal(form.selectedPresetId, 'after-work');
  form = applyBuildPlanPreset('saturday-marathon', form);
  assert.equal(form.selectedPresetId, 'saturday-marathon');
  assert.equal(form.planSize, '3 movies');
  form.mustInclude = [];
  form.flexible = false;
  form = createBuildPlanFormState();
  assert.equal(form.selectedPresetId, 'after-work');
  assert.equal(form.mustInclude.length, 1);
  assert.equal(form.flexible, true);
});

test('Fixture isolation — no stores or production planner imports', () => {
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(FIXTURE_SRC.includes('localStorage'), false);
  assert.equal(FIXTURE_SRC.includes('plannerEngine'), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
  assert.equal(FIXTURE_SRC.includes('plannerUrlState'), false);
  assert.equal(SURFACE_SRC.includes('localStorage'), false);
  assert.equal(SURFACE_SRC.includes('stores/'), false);
});

test('Build a Plan surface is designed, not a placeholder', () => {
  assert.match(APP_SRC, /BuildPlanSurface/);
  assert.match(APP_SRC, /openBuildPlan/);
  assert.match(PLANNER_SRC, /onOpenBuildPlan/);
  assert.match(SURFACE_SRC, /data-build-plan-source/);
  assert.match(SURFACE_SRC, /data-build-plan-section="presets"/);
  assert.match(SURFACE_SRC, /data-build-plan-section="when"/);
  assert.match(SURFACE_SRC, /data-build-plan-section="what"/);
  assert.match(SURFACE_SRC, /data-build-plan-section="where"/);
  assert.match(SURFACE_SRC, /data-build-plan-section="fineTuning"/);
  assert.match(SURFACE_SRC, /data-build-plan-section="summaryCta"/);
  assert.equal(SURFACE_SRC.includes('v2 shell · placeholder'), false);
  assert.match(SURFACE_SRC, /resultsDeferredMessage|onRequestResults/);
  assert.match(CSS, /\.v2-bp\b/);
  assert.match(CSS, /\.v2-bp-cta\b/);
  assert.match(CSS, /\.v2-bp-preset\b/);
});

test('CTA and Clear all are accessible; Finish before present', () => {
  assert.match(SURFACE_SRC, /aria-label=\{clearAllLabel\}/);
  assert.match(SURFACE_SRC, /aria-label=\{ctaLabel\}/);
  assert.match(SURFACE_SRC, /aria-labelledby="v2-bp-title"/);
  assert.match(SURFACE_SRC, /role="radiogroup"/);
  assert.match(SURFACE_SRC, /role="switch"/);
  assert.match(SURFACE_SRC, /finishBeforeLabel/);
  assert.match(FIXTURE_SRC, /Finish before/);
});

test('Navigation: Planner → Build a Plan → Back restores Planner', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.id),
    ['home', 'explore', 'planner', 'profile'],
  );
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'planner');
  nav = openBuildPlan(nav, { originPrimary: 'planner' });
  assert.equal(nav.surface?.type, 'build-plan');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'planner',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.match(NAV_SRC, /openBuildPlan/);
  assert.match(NAV_SRC, /'build-plan'/);
});

test('Opening Build a Plan does not seed planner persistence keys', () => {
  const storage = memoryStorage();
  openBuildPlan(createInitialNavState(), { originPrimary: 'planner' });
  createBuildPlanFormState();
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(SEEN_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(DISMISSED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY), null);
  assert.equal(getSavedFilms(storage).length, 0);
  assert.equal(getSeenFilms(storage).length, 0);
  assert.equal(getNotInterestedFilms(storage).length, 0);
  assert.equal(getFavoriteTheaters(storage).length, 0);
});

test('Form state resets independently of remount helper', () => {
  const a = createBuildPlanFormState();
  a.selectedPresetId = null;
  a.mustInclude = [];
  const b = createBuildPlanFormState();
  assert.equal(b.selectedPresetId, 'after-work');
  assert.equal(b.mustInclude.length, 1);
  assert.notEqual(a.mustInclude.length, b.mustInclude.length);
});
