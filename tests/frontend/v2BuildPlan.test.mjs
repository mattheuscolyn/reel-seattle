import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILD_PLAN_CTA_LABEL,
  BUILD_PLAN_MOCKUP_FIXTURE,
  BUILD_PLAN_MOCKUP_QUERY,
  BUILD_PLAN_SECTION_ORDER,
  applyBuildPlanPreset,
  buildPlanSummaryLines,
  createBuildPlanFormState,
  getBuildPlanMockupPresentation,
  resolveBuildPlanPresentation,
} from '../../v2/fixtures/buildPlanMockupFixture.js';
import {
  BUILD_PLAN_ACCORDION_IDS,
  buildCollapsedSectionSummaries,
  nextOpenSection,
  parseBuildPlanSectionQuery,
} from '../../v2/planner/buildPlanAccordion.js';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';
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
const ACCORDION_SRC = readFileSync(
  join(ROOT, 'v2/planner/buildPlanAccordion.js'),
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
  assert.deepEqual(
    p.presets.map((x) => x.title),
    ['After Work', 'Saturday Marathon', 'Last Chance'],
  );
  assert.equal(p.customDividerLabel, 'or build custom');
  assert.equal(p.clearAllLabel, 'Clear all');
  assert.equal(p.when.title, 'When?');
  assert.equal(p.what.title, 'What?');
  assert.equal(p.where.title, 'Where?');
  assert.equal(p.fineTuning.title, 'Fine tuning');
  assert.equal(p.fineTuning.titleFull, 'Fine tuning (optional)');
  assert.deepEqual([...BUILD_PLAN_SECTION_ORDER], [
    'header',
    'presets',
    'customDivider',
    'when',
    'where',
    'what',
    'fineTuning',
    'summaryCta',
  ]);
  assert.equal(p.when.step, 1);
  assert.equal(p.where.step, 2);
  assert.equal(p.what.step, 3);
  assert.equal(p.fineTuning.step, 4);
});

test('Must include is optional; Save draft and Avoid late ends absent', () => {
  assert.equal(SURFACE_SRC.includes('Save draft'), false);
  assert.equal(SURFACE_SRC.includes('Save Draft'), false);
  assert.equal(SURFACE_SRC.includes('Avoid late ends'), false);
  assert.equal(FIXTURE_SRC.includes('Save draft'), false);
  assert.equal(FIXTURE_SRC.includes('Avoid late ends'), false);
  assert.equal(SURFACE_SRC.includes('excludeSoldOut'), false);
  assert.equal(SURFACE_SRC.includes('Exclude sold out'), false);
  assert.match(SURFACE_SRC, /mustIncludeLabel/);
  assert.match(FIXTURE_SRC, /mustIncludeLabel: 'Must include'/);
  assert.equal(FIXTURE_SRC.includes('Must include (required)'), false);
});

test('Fine tuning keeps launch-working fields only', () => {
  const ids = BUILD_PLAN_MOCKUP_FIXTURE.fineTuning.fields.map((f) => f.id);
  assert.deepEqual(ids, ['planSize', 'minGap', 'maxGap']);
  const toggles = BUILD_PLAN_MOCKUP_FIXTURE.fineTuning.toggles.map((t) => t.id);
  assert.deepEqual(toggles, ['allowRepeats']);
  assert.equal(ids.includes('walking'), false);
  assert.equal(ids.includes('accessibility'), false);
  assert.equal(ids.includes('premiumFormats'), false);
  assert.equal(ids.includes('budget'), false);
});

test('Not interested labels omit unnecessary suffixes', () => {
  const titles = BUILD_PLAN_MOCKUP_FIXTURE.defaultForm.notInterested.map(
    (f) => f.title,
  );
  assert.equal(titles[0], 'Minions & Monsters');
  assert.equal(titles[1], 'Moana');
  assert.equal(titles.length, 5);
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
  assert.equal(form.wouldLove.length, 4);
  assert.equal(form.theaterPrefId, 'indie');
});

test('Collapsed summaries and footer derive from form state', () => {
  const form = createBuildPlanFormState();
  form.flexible = false;
  form.mustInclude = [];
  const collapsed = buildCollapsedSectionSummaries(form, {
    theaterPrefs: BUILD_PLAN_MOCKUP_FIXTURE.where.theaterPrefs,
  });
  assert.match(collapsed.when, /2:00 PM/);
  assert.equal(collapsed.when.includes('Flexible'), false);
  assert.match(collapsed.what, /0 must include/);
  assert.match(collapsed.what, /4 interested/);
  assert.match(collapsed.where, /Prefer indie/);
  const lines = buildPlanSummaryLines(form);
  assert.match(lines.line2, /0 must include/);
  assert.match(lines.line2, /Capitol Hill/);
});

test('Live form defaults stay empty of fixture films', () => {
  const live = createLiveBuildPlanFormState(
    () => new Date('2026-07-28T12:00:00-07:00'),
  );
  assert.equal(live.mustInclude.length, 0);
  assert.equal(live.wouldLove.length, 0);
  assert.equal(live.notInterested.length, 0);
  assert.equal(live.selectedPresetId, null);
  assert.equal(live.theaterPrefId, 'any');
  assert.equal(live.allowRepeats, false);
  assert.equal(live.flexible, false);
  assert.equal(live.dateIso, '2026-07-28');
});

