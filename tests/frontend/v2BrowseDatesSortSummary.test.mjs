import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  buildBrowseFilterSummaryPhrases,
  countActiveBrowseFilterDimensions,
  evaluateBrowseFilters,
  sortBrowseFilmGroups,
} from '../../v2/showtimes/browseFilterEngine.js';
import {
  browseEmptyMessageForReason,
  browseFiltersToNavUi,
  cloneBrowseSheetDraft,
  createDefaultBrowseFilters,
  dateModeToDateSelection,
  mergeBrowseSheetDraft,
  normalizeBrowseFilters,
  normalizeLegacyBrowseUi,
  resetBrowseSheetDraft,
} from '../../v2/showtimes/browseFilterState.js';
import {
  clampIsoDateToHorizon,
  createBrowseDateDraftFromApplied,
  dateSelectionFromBrowseDateDraft,
  formatBrowseDateSummaryPhrase,
  formatBrowseHorizonLabel,
  formatBrowseShortDateRange,
  resetBrowseDateDraftToToday,
  validateBrowseDateDraft,
} from '../../v2/showtimes/browseDateSortUtils.js';
import {
  buildShowtimesBrowsePresentation,
  createDefaultShowtimesBrowseUi,
} from '../../v2/showtimes/showtimesBrowseModel.js';
import { getBrowseOpportunityDateHorizon } from '../../v2/showtimes/showtimeEligibility.js';
import { resolveBrowseShowtimeOpportunity } from '../../v2/showtimes/showtimeActionSheetModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = new Date('2026-08-01T22:00:00.000Z');

function sampleHome() {
  return {
    films: [
      { filmKey: 'alpha', title: 'Zeta Film', runtimeMin: 120 },
      { filmKey: 'beta', title: 'Alpha Film', runtimeMin: 90 },
      { filmKey: 'gamma', title: 'Middle', runtimeMin: null },
    ],
    opportunities: [
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
        opportunityKey: 'tm-a',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-02',
        localTime: '14:00',
        sortableLocalDateTime: '2026-08-02T14:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'aug5',
        filmKey: 'beta',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-05',
        localTime: '18:00',
        sortableLocalDateTime: '2026-08-05T18:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'aug6',
        filmKey: 'gamma',
        theaterId: 't2',
        theaterName: 'Theater Two',
        localDate: '2026-08-06',
        localTime: '20:00',
        sortableLocalDateTime: '2026-08-06T20:00',
        formatLabels: ['35mm'],
      },
    ],
  };
}

const HORIZON = { minDate: '2026-08-01', maxDate: '2026-08-06' };

// DATE UI / semantics (1–14)
test('Dates helpers: exact date, range, horizon, invalid order', () => {
  assert.equal(formatBrowseShortDateRange('2026-09-04', '2026-09-06'), 'Sep 4–6');
  assert.equal(formatBrowseShortDateRange('2026-09-29', '2026-10-02'), 'Sep 29–Oct 2');
  assert.match(formatBrowseHorizonLabel(HORIZON), /Showtimes available/);

  const exact = dateSelectionFromBrowseDateDraft({
    pickerMode: 'single',
    startDate: '2026-08-05',
    endDate: '2026-08-05',
  });
  assert.equal(exact.mode, 'range');
  assert.equal(exact.startDate, exact.endDate);

  const range = dateSelectionFromBrowseDateDraft({
    pickerMode: 'range',
    startDate: '2026-08-05',
    endDate: '2026-08-06',
  });
  assert.equal(range.startDate, '2026-08-05');
  assert.equal(range.endDate, '2026-08-06');

  assert.equal(clampIsoDateToHorizon('2026-07-01', HORIZON), '2026-08-01');
  assert.equal(clampIsoDateToHorizon('2026-09-01', HORIZON), '2026-08-06');

  const invalid = validateBrowseDateDraft(
    { pickerMode: 'range', startDate: '2026-08-06', endDate: '2026-08-05' },
    HORIZON,
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /End date must be on or after/);
});

