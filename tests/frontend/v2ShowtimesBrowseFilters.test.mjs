import test from 'node:test';
import assert from 'node:assert/strict';
import { filmRefFromHomeFilm } from '../../v2/save/filmRefFromFilm.js';
import { favoriteTheater } from '../../v2/stores/favoriteTheatersStore.js';
import { markFilmNotInterested } from '../../v2/stores/notInterestedFilmsStore.js';
import { saveFilm } from '../../v2/stores/savedFilmsStore.js';
import { markFilmSeen } from '../../v2/stores/seenFilmsStore.js';
import {
  buildBrowseFilterSummaryPhrases,
  countActiveBrowseFilterDimensions,
  evaluateBrowseFilters,
  filmPassesBrowseUserStateFilters,
  isValidBrowseCustomTimeRange,
  opportunityMatchesBrowseFormats,
  opportunityMatchesBrowseTheater,
  opportunityMatchesBrowseTime,
  resolveAllowedTheaterIds,
  sortBrowseFilmGroups,
} from '../../v2/showtimes/browseFilterEngine.js';
import {
  browseFiltersToLegacyUi,
  createDefaultBrowseFilters,
  normalizeBrowseFilters,
  normalizeLegacyBrowseUi,
} from '../../v2/showtimes/browseFilterState.js';
import {
  clampBrowseDateBounds,
  getBrowseOpportunityDateHorizon,
  listEligibleBrowseOpportunitiesForDateSelection,
  resolveBrowseDateBounds,
} from '../../v2/showtimes/showtimeEligibility.js';
import {
  buildShowtimesBrowsePresentation,
  createDefaultShowtimesBrowseUi,
} from '../../v2/showtimes/showtimesBrowseModel.js';

/** Fixed Pacific-day: 2026-08-01 15:00 PDT */
const NOW = new Date('2026-08-01T22:00:00.000Z');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function sampleHome() {
  return {
    films: [
      { filmKey: 'alpha', title: 'Alpha', runtimeMin: 120 },
      { filmKey: 'beta', title: 'Beta', runtimeMin: 90 },
      { filmKey: 'gamma', title: 'Gamma', runtimeMin: null },
      {
        filmKey: 'variant-imax',
        title: 'Shared Title',
        parentFilmKey: 'parent-shared',
        runtimeMin: 100,
      },
      { filmKey: 'parent-shared', title: 'Shared Title', runtimeMin: 100 },
      { filmKey: 'remake', title: 'Shared Title', runtimeMin: 110 },
    ],
    opportunities: [
      {
        opportunityKey: 'today-past',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-01',
        localTime: '10:00',
        sortableLocalDateTime: '2026-08-01T10:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'today-a',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-01',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-01T19:00',
        formatLabels: ['imax-at-amc'],
      },
      {
        opportunityKey: 'today-b',
        filmKey: 'beta',
        theaterId: 't2',
        theaterName: 'Theater Two',
        localDate: '2026-08-01',
        localTime: '16:30',
        sortableLocalDateTime: '2026-08-01T16:30',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'today-g',
        filmKey: 'gamma',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-01',
        localTime: '21:15',
        sortableLocalDateTime: '2026-08-01T21:15',
        formatLabels: ['35mm'],
      },
      {
        opportunityKey: 'tm-a',
        filmKey: 'alpha',
        theaterId: 't2',
        theaterName: 'Theater Two',
        localDate: '2026-08-02',
        localTime: '14:00',
        sortableLocalDateTime: '2026-08-02T14:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'wk-b',
        filmKey: 'beta',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-05',
        localTime: '18:00',
        sortableLocalDateTime: '2026-08-05T18:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'beyond',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-08',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-08T19:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'variant-show',
        filmKey: 'variant-imax',
        theaterId: 't3',
        theaterName: 'Theater Three',
        localDate: '2026-08-01',
        localTime: '20:00',
        sortableLocalDateTime: '2026-08-01T20:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'remake-show',
        filmKey: 'remake',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-01',
        localTime: '22:00',
        sortableLocalDateTime: '2026-08-01T22:00',
        formatLabels: ['Digital'],
      },
    ],
  };
}

