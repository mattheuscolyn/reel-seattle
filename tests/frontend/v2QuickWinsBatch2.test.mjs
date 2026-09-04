import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WHY_SEE_IT_PREVIEW_LIMIT,
  buildTodaysShowtimes,
} from '../../v2/filmDetail/filmDetailModel.js';
import { toFilmDetailView } from '../../v2/filmDetail/toFilmDetailView.js';
import {
  filterOpeningFilms,
  sortOpeningFilms,
  OPENING_SORT_OPTIONS,
  countActiveOpeningFilters,
} from '../../v2/opening/openingListControls.js';
import { getOpeningThisWeekMockupPresentation } from '../../v2/fixtures/openingThisWeekMockupFixture.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openShowtimesBrowse,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import { resolveActivePrimaryId } from '../../v2/destinations.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import { createDefaultShowtimesBrowseUi } from '../../v2/showtimes/showtimesBrowseModel.js';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  getFavoriteTheaters,
  isTheaterFavorite,
  toggleFavoriteTheater,
} from '../../v2/stores/favoriteTheatersStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE = readFileSync(
  join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'),
  'utf8',
);
const OPENING_SRC = readFileSync(
  join(ROOT, 'v2/opening/OpeningThisWeekSurface.jsx'),
  'utf8',
);
const THEATERS_SRC = readFileSync(
  join(ROOT, 'v2/theaters/TheatersSurface.jsx'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const DEST_SRC = readFileSync(join(ROOT, 'v2/destinations.js'), 'utf8');
const TMDB_SRC = readFileSync(
  join(ROOT, 'v2/enrichment/TmdbAttribution.jsx'),
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

function homeWithTodayShowtimes(rows) {
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  });
  return {
    films: [{ filmKey: 'film-ad', title: 'AD Mix', filmId: null }],
    opportunities: rows.map((row, index) => ({
      opportunityKey: `opp-${index}`,
      filmKey: 'film-ad',
      theaterId: row.theaterId,
      theaterName: row.theaterName,
      localDate: today,
      localTime: row.localTime,
      timeDisplay: row.timeDisplay,
      formatLabels: row.formatLabels ?? [],
      screeningVariantType: row.screeningVariantType ?? null,
      ticketUrl: null,
      isSpecialScreening: false,
    })),
    newlyAdded: [],
  };
}

test('Why see it now See all expands only when more signals exist', () => {
  assert.match(SURFACE, /WHY_SEE_IT_PREVIEW_LIMIT/);
  assert.match(SURFACE, /whySeeItExpanded/);
  assert.match(SURFACE, /Show less/);
  assert.match(SURFACE, /See all \(\$\{whySeeIt\.signals\.length\}\)/);
  assert.equal(WHY_SEE_IT_PREVIEW_LIMIT, 4);
  assert.equal(SURFACE.includes('<span className="v2-fd-link">See all'), false);
});

test('Film Detail today chips use shared-only labels; AD stays per-time otherwise', () => {
  const mixed = homeWithTodayShowtimes([
    {
      theaterId: 'beacon',
      theaterName: 'The Beacon Cinema',
      localTime: '18:00',
      timeDisplay: '6:00 PM',
      formatLabels: ['35mm'],
      screeningVariantType: null,
    },
    {
      theaterId: 'beacon',
      theaterName: 'The Beacon Cinema',
      localTime: '20:00',
      timeDisplay: '8:00 PM',
      formatLabels: ['audio-description'],
      screeningVariantType: 'audio_description',
    },
  ]);
  const mixedToday = buildTodaysShowtimes(mixed, 'film-ad');
  assert.equal(mixedToday.rows.length, 1);
  assert.equal(mixedToday.rows[0].formatChips.includes('Audio Description'), false);
  assert.ok(
    mixedToday.rows[0].times.some((t) =>
      String(t.detailLabel ?? '').includes('Audio Description'),
    ),
  );
  assert.ok(
    mixedToday.rows[0].times.some((t) => !String(t.detailLabel ?? '').includes('Audio Description')),
  );

  const none = homeWithTodayShowtimes([
    {
      theaterId: 'beacon',
      theaterName: 'The Beacon Cinema',
      localTime: '18:00',
      timeDisplay: '6:00 PM',
      formatLabels: ['35mm'],
    },
    {
      theaterId: 'beacon',
      theaterName: 'The Beacon Cinema',
      localTime: '21:00',
      timeDisplay: '9:00 PM',
      formatLabels: ['35mm'],
    },
  ]);
  const noneToday = buildTodaysShowtimes(none, 'film-ad');
  assert.equal(
    noneToday.rows[0].formatChips.some((c) => c.includes('Audio Description')),
    false,
  );
  assert.ok(noneToday.rows[0].formatChips.includes('35mm'));
  assert.ok(noneToday.rows[0].times.every((t) => !t.detailLabel?.includes('Audio Description')));

  const allAd = homeWithTodayShowtimes([
    {
      theaterId: 'beacon',
      theaterName: 'The Beacon Cinema',
      localTime: '17:00',
      timeDisplay: '5:00 PM',
      formatLabels: ['audio-description'],
      screeningVariantType: 'audio_description',
    },
    {
      theaterId: 'beacon',
      theaterName: 'The Beacon Cinema',
      localTime: '19:30',
      timeDisplay: '7:30 PM',
      formatLabels: ['audio-description'],
      screeningVariantType: 'audio_description',
    },
  ]);
  const allAdToday = buildTodaysShowtimes(allAd, 'film-ad');
  assert.ok(allAdToday.rows[0].formatChips.includes('Audio Description'));
  assert.ok(allAdToday.rows[0].times.every((t) => !t.detailLabel));

  const view = toFilmDetailView({
    mode: 'real',
    presentation: {
      mode: 'real',
      source: 'home-data',
      resolved: true,
      filmKey: 'film-ad',
      hero: { title: 'AD Mix' },
      signals: [],
      signalTotal: 0,
      synopsis: { available: false },
      bestWay: null,
      bestWayEmpty: true,
      today: mixedToday,
    },
  });
  assert.ok(view.today.rows[0].times.some((t) => t.detailLabel));
});

test('Opening sort options reorder fixture films deterministically', () => {
  const films = getOpeningThisWeekMockupPresentation().films;
  assert.deepEqual(
    OPENING_SORT_OPTIONS.map((o) => o.id),
    ['opening-date', 'title-az', 'most-showtimes', 'most-theaters'],
  );
  assert.deepEqual(
    sortOpeningFilms(films, 'title-az').map((f) => f.title),
    [
      'AMC Screen Unseen: May 23',
      'Harry Potter And The Half Blood Prince',
      'The Cabinet of Dr. Caligari',
      'The Long Horizon',
    ],
  );
  assert.equal(
    sortOpeningFilms(films, 'most-showtimes')[0].title,
    'The Long Horizon',
  );
  assert.equal(
    sortOpeningFilms(films, 'most-theaters')[0].title,
    'The Long Horizon',
  );
  assert.equal(
    sortOpeningFilms(films, 'opening-date')[0].openingDate,
    '2025-05-21',
  );
  assert.match(OPENING_SRC, /OPENING_SORT_OPTIONS/);
  assert.match(OPENING_SRC, /sortOpeningFilms/);
});

test('Opening filters combine theater/format/date and support empty state', () => {
  const films = getOpeningThisWeekMockupPresentation().films;
  const filtered = filterOpeningFilms(films, {
    theaterId: 'the-beacon-cinema',
    formatLabel: '35MM',
    openingDate: '2025-05-24',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].title, 'The Cabinet of Dr. Caligari');
  assert.equal(
    filterOpeningFilms(films, {
      theaterId: 'paramount-theatre',
      formatLabel: 'DCP',
    }).length,
    0,
  );
  assert.equal(countActiveOpeningFilters({ theaterId: 'x' }), 1);
  assert.match(OPENING_SRC, /filterOpeningFilms/);
  assert.match(OPENING_SRC, /No Opening This Week films match these filters/);
});

test('Opening This Week opened from Home highlights Home in bottom nav', () => {
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'home');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.openingThisWeek,
    originPrimary: 'home',
  });
  assert.equal(nav.surface?.collectionId, 'opening-this-week');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'home',
  );
  nav = navigateBack(nav);
  assert.equal(nav.primaryDestinationId, 'home');
  assert.match(DEST_SRC, /opening-this-week/);
});