test('date draft init/reset and quick chips replace custom Dates', () => {
  const appliedRange = normalizeBrowseFilters(
    {
      dateSelection: {
        mode: 'range',
        startDate: '2026-08-05',
        endDate: '2026-08-06',
      },
    },
    NOW,
  );
  const draft = createBrowseDateDraftFromApplied(appliedRange, HORIZON, NOW);
  assert.equal(draft.pickerMode, 'range');
  assert.equal(draft.startDate, '2026-08-05');

  const reset = resetBrowseDateDraftToToday(HORIZON, NOW);
  assert.equal(reset.pickerMode, 'single');
  assert.equal(reset.startDate, '2026-08-01');

  const today = normalizeBrowseFilters(
    {
      ...appliedRange,
      dateSelection: dateModeToDateSelection('today', NOW),
    },
    NOW,
  );
  assert.equal(today.dateSelection.mode, 'today');
  assert.notEqual(today.dateSelection.mode, 'range');
});

test('custom date survives nav ui round-trip', () => {
  const applied = normalizeBrowseFilters(
    {
      dateSelection: {
        mode: 'range',
        startDate: '2026-08-05',
        endDate: '2026-08-05',
      },
      sortMode: 'title_az',
    },
    NOW,
  );
  const restored = normalizeBrowseFilters(browseFiltersToNavUi(applied), NOW);
  assert.equal(restored.dateSelection.mode, 'range');
  assert.equal(restored.dateSelection.startDate, '2026-08-05');
  assert.equal(restored.sortMode, 'title_az');
});

test('exact-date and range results are correct; date-empty vs filtered-zero', () => {
  const home = sampleHome();
  const exact = evaluateBrowseFilters(
    home,
    {
      dateSelection: {
        mode: 'range',
        startDate: '2026-08-05',
        endDate: '2026-08-05',
      },
    },
    { now: NOW },
  );
  assert.deepEqual(
    exact.opportunities.map((o) => o.opportunityKey),
    ['aug5'],
  );

  const range = evaluateBrowseFilters(
    home,
    {
      dateSelection: {
        mode: 'range',
        startDate: '2026-08-05',
        endDate: '2026-08-06',
      },
    },
    { now: NOW },
  );
  assert.deepEqual(
    range.opportunities.map((o) => o.opportunityKey).sort(),
    ['aug5', 'aug6'],
  );

  const outOfHorizon = buildShowtimesBrowsePresentation(
    home,
    {
      dateSelection: {
        mode: 'range',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
      },
    },
    { now: NOW },
  );
  assert.equal(outOfHorizon.emptyReason, 'no_date_results');
  assert.equal(
    browseEmptyMessageForReason('no_date_results', 'range'),
    'No showtimes on these dates.',
  );

  const filtered = buildShowtimesBrowsePresentation(
    home,
    {
      dateSelection: dateModeToDateSelection('today', NOW),
      savedMode: 'saved',
    },
    { now: NOW },
  );
  assert.equal(filtered.emptyReason, 'saved_zero');
});

// SORT (15–23)
test('sort options apply and do not affect Filters · N', () => {
  const home = sampleHome();
  const base = normalizeBrowseFilters(
    { dateSelection: dateModeToDateSelection('today', NOW) },
    NOW,
  );
  assert.equal(base.sortMode, 'earliest');
  assert.equal(countActiveBrowseFilterDimensions(base), 0);

  const az = evaluateBrowseFilters(
    home,
    { ...base, sortMode: 'title_az' },
    { now: NOW },
  );
  assert.deepEqual(
    az.filmGroups.map((f) => f.title),
    ['Alpha Film', 'Zeta Film'],
  );

  const shortest = sortBrowseFilmGroups(
    [
      { title: 'Long', runtimeMin: 120, earliestSortable: 'a', filmKey: 'l' },
      { title: 'Short', runtimeMin: 90, earliestSortable: 'b', filmKey: 's' },
      { title: 'Missing', runtimeMin: null, earliestSortable: 'c', filmKey: 'm' },
    ],
    'longest',
  );
  assert.equal(shortest[0].title, 'Long');
  assert.equal(shortest[2].title, 'Missing');

  const withSort = normalizeBrowseFilters({ ...base, sortMode: 'longest' }, NOW);
  assert.equal(countActiveBrowseFilterDimensions(withSort), 0);
  assert.equal(
    normalizeBrowseFilters(browseFiltersToNavUi(withSort), NOW).sortMode,
    'longest',
  );
});

