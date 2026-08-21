import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePlanSize,
  formatPlanSizeLabel,
} from '../../v2/planner/planSize.js';
import {
  planSizeFromUiMode,
  planSizeUiMode,
} from '../../v2/planner/planSizeUi.js';
import {
  formatEligibleShowtimeSummary,
  opportunityMatchesHardConstraints,
  resolveBuildPlanHardConstraints,
} from '../../v2/planner/buildPlanHardConstraints.js';
import {
  listPlannerEligibleFilms,
  filmCardHasEligibleShowtimes,
} from '../../v2/planner/buildPlanFilmCatalog.js';
import {
  addLockedShowtimeToForm,
  formatShowtimeChipLabel,
  groupPerformancesByFilm,
  listPlannerEligiblePerformances,
  removeLockedShowtimeFromForm,
} from '../../v2/planner/buildPlanPerformanceCatalog.js';
import { formatPlannerConflictMessages } from '../../v2/planner/buildPlanConflictCopy.js';
import { validateBuildPlanDraftForGenerate } from '../../v2/planner/buildPlanDraftValidation.js';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';
import {
  clearBuildPlanFormSession,
  ensureBuildPlanFormSession,
  getBuildPlanFormSession,
  setBuildPlanFormSession,
} from '../../v2/planner/buildPlanFormSession.js';
import {
  openBuildPlanShowtimeManage,
  navigateBack,
  openBuildPlan,
} from '../../v2/navigation/navState.js';

const DATE = '2026-07-29';
const THEATER = 'amc-alderwood';
const FIXTURE_NOW = () => new Date('2026-07-28T12:00:00-07:00');

function makeHome() {
  const films = [
    {
      filmKey: 'la-la-land',
      filmId: 'tmdb:ll',
      title: 'La La Land',
      runtimeMin: 128,
      posterUrl: null,
    },
    {
      filmKey: 'only-elsewhere',
      filmId: 'tmdb:oe',
      title: 'Only Elsewhere',
      runtimeMin: 110,
      posterUrl: null,
    },
    {
      filmKey: 'morning-a',
      filmId: 'tmdb:ma',
      title: 'Morning Feature A',
      runtimeMin: 100,
      posterUrl: null,
    },
  ];
  return {
    films,
    theaters: [
      { id: THEATER, name: 'AMC Alderwood' },
      { id: 'siiff', name: 'SIFF Cinema Uptown' },
    ],
    theatersById: {
      [THEATER]: { id: THEATER, name: 'AMC Alderwood' },
      siiff: { id: 'siiff', name: 'SIFF Cinema Uptown' },
    },
    opportunities: [
      {
        filmKey: 'la-la-land',
        title: 'La La Land',
        localDate: DATE,
        localTime: '13:15',
        theaterId: THEATER,
        theaterName: 'AMC Alderwood',
        runtimeMin: 128,
        source: 'amc',
        sourceShowtimeId: 'lll-1315',
        opportunityKey: 'src:amc:lll-1315',
        formatLabels: ['10th Anniversary', 'Dolby Cinema'],
        status: 'scheduled',
      },
      {
        filmKey: 'la-la-land',
        title: 'La La Land',
        localDate: DATE,
        localTime: '19:00',
        theaterId: THEATER,
        theaterName: 'AMC Alderwood',
        runtimeMin: 128,
        source: 'amc',
        sourceShowtimeId: 'lll-1900',
        opportunityKey: 'src:amc:lll-1900',
        formatLabels: ['Dolby Cinema'],
        status: 'scheduled',
      },
      {
        filmKey: 'morning-a',
        title: 'Morning Feature A',
        localDate: DATE,
        localTime: '10:00',
        theaterId: THEATER,
        theaterName: 'AMC Alderwood',
        runtimeMin: 100,
        source: 'amc',
        sourceShowtimeId: 'morn-a',
        opportunityKey: 'src:amc:morn-a',
        formatLabels: [],
        status: 'scheduled',
      },
      {
        filmKey: 'only-elsewhere',
        title: 'Only Elsewhere',
        localDate: DATE,
        localTime: '14:00',
        theaterId: 'siiff',
        theaterName: 'SIFF Cinema Uptown',
        runtimeMin: 110,
        source: 'siiff',
        sourceShowtimeId: 'oe-1400',
        opportunityKey: 'src:siiff:oe-1400',
        formatLabels: [],
        status: 'scheduled',
      },
    ],
  };
}