test('Theater View all opens showtimes browse with theater preselected', () => {
  assert.match(THEATERS_SRC, /onOpenShowtimesBrowse/);
  assert.match(APP_SRC, /handleBrowseTheaterShowtimes/);
  assert.match(APP_SRC, /theaterIds:\s*\[theaterId\]/);
  let nav = createInitialNavState();
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.theaters,
    originPrimary: 'explore',
  });
  const theatersSurface = nav.surface;
  nav = openShowtimesBrowse(nav, {
    originPrimary: 'explore',
    returnSurface: theatersSurface,
    browseUi: {
      ...createDefaultShowtimesBrowseUi(),
      dateMode: 'week',
      theaterIds: ['the-beacon-cinema'],
    },
  });
  assert.equal(nav.surface?.type, 'showtimes-browse');
  assert.deepEqual(nav.surface.browseUi.theaterIds, ['the-beacon-cinema']);
  nav = navigateBack(nav);
  assert.equal(nav.surface?.collectionId, 'theaters');
});

test('Theater list Favorite toggles and persists via favoriteTheatersStore', () => {
  assert.match(THEATERS_SRC, /toggleFavoriteTheater/);
  assert.match(THEATERS_SRC, /isTheaterFavorite/);
  assert.match(THEATERS_SRC, /aria-pressed/);
  assert.equal(THEATERS_SRC.includes('`favorite-${theater.id}`'), false);
  const storage = memoryStorage();
  const ref = {
    theaterId: 'the-beacon-cinema',
    name: 'The Beacon Cinema',
  };
  assert.equal(isTheaterFavorite(storage, ref), false);
  const on = toggleFavoriteTheater(storage, ref, { name: ref.name });
  assert.equal(on.ok, true);
  assert.equal(on.favorite, true);
  assert.equal(isTheaterFavorite(storage, ref), true);
  assert.equal(getFavoriteTheaters(storage).length, 1);
  assert.ok(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY));
  const off = toggleFavoriteTheater(storage, ref);
  assert.equal(off.favorite, false);
  assert.equal(isTheaterFavorite(storage, ref), false);
});

test('TMDB attribution stays on the shared Opening component', () => {
  assert.match(TMDB_SRC, /v2-tmdb-attribution/);
  assert.match(OPENING_SRC, /<TmdbAttribution compact \/>/);
  const profile = readFileSync(
    join(ROOT, 'v2/profile/ProfileDestination.jsx'),
    'utf8',
  );
  assert.equal(profile.includes('<TmdbAttribution'), false);
  assert.match(
    readFileSync(join(ROOT, 'v2/v2.css'), 'utf8'),
    /\.v2-tmdb-attribution\s*\{/,
  );
});