// SUMMARY (24–32)
test('summary phrases omit defaults and sort; support overflow', () => {
  assert.equal(formatBrowseDateSummaryPhrase({ mode: 'today' }), 'Today');
  assert.match(
    formatBrowseDateSummaryPhrase({
      mode: 'range',
      startDate: '2026-08-05',
      endDate: '2026-08-05',
    }),
    /Aug 5/,
  );

  const summary = buildBrowseFilterSummaryPhrases(
    normalizeBrowseFilters(
      {
        dateSelection: dateModeToDateSelection('today', NOW),
        time: { preset: 'evening', customStartMin: null, customEndMin: null },
        theaterIds: ['t1', 't2'],
        savedMode: 'saved',
        seenMode: 'not_seen',
        formatKeys: ['imax'],
      },
      NOW,
    ),
    { maxPhrases: 4 },
  );
  assert.match(summary.summary, /Today/);
  assert.match(summary.summary, /Evening/);
  assert.match(summary.summary, /2 theaters/);
  assert.match(summary.summary, /Saved|Not seen|\+1 more/);
  assert.doesNotMatch(summary.summary, /earliest|A–Z|Longest|Shortest/i);
  assert.doesNotMatch(summary.summary, /Any time|All theaters/);

  const defaults = buildBrowseFilterSummaryPhrases(
    createDefaultBrowseFilters(NOW),
  );
  assert.equal(defaults.summary, 'Today');
});

// RESET (33–35)
test('Filters Reset preserves date and sort; Today clears custom date', () => {
  const applied = normalizeBrowseFilters(
    {
      dateSelection: {
        mode: 'range',
        startDate: '2026-08-05',
        endDate: '2026-08-06',
      },
      sortMode: 'title_az',
      time: { preset: 'evening', customStartMin: null, customEndMin: null },
      savedMode: 'saved',
    },
    NOW,
  );
  const reset = resetBrowseSheetDraft(applied);
  assert.equal(reset.dateSelection.mode, 'range');
  assert.equal(reset.sortMode, 'title_az');
  assert.equal(reset.time.preset, 'any');
  assert.equal(reset.savedMode, 'any');

  const today = normalizeBrowseFilters(
    {
      ...applied,
      dateSelection: dateModeToDateSelection('today', NOW),
    },
    NOW,
  );
  assert.equal(today.dateSelection.mode, 'today');
});

// DEEP LINKS (36–38)
test('format/theater deep links and legacy dateMode still normalize', () => {
  const formatLink = normalizeBrowseFilters(
    {
      ...createDefaultShowtimesBrowseUi(),
      dateMode: 'week',
      formatKeys: ['imax'],
    },
    NOW,
  );
  assert.equal(formatLink.dateSelection.mode, 'week');
  assert.deepEqual(formatLink.formatKeys, ['imax']);

  const theaterLink = normalizeBrowseFilters(
    {
      ...createDefaultShowtimesBrowseUi(),
      dateMode: 'week',
      theaterIds: ['t1'],
    },
    NOW,
  );
  assert.deepEqual(theaterLink.theaterIds, ['t1']);

  const legacy = normalizeLegacyBrowseUi(
    { dateMode: 'tomorrow', timeRangeId: 'evening' },
    NOW,
  );
  assert.equal(legacy.dateSelection.mode, 'tomorrow');
  assert.equal(legacy.time.preset, 'evening');
});

// RESULTS / sorting on filtered groups (39–41)
test('sorting operates on filtered film groups', () => {
  const home = sampleHome();
  const evaluation = evaluateBrowseFilters(
    home,
    {
      dateSelection: dateModeToDateSelection('today', NOW),
      sortMode: 'title_az',
      theaterIds: ['t1', 't2'],
    },
    { now: NOW },
  );
  assert.deepEqual(
    evaluation.filmGroups.map((f) => f.title),
    ['Alpha Film', 'Zeta Film'],
  );
  assert.ok(
    evaluation.filmGroups.every((f) =>
      f.showtimes.every((s) =>
        evaluation.opportunities.some((o) => o.opportunityKey === s.opportunityKey),
      ),
    ),
  );
});