test('Single-open accordion helpers', () => {
  assert.deepEqual([...BUILD_PLAN_ACCORDION_IDS], [
    'when',
    'where',
    'what',
    'fineTuning',
  ]);
  assert.equal(parseBuildPlanSectionQuery('none'), null);
  assert.equal(parseBuildPlanSectionQuery('when'), 'when');
  assert.equal(parseBuildPlanSectionQuery('fine-tuning'), 'fineTuning');
  assert.equal(nextOpenSection(null, 'when'), 'when');
  assert.equal(nextOpenSection('when', 'when'), null);
  assert.equal(nextOpenSection('when', 'what'), 'what');
});

test('Fixture isolation — no stores or production planner imports', () => {
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(FIXTURE_SRC.includes('plannerEngine'), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
  assert.equal(FIXTURE_SRC.includes('plannerUrlState'), false);
  assert.equal(SURFACE_SRC.includes('localStorage'), false);
  assert.equal(SURFACE_SRC.includes('stores/'), false);
  // localStorage appears only in mockup-mode detection, never as persistence.
  assert.match(FIXTURE_SRC, /BUILD_PLAN_MOCKUP_STORAGE_KEY/);
});

test('Build a Plan surface uses accordion disclosure semantics', () => {
  assert.match(APP_SRC, /BuildPlanSurface/);
  assert.match(APP_SRC, /openBuildPlan/);
  assert.match(APP_SRC, /isBuildPlanMockupMode/);
  assert.match(PLANNER_SRC, /onOpenBuildPlan/);
  assert.match(SURFACE_SRC, /data-build-plan-source/);
  assert.match(SURFACE_SRC, /data-build-plan-section="presets"/);
  assert.match(SURFACE_SRC, /data-build-plan-section=\{id\}/);
  assert.match(SURFACE_SRC, /data-bp-accordion=\{id\}/);
  assert.match(SURFACE_SRC, /data-build-plan-section="summaryCta"/);
  assert.match(SURFACE_SRC, /aria-expanded=\{expanded\}/);
  assert.match(SURFACE_SRC, /aria-controls=\{panelId\}/);
  assert.match(SURFACE_SRC, /openSection/);
  assert.match(SURFACE_SRC, /adjustBuildPlanAccordionScroll/);
  assert.equal(SURFACE_SRC.includes('v2 shell · placeholder'), false);
  assert.match(CSS, /\.v2-bp-acc-trigger\b/);
  assert.match(CSS, /\.v2-bp-cta\b/);
  assert.match(CSS, /\.v2-bp-preset\b/);
  assert.match(CSS, /\.v2-bp-summary\b/);
  assert.equal(/\.v2-bp-summary\s*\{[^}]*position:\s*sticky/s.test(CSS), false);
  assert.match(ACCORDION_SRC, /prefersReducedMotion/);
  assert.equal(BUILD_PLAN_MOCKUP_QUERY, 'buildPlanMockup');
});

test('CTA accessible; Finish before present; Clear all / Reset not in expanded chrome', () => {
  assert.equal(SURFACE_SRC.includes('v2-bp-clear'), false);
  assert.equal(SURFACE_SRC.includes('v2-bp-back'), false);
  assert.equal(SURFACE_SRC.includes('resetFineTuning'), false);
  assert.equal(SURFACE_SRC.includes('v2-bp-film-remove'), false);
  assert.match(SURFACE_SRC, /aria-label=\{ctaLabel\}/);
  assert.match(SURFACE_SRC, /aria-labelledby="v2-bp-title"/);
  assert.match(SURFACE_SRC, /role="radiogroup"/);
  assert.match(SURFACE_SRC, /role="switch"/);
  assert.match(SURFACE_SRC, /finishBeforeLabel/);
  assert.match(SURFACE_SRC, /v2-bp-must-row/);
  assert.match(SURFACE_SRC, /v2-bp-chip-row/);
  assert.match(SURFACE_SRC, /type="date"/);
  assert.match(SURFACE_SRC, /setPlanDate/);
  assert.equal(SURFACE_SRC.includes('v2-bp-add-day'), false);
  assert.equal(SURFACE_SRC.includes('v2-bp-flexible'), false);
  assert.equal(SURFACE_SRC.includes("announce('date-picker'"), false);
  assert.equal(SURFACE_SRC.includes('v2-bp-location'), false);
  assert.equal(SURFACE_SRC.includes('v2-bp-more-options'), false);
  assert.match(FIXTURE_SRC, /Finish before/);
  assert.match(APP_SRC, /headerMode=\{/);
  assert.match(APP_SRC, /build-plan/);
  assert.match(APP_SRC, /backStyle/);
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

test('Values survive conceptual collapse (form object unchanged by openSection)', () => {
  const form = createBuildPlanFormState();
  form.startAfter = '7:00 PM';
  let open = null;
  open = nextOpenSection(open, 'when');
  assert.equal(open, 'when');
  open = nextOpenSection(open, 'what');
  assert.equal(open, 'what');
  open = nextOpenSection(open, 'what');
  assert.equal(open, null);
  assert.equal(form.startAfter, '7:00 PM');
});
