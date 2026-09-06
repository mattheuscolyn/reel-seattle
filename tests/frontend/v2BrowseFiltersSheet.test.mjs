import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { filmRefFromHomeFilm } from '../../v2/save/filmRefFromFilm.js';
import { favoriteTheater } from '../../v2/stores/favoriteTheatersStore.js';
import { saveFilm } from '../../v2/stores/savedFilmsStore.js';
import {
  countActiveBrowseFilterDimensions,
  evaluateBrowseFilters,
} from '../../v2/showtimes/browseFilterEngine.js';
import {
  browseEmptyMessageForReason,
  browseFiltersToNavUi,
  cloneBrowseSheetDraft,
  createDefaultBrowseFilters,
  mergeBrowseSheetDraft,
  normalizeBrowseFilters,
  normalizeLegacyBrowseUi,
  resetBrowseSheetDraft,
} from '../../v2/showtimes/browseFilterState.js';
import {
  browseMinutesToTimeInput,
  browseTimeInputToMinutes,
  formatBrowseCustomTimeSummary,
} from '../../v2/showtimes/browseFilterSheetUtils.js';
import {
  buildShowtimesBrowsePresentation,
  createDefaultShowtimesBrowseUi,
  ensureSelectedBrowseFormatOptions,
  listBrowseFormatFilterOptions,
} from '../../v2/showtimes/showtimesBrowseModel.js';
import { resolveBrowseShowtimeOpportunity } from '../../v2/showtimes/showtimeActionSheetModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
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
      { filmKey: 'gamma', title: 'Gamma', runtimeMin: 80 },
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
        theaterId: 't3',
        theaterName: 'Theater Three',
        localDate: '2026-08-02',
        localTime: '14:00',
        sortableLocalDateTime: '2026-08-02T14:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 't4-a',
        filmKey: 'beta',
        theaterId: 't4',
        theaterName: 'Theater Four',
        localDate: '2026-08-01',
        localTime: '18:00',
        sortableLocalDateTime: '2026-08-01T18:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 't5-a',
        filmKey: 'beta',
        theaterId: 't5',
        theaterName: 'Theater Five',
        localDate: '2026-08-01',
        localTime: '18:30',
        sortableLocalDateTime: '2026-08-01T18:30',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 't6-a',
        filmKey: 'beta',
        theaterId: 't6',
        theaterName: 'Theater Six',
        localDate: '2026-08-01',
        localTime: '19:30',
        sortableLocalDateTime: '2026-08-01T19:30',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 't7-a',
        filmKey: 'beta',
        theaterId: 't7',
        theaterName: 'Theater Seven',
        localDate: '2026-08-01',
        localTime: '20:00',
        sortableLocalDateTime: '2026-08-01T20:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 't8-a',
        filmKey: 'beta',
        theaterId: 't8',
        theaterName: 'Theater Eight',
        localDate: '2026-08-01',
        localTime: '20:30',
        sortableLocalDateTime: '2026-08-01T20:30',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 't9-a',
        filmKey: 'beta',
        theaterId: 't9',
        theaterName: 'Theater Nine',
        localDate: '2026-08-01',
        localTime: '17:45',
        sortableLocalDateTime: '2026-08-01T17:45',
        formatLabels: ['Digital'],
      },
    ],
  };
}

// OPEN / DRAFT / APPLY / RESET helpers (1–13)
test('draft initializes from applied and close semantics discard via re-clone', () => {
  const applied = normalizeBrowseFilters(
    {
      time: { preset: 'evening', customStartMin: null, customEndMin: null },
      theaterIds: ['t1'],
      savedMode: 'saved',
    },
    NOW,
  );
  const draft = cloneBrowseSheetDraft(applied);
  assert.equal(draft.time.preset, 'evening');
  assert.deepEqual(draft.theaterIds, ['t1']);
  assert.equal(draft.savedMode, 'saved');

  draft.time.preset = 'morning';
  draft.theaterIds = ['t2'];
  // Discard = re-clone applied (sheet close path)
  const discarded = cloneBrowseSheetDraft(applied);
  assert.equal(discarded.time.preset, 'evening');
  assert.deepEqual(discarded.theaterIds, ['t1']);
});