function liveForm(overrides = {}) {
  return {
    ...createLiveBuildPlanFormState(() => new Date('2026-07-29T08:00:00-07:00')),
    dateIso: DATE,
    theaterPrefId: THEATER,
    startAfter: '9:00 AM',
    finishBefore: '11:00 PM',
    planSize: { min: 4, max: 4 },
    maxGap: 'Any',
    minGap: 'Any',
    ...overrides,
  };
}

test('plan size UI maps exact / range / max canonically', () => {
  assert.deepEqual(planSizeFromUiMode('exact', { exact: 4 }), {
    min: 4,
    max: 4,
  });
  assert.equal(planSizeUiMode({ min: 4, max: 4 }), 'exact');
  assert.deepEqual(planSizeFromUiMode('range', { min: 2, max: 5 }), {
    min: 2,
    max: 5,
  });
  assert.equal(planSizeUiMode({ min: 2, max: 5 }), 'range');
  assert.equal(planSizeFromUiMode('max').mode, 'max');
  assert.deepEqual(planSizeFromUiMode('range', { min: 5, max: 2 }), {
    min: 2,
    max: 5,
  });
  assert.equal(formatPlanSizeLabel({ min: 4, max: 4 }), '4 movies');
});

test('availability summary never exposes a single arbitrary showtime', () => {
  assert.equal(
    formatEligibleShowtimeSummary({ showtimeCount: 1 }),
    '1 eligible showtime',
  );
  assert.equal(
    formatEligibleShowtimeSummary({ showtimeCount: 3 }),
    '3 eligible showtimes',
  );
  assert.equal(
    formatEligibleShowtimeSummary({ showtimeCount: 5, theaterCount: 2 }),
    '2 theaters · 5 eligible showtimes',
  );
  assert.equal(
    formatEligibleShowtimeSummary({ showtimeCount: 0 }),
    'No eligible showtimes',
  );
});

test('film picker is constraint-aware and uses availability copy', () => {
  const home = makeHome();
  const form = liveForm();
  const hard = resolveBuildPlanHardConstraints(form, home);
  const films = listPlannerEligibleFilms(home, {
    dateIso: hard.dateIso,
    theaterIds: hard.theaterIds,
    startAfterMin: hard.startAfterMin,
    finishByMin: hard.finishByMin,
    now: FIXTURE_NOW,
  });
  assert.ok(films.some((f) => f.filmKey === 'la-la-land'));
  assert.ok(films.some((f) => f.filmKey === 'morning-a'));
  assert.equal(
    films.some((f) => f.filmKey === 'only-elsewhere'),
    false,
  );
  const lll = films.find((f) => f.filmKey === 'la-la-land');
  assert.equal(lll.eligibleShowtimeCount, 2);
  assert.match(lll.detailLabel, /eligible showtimes?/i);
  assert.equal(/\d{1,2}:\d{2}/.test(lll.detailLabel), false);
});

test('performance picker filters and locks by performanceKey', () => {
  const home = makeHome();
  let form = liveForm({ lockedShowtimes: [] });
  const perfs = listPlannerEligiblePerformances(home, form, {
    now: FIXTURE_NOW,
  });
  assert.ok(perfs.length >= 2);
  assert.ok(perfs.every((p) => p.theaterId === THEATER));
  assert.ok(perfs.every((p) => p.localDate === DATE));
  const groups = groupPerformancesByFilm(perfs);
  assert.ok(groups.length >= 1);
  assert.ok(groups.every((g) => Array.isArray(g.theaterGroups) && g.theaterGroups.length >= 1));
  assert.ok(groups.every((g) => g.title && g.theaterGroups[0].theaterName));
  const lockTarget = perfs.find((p) => p.localTime === '13:15');
  assert.ok(lockTarget);
  assert.ok(lockTarget.performanceKey.startsWith('src:'));
  assert.match(formatShowtimeChipLabel(lockTarget), /1:15|13:15/i);
  assert.equal(
    /Alderwood|Kent|Pacific|theater/i.test(formatShowtimeChipLabel(lockTarget)),
    false,
  );
  const added = addLockedShowtimeToForm(form, lockTarget);
  assert.equal(added.added, true);
  form = added.form;
  assert.equal(form.lockedShowtimes.length, 1);
  assert.equal(
    form.lockedShowtimes[0].performanceKey,
    lockTarget.performanceKey,
  );
  // Locked performances must not remain selectable in add-more grouping.
  const remaining = groupPerformancesByFilm(
    perfs.filter(
      (p) => p.performanceKey !== lockTarget.performanceKey,
    ),
  );
  assert.equal(
    remaining.some((g) =>
      g.theaterGroups.some((tg) =>
        tg.performances.some((p) => p.performanceKey === lockTarget.performanceKey),
      ),
    ),
    false,
  );
  const dup = addLockedShowtimeToForm(form, lockTarget);
  assert.equal(dup.added, false);
  assert.equal(dup.reason, 'duplicate');
  form = removeLockedShowtimeFromForm(form, lockTarget.performanceKey);
  assert.equal(form.lockedShowtimes.length, 0);
});

