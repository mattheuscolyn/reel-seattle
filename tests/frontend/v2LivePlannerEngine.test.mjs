import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeDataToPlannerRows } from '../../v2/planner/homeDataToPlannerRows.js';
import {
  mapBuildFormToPlannerFilters,
  parsePlanSizeFilmCounts,
} from '../../v2/planner/mapBuildFormToPlannerFilters.js';
import { generateLivePlannerResults } from '../../v2/planner/generateLivePlannerResults.js';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';
import {
  isPlanResultsMockupMode,
  resolveBuildPlanResultsPagePresentation,
} from '../../v2/planner/resolveBuildPlanResultsPresentation.js';
import { acceptResultsPlan } from '../../v2/planner/acceptPlanFromResults.js';
import { exportPlanToCalendar } from '../../v2/calendar/exportFromOpportunity.js';
import { buildPlanCalendarDownload } from '../../src/utils/calendarExport.js';
import { getAcceptedPlans } from '../../v2/stores/acceptedPlansStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanResultsSurface.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/buildPlanResultsMockupFixture.js'),
  'utf8',
);
const RESOLVER_SRC = readFileSync(
  join(ROOT, 'v2/planner/resolveBuildPlanResultsPresentation.js'),
  'utf8',
);

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const DATE = '2026-07-28';