test('draft edits do not change applied evaluation until merge/apply', () => {
  const home = sampleHome();
  const applied = normalizeBrowseFilters(
    { dateSelection: { mode: 'today' } },
    NOW,
  );
  const draft = cloneBrowseSheetDraft(applied);
  draft.theaterIds = ['t2'];
  draft.time = { preset: 'afternoon', customStartMin: null, customEndMin: null };

  const appliedEval = evaluateBrowseFilters(home, applied, { now: NOW });
  const draftPreview = evaluateBrowseFilters(
    home,
    mergeBrowseSheetDraft(applied, draft),
    { now: NOW },
  );
  assert.notEqual(appliedEval.resultCount, draftPreview.resultCount);
  assert.ok(appliedEval.resultCount > draftPreview.resultCount);

  const afterApply = evaluateBrowseFilters(
    home,
    mergeBrowseSheetDraft(applied, draft),
    { now: NOW },
  );
  assert.equal(afterApply.resultCount, draftPreview.resultCount);
});

test('Show N preview count updates live from draft merge', () => {
  const home = sampleHome();
  const applied = createDefaultBrowseFilters(NOW);
  let draft = cloneBrowseSheetDraft(applied);
  let preview = evaluateBrowseFilters(
    home,
    mergeBrowseSheetDraft(applied, draft),
    { now: NOW },
  ).resultCount;
  assert.ok(preview > 0);

  draft = {
    ...draft,
    time: { preset: 'evening', customStartMin: null, customEndMin: null },
  };
  const eveningCount = evaluateBrowseFilters(
    home,
    mergeBrowseSheetDraft(applied, draft),
    { now: NOW },
  ).resultCount;
  assert.ok(eveningCount < preview);
});

test('applied state persists after reopen (nav ui round-trip)', () => {
  const applied = normalizeBrowseFilters(
    {
      time: { preset: 'late', customStartMin: null, customEndMin: null },
      theaterIds: ['t1', 't2'],
      favoritesOnly: true,
      savedMode: 'saved',
      seenMode: 'not_seen',
      notInterestedMode: 'hide',
      formatKeys: ['imax'],
    },
    NOW,
  );
  const nav = browseFiltersToNavUi(applied);
  const restored = normalizeBrowseFilters(nav, NOW);
  assert.equal(restored.time.preset, 'late');
  assert.deepEqual(restored.theaterIds, ['t1', 't2']);
  assert.equal(restored.favoritesOnly, true);
  assert.equal(restored.savedMode, 'saved');
  assert.equal(restored.seenMode, 'not_seen');
  assert.equal(restored.notInterestedMode, 'hide');
  assert.deepEqual(restored.formatKeys, ['imax']);
});

test('reset returns draft sheet filters to defaults; date and sort unchanged', () => {
  const applied = normalizeBrowseFilters(
    {
      dateMode: 'tomorrow',
      sortMode: 'title_az',
      time: { preset: 'evening', customStartMin: null, customEndMin: null },
      theaterIds: ['t1'],
      favoritesOnly: true,
      formatKeys: ['imax'],
      savedMode: 'saved',
      seenMode: 'seen',
      notInterestedMode: 'hide',
    },
    NOW,
  );
  const reset = resetBrowseSheetDraft(applied);
  assert.equal(reset.time.preset, 'any');
  assert.deepEqual(reset.theaterIds, []);
  assert.equal(reset.favoritesOnly, false);
  assert.deepEqual(reset.formatKeys, []);
  assert.equal(reset.savedMode, 'any');
  assert.equal(reset.seenMode, 'any');
  assert.equal(reset.notInterestedMode, 'any');
  assert.equal(reset.dateSelection.mode, 'tomorrow');
  assert.equal(reset.sortMode, 'title_az');

  // Reset does not apply until merge into applied
  assert.equal(applied.time.preset, 'evening');
  assert.equal(applied.savedMode, 'saved');
});

// TIME (14–16)
test('time preset and custom exclusivity + wiring', () => {
  assert.equal(browseTimeInputToMinutes('19:30'), 19 * 60 + 30);
  assert.equal(browseMinutesToTimeInput(19 * 60 + 30), '19:30');
  assert.equal(
    formatBrowseCustomTimeSummary({ customStartMin: null, customEndMin: null }),
    'Any start – Any end',
  );

  const applied = createDefaultBrowseFilters(NOW);
  let draft = cloneBrowseSheetDraft(applied);
  draft.time = { preset: 'evening', customStartMin: null, customEndMin: null };
  assert.equal(draft.time.customStartMin, null);

  draft.time = {
    preset: 'custom',
    customStartMin: 18 * 60,
    customEndMin: 20 * 60,
  };
  assert.equal(draft.time.preset, 'custom');
  // Selecting preset clears custom mins (sheet setTimePreset behavior)
  draft.time = { preset: 'morning', customStartMin: null, customEndMin: null };
  assert.equal(draft.time.customStartMin, null);
  assert.equal(draft.time.customEndMin, null);
});

