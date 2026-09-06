import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILD_PLAN_DRAFT_STORAGE_KEY,
  BUILD_PLAN_DRAFT_VERSION,
  clearBuildPlanDraftStorage,
  parseBuildPlanDraft,
  readBuildPlanDraft,
  sanitizeBuildPlanDraft,
  serializeBuildPlanDraft,
  writeBuildPlanDraft,
} from '../../v2/planner/buildPlanDraftPersistence.js';
import {
  clearBuildPlanFormSession,
  ensureBuildPlanFormSession,
  getBuildPlanFormSession,
  setBuildPlanFormSession,
} from '../../v2/planner/buildPlanFormSession.js';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';
import {
  ACCEPTED_PLANS_STORAGE_KEY,
} from '../../v2/stores/acceptedPlansStore.js';
import {
  createInitialNavState,
  navigateBack,
  openBuildPlan,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const SURFACE_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanSurface.jsx'),
  'utf8',
);

const NOW = () => new Date('2026-09-05T19:00:00.000Z');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function configuredDraft() {
  return sanitizeBuildPlanDraft(
    {
      ...createLiveBuildPlanFormState(NOW),
      selectedPresetId: 'after-work',
      dateIso: '2026-09-06',
      startAfter: '6:00 PM',
      finishBefore: '11:00 PM',
      theaterPrefId: 'custom',
      selectedTheaters: ['siff-uptown', 'the-beacon'],
      mustInclude: [
        {
          filmKey: 'sinners',
          title: 'Sinners',
          imageUrl: 'https://example.com/sinners.jpg',
        },
      ],
      wouldLove: [
        {
          filmKey: 'weapons',
          title: 'Weapons',
          posterUrl: 'https://example.com/weapons.jpg',
        },
      ],
      notInterested: [{ filmKey: 'minions', title: 'Minions' }],
      lockedShowtimes: [
        {
          performanceKey: 'perf-1',
          filmKey: 'sinners',
          theaterId: 'the-beacon',
          localDate: '2026-09-06',
          localTime: '19:15',
          title: 'Sinners',
        },
      ],
      planSize: { min: 2, max: 4 },
      minGap: '45m',
      maxGap: '2 hr',
      allowRepeats: true,
    },
    { now: NOW },
  );
}

test('configured Build a Plan inputs persist after leaving and returning', () => {
  const storage = memoryStorage();
  clearBuildPlanFormSession({ storage });
  const draft = configuredDraft();
  setBuildPlanFormSession(draft, { storage });

  let nav = selectPrimaryDestination(createInitialNavState(), 'planner');
  nav = openBuildPlan(nav, { originPrimary: 'planner' });
  nav = navigateBack(nav);
  nav = selectPrimaryDestination(nav, 'home');
  nav = selectPrimaryDestination(nav, 'planner');
  nav = openBuildPlan(nav, { originPrimary: 'planner' });
  assert.equal(nav.surface?.type, 'build-plan');

  // In-memory session survives SPA navigation away from Build a Plan.
  assert.equal(getBuildPlanFormSession()?.mustInclude[0].filmKey, 'sinners');
  assert.deepEqual(getBuildPlanFormSession()?.selectedTheaters, [
    'siff-uptown',
    'the-beacon',
  ]);
  assert.equal(getBuildPlanFormSession()?.startAfter, '6:00 PM');

  // Memory drop (unmount) still restores from session storage.
  clearBuildPlanFormSession({ persist: false, storage });
  assert.equal(getBuildPlanFormSession(), null);
  const restored = ensureBuildPlanFormSession(
    () => createLiveBuildPlanFormState(NOW),
    { storage },
  );
  assert.equal(restored.mustInclude[0].title, 'Sinners');
  assert.equal(restored.theaterPrefId, 'custom');
  assert.equal(restored.dateIso, '2026-09-06');
  assert.equal(restored.allowRepeats, true);
  clearBuildPlanFormSession({ storage });
});

test('configured inputs restore from session storage after remount/refresh', () => {
  const storage = memoryStorage();
  clearBuildPlanFormSession({ storage });
  setBuildPlanFormSession(configuredDraft(), { storage });

  const stored = JSON.parse(storage.getItem(BUILD_PLAN_DRAFT_STORAGE_KEY));
  assert.equal(stored.version, BUILD_PLAN_DRAFT_VERSION);
  assert.ok(stored.savedAt);
  assert.equal(stored.form.wouldLove[0].filmKey, 'weapons');

  clearBuildPlanFormSession({ persist: false, storage });
  const restored = ensureBuildPlanFormSession(
    () => createLiveBuildPlanFormState(NOW),
    { storage },
  );
  assert.equal(restored.dateDisplay.includes('Sep'), true);
  assert.equal(restored.lockedShowtimes[0].performanceKey, 'perf-1');
  assert.equal(restored.planSize.min, 2);
  assert.equal(restored.planSize.max, 4);
  assert.equal(restored.minGap, '45m');
  clearBuildPlanFormSession({ storage });
});