function evaluate(home, filters, storage = null) {
  return evaluateBrowseFilters(home, filters, { now: NOW, storage });
}

// DATE (1–9)
test('date: today eligibility', () => {
  const result = evaluate(sampleHome(), { dateSelection: { mode: 'today' } });
  assert.deepEqual(
    result.opportunities.map((o) => o.opportunityKey).sort(),
    ['remake-show', 'today-a', 'today-b', 'today-g', 'variant-show'],
  );
});

test('date: tomorrow eligibility', () => {
  const result = evaluate(sampleHome(), { dateSelection: { mode: 'tomorrow' } });
  assert.deepEqual(result.opportunities.map((o) => o.opportunityKey), ['tm-a']);
});

test('date: week eligibility', () => {
  const result = evaluate(sampleHome(), { dateSelection: { mode: 'week' } });
  const keys = result.opportunities.map((o) => o.opportunityKey).sort();
  assert.deepEqual(keys, [
    'remake-show',
    'tm-a',
    'today-a',
    'today-b',
    'today-g',
    'variant-show',
    'wk-b',
  ]);
});

test('date: exact date via range', () => {
  const result = evaluate(sampleHome(), {
    dateSelection: {
      mode: 'range',
      startDate: '2026-08-05',
      endDate: '2026-08-05',
    },
  });
  assert.deepEqual(result.opportunities.map((o) => o.opportunityKey), ['wk-b']);
});

test('date: contiguous date range', () => {
  const result = evaluate(sampleHome(), {
    dateSelection: {
      mode: 'range',
      startDate: '2026-08-02',
      endDate: '2026-08-05',
    },
  });
  assert.deepEqual(
    result.opportunities.map((o) => o.opportunityKey).sort(),
    ['tm-a', 'wk-b'],
  );
});

test('date: inclusive range boundaries', () => {
  const home = sampleHome();
  const eligible = listEligibleBrowseOpportunitiesForDateSelection(
    home,
    { mode: 'range', startDate: '2026-08-01', endDate: '2026-08-02' },
    NOW,
  );
  assert.ok(eligible.some((o) => o.localDate === '2026-08-01'));
  assert.ok(eligible.some((o) => o.localDate === '2026-08-02'));
});

test('date: today excludes started screenings', () => {
  const result = evaluate(sampleHome(), { dateSelection: { mode: 'today' } });
  assert.ok(!result.opportunities.some((o) => o.opportunityKey === 'today-past'));
});

test('date: future day does not exclude based on today time', () => {
  const result = evaluate(sampleHome(), { dateSelection: { mode: 'tomorrow' } });
  assert.equal(result.opportunities[0].localTime, '14:00');
});

test('date: out-of-horizon range clamps safely', () => {
  const home = sampleHome();
  const horizon = getBrowseOpportunityDateHorizon(home);
  assert.equal(horizon.minDate, '2026-08-01');
  assert.equal(horizon.maxDate, '2026-08-08');
  const bounds = resolveBrowseDateBounds(
    { mode: 'range', startDate: '2026-09-01', endDate: '2026-09-10' },
    NOW,
  );
  const clamped = clampBrowseDateBounds(bounds, horizon);
  assert.equal(clamped.hasIntersection, false);
  const result = evaluate(home, {
    dateSelection: { mode: 'range', startDate: '2026-09-01', endDate: '2026-09-10' },
  });
  assert.equal(result.opportunities.length, 0);
  assert.equal(result.emptyReason, 'no_date_results');
});

// TIME (10–18)
test('time: morning preset', () => {
  const opp = { localTime: '11:30' };
  assert.equal(opportunityMatchesBrowseTime(opp, { preset: 'morning', customStartMin: null, customEndMin: null }), true);
  assert.equal(opportunityMatchesBrowseTime({ localTime: '12:00' }, { preset: 'morning', customStartMin: null, customEndMin: null }), false);
});

test('time: afternoon preset', () => {
  assert.equal(opportunityMatchesBrowseTime({ localTime: '16:30' }, { preset: 'afternoon', customStartMin: null, customEndMin: null }), true);
  assert.equal(opportunityMatchesBrowseTime({ localTime: '17:00' }, { preset: 'afternoon', customStartMin: null, customEndMin: null }), false);
});