// THEATERS (17–21)
test('theater filters: single, multi OR, favorites, intersection, show-all need', () => {
  const home = sampleHome();
  const storage = memoryStorage();
  favoriteTheater(storage, { theaterId: 't1' });
  favoriteTheater(storage, { theaterId: 't2' });

  const single = evaluateBrowseFilters(
    home,
    { theaterIds: ['t2'] },
    { now: NOW, storage },
  );
  assert.ok(single.opportunities.every((o) => o.theaterId === 't2'));

  const multi = evaluateBrowseFilters(
    home,
    { theaterIds: ['t1', 't3'] },
    { now: NOW, storage },
  );
  assert.ok(multi.opportunities.every((o) => ['t1', 't3'].includes(o.theaterId)));

  const favOnly = evaluateBrowseFilters(
    home,
    { favoritesOnly: true },
    { now: NOW, storage },
  );
  assert.ok(favOnly.opportunities.every((o) => ['t1', 't2'].includes(o.theaterId)));

  const intersection = evaluateBrowseFilters(
    home,
    { favoritesOnly: true, theaterIds: ['t1', 't3'] },
    { now: NOW, storage },
  );
  assert.ok(intersection.opportunities.every((o) => o.theaterId === 't1'));

  const presentation = buildShowtimesBrowsePresentation(
    home,
    createDefaultBrowseFilters(NOW),
    { now: NOW, storage },
  );
  assert.ok(presentation.theaterOptions.length > 7);
});

// YOUR FILMS (22–26)
test('your films modes, defaults Any, and Saved + Not seen composition', () => {
  const defaults = createDefaultBrowseFilters(NOW);
  assert.equal(defaults.savedMode, 'any');
  assert.equal(defaults.seenMode, 'any');
  assert.equal(defaults.notInterestedMode, 'any');

  const home = sampleHome();
  const storage = memoryStorage();
  saveFilm(storage, filmRefFromHomeFilm({ filmKey: 'alpha', title: 'Alpha' }));

  const saved = evaluateBrowseFilters(
    home,
    { savedMode: 'saved', seenMode: 'not_seen' },
    { now: NOW, storage },
  );
  assert.ok(saved.opportunities.every((o) => o.filmKey === 'alpha'));

  const hideNi = normalizeBrowseFilters({ notInterestedMode: 'hide' }, NOW);
  assert.equal(hideNi.notInterestedMode, 'hide');
  assert.equal(countActiveBrowseFilterDimensions(hideNi), 1);
});

// FORMATS (27–29)
test('formats options, multiselect, and deep-link zero-count preservation', () => {
  const home = sampleHome();
  const presentation = buildShowtimesBrowsePresentation(
    home,
    normalizeBrowseFilters(
      { formatKeys: ['imax', 'dolby cinema'] },
      NOW,
    ),
    { now: NOW },
  );
  assert.ok(presentation.formatOptions.some((f) => f.key === 'imax'));
  const ensured = ensureSelectedBrowseFormatOptions(
    listBrowseFormatFilterOptions(presentation.evaluation.eligibleOpportunities),
    ['open captions'],
  );
  assert.ok(ensured.some((f) => f.key === 'open captions' && f.count === 0));

  const multi = evaluateBrowseFilters(
    home,
    { formatKeys: ['imax', '35mm'] },
    { now: NOW },
  );
  assert.deepEqual(
    multi.opportunities.map((o) => o.opportunityKey).sort(),
    ['today-a', 'today-g'],
  );
});

// COUNT (30–32)
test('Filters · N counts applied dimensions only', () => {
  const eveningTheatersSaved = normalizeBrowseFilters(
    {
      time: { preset: 'evening', customStartMin: null, customEndMin: null },
      theaterIds: ['t1', 't2'],
      savedMode: 'saved',
    },
    NOW,
  );
  assert.equal(countActiveBrowseFilterDimensions(eveningTheatersSaved), 3);

  const twoTheaters = normalizeBrowseFilters({ theaterIds: ['t1', 't2'] }, NOW);
  assert.equal(countActiveBrowseFilterDimensions(twoTheaters), 1);

  const niAny = createDefaultBrowseFilters(NOW);
  assert.equal(niAny.notInterestedMode, 'any');
  assert.equal(countActiveBrowseFilterDimensions(niAny), 0);
});

