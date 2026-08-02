/**
 * T-V2-LAUNCH-PLANNER-01 — live catalog, mapper gaps, soft prefs, UI honesty.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyFilmBucketSelection,
  filterPlannerFilmCandidates,
  isEligiblePlannerCatalogOpportunity,
  listPlannerEligibleFilms,
} from '../../v2/planner/buildPlanFilmCatalog.js';
import {
  mapBuildFormToPlannerFilters,
  normalizeBreakGapRange,
  parseMinGapMinutes,
} from '../../v2/planner/mapBuildFormToPlannerFilters.js';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';
import { generateLivePlannerResults } from '../../v2/planner/generateLivePlannerResults.js';
import { findSchedules } from '../../src/utils/plannerEngine.js';
import { acceptResultsPlan } from '../../v2/planner/acceptPlanFromResults.js';
import { getAcceptedPlans } from '../../v2/stores/acceptedPlansStore.js';
import { saveFilm } from '../../v2/stores/savedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BP_SRC = readFileSync(join(ROOT, 'v2/planner/BuildPlanSurface.jsx'), 'utf8');
const MANAGE_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanFilmManageSurface.jsx'),
  'utf8',
);
const DETAILS_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanPlanDetailsSurface.jsx'),
  'utf8',
);
const MAPPER_SRC = readFileSync(
  join(ROOT, 'v2/planner/mapBuildFormToPlannerFilters.js'),
  'utf8',
);
const LIVE_DEFAULTS_SRC = readFileSync(
  join(ROOT, 'v2/planner/createLiveBuildPlanFormState.js'),
  'utf8',
);

const DATE = '2026-07-28';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function makeHomeData() {
  return {
    theaters: [
      { id: 'theater-a', name: 'Theater A' },
      { id: 'theater-b', name: 'Theater B' },
      { id: 'amc-pacific-place', name: 'AMC Pacific Place 11' },
    ],
    films: [
      {
        filmKey: 'alpha',
        filmId: 'tmdb:1',
        title: 'Alpha',
        runtimeMin: 90,
        posterUrl: 'https://example.com/a.jpg',
        genres: ['Drama'],
      },
      {
        filmKey: 'beta',
        filmId: null,
        title: 'Beta Unenriched',
        runtimeMin: 100,
        posterUrl: null,
      },
      {
        filmKey: 'gamma',
        filmId: 'tmdb:3',
        title: 'Gamma',
        runtimeMin: 95,
      },
      {
        filmKey: 'past-only',
        title: 'Past Only',
        runtimeMin: 80,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'oa1',
        filmKey: 'alpha',
        theaterId: 'theater-a',
        theaterName: 'Theater A',
        localDate: DATE,
        localTime: '14:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'ob1',
        filmKey: 'beta',
        theaterId: 'theater-a',
        theaterName: 'Theater A',
        localDate: DATE,
        localTime: '16:30',
        formatLabels: ['IMAX'],
      },
      {
        opportunityKey: 'og1',
        filmKey: 'gamma',
        theaterId: 'theater-b',
        theaterName: 'Theater B',
        localDate: DATE,
        localTime: '19:30',
        formatLabels: ['35mm'],
      },
      {
        opportunityKey: 'past1',
        filmKey: 'past-only',
        theaterId: 'theater-a',
        theaterName: 'Theater A',
        localDate: '2026-07-27',
        localTime: '20:00',
        formatLabels: ['Digital'],
      },
    ],
  };
}

function liveForm(overrides = {}) {
  return {
    ...createLiveBuildPlanFormState(() => new Date('2026-07-28T12:00:00-07:00')),
    dateIso: DATE,
    startAfter: '12:00 PM',
    finishBefore: '11:00 PM',
    planSize: '1–3 movies',
    maxGap: '120 min',
    minGap: 'Any',
    ...overrides,
  };
}

test('new user receives non-empty candidates from HomeData', () => {
  const films = listPlannerEligibleFilms(makeHomeData(), {
    dateIso: DATE,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  assert.ok(films.length >= 3);
  assert.ok(films.some((f) => f.filmKey === 'alpha'));
  assert.ok(films.some((f) => f.filmKey === 'beta'));
  assert.equal(
    films.some((f) => f.filmKey === 'past-only'),
    false,
  );
});

test('unenriched films remain selectable in catalog', () => {
  const films = listPlannerEligibleFilms(makeHomeData(), {
    dateIso: DATE,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  const beta = films.find((f) => f.filmKey === 'beta');
  assert.ok(beta);
  assert.equal(beta.filmId, null);
  assert.equal(beta.title, 'Beta Unenriched');
});

test('catalog eligibility ignores past showtimes', () => {
  const home = makeHomeData();
  const pastOpp = home.opportunities.find((o) => o.filmKey === 'past-only');
  const filmsByKey = new Map(home.films.map((f) => [f.filmKey, f]));
  assert.equal(
    isEligiblePlannerCatalogOpportunity(pastOpp, {
      dateIso: DATE,
      filmsByKey,
      now: () => new Date('2026-07-28T12:00:00-07:00'),
    }),
    false,
  );
});

test('search / saved / theater / format filters intersect', () => {
  const storage = memoryStorage();
  saveFilm(storage, {
    filmKey: 'alpha',
    showtimeFilmKey: 'alpha',
    filmId: 'tmdb:1',
  });
  const films = listPlannerEligibleFilms(makeHomeData(), {
    dateIso: DATE,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  assert.equal(
    filterPlannerFilmCandidates(films, { query: '  alp  ' }).length,
    1,
  );
  assert.equal(
    filterPlannerFilmCandidates(films, { query: '' }).length,
    films.length,
  );
  const saved = filterPlannerFilmCandidates(films, {
    savedOnly: true,
    storage,
  });
  assert.ok(saved.every((f) => f.filmKey === 'alpha'));
  const theater = filterPlannerFilmCandidates(films, {
    theaterIds: ['theater-b'],
  });
  assert.ok(theater.every((f) => f.theaterIds.includes('theater-b')));
  const format = filterPlannerFilmCandidates(films, {
    formatKeys: ['imax'],
  });
  assert.ok(format.every((f) => f.formatKeys.includes('imax')));
  const both = filterPlannerFilmCandidates(films, {
    theaterIds: ['theater-a'],
    formatKeys: ['digital'],
  });
  assert.ok(both.some((f) => f.filmKey === 'alpha'));
  assert.equal(
    both.some((f) => f.filmKey === 'beta'),
    false,
  );
});

test('bucket conflict resolution rules', () => {
  const card = {
    id: 'alpha',
    filmKey: 'alpha',
    title: 'Alpha',
    detailLabel: 'Theater A',
    imageUrl: '',
  };
  let form = {
    mustInclude: [],
    wouldLove: [{ ...card, id: 'alpha' }],
    notInterested: [{ ...card, id: 'alpha' }],
  };
  let next = applyFilmBucketSelection(form, 'mustInclude', card);
  assert.equal(next.mustInclude.length, 1);
  assert.equal(next.wouldLove.length, 0);
  assert.equal(next.notInterested.length, 0);

  form = {
    mustInclude: [{ ...card }],
    wouldLove: [],
    notInterested: [],
  };
  next = applyFilmBucketSelection(form, 'wouldLove', card);
  assert.equal(next.rejected, 'must');
  assert.equal(next.mustInclude.length, 1);

  form = {
    mustInclude: [{ ...card }],
    wouldLove: [{ ...card, id: 'beta', filmKey: 'beta', title: 'Beta' }],
    notInterested: [],
  };
  next = applyFilmBucketSelection(form, 'notInterested', card);
  assert.equal(next.mustInclude.length, 0);
  assert.equal(next.wouldLove.length, 1);
  assert.equal(next.notInterested.length, 1);

  form = {
    mustInclude: [],
    wouldLove: [],
    notInterested: [{ ...card }],
  };
  next = applyFilmBucketSelection(form, 'wouldLove', card);
  assert.equal(next.notInterested.length, 0);
  assert.equal(next.wouldLove.length, 1);
});

test('must include cap is enforced', () => {
  const form = {
    mustInclude: [
      { id: 'a', filmKey: 'a', title: 'A' },
      { id: 'b', filmKey: 'b', title: 'B' },
    ],
    wouldLove: [],
    notInterested: [],
  };
  const next = applyFilmBucketSelection(form, 'mustInclude', {
    id: 'c',
    filmKey: 'c',
    title: 'C',
  });
  assert.equal(next.rejected, 'cap');
  assert.equal(next.mustInclude.length, 2);
});

test('mapper passes minGapMin and maxGapMin; normalizes invalid ranges', () => {
  const mapped = mapBuildFormToPlannerFilters(
    liveForm({ minGap: '45m', maxGap: '90 min' }),
    makeHomeData(),
  );
  assert.equal(mapped.filters.minGapMin, 45);
  assert.equal(mapped.filters.maxGapMin, 90);

  const clamped = normalizeBreakGapRange('120m', '60 min');
  assert.equal(clamped.minGapMin, 60);
  assert.equal(clamped.maxGapMin, 60);
  assert.equal(parseMinGapMinutes('Any'), 0);
  assert.equal(parseMinGapMinutes(''), 0);

  const anyMax = mapBuildFormToPlannerFilters(
    liveForm({ minGap: '30m', maxGap: 'Any' }),
    makeHomeData(),
  );
  assert.equal(anyMax.filters.minGapMin, 30);
  assert.equal(anyMax.filters.maxGapMin, null);
});

test('live defaults: any theater, repeats off, pacific today', () => {
  const live = createLiveBuildPlanFormState(
    () => new Date('2026-07-28T12:00:00-07:00'),
  );
  assert.equal(live.theaterPrefId, 'any');
  assert.equal(live.allowRepeats, false);
  assert.equal(live.dateIso, '2026-07-28');
  const mapped = mapBuildFormToPlannerFilters(live, makeHomeData(), {
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  assert.deepEqual(mapped.filters.theaters, []);
  assert.equal(mapped.filters.allowRepeatFilms, false);
  assert.equal(mapped.filters.date, '2026-07-28');
  assert.match(LIVE_DEFAULTS_SRC, /theaterPrefId: 'any'/);
  assert.match(LIVE_DEFAULTS_SRC, /allowRepeats: false/);
  assert.equal(LIVE_DEFAULTS_SRC.includes("createBuildPlanFormState"), false);
});

test('Must Include hard; Not Interested hard; Would Love soft', () => {
  const home = makeHomeData();

  const must = generateLivePlannerResults({
    homeData: home,
    form: liveForm({
      mustInclude: [{ id: 'alpha', filmKey: 'alpha', title: 'Alpha' }],
      planSize: '2 movies',
      startAfter: '12:00 PM',
      theaterPrefId: 'any',
    }),
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  assert.ok(must.plans.length > 0, must.message);
  assert.ok(
    must.plans.every((p) =>
      p.items?.some((it) => it.type !== 'break' && (it.title === 'Alpha' || it.filmKey === 'alpha')),
    ),
  );

  const excluded = generateLivePlannerResults({
    homeData: home,
    form: liveForm({
      notInterested: [{ id: 'beta', filmKey: 'beta', title: 'Beta Unenriched' }],
      planSize: '1–3 movies',
    }),
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  assert.ok(excluded.plans.length > 0, excluded.message);
  assert.ok(
    excluded.plans.every(
      (p) =>
        !p.items?.some(
          (it) =>
            it.type !== 'break' &&
            (it.title === 'Beta Unenriched' || it.filmKey === 'beta'),
        ),
    ),
  );

  const soft = generateLivePlannerResults({
    homeData: home,
    form: liveForm({
      wouldLove: [
        { id: 'zeta', filmKey: 'zeta', title: 'Zeta Impossible' },
        { id: 'beta', filmKey: 'beta', title: 'Beta Unenriched' },
      ],
      planSize: '1–3 movies',
    }),
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  assert.ok(soft.plans.length > 0, soft.message);
  // Soft prefs must not wipe all non-preferred plans.
  assert.ok(
    soft.plans.some(
      (p) =>
        !p.items?.some(
          (it) =>
            it.type !== 'break' &&
            (it.title === 'Beta Unenriched' || it.filmKey === 'beta'),
        ),
    ),
  );
});

test('minimum break recomputes and filters engine gaps', () => {
  const DATE_US = '07/28/2026';
  const rows = [
    {
      Film: 'Alpha',
      Theater: 'T',
      theater_id: 't',
      Date: DATE_US,
      Time: '12:00PM',
      Runtime: '60',
      showtime_film_key: 'alpha',
    },
    {
      Film: 'Beta',
      Theater: 'T',
      theater_id: 't',
      Date: DATE_US,
      Time: '1:15PM',
      Runtime: '60',
      showtime_film_key: 'beta',
    },
    {
      Film: 'Gamma',
      Theater: 'T',
      theater_id: 't',
      Date: DATE_US,
      Time: '3:00PM',
      Runtime: '60',
      showtime_film_key: 'gamma',
    },
  ];
  const base = {
    date: DATE_US,
    theaters: [],
    filmCount: 2,
    startAfterMin: null,
    finishByMin: null,
    maxGapMin: 180,
    includeFilms: [],
    excludeFilms: [],
    preferredFilms: [],
    firstFilm: null,
    lastFilm: null,
    allowRepeatFilms: false,
  };
  const tight = findSchedules({
    rows,
    filters: { ...base, minGapMin: 0 },
  });
  assert.ok(tight.schedules.length > 0);

  const looseMin = findSchedules({
    rows,
    filters: { ...base, minGapMin: 45 },
  });
  assert.ok(looseMin.schedules.length > 0);
  assert.ok(looseMin.schedules.every((s) => s.gapTimeMin >= 45));
  assert.ok(looseMin.schedules.length <= tight.schedules.length);
});

test('UI honesty — disconnected launch controls are hidden', () => {
  assert.match(BP_SRC, /type="date"/);
  assert.match(BP_SRC, /Minimum break/);
  assert.match(BP_SRC, /Allow repeat films/);
  assert.equal(BP_SRC.includes("announce('date-picker'"), false);
  assert.equal(BP_SRC.includes('v2-bp-add-day'), false);
  assert.equal(BP_SRC.includes('v2-bp-flexible'), false);
  assert.equal(BP_SRC.includes('v2-bp-location'), false);
  assert.equal(BP_SRC.includes('v2-bp-more-options'), false);
  assert.equal(BP_SRC.includes("announce('custom-theaters'"), false);
  assert.equal(BP_SRC.includes("announce(`fine-"), false);
  assert.match(MANAGE_SRC, /listPlannerEligibleFilms/);
  assert.match(MANAGE_SRC, /homeData/);
  assert.equal(MANAGE_SRC.includes("isn’t available yet"), false);
  assert.equal(DETAILS_SRC.includes('handleSave'), false);
  assert.equal(DETAILS_SRC.includes('v2-bpd-save'), false);
  assert.match(DETAILS_SRC, /Add to My Schedule/);
  assert.match(MAPPER_SRC, /minGapMin/);
  assert.match(MAPPER_SRC, /normalizeBreakGapRange/);
});

test('accepted plan persists across store re-read', () => {
  const storage = memoryStorage();
  const result = generateLivePlannerResults({
    homeData: makeHomeData(),
    form: liveForm({ planSize: '2 movies' }),
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  const plan = result.plans[0];
  assert.ok(plan);
  const filmIds = plan.items.filter((i) => i.type !== 'break').map((i) => i.id);
  const first = acceptResultsPlan(plan, filmIds, {
    storage,
    provenance: 'live',
  });
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  const again = acceptResultsPlan(plan, filmIds, {
    storage,
    provenance: 'live',
  });
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.equal(getAcceptedPlans(storage).length, 1);
});
