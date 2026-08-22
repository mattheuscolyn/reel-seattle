/**
 * RESULT-03 — Lock / Unlock exact showtimes from Results.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';
import {
  addLockedShowtimeToForm,
  removeLockedShowtimeFromForm,
} from '../../v2/planner/buildPlanPerformanceCatalog.js';
import { generateLivePlannerResults } from '../../v2/planner/generateLivePlannerResults.js';
import {
  applyShowtimeLockToForm,
  exactScreeningLockCopy,
  isResultsFilmPerformanceLocked,
} from '../../v2/planner/resultsShowtimeLock.js';
import {
  clearBuildPlanFormSession,
  getBuildPlanFormSession,
  setBuildPlanFormSession,
} from '../../v2/planner/buildPlanFormSession.js';
import { normalizeLockedShowtime } from '../../v2/planner/lockedShowtimes.js';
import { validateBuildPlanDraftForGenerate } from '../../v2/planner/buildPlanDraftValidation.js';
import { hhmmToLegacyPlannerTime } from '../../v2/planner/homeDataToPlannerRows.js';
import { lockedShowtimeFromPlannerRow } from '../../v2/planner/validatePlannerDraftConstraints.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OVERLAY = readFileSync(
  join(ROOT, 'v2/planner/AdjustFilmInPlansOverlay.jsx'),
  'utf8',
);
const RESULTS = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanResultsSurface.jsx'),
  'utf8',
);
const LOCK_HELPER = readFileSync(
  join(ROOT, 'v2/planner/resultsShowtimeLock.js'),
  'utf8',
);

const DATE = '2026-07-29';
const THEATER = 'amc-alderwood';
const THEATER_NAME = 'AMC Alderwood';
const FIXTURE_NOW = () => new Date('2026-07-29T08:00:00-07:00');

function row({
  filmKey,
  title,
  time,
  runtime = 120,
  sourceShowtimeId,
  theaterId = THEATER,
  theaterName = THEATER_NAME,
  date = DATE,
}) {
  return {
    Date: date,
    Time: hhmmToLegacyPlannerTime(time),
    Film: title,
    Theater: theaterName,
    theater_id: theaterId,
    Runtime: runtime,
    showtime_film_key: filmKey,
    filmKey,
    filmId: `tmdb:${filmKey}`,
    localDate: date,
    localTime: time,
    source: 'amc',
    source_showtime_id: sourceShowtimeId,
    opportunityKey: `src:amc:${sourceShowtimeId}`,
    posterDynamic: null,
    premiumFormat: '',
    status: 'scheduled',
  };
}

function alderwoodUniverse() {
  return [
    row({
      filmKey: 'morning-a',
      title: 'Morning Feature A',
      time: '10:00',
      runtime: 100,
      sourceShowtimeId: 'amc-morn-a',
    }),
    row({
      filmKey: 'morning-b',
      title: 'Morning Feature B',
      time: '10:30',
      runtime: 110,
      sourceShowtimeId: 'amc-morn-b',
    }),
    row({
      filmKey: 'la-la-land',
      title: 'La La Land',
      time: '13:15',
      runtime: 128,
      sourceShowtimeId: 'lll-1315',
    }),
    row({
      filmKey: 'la-la-land',
      title: 'La La Land',
      time: '19:00',
      runtime: 128,
      sourceShowtimeId: 'lll-1900',
    }),
    row({
      filmKey: 'the-odyssey',
      title: 'The Odyssey',
      time: '16:30',
      runtime: 110,
      sourceShowtimeId: 'od-1630',
    }),
    row({
      filmKey: 'evening-d',
      title: 'Evening Feature D',
      time: '19:45',
      runtime: 115,
      sourceShowtimeId: 'amc-eve-d',
    }),
    row({
      filmKey: 'late-e',
      title: 'Late Feature E',
      time: '22:15',
      runtime: 95,
      sourceShowtimeId: 'amc-late-e',
    }),
  ];
}

function homeFromRows(rows) {
  const films = [];
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.filmKey)) continue;
    seen.add(r.filmKey);
    films.push({
      filmKey: r.filmKey,
      filmId: r.filmId,
      title: r.Film,
      runtimeMin: r.Runtime,
      posterUrl: null,
    });
  }
  return {
    films,
    theaters: [{ id: THEATER, name: THEATER_NAME }],
    theatersById: { [THEATER]: { id: THEATER, name: THEATER_NAME } },
    opportunities: rows.map((r) => ({
      filmKey: r.filmKey,
      title: r.Film,
      localDate: r.localDate,
      localTime: r.localTime,
      theaterId: r.theater_id,
      theaterName: r.Theater,
      runtimeMin: r.Runtime,
      source: r.source,
      sourceShowtimeId: r.source_showtime_id,
      opportunityKey: r.opportunityKey,
      formatLabels: [],
      status: 'scheduled',
      ticketUrl: null,
    })),
  };
}

function baseForm(overrides = {}) {
  return {
    ...createLiveBuildPlanFormState(FIXTURE_NOW),
    dateIso: DATE,
    theaterPrefId: THEATER,
    startAfter: '9:00 AM',
    finishBefore: '11:59 PM',
    planSize: { min: 2, max: 4 },
    maxGap: 'Any',
    minGap: 'Any',
    lockedShowtimes: [],
    mustInclude: [],
    wouldLove: [],
    notInterested: [],
    ...overrides,
  };
}

function filmItems(plans) {
  return plans.flatMap((p) =>
    (p.items ?? []).filter((i) => i.type !== 'break'),
  );
}

function findFilmByTitleTime(plans, title, localTime) {
  return filmItems(plans).find(
    (f) =>
      f.title === title && (f.localTime === localTime || f.time === localTime),
  );
}

test('overlay keeps film prefs independent of exact-screening lock', () => {
  assert.match(OVERLAY, /Require this film/);
  assert.match(OVERLAY, /Prefer this film/);
  assert.match(OVERLAY, /Exclude this film/);
  assert.match(OVERLAY, /Exact screening/);
  assert.match(OVERLAY, /exactScreeningLockCopy/);
  assert.match(OVERLAY, /lockShowtime/);
  assert.match(OVERLAY, /role="radiogroup"/);
  assert.match(OVERLAY, /data-adj-section="exact-screening"/);
  assert.doesNotMatch(OVERLAY, /id: 'lock'/);
});

test('LOCK SWITCH: checked = locked; copy follows staged state', () => {
  assert.deepEqual(exactScreeningLockCopy(false), {
    label: 'Lock this showtime',
    support: 'Keep this exact screening in every regenerated plan.',
  });
  assert.deepEqual(exactScreeningLockCopy(true), {
    label: 'Unlock this showtime',
    support: 'Allow the planner to choose another screening.',
  });
  assert.match(OVERLAY, /aria-checked=\{draftLock\}/);
  assert.match(OVERLAY, /data-lock-checked=\{draftLock \? 'true' : 'false'\}/);
  assert.match(OVERLAY, /className=\{`v2-bp-switch\$\{draftLock \? ' is-on' : ''\}`\}/);
  assert.match(OVERLAY, /exactScreeningLockCopy\(draftLock\)/);
});

test('FILM STATUS SWITCHES: controlled is-on + aria-checked', () => {
  assert.match(OVERLAY, /aria-checked=\{draftSeen\}/);
  assert.match(OVERLAY, /aria-checked=\{draftNi\}/);
  assert.match(OVERLAY, /className=\{`v2-bp-switch\$\{draftSeen \? ' is-on' : ''\}`\}/);
  assert.match(OVERLAY, /className=\{`v2-bp-switch\$\{draftNi \? ' is-on' : ''\}`\}/);
  assert.match(OVERLAY, /data-switch-on=\{draftSeen \? 'true' : 'false'\}/);
});

test('STRUCTURAL/CSS: shared switch ON works without checkbox input', () => {
  const css = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');
  assert.match(css, /\.v2-bp-switch\.is-on \.v2-bp-switch-track/);
  assert.match(css, /\.v2-bp-switch\[aria-checked='true'\] \.v2-bp-switch-track/);
  assert.match(
    css,
    /\.v2-bpr-adj-lock-toggle\[aria-checked='true'\] \.v2-bp-switch-track/,
  );
});

test('results wires lock helpers + performanceKey chrome', () => {
  assert.match(RESULTS, /applyShowtimeLockToForm/);
  assert.match(RESULTS, /isResultsFilmPerformanceLocked/);
  assert.match(RESULTS, /resultsShowtimeLock/);
  assert.match(RESULTS, /data-performance-key/);
  assert.match(RESULTS, /v2-bpr-locked-badge/);
  assert.match(RESULTS, /lockShowtime=\{filmLockShowtime\}/);
  assert.match(LOCK_HELPER, /addLockedShowtimeToForm/);
  assert.match(LOCK_HELPER, /removeLockedShowtimeFromForm/);
  assert.doesNotMatch(RESULTS, /acceptedPlansStore/);
});

test('IDENTITY: live result rows expose canonical performanceKey', () => {
  const home = homeFromRows(alderwoodUniverse());
  const generated = generateLivePlannerResults({
    homeData: home,
    form: baseForm(),
    sortId: 'best-match',
    now: FIXTURE_NOW,
  });
  assert.equal(generated.ok, true);
  const lll = findFilmByTitleTime(generated.plans, 'La La Land', '13:15');
  assert.ok(lll, 'expected La La Land 13:15 in results');
  assert.ok(lll.performanceKey);
  assert.match(lll.performanceKey, /^src:/);
  assert.equal(lll.theaterId, THEATER);
  assert.equal(lll.localDate ?? lll.date, DATE);
  assert.equal(lll.source, 'amc');
  assert.equal(lll.sourceShowtimeId, 'lll-1315');
});

test('IDENTITY: lock check uses exact performanceKey not film id', () => {
  const rows = alderwoodUniverse();
  const home = homeFromRows(rows);
  const generated = generateLivePlannerResults({
    homeData: home,
    form: baseForm(),
    sortId: 'best-match',
    now: FIXTURE_NOW,
  });
  const locked1315 = findFilmByTitleTime(generated.plans, 'La La Land', '13:15');
  const other1900 = findFilmByTitleTime(generated.plans, 'La La Land', '19:00');
  assert.ok(locked1315?.performanceKey);
  const form = addLockedShowtimeToForm(baseForm(), locked1315).form;
  assert.equal(isResultsFilmPerformanceLocked(form, locked1315), true);
  if (other1900?.performanceKey) {
    assert.notEqual(other1900.performanceKey, locked1315.performanceKey);
    assert.equal(isResultsFilmPerformanceLocked(form, other1900), false);
  }
  assert.equal(
    isResultsFilmPerformanceLocked(form, {
      filmId: locked1315.filmId,
      filmKey: locked1315.filmKey,
      title: locked1315.title,
    }),
    false,
  );
});

test('LOCK: applyShowtimeLockToForm adds canonical lock and regenerates', () => {
  const home = homeFromRows(alderwoodUniverse());
  let form = baseForm({ planSize: { min: 3, max: 4 } });
  const before = generateLivePlannerResults({
    homeData: home,
    form,
    sortId: 'best-match',
    now: FIXTURE_NOW,
  });
  const target = findFilmByTitleTime(before.plans, 'La La Land', '13:15');
  assert.ok(target?.performanceKey);

  form = applyShowtimeLockToForm(form, target, true);
  assert.equal(form.lockedShowtimes.length, 1);
  assert.equal(form.lockedShowtimes[0].performanceKey, target.performanceKey);
  assert.equal(
    normalizeLockedShowtime(form.lockedShowtimes[0]).performanceKey,
    target.performanceKey,
  );

  const after = generateLivePlannerResults({
    homeData: home,
    form,
    sortId: 'best-match',
    now: FIXTURE_NOW,
  });
  assert.equal(after.ok, true);
  assert.ok(after.plans.length >= 1);
  for (const plan of after.plans) {
    const keys = filmItems([plan]).map((f) => f.performanceKey);
    assert.ok(
      keys.includes(target.performanceKey),
      `plan ${plan.id} missing locked performance`,
    );
  }
  for (const plan of after.plans) {
    const lll = filmItems([plan]).filter((f) => f.filmKey === 'la-la-land');
    for (const rowFilm of lll) {
      assert.equal(rowFilm.performanceKey, target.performanceKey);
    }
  }
});

test('LOCK: Build a Plan session round-trip shows lock', () => {
  clearBuildPlanFormSession();
  const home = homeFromRows(alderwoodUniverse());
  const generated = generateLivePlannerResults({
    homeData: home,
    form: baseForm(),
    sortId: 'best-match',
    now: FIXTURE_NOW,
  });
  const target = findFilmByTitleTime(generated.plans, 'La La Land', '13:15');
  assert.ok(target?.performanceKey);
  const form = applyShowtimeLockToForm(baseForm(), target, true);
  setBuildPlanFormSession(form);
  const session = getBuildPlanFormSession();
  assert.equal(session.lockedShowtimes.length, 1);
  assert.equal(
    session.lockedShowtimes[0].performanceKey,
    target.performanceKey,
  );
  clearBuildPlanFormSession();
});

test('UNLOCK: removes exact lock only; other locks remain', () => {
  const rows = alderwoodUniverse();
  const home = homeFromRows(rows);
  const lockA = lockedShowtimeFromPlannerRow(
    rows.find((r) => r.source_showtime_id === 'lll-1315'),
  );
  const lockB = lockedShowtimeFromPlannerRow(
    rows.find((r) => r.source_showtime_id === 'od-1630'),
  );
  assert.ok(lockA?.performanceKey);
  assert.ok(lockB?.performanceKey);

  let form = baseForm({
    planSize: { min: 2, max: 4 },
    lockedShowtimes: [lockA, lockB],
  });
  assert.equal(form.lockedShowtimes.length, 2);

  form = applyShowtimeLockToForm(form, lockA, false);
  assert.equal(form.lockedShowtimes.length, 1);
  assert.equal(form.lockedShowtimes[0].performanceKey, lockB.performanceKey);

  const after = generateLivePlannerResults({
    homeData: home,
    form,
    sortId: 'best-match',
    now: FIXTURE_NOW,
  });
  assert.equal(after.ok, true);
  for (const plan of after.plans) {
    const keys = filmItems([plan]).map((f) => f.performanceKey);
    assert.ok(keys.includes(lockB.performanceKey));
  }
});

test('MULTIPLE LOCKS: Results lock is additive with existing Build lock', () => {
  const rows = alderwoodUniverse();
  const home = homeFromRows(rows);
  const lockA = lockedShowtimeFromPlannerRow(
    rows.find((r) => r.source_showtime_id === 'lll-1315'),
  );
  const lockB = lockedShowtimeFromPlannerRow(
    rows.find((r) => r.source_showtime_id === 'od-1630'),
  );

  let form = baseForm({
    planSize: { min: 2, max: 4 },
    lockedShowtimes: [lockA],
  });
  form = applyShowtimeLockToForm(form, lockB, true);
  assert.equal(form.lockedShowtimes.length, 2);
  const keys = new Set(form.lockedShowtimes.map((l) => l.performanceKey));
  assert.ok(keys.has(lockA.performanceKey));
  assert.ok(keys.has(lockB.performanceKey));

  const after = generateLivePlannerResults({
    homeData: home,
    form,
    sortId: 'best-match',
    now: FIXTURE_NOW,
  });
  assert.equal(after.ok, true);
  assert.ok(after.plans.length >= 1);
  for (const plan of after.plans) {
    const planKeys = new Set(filmItems([plan]).map((f) => f.performanceKey));
    assert.ok(planKeys.has(lockA.performanceKey));
    assert.ok(planKeys.has(lockB.performanceKey));
  }
});

test('OVERLAY/CONFLICT: Exclude + Lock surfaces structured conflict', () => {
  const rows = alderwoodUniverse();
  const home = homeFromRows(rows);
  const lock = lockedShowtimeFromPlannerRow(
    rows.find((r) => r.source_showtime_id === 'lll-1315'),
  );
  const form = baseForm({
    lockedShowtimes: [lock],
    notInterested: [
      {
        id: 'la-la-land',
        filmKey: 'la-la-land',
        filmId: 'tmdb:la-la-land',
        title: 'La La Land',
      },
    ],
  });
  const validation = validateBuildPlanDraftForGenerate(form, home, {
    now: FIXTURE_NOW,
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.conflicts.length >= 1);
  assert.ok(
    validation.conflicts.some(
      (c) =>
        /lock|exclude|not_interested|interested/i.test(String(c.code ?? '')) ||
        /not interested|exclude|lock/i.test(String(c.message ?? '')),
    ),
    `expected lock/exclude conflict, got ${JSON.stringify(validation.conflicts)}`,
  );

  const live = generateLivePlannerResults({
    homeData: home,
    form,
    sortId: 'best-match',
    now: FIXTURE_NOW,
  });
  assert.equal(live.status, 'invalid_constraints');
  assert.ok(live.conflicts.length >= 1);
  assert.equal(live.plans.length, 0);
});

test('OVERLAY: Require + Lock and Prefer + Lock coexist without rewriting', () => {
  const rows = alderwoodUniverse();
  const lock = lockedShowtimeFromPlannerRow(
    rows.find((r) => r.source_showtime_id === 'lll-1315'),
  );
  const card = {
    id: 'la-la-land',
    filmKey: 'la-la-land',
    filmId: 'tmdb:la-la-land',
    title: 'La La Land',
  };

  const requireForm = applyShowtimeLockToForm(
    baseForm({ mustInclude: [card] }),
    lock,
    true,
  );
  assert.equal(requireForm.mustInclude.length, 1);
  assert.equal(requireForm.lockedShowtimes.length, 1);

  const preferForm = applyShowtimeLockToForm(
    baseForm({ wouldLove: [card] }),
    lock,
    true,
  );
  assert.equal(preferForm.wouldLove.length, 1);
  assert.equal(preferForm.lockedShowtimes.length, 1);
});

test('RESULT ROWS: locked indicator is performanceKey-scoped', () => {
  assert.match(RESULTS, /lockedPerformanceKeys\?\.has\(item\.performanceKey\)/);
  assert.match(RESULTS, /data-locked=\{locked \? 'true' : 'false'\}/);
});

test('REGRESSION: removeLockedShowtimeFromForm still works for unlock path', () => {
  const rows = alderwoodUniverse();
  const lock = lockedShowtimeFromPlannerRow(
    rows.find((r) => r.source_showtime_id === 'lll-1315'),
  );
  let form = addLockedShowtimeToForm(baseForm(), lock).form;
  form = removeLockedShowtimeFromForm(form, lock.performanceKey);
  assert.equal(form.lockedShowtimes.length, 0);
  assert.equal(isResultsFilmPerformanceLocked(form, lock), false);
});