test('time: evening preset', () => {
  assert.equal(opportunityMatchesBrowseTime({ localTime: '19:00' }, { preset: 'evening', customStartMin: null, customEndMin: null }), true);
  assert.equal(opportunityMatchesBrowseTime({ localTime: '21:00' }, { preset: 'evening', customStartMin: null, customEndMin: null }), false);
});

test('time: late preset', () => {
  assert.equal(opportunityMatchesBrowseTime({ localTime: '21:15' }, { preset: 'late', customStartMin: null, customEndMin: null }), true);
  assert.equal(opportunityMatchesBrowseTime({ localTime: '20:59' }, { preset: 'late', customStartMin: null, customEndMin: null }), false);
});

test('time: custom lower bound', () => {
  assert.equal(
    opportunityMatchesBrowseTime({ localTime: '18:00' }, { preset: 'custom', customStartMin: 18 * 60, customEndMin: null }),
    true,
  );
  assert.equal(
    opportunityMatchesBrowseTime({ localTime: '17:59' }, { preset: 'custom', customStartMin: 18 * 60, customEndMin: null }),
    false,
  );
});

test('time: custom upper bound', () => {
  assert.equal(
    opportunityMatchesBrowseTime({ localTime: '20:00' }, { preset: 'custom', customStartMin: null, customEndMin: 20 * 60 }),
    true,
  );
  assert.equal(
    opportunityMatchesBrowseTime({ localTime: '20:01' }, { preset: 'custom', customStartMin: null, customEndMin: 20 * 60 }),
    false,
  );
});

test('time: custom both bounds', () => {
  const time = { preset: 'custom', customStartMin: 17 * 60, customEndMin: 20 * 60 };
  assert.equal(opportunityMatchesBrowseTime({ localTime: '19:00' }, time), true);
  assert.equal(opportunityMatchesBrowseTime({ localTime: '16:59' }, time), false);
  assert.equal(opportunityMatchesBrowseTime({ localTime: '20:01' }, time), false);
});

test('time: inclusive custom boundaries', () => {
  const time = { preset: 'custom', customStartMin: 19 * 60, customEndMin: 19 * 60 };
  assert.equal(opportunityMatchesBrowseTime({ localTime: '19:00' }, time), true);
});

test('time: invalid cross-midnight custom range rejected', () => {
  const time = { preset: 'custom', customStartMin: 22 * 60, customEndMin: 2 * 60 };
  assert.equal(isValidBrowseCustomTimeRange(time), false);
  const result = evaluate(sampleHome(), { time });
  assert.equal(result.opportunities.length, 0);
  assert.equal(result.emptyReason, 'filtered_zero');
});

// THEATERS (19–23)
test('theaters: single theater', () => {
  const result = evaluate(sampleHome(), { theaterIds: ['t2'] });
  assert.ok(result.opportunities.every((o) => o.theaterId === 't2'));
});

test('theaters: multiple theater OR', () => {
  const result = evaluate(sampleHome(), { theaterIds: ['t1', 't3'] });
  assert.ok(result.opportunities.every((o) => ['t1', 't3'].includes(o.theaterId)));
  assert.ok(result.opportunities.length > 1);
});

test('theaters: favorites only', () => {
  const storage = memoryStorage();
  favoriteTheater(storage, { theaterId: 't2' });
  const result = evaluate(sampleHome(), { favoritesOnly: true }, storage);
  assert.ok(result.opportunities.every((o) => o.theaterId === 't2'));
});

test('theaters: favorites plus explicit IDs intersection', () => {
  const storage = memoryStorage();
  favoriteTheater(storage, { theaterId: 't1' });
  favoriteTheater(storage, { theaterId: 't2' });
  const allowed = resolveAllowedTheaterIds(['t1', 't3'], true, ['t1', 't2']);
  assert.deepEqual([...allowed], ['t1']);
});

test('theaters: empty favorites produces zero', () => {
  const result = evaluate(sampleHome(), { favoritesOnly: true }, memoryStorage());
  assert.equal(result.opportunities.length, 0);
  assert.equal(result.emptyReason, 'favorites_empty');
});

