import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSE_EXPANDED_SHOWTIME_PREVIEW_LIMIT,
  formatBrowseSeeAllShowtimesLabel,
  groupBrowseOpportunitiesByFilm,
  selectBrowseExpandedShowtimePreview,
} from '../../v2/showtimes/showtimesBrowseModel.js';
import {
  browseFiltersToFilmShowtimesSeed,
} from '../../v2/showtimes/browseFilterState.js';
import {
  createInitialNavState,
  navigateBack,
  openShowtimes,
  openShowtimesBrowse,
} from '../../v2/navigation/navState.js';
import { resolveHeaderBackLabel } from '../../v2/destinations.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BROWSE_SRC = readFileSync(
  join(ROOT, 'v2/surfaces/ShowtimesBrowseSurface.jsx'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const ST_SRC = readFileSync(join(ROOT, 'v2/surfaces/ShowtimesSurface.jsx'), 'utf8');

function st(opportunityKey, theaterId, theaterName, localDate, localTime) {
  return {
    opportunityKey,
    theaterId,
    theaterName,
    localDate,
    localTime,
    timeDisplay: localTime,
    formatLabels: [],
  };
}

function theater(theaterId, theaterName, showtimes) {
  return { theaterId, theaterName, showtimes };
}

function dateGroup(localDate, theaters) {
  return {
    localDate,
    dateLabel: localDate,
    theaters,
  };
}

function countPreviewChips(preview) {
  return preview.dateGroups.reduce(
    (sum, group) =>
      sum +
      group.theaters.reduce(
        (inner, block) => inner + block.showtimes.length,
        0,
      ),
    0,
  );
}

test('films under the cap show all showtimes and no See all CTA', () => {
  const groups = [
    dateGroup('2026-08-01', [
      theater('t1', 'Theater One', [
        st('a', 't1', 'Theater One', '2026-08-01', '16:00'),
        st('b', 't1', 'Theater One', '2026-08-01', '19:00'),
      ]),
      theater('t2', 'Theater Two', [
        st('c', 't2', 'Theater Two', '2026-08-01', '18:00'),
      ]),
    ]),
  ];
  const preview = selectBrowseExpandedShowtimePreview(groups);
  assert.equal(preview.totalShowtimeCount, 3);
  assert.equal(preview.previewShowtimeCount, 3);
  assert.equal(preview.hasMoreShowtimes, false);
  assert.equal(countPreviewChips(preview), 3);
  assert.equal(preview.dateGroups[0].theaters.length, 2);
});

test('films over the cap render at most 6 preview chips with theater breadth', () => {
  const groups = [
    dateGroup('2026-08-01', [
      theater('t1', 'Theater One', [
        st('t1-1', 't1', 'Theater One', '2026-08-01', '12:00'),
        st('t1-2', 't1', 'Theater One', '2026-08-01', '13:00'),
        st('t1-3', 't1', 'Theater One', '2026-08-01', '14:00'),
        st('t1-4', 't1', 'Theater One', '2026-08-01', '15:00'),
        st('t1-5', 't1', 'Theater One', '2026-08-01', '16:00'),
        st('t1-6', 't1', 'Theater One', '2026-08-01', '17:00'),
        st('t1-7', 't1', 'Theater One', '2026-08-01', '18:00'),
      ]),
      theater('t2', 'Theater Two', [
        st('t2-1', 't2', 'Theater Two', '2026-08-01', '12:30'),
        st('t2-2', 't2', 'Theater Two', '2026-08-01', '15:30'),
      ]),
      theater('t3', 'Theater Three', [
        st('t3-1', 't3', 'Theater Three', '2026-08-01', '19:00'),
      ]),
    ]),
  ];
  const preview = selectBrowseExpandedShowtimePreview(groups);
  assert.equal(preview.totalShowtimeCount, 10);
  assert.equal(preview.previewShowtimeCount, BROWSE_EXPANDED_SHOWTIME_PREVIEW_LIMIT);
  assert.equal(countPreviewChips(preview), 6);
  assert.equal(preview.hasMoreShowtimes, true);

  const theaterIds = preview.dateGroups[0].theaters.map((t) => t.theaterId);
  assert.deepEqual(theaterIds, ['t1', 't2', 't3']);

  const byTheater = Object.fromEntries(
    preview.dateGroups[0].theaters.map((t) => [t.theaterId, t.showtimes.map((s) => s.opportunityKey)]),
  );
  // Round 1: one from each theater; remaining slots continue round-robin.
  assert.deepEqual(byTheater.t1, ['t1-1', 't1-2', 't1-3']);
  assert.deepEqual(byTheater.t2, ['t2-1', 't2-2']);
  assert.deepEqual(byTheater.t3, ['t3-1']);
});

test('preview prefers earlier dates before later ones', () => {
  const groups = [
    dateGroup('2026-08-01', [
      theater('t1', 'One', [
        st('d1-a', 't1', 'One', '2026-08-01', '12:00'),
        st('d1-b', 't1', 'One', '2026-08-01', '13:00'),
        st('d1-c', 't1', 'One', '2026-08-01', '14:00'),
        st('d1-d', 't1', 'One', '2026-08-01', '15:00'),
      ]),
    ]),
    dateGroup('2026-08-02', [
      theater('t2', 'Two', [
        st('d2-a', 't2', 'Two', '2026-08-02', '12:00'),
        st('d2-b', 't2', 'Two', '2026-08-02', '13:00'),
        st('d2-c', 't2', 'Two', '2026-08-02', '14:00'),
        st('d2-d', 't2', 'Two', '2026-08-02', '15:00'),
      ]),
    ]),
  ];
  const preview = selectBrowseExpandedShowtimePreview(groups);
  assert.equal(countPreviewChips(preview), 6);
  assert.equal(preview.dateGroups.length, 2);
  assert.equal(preview.dateGroups[0].localDate, '2026-08-01');
  assert.equal(preview.dateGroups[0].theaters[0].showtimes.length, 4);
  assert.equal(preview.dateGroups[1].localDate, '2026-08-02');
  assert.equal(preview.dateGroups[1].theaters[0].showtimes.length, 2);
});

test('inline cap does not alter underlying film showtimeCount or dateGroups', () => {
  const homeData = {
    films: [{ filmKey: 'alpha', title: 'Alpha', runtimeMin: 100 }],
    opportunities: [],
  };
  const opps = [];
  for (let i = 0; i < 9; i += 1) {
    opps.push({
      opportunityKey: `o${i}`,
      filmKey: 'alpha',
      theaterId: i < 6 ? 't1' : 't2',
      theaterName: i < 6 ? 'One' : 'Two',
      localDate: '2026-08-01',
      localTime: `${12 + i}:00`.padStart(5, '0'),
      sortableLocalDateTime: `2026-08-01T${String(12 + i).padStart(2, '0')}:00`,
      formatLabels: ['Digital'],
    });
  }
  const films = groupBrowseOpportunitiesByFilm(opps, homeData, 'today');
  assert.equal(films.length, 1);
  const film = films[0];
  assert.equal(film.showtimeCount, 9);
  assert.equal(film.showtimes.length, 9);
  const fullChipCount = film.dateGroups.reduce(
    (sum, g) =>
      sum + g.theaters.reduce((inner, t) => inner + t.showtimes.length, 0),
    0,
  );
  assert.equal(fullChipCount, 9);
  assert.equal(film.previewShowtimeCount, 6);
  assert.equal(film.hasMoreShowtimes, true);
  assert.equal(film.seeAllShowtimesLabel, 'See all 9 showtimes');
  assert.equal(
    film.previewDateGroups.reduce(
      (sum, g) =>
        sum + g.theaters.reduce((inner, t) => inner + t.showtimes.length, 0),
      0,
    ),
    6,
  );
});

test('See all label uses singular grammar when count is 1', () => {
  assert.equal(formatBrowseSeeAllShowtimesLabel(1), 'See all 1 showtime');
  assert.equal(formatBrowseSeeAllShowtimesLabel(18), 'See all 18 showtimes');
});

test('browse surface wires capped preview and See all showtimes CTA', () => {
  assert.ok(BROWSE_SRC.includes('previewDateGroups'));
  assert.ok(BROWSE_SRC.includes('seeAllShowtimesLabel'));
  assert.ok(BROWSE_SRC.includes('openAllShowtimesForFilm'));
  assert.ok(BROWSE_SRC.includes('onOpenShowtimes'));
  assert.ok(BROWSE_SRC.includes('browseFiltersToFilmShowtimesSeed'));
  assert.ok(BROWSE_SRC.includes('v2-stb-see-all'));
  assert.ok(APP_SRC.includes('onOpenShowtimes='));
  assert.match(APP_SRC, /isShowtimesBrowse[\s\S]*onOpenShowtimes/);
});

test('See all opens film showtimes with exact film identity and restore surface', () => {
  let nav = createInitialNavState();
  nav = openShowtimesBrowse(nav, {
    originPrimary: 'explore',
    browseUi: {
      dateMode: 'today',
      formatKeys: ['imax'],
      theaterIds: ['si'],
      timeRangeId: 'evening',
      expandedFilmKey: 'alpha',
    },
  });
  nav = openShowtimes(nav, {
    filmKey: 'alpha',
    theaterId: 'si',
    formatKeys: ['imax'],
    timeRangeId: 'evening',
    selectedDate: '2026-08-01',
    opportunityKey: 'opp-1',
    returnSurface: {
      type: 'showtimes-browse',
      originPrimary: 'explore',
      browseUi: {
        expandedFilmKey: 'alpha',
        restoreItemKey: 'alpha',
        scrollY: 420,
        formatKeys: ['imax'],
        theaterIds: ['si'],
      },
    },
  });
  assert.equal(nav.surface.type, 'showtimes');
  assert.equal(nav.surface.filmKey, 'alpha');
  assert.equal(nav.surface.theaterId, 'si');
  assert.deepEqual(nav.surface.formatKeys, ['imax']);
  assert.equal(nav.surface.timeRangeId, 'evening');
  assert.equal(nav.surface.selectedDate, '2026-08-01');
  assert.equal(nav.surface.opportunityKey, 'opp-1');
  assert.equal(nav.surface.returnSurface?.type, 'showtimes-browse');
  assert.equal(nav.surface.returnSurface?.browseUi?.expandedFilmKey, 'alpha');
  assert.equal(nav.surface.returnSurface?.browseUi?.restoreItemKey, 'alpha');
  assert.equal(nav.surface.returnSurface?.browseUi?.scrollY, 420);
  assert.equal(resolveHeaderBackLabel(nav), 'Showtimes');

  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'showtimes-browse');
  assert.equal(nav.surface.browseUi?.expandedFilmKey, 'alpha');
  assert.equal(nav.surface.browseUi?.restoreItemKey, 'alpha');
  assert.equal(nav.surface.browseUi?.scrollY, 420);
});