// RESULTS (33–35)
test('applied results come from evaluateBrowseFilters; card counts match', () => {
  const home = sampleHome();
  const filters = normalizeBrowseFilters(
    {
      time: { preset: 'evening', customStartMin: null, customEndMin: null },
      theaterIds: ['t1'],
    },
    NOW,
  );
  const evaluation = evaluateBrowseFilters(home, filters, { now: NOW });
  const presentation = buildShowtimesBrowsePresentation(home, filters, {
    now: NOW,
  });
  assert.equal(presentation.filteredCount, evaluation.resultCount);
  assert.deepEqual(
    presentation.films.map((f) => f.filmKey),
    evaluation.filmGroups.map((f) => f.filmKey),
  );
  for (const film of presentation.films) {
    assert.equal(
      film.showtimeCount,
      film.showtimes.length,
    );
    assert.ok(
      film.showtimes.every((st) =>
        evaluation.opportunities.some((o) => o.opportunityKey === st.opportunityKey),
      ),
    );
  }
});

// EMPTY (36–38)
test('empty reasons map to user-facing copy', () => {
  assert.equal(
    browseEmptyMessageForReason('filtered_zero'),
    'No showtimes match these filters.',
  );
  assert.equal(
    browseEmptyMessageForReason('saved_zero'),
    'No saved films have showtimes in this period.',
  );
  assert.equal(
    browseEmptyMessageForReason('favorites_empty'),
    'Add favorite theaters to use this filter.',
  );

  const home = sampleHome();
  const storage = memoryStorage();
  const favoritesEmpty = buildShowtimesBrowsePresentation(
    home,
    { favoritesOnly: true },
    { now: NOW, storage },
  );
  assert.equal(favoritesEmpty.emptyReason, 'favorites_empty');
  assert.equal(
    favoritesEmpty.emptyMessage,
    'Add favorite theaters to use this filter.',
  );

  const savedZero = buildShowtimesBrowsePresentation(
    home,
    { savedMode: 'saved' },
    { now: NOW, storage },
  );
  assert.equal(savedZero.emptyReason, 'saved_zero');
});

// REGRESSION (39–42)
test('ShowtimeActionSheet still resolves from filtered browse rows', () => {
  const home = sampleHome();
  const presentation = buildShowtimesBrowsePresentation(
    home,
    { theaterIds: ['t1'], timeRangeId: 'evening' },
    { now: NOW },
  );
  const film = presentation.films[0];
  const row = film.showtimes[0];
  const opportunity = resolveBrowseShowtimeOpportunity({ row, homeData: home });
  assert.ok(opportunity);
  assert.equal(opportunity.opportunityKey, row.opportunityKey);
});

test('Formats deep link legacy browseUi still filters', () => {
  const legacy = {
    ...createDefaultShowtimesBrowseUi(),
    dateMode: 'week',
    formatKeys: ['imax'],
  };
  const presentation = buildShowtimesBrowsePresentation(sampleHome(), legacy, {
    now: NOW,
  });
  assert.ok(presentation.films.every((f) =>
    f.showtimes.some((s) => s.formatKeys.includes('imax')),
  ));
  assert.equal(normalizeLegacyBrowseUi(legacy, NOW).formatKeys[0], 'imax');
});

test('BrowseFiltersSheet renders dialog chrome when open', async () => {
  const configFile = join(ROOT, 'vite.v2.config.js');
  const server = await createServer({ configFile, logLevel: 'error' });
  try {
    const mod = await server.ssrLoadModule('/showtimes/BrowseFiltersSheet.jsx');
    const html = renderToString(
      React.createElement(mod.default, {
        open: true,
        appliedFilters: createDefaultBrowseFilters(NOW),
        homeData: sampleHome(),
        storage: memoryStorage(),
        now: NOW,
        onClose: () => {},
        onApply: () => {},
      }),
    );
    assert.match(html, /data-browse-filters-sheet="open"/);
    assert.match(html, /role="dialog"/);
    assert.match(html, /Refine your showtimes/);
    assert.match(html, /Your films/);
    assert.match(html, /Favorites only/);
    assert.match(html, /Show \d+ results/);
    assert.match(html, /Not Interested/);
    assert.match(html, /aria-pressed="true"/); // defaults Any selected
  } finally {
    await server.close();
  }
});

test('ShowtimesBrowseSurface uses Filters · N and no inline filter panel', async () => {
  const surfaceSrc = readFileSync(
    join(ROOT, 'v2/surfaces/ShowtimesBrowseSurface.jsx'),
    'utf8',
  );
  assert.match(surfaceSrc, /BrowseFiltersSheet/);
  assert.match(surfaceSrc, /Filters · \$\{activeFilterCount\}/);
  assert.doesNotMatch(surfaceSrc, /v2-stb-filters/);
  assert.doesNotMatch(surfaceSrc, /All theaters/);
  assert.doesNotMatch(surfaceSrc, /All formats/);

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
        },
      }),
    );
    assert.match(html, /Filters · 2/);
    assert.doesNotMatch(html, /v2-stb-filters/);
    assert.doesNotMatch(html, /All theaters/);
  } finally {
    await server.close();
  }
});