// FORMATS (24–26)
test('formats: one format', () => {
  const result = evaluate(sampleHome(), { formatKeys: ['imax'] });
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].opportunityKey, 'today-a');
});

test('formats: multiple formats OR', () => {
  const result = evaluate(sampleHome(), { formatKeys: ['imax', '35mm'] });
  assert.deepEqual(
    result.opportunities.map((o) => o.opportunityKey).sort(),
    ['today-a', 'today-g'],
  );
});

test('formats: normalized keys', () => {
  assert.equal(
    opportunityMatchesBrowseFormats(
      { formatLabels: ['imax-at-amc'] },
      ['imax'],
    ),
    true,
  );
});

// SAVED / SEEN / NI (27–36)
test('user state: saved only', () => {
  const storage = memoryStorage();
  saveFilm(storage, filmRefFromHomeFilm({ filmKey: 'alpha', title: 'Alpha' }));
  const result = evaluate(sampleHome(), { savedMode: 'saved' }, storage);
  assert.ok(result.opportunities.every((o) => o.filmKey === 'alpha'));
});

test('user state: not saved', () => {
  const storage = memoryStorage();
  saveFilm(storage, filmRefFromHomeFilm({ filmKey: 'alpha', title: 'Alpha' }));
  const result = evaluate(sampleHome(), { savedMode: 'not_saved' }, storage);
  assert.ok(!result.opportunities.some((o) => o.filmKey === 'alpha'));
});

test('user state: seen only', () => {
  const storage = memoryStorage();
  markFilmSeen(storage, filmRefFromHomeFilm({ filmKey: 'beta', title: 'Beta' }));
  const result = evaluate(sampleHome(), { seenMode: 'seen' }, storage);
  assert.ok(result.opportunities.every((o) => o.filmKey === 'beta'));
});

test('user state: not seen', () => {
  const storage = memoryStorage();
  markFilmSeen(storage, filmRefFromHomeFilm({ filmKey: 'beta', title: 'Beta' }));
  const result = evaluate(sampleHome(), { seenMode: 'not_seen' }, storage);
  assert.ok(!result.opportunities.some((o) => o.filmKey === 'beta'));
});

test('user state: not interested any is neutral', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, filmRefFromHomeFilm({ filmKey: 'gamma', title: 'Gamma' }));
  const defaults = createDefaultBrowseFilters(NOW);
  assert.equal(defaults.notInterestedMode, 'any');
  const result = evaluate(sampleHome(), {}, storage);
  assert.ok(result.opportunities.some((o) => o.filmKey === 'gamma'));
});

test('user state: hide not interested', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, filmRefFromHomeFilm({ filmKey: 'gamma', title: 'Gamma' }));
  const result = evaluate(sampleHome(), { notInterestedMode: 'hide' }, storage);
  assert.ok(!result.opportunities.some((o) => o.filmKey === 'gamma'));
});

test('user state: only not interested', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, filmRefFromHomeFilm({ filmKey: 'gamma', title: 'Gamma' }));
  const result = evaluate(sampleHome(), { notInterestedMode: 'only' }, storage);
  assert.ok(result.opportunities.every((o) => o.filmKey === 'gamma'));
});

test('user state: saved and not seen', () => {
  const storage = memoryStorage();
  saveFilm(storage, filmRefFromHomeFilm({ filmKey: 'alpha', title: 'Alpha' }));
  markFilmSeen(storage, filmRefFromHomeFilm({ filmKey: 'beta', title: 'Beta' }));
  const result = evaluate(
    sampleHome(),
    { savedMode: 'saved', seenMode: 'not_seen' },
    storage,
  );
  assert.deepEqual(result.opportunities.map((o) => o.filmKey), ['alpha']);
});

test('user state: saved, not seen, hide NI', () => {
  const storage = memoryStorage();
  saveFilm(storage, filmRefFromHomeFilm({ filmKey: 'alpha', title: 'Alpha' }));
  markFilmNotInterested(storage, filmRefFromHomeFilm({ filmKey: 'alpha', title: 'Alpha' }));
  const result = evaluate(
    sampleHome(),
    { savedMode: 'saved', seenMode: 'not_seen', notInterestedMode: 'hide' },
    storage,
  );
  assert.equal(result.opportunities.length, 0);
});