test('invalid or stale persisted Build a Plan state falls back to defaults', () => {
  const defaults = createLiveBuildPlanFormState(NOW);

  assert.equal(parseBuildPlanDraft('not-json').ok, false);
  assert.equal(parseBuildPlanDraft('not-json').reason, 'corrupt');
  assert.equal(parseBuildPlanDraft(null).reason, 'empty');
  assert.equal(
    parseBuildPlanDraft({ version: 99, form: configuredDraft() }).reason,
    'unsupported_version',
  );
  assert.equal(parseBuildPlanDraft({ version: 1, form: null }).ok, false);
  assert.equal(sanitizeBuildPlanDraft(null), null);
  assert.equal(sanitizeBuildPlanDraft(['nope']), null);

  const storage = memoryStorage({
    [BUILD_PLAN_DRAFT_STORAGE_KEY]: '{bad',
  });
  clearBuildPlanFormSession({ persist: false, storage });
  const restored = ensureBuildPlanFormSession(
    () => createLiveBuildPlanFormState(NOW),
    { storage },
  );
  assert.equal(restored.dateIso, defaults.dateIso);
  assert.equal(restored.mustInclude.length, 0);
  assert.equal(restored.theaterPrefId, 'any');

  const stale = memoryStorage({
    [BUILD_PLAN_DRAFT_STORAGE_KEY]: JSON.stringify({
      version: 0,
      form: configuredDraft(),
    }),
  });
  assert.equal(readBuildPlanDraft(stale).ok, false);
  assert.equal(readBuildPlanDraft(stale).reason, 'unsupported_version');
  clearBuildPlanFormSession({ persist: false, storage: stale });
  const staleRestored = ensureBuildPlanFormSession(
    () => createLiveBuildPlanFormState(NOW),
    { storage: stale },
  );
  assert.equal(staleRestored.mustInclude.length, 0);

  const droppedFilm = sanitizeBuildPlanDraft(
    {
      dateIso: 'nope',
      theaterPrefId: 'imax-only',
      mustInclude: [{ title: 'No identity' }],
      selectedTheaters: [123, 'beacon', 'beacon'],
    },
    { now: NOW },
  );
  assert.equal(droppedFilm.dateIso, defaults.dateIso);
  assert.equal(droppedFilm.theaterPrefId, 'any');
  assert.equal(droppedFilm.mustInclude.length, 0);
  assert.deepEqual(droppedFilm.selectedTheaters, ['beacon']);
  clearBuildPlanFormSession({ storage });
  clearBuildPlanFormSession({ storage: stale });
});

test('derived plan results are not restored as stale serialized output', () => {
  const storage = memoryStorage();
  const withResults = {
    ...configuredDraft(),
    plans: [{ id: 'stale-plan', films: ['old'] }],
    results: { itineraries: [1, 2, 3] },
    generatedPlans: [{ id: 'gen' }],
    presentation: { source: 'stale' },
    schedules: [{ id: 'sched' }],
  };
  const serialized = serializeBuildPlanDraft(withResults);
  assert.equal(serialized.form.plans, undefined);
  assert.equal(serialized.form.results, undefined);
  assert.equal(serialized.form.generatedPlans, undefined);
  assert.equal(serialized.form.presentation, undefined);
  assert.equal(serialized.form.schedules, undefined);
  assert.equal(serialized.form.mustInclude[0].filmKey, 'sinners');

  writeBuildPlanDraft(storage, withResults);
  const parsed = parseBuildPlanDraft(storage.getItem(BUILD_PLAN_DRAFT_STORAGE_KEY));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.form.plans, undefined);
  assert.equal(parsed.form.results, undefined);
  assert.equal('eligibleShowtimeCount' in (parsed.form.mustInclude[0] ?? {}), false);

  clearBuildPlanFormSession({ persist: false, storage });
  const restored = ensureBuildPlanFormSession(
    () => createLiveBuildPlanFormState(NOW),
    { storage },
  );
  assert.equal(restored.plans, undefined);
  assert.equal(restored.mustInclude[0].filmKey, 'sinners');
  assert.equal(storage.getItem(ACCEPTED_PLANS_STORAGE_KEY), null);
  clearBuildPlanDraftStorage(storage);
  clearBuildPlanFormSession({ storage });
});

test('draft persistence uses session storage and does not clear on leave', () => {
  assert.equal(BUILD_PLAN_DRAFT_STORAGE_KEY.includes('acceptedPlans'), false);
  assert.match(SURFACE_SRC, /persist: !mockupMode/);
  assert.equal(APP_SRC.includes('clearBuildPlanFormSession'), false);
  assert.match(
    readFileSync(join(ROOT, 'v2/planner/buildPlanFormSession.js'), 'utf8'),
    /sessionStorage/,
  );
});
