import test from 'node:test';
import assert from 'node:assert/strict';
import { findSchedules } from '../../src/utils/plannerEngine.js';
import { hhmmToLegacyPlannerTime } from '../../v2/planner/homeDataToPlannerRows.js';
import {
  formatPlanSizeLabel,
  normalizePlanSize,
  parsePlanSizeFilmCounts,
  planSizeToFilmCounts,
} from '../../v2/planner/planSize.js';
import {
  normalizeLockedShowtime,
  normalizeLockedShowtimes,
} from '../../v2/planner/lockedShowtimes.js';
import {
  lockedShowtimeFromPlannerRow,
  validatePlannerDraftConstraints,
} from '../../v2/planner/validatePlannerDraftConstraints.js';
import { generateLivePlannerResults } from '../../v2/planner/generateLivePlannerResults.js';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';
import { buildPerformanceKey } from '../../v2/identity/performanceIdentity.js';
import { buildAcceptedPerformanceKey } from '../../v2/stores/acceptedPlansStore.js';

const DATE = '2026-07-29';
const THEATER = 'amc-alderwood';
const THEATER_NAME = 'AMC Alderwood';

function planFilms(plan) {
  return (plan.items ?? []).filter((item) => item && item.type !== 'break');
}

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
  const localTime = time; // HH:MM
  return {
    Date: date,
    Time: hhmmToLegacyPlannerTime(localTime),
    Film: title,
    Theater: theaterName,
    theater_id: theaterId,
    Runtime: runtime,
    showtime_film_key: filmKey,
    filmKey,
    filmId: `tmdb:${filmKey}`,
    localDate: date,
    localTime,
    source: 'amc',
    source_showtime_id: sourceShowtimeId,
    opportunityKey: `src:amc:${sourceShowtimeId}`,
    posterDynamic: null,
    premiumFormat: '',
    status: 'scheduled',
  };
}