test('user state: identity uses filmRef not title', () => {
  const storage = memoryStorage();
  saveFilm(
    storage,
    filmRefFromHomeFilm({
      filmKey: 'parent-shared',
      title: 'Shared Title',
    }),
  );
  const parent = sampleHome().films.find((f) => f.filmKey === 'parent-shared');
  const variant = sampleHome().films.find((f) => f.filmKey === 'variant-imax');
  const remake = sampleHome().films.find((f) => f.filmKey === 'remake');
  assert.equal(filmPassesBrowseUserStateFilters(variant, storage, { savedMode: 'saved', seenMode: 'any', notInterestedMode: 'any' }), true);
  assert.equal(filmPassesBrowseUserStateFilters(remake, storage, { savedMode: 'saved', seenMode: 'any', notInterestedMode: 'any' }), false);
  assert.equal(filmPassesBrowseUserStateFilters(parent, storage, { savedMode: 'saved', seenMode: 'any', notInterestedMode: 'any' }), true);
});

// COMPOSITION (37–38)
test('composition: AND across dimensions', () => {
  const result = evaluate(sampleHome(), {
    dateSelection: { mode: 'today' },
    time: { preset: 'evening', customStartMin: null, customEndMin: null },
    theaterIds: ['t1'],
    formatKeys: ['imax'],
  });
  assert.deepEqual(result.opportunities.map((o) => o.opportunityKey), ['today-a']);
});

test('composition: evaluate returns same filtered set used for film groups', () => {
  const result = evaluate(sampleHome(), {
    dateSelection: { mode: 'week' },
    time: { preset: 'any', customStartMin: null, customEndMin: null },
    theaterIds: ['t1'],
  });
  const keysFromOpps = new Set(result.opportunities.map((o) => o.opportunityKey));
  const keysFromGroups = new Set(
    result.filmGroups.flatMap((f) => f.showtimes.map((s) => s.opportunityKey)),
  );
  assert.deepEqual(keysFromGroups, keysFromOpps);
  assert.equal(result.resultCount, result.opportunities.length);
  assert.equal(result.filmCount, result.filmGroups.length);
});

// SORT (39–44)
test('sort: earliest', () => {
  const home = sampleHome();
  const result = evaluate(home, { sortMode: 'earliest' });
  for (let i = 1; i < result.filmGroups.length; i += 1) {
    const prev = result.filmGroups[i - 1];
    const curr = result.filmGroups[i];
    if (prev.earliestSortable !== curr.earliestSortable) {
      assert.ok(prev.earliestSortable <= curr.earliestSortable);
    } else {
      assert.ok(prev.title.localeCompare(curr.title) <= 0);
    }
  }
});

test('sort: title A–Z', () => {
  const result = evaluate(sampleHome(), { sortMode: 'title_az' });
  const titles = result.filmGroups.map((f) => f.title);
  assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)));
});

test('sort: shortest runtime', () => {
  const groups = sortBrowseFilmGroups(
    [
      { title: 'Long', runtimeMin: 120, earliestSortable: '2026-08-01T19:00', filmKey: 'a' },
      { title: 'Short', runtimeMin: 90, earliestSortable: '2026-08-01T20:00', filmKey: 'b' },
    ],
    'shortest',
  );
  assert.equal(groups[0].title, 'Short');
});

test('sort: longest runtime', () => {
  const groups = sortBrowseFilmGroups(
    [
      { title: 'Long', runtimeMin: 120, earliestSortable: '2026-08-01T19:00', filmKey: 'a' },
      { title: 'Short', runtimeMin: 90, earliestSortable: '2026-08-01T20:00', filmKey: 'b' },
    ],
    'longest',
  );
  assert.equal(groups[0].title, 'Long');
});

test('sort: missing runtime last', () => {
  const groups = sortBrowseFilmGroups(
    [
      { title: 'Missing', runtimeMin: null, earliestSortable: '2026-08-01T10:00', filmKey: 'm' },
      { title: 'Known', runtimeMin: 90, earliestSortable: '2026-08-01T20:00', filmKey: 'k' },
    ],
    'shortest',
  );
  assert.equal(groups[0].title, 'Known');
  assert.equal(groups[1].title, 'Missing');
});