test('Film Showtimes surface accepts seeded filters from browse', () => {
  assert.ok(ST_SRC.includes('initialFormatKeys'));
  assert.ok(ST_SRC.includes('initialTimeRangeId'));
  assert.ok(ST_SRC.includes('initialSelectedDate'));
  assert.ok(APP_SRC.includes('formatKeys={nav.surface.formatKeys'));
  assert.ok(APP_SRC.includes('timeRangeId={nav.surface.timeRangeId'));
  assert.ok(APP_SRC.includes('selectedDate={nav.surface.selectedDate'));
});

test('browse filter seed carries only clean Film Showtimes mappings', () => {
  const now = new Date('2026-08-01T22:00:00.000Z');
  const seed = browseFiltersToFilmShowtimesSeed(
    {
      dateSelection: {
        mode: 'tomorrow',
        startDate: '2026-08-02',
        endDate: '2026-08-02',
      },
      time: { preset: 'evening', customStartMin: null, customEndMin: null },
      theaterIds: ['t1'],
      formatKeys: ['imax', '70mm'],
      favoritesOnly: true,
      savedMode: 'saved',
      seenMode: 'seen',
      notInterestedMode: 'hide',
      sortMode: 'title_az',
    },
    now,
  );
  assert.deepEqual(seed.formatKeys, ['imax', '70mm']);
  assert.equal(seed.theaterId, 't1');
  assert.equal(seed.timeRangeId, 'evening');
  assert.equal(seed.selectedDate, '2026-08-02');

  const multiTheater = browseFiltersToFilmShowtimesSeed(
    {
      theaterIds: ['t1', 't2'],
      formatKeys: ['imax'],
      time: { preset: 'custom', customStartMin: 600, customEndMin: 900 },
      dateSelection: {
        mode: 'week',
        startDate: '2026-08-01',
        endDate: '2026-08-07',
      },
    },
    now,
  );
  assert.equal(multiTheater.theaterId, null);
  assert.equal(multiTheater.timeRangeId, 'any');
  assert.equal(multiTheater.selectedDate, null);
  assert.deepEqual(multiTheater.formatKeys, ['imax']);
});

test('openShowtimes still works from Film Detail without browse seed', () => {
  let nav = createInitialNavState();
  nav = openShowtimesBrowse(nav, { originPrimary: 'explore' });
  // Simulate film-detail origin via openShowtimesBrowse then replace surface
  nav = {
    ...nav,
    surface: {
      type: 'film-detail',
      filmKey: 'alpha',
      filmId: null,
      opportunityKey: null,
      originPrimary: 'explore',
      homeRestore: null,
      exploreRestore: null,
      returnSurface: null,
    },
  };
  nav = openShowtimes(nav, { filmKey: 'alpha', opportunityKey: 'o1' });
  assert.equal(nav.surface.type, 'showtimes');
  assert.equal(nav.surface.filmKey, 'alpha');
  assert.deepEqual(nav.surface.formatKeys, []);
  assert.equal(nav.surface.timeRangeId, null);
  assert.equal(nav.surface.selectedDate, null);
  assert.equal(nav.surface.returnSurface?.type, 'film-detail');
  assert.equal(resolveHeaderBackLabel(nav), 'Film');
});