function makeHomeData() {
  return {
    theaters: [
      {
        id: 'theater-a',
        name: 'Theater A',
        addressLine1: '100 Main St',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
      },
      {
        id: 'theater-b',
        name: 'Theater B',
        addressLine1: '200 Pike St',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
      },
      { id: 'amc-pacific-place', name: 'AMC Pacific Place 11' },
    ],
    theatersById: {
      'theater-a': {
        id: 'theater-a',
        name: 'Theater A',
        addressLine1: '100 Main St',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
      },
      'theater-b': {
        id: 'theater-b',
        name: 'Theater B',
        addressLine1: '200 Pike St',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
      },
    },
    films: [
      {
        filmKey: 'alpha',
        filmId: 'tmdb:1',
        title: 'Alpha',
        runtimeMin: 90,
        posterUrl: 'https://example.com/a.jpg',
      },
      {
        filmKey: 'beta',
        filmId: 'tmdb:2',
        title: 'Beta',
        runtimeMin: 100,
        posterUrl: 'https://example.com/b.jpg',
      },
      {
        filmKey: 'gamma',
        filmId: 'tmdb:3',
        title: 'Gamma',
        runtimeMin: 95,
        posterUrl: 'https://example.com/g.jpg',
      },
    ],
    opportunities: [
      {
        opportunityKey: 'oa1',
        filmKey: 'alpha',
        title: 'Alpha',
        theaterId: 'theater-a',
        theaterName: 'Theater A',
        localDate: DATE,
        localTime: '14:00',
        runtimeMin: 90,
        source: 'fixture-test',
        sourceShowtimeId: 'oa1',
        formatLabels: ['Digital'],
        ticketUrl: 'https://example.com/t/oa1',
      },
      {
        opportunityKey: 'ob1',
        filmKey: 'beta',
        title: 'Beta',
        theaterId: 'theater-a',
        theaterName: 'Theater A',
        localDate: DATE,
        localTime: '16:30',
        runtimeMin: 100,
        source: 'fixture-test',
        sourceShowtimeId: 'ob1',
        formatLabels: ['IMAX'],
        ticketUrl: 'https://example.com/t/ob1',
      },
      {
        opportunityKey: 'og1',
        filmKey: 'gamma',
        title: 'Gamma',
        theaterId: 'theater-a',
        theaterName: 'Theater A',
        localDate: DATE,
        localTime: '19:30',
        runtimeMin: 95,
        source: 'fixture-test',
        sourceShowtimeId: 'og1',
        formatLabels: ['35mm'],
        ticketUrl: 'https://example.com/t/og1',
      },
      // Same titles/times at another theater — must not mix venues (T-PENG-01).
      {
        opportunityKey: 'oa2',
        filmKey: 'alpha',
        title: 'Alpha',
        theaterId: 'theater-b',
        theaterName: 'Theater B',
        localDate: DATE,
        localTime: '14:00',
        runtimeMin: 90,
        source: 'fixture-test',
        sourceShowtimeId: 'oa2',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'ob2',
        filmKey: 'beta',
        title: 'Beta',
        theaterId: 'theater-b',
        theaterName: 'Theater B',
        localDate: DATE,
        localTime: '16:30',
        runtimeMin: 100,
        source: 'fixture-test',
        sourceShowtimeId: 'ob2',
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
    planSize: '1 – 3 movies',
    mustInclude: [],
    wouldLove: [],
    notInterested: [],
    maxGap: '120 min',
    ...overrides,
  };
}

test('homeDataToPlannerRows maps HH:MM + live accept fields', () => {
  const rows = homeDataToPlannerRows(makeHomeData());
  assert.ok(rows.length >= 5);
  const alpha = rows.find((r) => r.filmKey === 'alpha' && r.theater_id === 'theater-a');
  assert.equal(alpha.Date, DATE);
  assert.equal(alpha.Time, '2:00PM');
  assert.equal(alpha.localTime, '14:00');
  assert.equal(alpha.source, 'fixture-test');
  assert.equal(alpha.source_showtime_id, 'oa1');
  assert.equal(alpha.Runtime, 90);
});

test('parsePlanSizeFilmCounts covers singles and ranges', () => {
  assert.deepEqual(parsePlanSizeFilmCounts('1 movie'), [1]);
  assert.deepEqual(parsePlanSizeFilmCounts('1 – 3 movies'), [1, 2, 3]);
  assert.deepEqual(parsePlanSizeFilmCounts('2 – 4 movies'), [2, 3, 4]);
  assert.equal(parsePlanSizeFilmCounts('As many as possible'), 'max');
});

test('mapBuildFormToPlannerFilters suppresses walk/budget/multi', () => {
  const mapped = mapBuildFormToPlannerFilters(liveForm(), makeHomeData());
  assert.equal(mapped.dateIso, DATE);
  assert.deepEqual(mapped.suppressed, {
    walking: true,
    budget: true,
    multiTheater: true,
  });
  assert.equal(mapped.filters.date, DATE);
});

test('one-film itinerary generation', () => {
  const result = generateLivePlannerResults({
    homeData: makeHomeData(),
    form: liveForm({ planSize: '1 movie' }),
    sortId: 'best-match',
  });
  assert.equal(result.ok, true);
  assert.ok(result.plans.length >= 1);
  assert.ok(result.plans.every((p) => p.provenance === 'live'));
  const single = result.plans.find((p) => p.movieCountLabel.startsWith('1 '));
  assert.ok(single);
  const films = single.items.filter((i) => i.type !== 'break');
  assert.equal(films.length, 1);
  assert.equal(films[0].localDate, DATE);
  assert.ok(films[0].theaterId);
  assert.ok(films[0].sourceShowtimeId || films[0].filmKey);
});

test('double feature same-theater only', () => {
  const result = generateLivePlannerResults({
    homeData: makeHomeData(),
    form: liveForm({ planSize: '2 movies' }),
    sortId: 'best-match',
  });
  assert.ok(result.plans.length >= 1);
  for (const plan of result.plans) {
    const films = plan.items.filter((i) => i.type !== 'break');
    assert.equal(films.length, 2);
    assert.equal(films[0].theaterId, films[1].theaterId);
  }
});

test('cross-theater chains are not produced (T-PENG-01 same-theater)', () => {
  const result = generateLivePlannerResults({
    homeData: makeHomeData(),
    form: liveForm({ planSize: '2 movies' }),
  });
  for (const plan of result.plans) {
    const films = plan.items.filter((i) => i.type !== 'break');
    const theaters = new Set(films.map((f) => f.theaterId));
    assert.equal(theaters.size, 1);
  }
});

test('finish-before and gap validation exclude invalid chains', () => {
  const tight = generateLivePlannerResults({
    homeData: makeHomeData(),
    form: liveForm({
      planSize: '2 movies',
      startAfter: '2:00 PM',
      finishBefore: '4:00 PM',
    }),
  });
  assert.equal(tight.plans.length, 0);

  const open = generateLivePlannerResults({
    homeData: makeHomeData(),
    form: liveForm({ planSize: '2 movies', maxGap: '30 min' }),
  });
  // Alpha ends ~15:45; Beta 16:30 → gap 45 > 30 → empty
  assert.equal(open.plans.length, 0);

  const mapped = mapBuildFormToPlannerFilters(
    liveForm({ startAfter: '2:00 PM', finishBefore: '11:00 PM' }),
    makeHomeData(),
  );
  assert.equal(mapped.filters.startAfterMin, 14 * 60);
  assert.equal(mapped.filters.finishByMin, 23 * 60);
});

test('no overlap and deterministic ordering', () => {
  const a = generateLivePlannerResults({
    homeData: makeHomeData(),
    form: liveForm({ planSize: '2 movies' }),
    sortId: 'leaves-soonest',
  });
  const b = generateLivePlannerResults({
    homeData: makeHomeData(),
    form: liveForm({ planSize: '2 movies' }),
    sortId: 'leaves-soonest',
  });
  assert.deepEqual(
    a.plans.map((p) => p.id),
    b.plans.map((p) => p.id),
  );
  for (const plan of a.plans) {
    const films = plan.items.filter((i) => i.type !== 'break');
    for (let i = 0; i < films.length - 1; i += 1) {
      assert.ok(films[i].localTime);
      assert.ok(films[i + 1].localTime);
    }
  }
});

test('empty results when must-include cannot fit', () => {
  const result = generateLivePlannerResults({
    homeData: makeHomeData(),
    form: liveForm({
      planSize: '2 movies',
      mustInclude: [{ id: 'x', title: 'Not A Real Film' }],
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.plans.length, 0);
  assert.match(result.message ?? '', /No same-theater plans/i);
});

test('live plan accept + calendar ICS contract', () => {
  const storage = memoryStorage();
  const result = generateLivePlannerResults({
    homeData: makeHomeData(),
    form: liveForm({ planSize: '2 movies' }),
  });
  const plan = result.plans[0];
  assert.ok(plan);
  const filmIds = plan.items
    .filter((i) => i.type !== 'break')
    .map((i) => i.id);
  const accepted = acceptResultsPlan(plan, filmIds, {
    storage,
    provenance: 'live',
  });
  assert.equal(accepted.ok, true);
  assert.equal(getAcceptedPlans(storage).length, 1);

  const exportFilms = plan.items
    .filter((i) => i.type !== 'break')
    .map((item) => ({
      title: item.title,
      date: item.date,
      time: item.time,
      runtime: item.runtime,
      theater: item.theater,
      theater_id: item.theaterId,
      filmKey: item.filmKey,
      source: item.source,
      source_showtime_id: item.sourceShowtimeId,
      addressLabel: item.addressLabel,
    }));
  const download = buildPlanCalendarDownload({
    planId: plan.id,
    title: 'Test plan',
    films: exportFilms,
  });
  assert.equal(download.ok, true);
  assert.match(download.ics, /BEGIN:VEVENT/);
  // Browser download helper fails closed in Node (same as T-PLAN-01).
  assert.equal(
    exportPlanToCalendar({
      planId: plan.id,
      title: 'Test plan',
      films: exportFilms,
    }).ok,
    false,
  );
});

test('mockup mode is explicit; live default uses engine', () => {
  assert.equal(isPlanResultsMockupMode(), false);
  const live = resolveBuildPlanResultsPagePresentation({
    homeData: makeHomeData(),
    form: liveForm({ planSize: '1 movie' }),
    forceMockup: false,
  });
  assert.equal(live.source, 'live');
  assert.ok(live.plans.length >= 1);

  const mock = resolveBuildPlanResultsPagePresentation({
    forceMockup: true,
  });
  assert.equal(mock.source, 'mockup-fixture');
  assert.equal(mock.plans.length, 3);

  assert.match(RESOLVER_SRC, /planResultsMockup/);
  assert.equal(FIXTURE_SRC.includes('plannerEngine'), false);
  assert.match(SURFACE_SRC, /generateLivePlannerResults|resolveBuildPlanResultsPagePresentation/);
  assert.match(SURFACE_SRC, /homeData/);
});