test('plan size UI modes expose the correct controls', () => {
  assert.equal(planSizeUiMode({ min: 4, max: 4 }), 'exact');
  assert.equal(planSizeUiMode({ min: 2, max: 5 }), 'range');
  assert.equal(planSizeUiMode({ min: 1, max: 6, mode: 'max' }), 'max');
  assert.deepEqual(planSizeFromUiMode('exact', { exact: 4 }), {
    min: 4,
    max: 4,
  });
  assert.deepEqual(planSizeFromUiMode('range', { min: 2, max: 5 }), {
    min: 2,
    max: 5,
  });
});

test('selected film retained as ineligible when theater changes', () => {
  const home = makeHome();
  const form = liveForm({
    theaterPrefId: 'siiff',
    mustInclude: [
      {
        id: 'la-la-land',
        filmKey: 'la-la-land',
        filmId: 'tmdb:ll',
        title: 'La La Land',
      },
    ],
  });
  const hard = resolveBuildPlanHardConstraints(form, home);
  assert.equal(
    filmCardHasEligibleShowtimes(form.mustInclude[0], home, {
      dateIso: hard.dateIso,
      theaterIds: hard.theaterIds,
      startAfterMin: hard.startAfterMin,
      finishByMin: hard.finishByMin,
      now: FIXTURE_NOW,
    }),
    false,
  );
  assert.equal(form.mustInclude[0].filmKey, 'la-la-land');
});