// REGRESSION (42–46)
test('Filters draft helpers and ShowtimeActionSheet still work', () => {
  const home = sampleHome();
  const applied = createDefaultBrowseFilters(NOW);
  const draft = cloneBrowseSheetDraft(applied);
  draft.time = { preset: 'evening', customStartMin: null, customEndMin: null };
  const preview = evaluateBrowseFilters(
    home,
    mergeBrowseSheetDraft(applied, draft),
    { now: NOW },
  );
  assert.ok(preview.resultCount < evaluateBrowseFilters(home, applied, { now: NOW }).resultCount);

  const presentation = buildShowtimesBrowsePresentation(
    home,
    { theaterIds: ['t1'], timeRangeId: 'evening' },
    { now: NOW },
  );
  const film = presentation.films[0];
  const row = film.showtimes[0];
  assert.ok(resolveBrowseShowtimeOpportunity({ row, homeData: home }));
});

test('BrowseDatePickerSheet and BrowseSortSheet render', async () => {
  const configFile = join(ROOT, 'vite.v2.config.js');
  const server = await createServer({ configFile, logLevel: 'error' });
  try {
    const dateMod = await server.ssrLoadModule(
      '/showtimes/BrowseDatePickerSheet.jsx',
    );
    const sortMod = await server.ssrLoadModule('/showtimes/BrowseSortSheet.jsx');
    const dateHtml = renderToString(
      React.createElement(dateMod.default, {
        open: true,
        appliedFilters: createDefaultBrowseFilters(NOW),
        homeData: sampleHome(),
        now: NOW,
        onClose: () => {},
        onApply: () => {},
      }),
    );
    assert.match(dateHtml, /data-browse-date-sheet="open"/);
    assert.match(dateHtml, /Single date/);
    assert.match(dateHtml, /Date range/);
    assert.match(dateHtml, /Show results/);

    const sortHtml = renderToString(
      React.createElement(sortMod.default, {
        open: true,
        sortMode: 'earliest',
        onClose: () => {},
        onSelect: () => {},
      }),
    );
    assert.match(sortHtml, /data-browse-sort-sheet="open"/);
    assert.match(sortHtml, /Sort showtimes/);
    assert.match(sortHtml, /Earliest showtime/);
    assert.match(sortHtml, /A–Z/);
  } finally {
    await server.close();
  }
});

test('ShowtimesBrowseSurface wires Dates, Sort, and summary', async () => {
  const surfaceSrc = readFileSync(
    join(ROOT, 'v2/surfaces/ShowtimesBrowseSurface.jsx'),
    'utf8',
  );
  assert.match(surfaceSrc, /BrowseDatePickerSheet/);
  assert.match(surfaceSrc, /BrowseSortSheet/);
  assert.match(surfaceSrc, /buildBrowseFilterSummaryPhrases/);
  assert.match(surfaceSrc, /\bDates\b/);
  assert.match(surfaceSrc, /\bSort\b/);
  assert.doesNotMatch(surfaceSrc, /View: Films/);
  assert.doesNotMatch(surfaceSrc, /Leaving soonest/);

  const homeSrc = readFileSync(join(ROOT, 'v2/HomeDestination.jsx'), 'utf8');
  assert.match(homeSrc, /BrowseShowtimesStrip|Browse Showtimes/);
  assert.equal(homeSrc.includes('Browse all showtimes'), false);
  const showtimesSrc = readFileSync(
    join(ROOT, 'v2/surfaces/ShowtimesSurface.jsx'),
    'utf8',
  );
  assert.ok(showtimesSrc.length > 100);

  const configFile = join(ROOT, 'vite.v2.config.js');
  const server = await createServer({ configFile, logLevel: 'error' });
  try {
    const mod = await server.ssrLoadModule('/surfaces/ShowtimesBrowseSurface.jsx');
    const html = renderToString(
      React.createElement(mod.default, {
        homeData: sampleHome(),
        loadStatus: 'ready',
        browseUi: {
          ...createDefaultShowtimesBrowseUi(),
          timeRangeId: 'evening',
          theaterIds: ['t1', 't2'],
          savedMode: 'saved',
        },
      }),
    );
    assert.match(html, /Filters · 3/);
    assert.match(html, /Dates/);
    assert.match(html, /Sort/);
    assert.match(html, /v2-stb-summary/);
    assert.match(html, /Today/);
    assert.match(html, /Evening/);
  } finally {
    await server.close();
  }
});

test('horizon helpers use opportunity data', () => {
  const horizon = getBrowseOpportunityDateHorizon(sampleHome());
  assert.equal(horizon.minDate, '2026-08-01');
  assert.equal(horizon.maxDate, '2026-08-06');
});