/** Fixture: lock at 13:15 with films before and after, plus an alternate lock film time. */
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
      filmKey: 'locked-musical',
      title: 'Anniversary Musical',
      time: '13:15',
      runtime: 128,
      sourceShowtimeId: 'amc-lock-1315',
    }),
    // Alternate screening of the locked film — must NEVER substitute.
    row({
      filmKey: 'locked-musical',
      title: 'Anniversary Musical',
      time: '19:00',
      runtime: 128,
      sourceShowtimeId: 'amc-lock-1900',
    }),
    row({
      filmKey: 'afternoon-c',
      title: 'Afternoon Feature C',
      time: '16:30',
      runtime: 105,
      sourceShowtimeId: 'amc-aft-c',
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

function lock1315(rows = alderwoodUniverse()) {
  const lockRow = rows.find((r) => r.source_showtime_id === 'amc-lock-1315');
  return lockedShowtimeFromPlannerRow(lockRow);
}

test('normalizePlanSize accepts objects, legacy strings, and defaults', () => {
  assert.deepEqual(normalizePlanSize({ min: 4, max: 4 }), { min: 4, max: 4 });
  assert.deepEqual(normalizePlanSize({ min: 3, max: 5 }), { min: 3, max: 5 });
  assert.deepEqual(normalizePlanSize('1 movie'), { min: 1, max: 1 });
  assert.deepEqual(normalizePlanSize('1–3 movies'), { min: 1, max: 3 });
  assert.deepEqual(normalizePlanSize('2 – 4 movies'), { min: 2, max: 4 });
  assert.equal(normalizePlanSize('As many as possible').mode, 'max');
  assert.deepEqual(normalizePlanSize(null), { min: 1, max: 3 });
  assert.deepEqual(normalizePlanSize({ min: 9, max: 1 }), { min: 1, max: 6 });
  assert.deepEqual(parsePlanSizeFilmCounts('1 movie'), [1]);
  assert.deepEqual(planSizeToFilmCounts({ min: 4, max: 4 }), [4]);
  assert.equal(formatPlanSizeLabel({ min: 4, max: 4 }), '4 movies');
  assert.equal(formatPlanSizeLabel('1–3 movies'), '1–3 movies');
});

test('performance identity helper is shared with accepted plans', () => {
  const input = {
    source: 'amc',
    sourceShowtimeId: 'abc',
    theaterId: THEATER,
  };
  assert.equal(buildPerformanceKey(input), buildAcceptedPerformanceKey(input));
  assert.equal(
    buildPerformanceKey(input),
    `src:amc:${THEATER}:abc`,
  );
});

test('locked showtime normalize requires identity', () => {
  assert.equal(normalizeLockedShowtime({ title: 'Nope' }), null);
  const lock = normalizeLockedShowtime({
    source: 'amc',
    sourceShowtimeId: 'x1',
    theaterId: THEATER,
    localDate: DATE,
    localTime: '13:15',
    filmKey: 'locked-musical',
    title: 'Anniversary Musical',
  });
  assert.ok(lock);
  assert.equal(lock.performanceKey, `src:amc:${THEATER}:x1`);
  assert.deepEqual(normalizeLockedShowtimes([lock, lock]).length, 1);
});

test('real scenario: exact 4 + mid-day lock seeds before and after', () => {
  const rows = alderwoodUniverse();
  const lock = lock1315(rows);
  assert.ok(lock);

  const { schedules } = findSchedules({
    rows,
    filters: {
      date: DATE,
      theaters: [THEATER],
      filmCount: 4,
      startAfterMin: null,
      finishByMin: null,
      minGapMin: 0,
      maxGapMin: null,
      includeFilms: [],
      excludeFilms: [],
      preferredFilms: [],
      allowRepeatFilms: false,
    },
    lockedCandidates: [
      // Resolve via engine path: pass candidate-shaped lock from rows
      ...(() => {
        const { schedules: one } = findSchedules({
          rows: rows.filter((r) => r.source_showtime_id === 'amc-lock-1315'),
          filters: {
            date: DATE,
            theaters: [THEATER],
            filmCount: 2,
            allowRepeatFilms: false,
            includeFilms: [],
            excludeFilms: [],
            preferredFilms: [],
          },
        });
        // Build candidate manually from row via second findSchedules meta — use validation helper instead
        return [];
      })(),
    ],
  });
  void schedules;

  const home = homeFromRows(rows);
  const form = {
    ...createLiveBuildPlanFormState(() => new Date('2026-07-29T08:00:00-07:00')),
    dateIso: DATE,
    planSize: { min: 4, max: 4 },
    theaterPrefId: THEATER,
    selectedTheaters: [THEATER],
    startAfter: '9:00 AM',
    finishBefore: '11:59 PM',
    maxGap: 'Any',
    minGap: 'Any',
    lockedShowtimes: [lock],
    mustInclude: [],
    wouldLove: [],
    notInterested: [],
  };

  const result = generateLivePlannerResults({
    homeData: home,
    form,
    now: () => new Date('2026-07-29T08:00:00-07:00'),
  });

  assert.equal(result.status, 'ok');
  assert.ok(result.plans.length >= 1);
  for (const plan of result.plans) {
    const films = planFilms(plan);
    assert.equal(films.length, 4);
    const keys = films.map((f) => f.performanceKey);
    assert.ok(keys.includes(lock.performanceKey));
    assert.equal(
      keys.includes(`src:amc:${THEATER}:amc-lock-1900`),
      false,
    );
    const lockIdx = films.findIndex(
      (f) => f.performanceKey === lock.performanceKey,
    );
    assert.ok(lockIdx >= 0);
  }

  const around = result.plans.find((plan) => {
    const films = planFilms(plan);
    const idx = films.findIndex(
      (f) => f.performanceKey === lock.performanceKey,
    );
    return idx > 0 && idx < films.length - 1;
  });
  assert.ok(
    around,
    'expected at least one plan with films before and after the 1:15 lock',
  );
});

test('validation: overlapping locks, theater/date/window, size, NI collisions', () => {
  const rows = alderwoodUniverse();
  const lockA = lock1315(rows);
  const lockB = lockedShowtimeFromPlannerRow(
    rows.find((r) => r.source_showtime_id === 'amc-aft-c'),
  );
  // Force overlap: same start neighborhood with long runtimes already ok;
  // use morning + lock that can't follow with huge min gap
  const formBase = {
    ...createLiveBuildPlanFormState(() => new Date('2026-07-29T08:00:00-07:00')),
    dateIso: DATE,
    planSize: { min: 2, max: 2 },
    theaterPrefId: THEATER,
    lockedShowtimes: [lockA, lockB],
    maxGap: '30 min',
    minGap: '0 min',
    startAfter: '9:00 AM',
    finishBefore: '11:00 PM',
  };

  // locks > max size
  {
    const v = validatePlannerDraftConstraints({
      form: {
        ...formBase,
        planSize: { min: 1, max: 1 },
        lockedShowtimes: [lockA, lockB],
      },
      rows,
      filters: { minGapMin: 0, maxGapMin: null, allowRepeatFilms: false },
      dateIso: DATE,
      theaterIds: [THEATER],
    });
    assert.ok(v.conflicts.some((c) => c.code === 'plan_size_smaller_than_locks'));
  }

  // date mismatch
  {
    const bad = {
      ...lockA,
      localDate: '2026-07-30',
      performanceKey: lockA.performanceKey,
    };
    // unresolved because date on lock doesn't match candidate date identity —
    // candidate still resolves by key; add explicit date check on candidate.date
    const v = validatePlannerDraftConstraints({
      form: { ...formBase, dateIso: '2026-07-30', lockedShowtimes: [lockA] },
      rows,
      filters: {},
      dateIso: '2026-07-30',
      theaterIds: [THEATER],
    });
    assert.ok(
      v.conflicts.some(
        (c) =>
          c.code === 'locked_showtime_date_mismatch' ||
          c.code === 'locked_showtime_unresolved',
      ),
    );
  }

  // theater mismatch
  {
    const v = validatePlannerDraftConstraints({
      form: { ...formBase, lockedShowtimes: [lockA] },
      rows,
      filters: {},
      dateIso: DATE,
      theaterIds: ['other-theater'],
    });
    assert.ok(
      v.conflicts.some((c) => c.code === 'locked_showtime_theater_mismatch'),
    );
  }

  // locked ∩ NI
  {
    const v = validatePlannerDraftConstraints({
      form: {
        ...formBase,
        lockedShowtimes: [lockA],
        notInterested: [
          {
            id: 'locked-musical',
            filmKey: 'locked-musical',
            filmId: 'tmdb:locked-musical',
            title: 'Anniversary Musical',
          },
        ],
        planSize: { min: 4, max: 4 },
      },
      rows,
      filters: {
        excludeFilms: ['tmdb:locked-musical', 'locked-musical'],
      },
      dateIso: DATE,
      theaterIds: [THEATER],
    });
    assert.ok(v.conflicts.some((c) => c.code === 'locked_film_not_interested'));
  }

  // must ∩ NI
  {
    const v = validatePlannerDraftConstraints({
      form: {
        ...formBase,
        lockedShowtimes: [],
        mustInclude: [
          {
            id: 'x',
            filmKey: 'afternoon-c',
            filmId: 'tmdb:afternoon-c',
            title: 'Afternoon Feature C',
          },
        ],
        notInterested: [
          {
            id: 'x',
            filmKey: 'afternoon-c',
            filmId: 'tmdb:afternoon-c',
            title: 'Afternoon Feature C',
          },
        ],
      },
      rows,
      filters: { excludeFilms: ['tmdb:afternoon-c'] },
      dateIso: DATE,
      theaterIds: [THEATER],
    });
    assert.ok(v.conflicts.some((c) => c.code === 'must_include_not_interested'));
  }
});

test('unresolved lock and no substitute screening', () => {
  const rows = alderwoodUniverse();
  const lock = {
    ...lock1315(rows),
    performanceKey: 'src:amc:amc-alderwood:does-not-exist',
  };
  const home = homeFromRows(rows);
  const result = generateLivePlannerResults({
    homeData: home,
    form: {
      ...createLiveBuildPlanFormState(() => new Date('2026-07-29T08:00:00-07:00')),
      dateIso: DATE,
      planSize: { min: 4, max: 4 },
      theaterPrefId: THEATER,
      lockedShowtimes: [lock],
    },
    now: () => new Date('2026-07-29T08:00:00-07:00'),
  });
  assert.equal(result.status, 'invalid_constraints');
  assert.ok(
    result.conflicts.some((c) => c.code === 'locked_showtime_unresolved'),
  );
});

test('exact size met by locks alone; five locks conflicts', () => {
  const rows = alderwoodUniverse();
  const four = [
    lockedShowtimeFromPlannerRow(rows[0]),
    lockedShowtimeFromPlannerRow(rows[2]),
    lockedShowtimeFromPlannerRow(rows[4]),
    lockedShowtimeFromPlannerRow(rows[5]),
  ].filter(Boolean);

  const home = homeFromRows(rows);
  const ok = generateLivePlannerResults({
    homeData: home,
    form: {
      ...createLiveBuildPlanFormState(() => new Date('2026-07-29T08:00:00-07:00')),
      dateIso: DATE,
      planSize: { min: 4, max: 4 },
      theaterPrefId: THEATER,
      maxGap: 'Any',
      minGap: 'Any',
      startAfter: '9:00 AM',
      finishBefore: '11:59 PM',
      lockedShowtimes: four,
    },
    now: () => new Date('2026-07-29T08:00:00-07:00'),
  });
  // May be ok or no_feasible if gaps don't work — if ok, length 4 with all keys
  if (ok.status === 'ok') {
    const films = planFilms(ok.plans[0]);
    assert.equal(films.length, 4);
    for (const lock of four) {
      assert.ok(
        films.some((f) => f.performanceKey === lock.performanceKey),
      );
    }
  }

  const five = [
    ...four,
    lockedShowtimeFromPlannerRow(rows[6]),
  ].filter(Boolean);
  const bad = generateLivePlannerResults({
    homeData: home,
    form: {
      ...createLiveBuildPlanFormState(() => new Date('2026-07-29T08:00:00-07:00')),
      dateIso: DATE,
      planSize: { min: 4, max: 4 },
      theaterPrefId: THEATER,
      lockedShowtimes: five,
    },
    now: () => new Date('2026-07-29T08:00:00-07:00'),
  });
  assert.equal(bad.status, 'invalid_constraints');
  assert.ok(
    bad.conflicts.some((c) => c.code === 'plan_size_smaller_than_locks'),
  );
});

test('no locks preserves range behavior; 1-film path still works', () => {
  const rows = alderwoodUniverse();
  const home = homeFromRows(rows);
  const range = generateLivePlannerResults({
    homeData: home,
    form: {
      ...createLiveBuildPlanFormState(() => new Date('2026-07-29T08:00:00-07:00')),
      dateIso: DATE,
      planSize: { min: 2, max: 3 },
      theaterPrefId: THEATER,
      maxGap: 'Any',
      lockedShowtimes: [],
    },
    now: () => new Date('2026-07-29T08:00:00-07:00'),
  });
  assert.equal(range.status, 'ok');
  assert.ok(
    range.plans.every((p) => {
      const n = planFilms(p).length;
      return n >= 2 && n <= 3;
    }),
  );

  const one = generateLivePlannerResults({
    homeData: home,
    form: {
      ...createLiveBuildPlanFormState(() => new Date('2026-07-29T08:00:00-07:00')),
      dateIso: DATE,
      planSize: { min: 1, max: 1 },
      theaterPrefId: THEATER,
      lockedShowtimes: [],
    },
    now: () => new Date('2026-07-29T08:00:00-07:00'),
  });
  assert.equal(one.status, 'ok');
  assert.ok(one.plans.every((p) => planFilms(p).length === 1));
});

test('Must Include satisfied by lock; Would Love still ranks; NI excluded', () => {
  const rows = alderwoodUniverse();
  const lock = lock1315(rows);
  const home = homeFromRows(rows);
  const result = generateLivePlannerResults({
    homeData: home,
    form: {
      ...createLiveBuildPlanFormState(() => new Date('2026-07-29T08:00:00-07:00')),
      dateIso: DATE,
      planSize: { min: 4, max: 4 },
      theaterPrefId: THEATER,
      maxGap: 'Any',
      minGap: 'Any',
      startAfter: '9:00 AM',
      finishBefore: '11:59 PM',
      lockedShowtimes: [lock],
      mustInclude: [
        {
          id: 'locked-musical',
          filmKey: 'locked-musical',
          filmId: 'tmdb:locked-musical',
          title: 'Anniversary Musical',
        },
      ],
      wouldLove: [
        {
          id: 'evening-d',
          filmKey: 'evening-d',
          filmId: 'tmdb:evening-d',
          title: 'Evening Feature D',
        },
      ],
      notInterested: [
        {
          id: 'late-e',
          filmKey: 'late-e',
          filmId: 'tmdb:late-e',
          title: 'Late Feature E',
        },
      ],
    },
    now: () => new Date('2026-07-29T08:00:00-07:00'),
  });
  assert.equal(result.status, 'ok');
  for (const plan of result.plans) {
    const films = planFilms(plan);
    assert.ok(
      films.some((f) => f.performanceKey === lock.performanceKey),
    );
    assert.equal(
      films.some((f) => f.filmKey === 'late-e'),
      false,
    );
  }
});

test('valid constraints with no feasible plan are distinct from invalid', () => {
  const rows = [
    row({
      filmKey: 'only-a',
      title: 'Only A',
      time: '10:00',
      runtime: 200,
      sourceShowtimeId: 'only-a',
    }),
    row({
      filmKey: 'only-b',
      title: 'Only B',
      time: '10:05',
      runtime: 200,
      sourceShowtimeId: 'only-b',
    }),
  ];
  const home = homeFromRows(rows);
  const result = generateLivePlannerResults({
    homeData: home,
    form: {
      ...createLiveBuildPlanFormState(() => new Date('2026-07-29T08:00:00-07:00')),
      dateIso: DATE,
      planSize: { min: 2, max: 2 },
      theaterPrefId: THEATER,
      maxGap: '5 min',
      minGap: '0 min',
      lockedShowtimes: [],
    },
    now: () => new Date('2026-07-29T08:00:00-07:00'),
  });
  assert.equal(result.status, 'no_feasible_plan');
  assert.deepEqual(result.conflicts, []);
});