test('draft validation surfaces conflicts for generate UX', () => {
  const home = makeHome();
  const form = liveForm({
    planSize: { min: 1, max: 1 },
    lockedShowtimes: [
      {
        performanceKey: 'src:amc:amc-alderwood:lll-1315',
        title: 'La La Land',
        filmKey: 'la-la-land',
        filmId: 'tmdb:ll',
        theaterId: THEATER,
        theaterName: 'AMC Alderwood',
        localDate: DATE,
        localTime: '13:15',
        runtimeMin: 128,
        source: 'amc',
        sourceShowtimeId: 'lll-1315',
      },
      {
        performanceKey: 'src:amc:amc-alderwood:lll-1900',
        title: 'La La Land',
        filmKey: 'la-la-land',
        filmId: 'tmdb:ll',
        theaterId: THEATER,
        theaterName: 'AMC Alderwood',
        localDate: DATE,
        localTime: '19:00',
        runtimeMin: 128,
        source: 'amc',
        sourceShowtimeId: 'lll-1900',
      },
    ],
  });
  const result = validateBuildPlanDraftForGenerate(form, home, {
    now: FIXTURE_NOW,
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.conflicts.some((c) => c.code === 'plan_size_smaller_than_locks'),
  );
  const messages = formatPlannerConflictMessages(result.conflicts);
  assert.ok(messages.length >= 1);
  assert.equal(messages.some((m) => /plan_size_smaller_than_locks/.test(m)), false);
});

test('session preserves planSize object and lockedShowtimes', () => {
  clearBuildPlanFormSession();
  ensureBuildPlanFormSession(() => liveForm());
  setBuildPlanFormSession((prev) => ({
    ...prev,
    planSize: { min: 4, max: 4 },
    lockedShowtimes: [
      {
        performanceKey: 'src:amc:amc-alderwood:lll-1315',
        title: 'La La Land',
        filmKey: 'la-la-land',
        theaterId: THEATER,
        localDate: DATE,
        localTime: '13:15',
        source: 'amc',
        sourceShowtimeId: 'lll-1315',
      },
    ],
  }));
  const session = getBuildPlanFormSession();
  assert.deepEqual(session.planSize, { min: 4, max: 4 });
  assert.equal(session.lockedShowtimes.length, 1);
  clearBuildPlanFormSession();
});

test('showtime manage navigation returns to Build with what section', () => {
  let state = openBuildPlan({}, { originPrimary: 'planner' });
  state = openBuildPlanShowtimeManage(state, {
    originPrimary: 'planner',
    returnSurface: {
      ...state.surface,
      resumeOpenSection: 'what',
    },
  });
  assert.equal(state.surface.type, 'build-plan-showtime-manage');
  state = navigateBack(state);
  assert.equal(state.surface.type, 'build-plan');
  assert.equal(state.surface.resumeOpenSection, 'what');
});

test('time window hard constraint excludes out-of-window performances', () => {
  assert.equal(
    opportunityMatchesHardConstraints(
      {
        localDate: DATE,
        localTime: '13:15',
        theaterId: THEATER,
        runtimeMin: 128,
      },
      {
        dateIso: DATE,
        theaterIds: [THEATER],
        startAfterMin: 14 * 60,
        finishByMin: 23 * 60,
        runtimeMin: 128,
      },
    ),
    false,
  );
  assert.equal(
    opportunityMatchesHardConstraints(
      {
        localDate: DATE,
        localTime: '13:15',
        theaterId: THEATER,
        runtimeMin: 128,
      },
      {
        dateIso: DATE,
        theaterIds: [THEATER],
        startAfterMin: 11 * 60,
        finishByMin: 23 * 60,
        runtimeMin: 128,
      },
    ),
    true,
  );
});

test('legacy planSize strings remain normalized', () => {
  assert.deepEqual(normalizePlanSize('4 movies'), { min: 4, max: 4 });
  assert.deepEqual(normalizePlanSize('1–3 movies'), { min: 1, max: 3 });
  assert.equal(formatPlanSizeLabel({ min: 4, max: 4 }), '4 movies');
});

test('Build a Plan What? exposes direct add paths for every preference category', () => {
  const surface = readFileSync(
    new URL('../../v2/planner/BuildPlanSurface.jsx', import.meta.url),
    'utf8',
  );
  assert.match(surface, /Add another showtime|Add a showtime/);
  assert.match(surface, /openManage\('mustInclude'\)/);
  assert.match(surface, /openManage\('wouldLove'\)/);
  assert.match(surface, /openManage\('notInterested'\)/);
  const addFilmHits = surface.match(/Add another film|Add film/g) ?? [];
  assert.ok(addFilmHits.length >= 3);
  assert.match(
    surface,
    /className="v2-bp-film-add"[\s\S]*?openManage\('wouldLove'\)/,
  );
  assert.match(
    surface,
    /className="v2-bp-film-add"[\s\S]*?openManage\('notInterested'\)/,
  );
});

test('Add a showtime manage surface uses grouped film rows and theater groups', () => {
  const src = readFileSync(
    new URL('../../v2/planner/BuildPlanShowtimeManageSurface.jsx', import.meta.url),
    'utf8',
  );
  assert.match(src, /groupPerformancesByFilm/);
  assert.match(src, /v2-bp-showtime-film-row/);
  assert.match(src, /v2-bp-showtime-theater-group/);
  assert.match(src, /v2-bp-showtime-chip/);
  assert.match(src, /Locked showtimes/);
  assert.match(src, /Add more showtimes/);
  assert.doesNotMatch(src, />\s*Lock\s*</);
  assert.match(src, /Exact screening will be required/);
  assert.match(src, /theaterGroups\.map/);
});

test('multi-theater grouping nests theaters under film without chip theater names', () => {
  const home = makeHome();
  home.opportunities.push({
    opportunityKey: 'lll-siiff',
    filmKey: 'la-la-land',
    title: 'La La Land',
    theaterId: 'siiff',
    theaterName: 'SIFF Cinema Uptown',
    localDate: DATE,
    localTime: '19:00',
    source: 'fixture',
    sourceShowtimeId: 'lll-siiff',
    formatLabels: [],
    runtimeMin: 128,
  });
  const form = liveForm({
    theaterPrefId: 'any',
    selectedTheaters: [],
    lockedShowtimes: [],
  });
  const perfs = listPlannerEligiblePerformances(home, form, {
    now: FIXTURE_NOW,
  });
  const groups = groupPerformancesByFilm(perfs);
  const lll = groups.find((g) => g.filmKey === 'la-la-land');
  assert.ok(lll);
  assert.ok(lll.multiTheater);
  assert.ok(lll.theaterGroups.length >= 2);
  for (const tg of lll.theaterGroups) {
    for (const p of tg.performances) {
      const label = formatShowtimeChipLabel(p, {
        includeFormat: Boolean(p.formatLabel),
      });
      assert.equal(/SIFF|Alderwood|Uptown|theater/i.test(label), false);
      assert.match(label, /\d/);
    }
  }
});

test('shared select styling forces dark options for native menus', () => {
  const css = readFileSync(new URL('../../v2/v2.css', import.meta.url), 'utf8');
  assert.match(css, /\.v2-bp-select\s*\{[\s\S]*?color-scheme:\s*dark/);
  assert.match(css, /\.v2-bp-select option/);
  assert.match(css, /background-color:\s*var\(--v2-bg-raised/);
});