test('sort: stable tie-breakers', () => {
  const groups = sortBrowseFilmGroups(
    [
      { title: 'B', runtimeMin: 90, earliestSortable: '2026-08-01T19:00', filmKey: 'b' },
      { title: 'A', runtimeMin: 90, earliestSortable: '2026-08-01T19:00', filmKey: 'a' },
    ],
    'shortest',
  );
  assert.equal(groups[0].title, 'A');
});

// ACTIVE COUNT (45–47)
test('active count: dimensions not selection counts', () => {
  const filters = normalizeBrowseFilters({
    time: { preset: 'evening', customStartMin: null, customEndMin: null },
    theaterIds: ['t1', 't2'],
    savedMode: 'saved',
  });
  assert.equal(countActiveBrowseFilterDimensions(filters), 3);
});

test('active count: default NI any does not count', () => {
  const filters = createDefaultBrowseFilters(NOW);
  assert.equal(filters.notInterestedMode, 'any');
  assert.equal(countActiveBrowseFilterDimensions(filters), 0);
});

test('active count: hide NI counts as one', () => {
  const filters = normalizeBrowseFilters({ notInterestedMode: 'hide' });
  assert.equal(countActiveBrowseFilterDimensions(filters), 1);
});

// BACKWARD COMPAT (48–50)
test('backward compat: legacy browseUi normalizes without error', () => {
  const legacy = {
    dateMode: 'tomorrow',
    theaterIds: ['t2'],
    formatKeys: ['digital'],
    timeRangeId: 'afternoon',
    expandedFilmKey: 'alpha',
    scrollY: 42,
    weirdField: true,
  };
  const normalized = normalizeLegacyBrowseUi(legacy, NOW);
  assert.equal(normalized.dateSelection.mode, 'tomorrow');
  assert.deepEqual(normalized.theaterIds, ['t2']);
  assert.deepEqual(normalized.formatKeys, ['digital']);
  assert.equal(normalized.time.preset, 'afternoon');
  assert.equal(normalized.expandedFilmKey, 'alpha');
  assert.equal(normalized.scrollY, 42);
  assert.doesNotThrow(() => evaluateBrowseFilters(sampleHome(), normalized, { now: NOW }));
});

test('backward compat: format deep-link state still works', () => {
  const legacy = createDefaultShowtimesBrowseUi();
  legacy.formatKeys = ['imax'];
  const normalized = normalizeBrowseFilters(legacy, NOW);
  const result = evaluate(sampleHome(), normalized);
  assert.equal(result.opportunities.length, 1);
  assert.equal(browseFiltersToLegacyUi(normalized).formatKeys[0], 'imax');
});

test('backward compat: default browse behavior unchanged', () => {
  const legacy = createDefaultShowtimesBrowseUi();
  const presentation = buildShowtimesBrowsePresentation(sampleHome(), legacy, {
    now: NOW,
  });
  const engine = evaluate(sampleHome(), normalizeLegacyBrowseUi(legacy, NOW));
  assert.equal(presentation.filteredCount, engine.resultCount);
  assert.deepEqual(
    presentation.films.map((f) => f.filmKey),
    engine.filmGroups.map((f) => f.filmKey),
  );
});

test('summary helper builds phrases without wiring UI', () => {
  const summary = buildBrowseFilterSummaryPhrases(
    normalizeBrowseFilters({
      dateSelection: { mode: 'today' },
      time: { preset: 'evening', customStartMin: null, customEndMin: null },
      theaterIds: ['t1', 't2'],
      savedMode: 'saved',
    }),
    { maxPhrases: 4 },
  );
  assert.match(summary.summary, /Today/);
  assert.match(summary.summary, /Evening/);
  assert.match(summary.summary, /2 theaters/);
  assert.match(summary.summary, /Saved/);
});

test('theater matcher respects allowed set', () => {
  const allowed = new Set(['t1']);
  assert.equal(opportunityMatchesBrowseTheater({ theaterId: 't1' }, allowed), true);
  assert.equal(opportunityMatchesBrowseTheater({ theaterId: 't2' }, allowed), false);
  assert.equal(opportunityMatchesBrowseTheater({ theaterId: 't2' }, null), true);
});
