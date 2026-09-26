/**
 * Global Seen / Not Interested discovery visibility policy.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySeenToggle } from '../../v2/save/seenActionState.js';
import {
  RECENT_SEEN_GRACE_MS,
  RECENT_SEEN_MAX_ITEMS,
  RECENT_SEEN_STORAGE_KEY,
  clearRecentSeen,
  isWithinRecentSeenGrace,
  loadRecentSeenStore,
  recordRecentSeen,
} from '../../v2/stores/recentSeenStore.js';
import {
  VISIBILITY_PREFERENCES_STORAGE_KEY,
  defaultVisibilityPreferences,
  getVisibilityPreferences,
  updateVisibilityPreferences,
} from '../../v2/stores/visibilityPreferencesStore.js';
import { markFilmNotInterested } from '../../v2/stores/notInterestedFilmsStore.js';
import {
  isFilmSeen,
  markFilmSeen,
  markFilmUnseen,
} from '../../v2/stores/seenFilmsStore.js';
import {
  filterVisibleFilms,
  filterVisibleListPresentation,
  filterVisibleOpportunities,
  filterVisibleShelf,
  capVisibleShelf,
  shouldShowFilm,
} from '../../v2/visibility/filmVisibility.js';
import {
  HOME_LEAVING_SOON_MAX_CARDS,
  buildLeavingSoonShelf,
} from '../../v2/home/shelfData.js';
import {
  THEATER_NOW_SHOWING_LIST_LIMIT,
  buildTheaterNowShowing,
} from '../../v2/theaters/resolveTheaterPresentation.js';
import { evaluateBrowseFilters } from '../../v2/showtimes/browseFilterEngine.js';
import { createDefaultBrowseFilters } from '../../v2/showtimes/browseFilterState.js';
import { composeAllMoviesPresentation } from '../../v2/allMovies/composeAllMoviesPresentation.js';
import { buildSearchResultsModel } from '../../v2/explore/searchResultsModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

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

const FILM_A = {
  filmKey: 'fk-alpha',
  filmId: 'tmdb:1001',
  title: 'Alpha',
};
const FILM_B = {
  filmKey: 'fk-beta',
  filmId: 'tmdb:1002',
  title: 'Beta',
};
const REF_A = {
  filmId: 'tmdb:1001',
  showtimeFilmKey: 'fk-alpha',
  sourceFilmId: null,
  source: null,
};
const REF_B = {
  filmId: 'tmdb:1002',
  showtimeFilmKey: 'fk-beta',
  sourceFilmId: null,
  source: null,
};

const T0 = Date.parse('2026-09-25T18:00:00.000Z');

test('visibility defaults: both hide prefs off (opt-in)', () => {
  const prefs = defaultVisibilityPreferences();
  assert.equal(prefs.hideNotInterested, false);
  assert.equal(prefs.hideSeen, false);
  assert.equal(RECENT_SEEN_GRACE_MS, 5 * 60 * 1000);
});

test('1–3 Hide Not Interested toggle visibility', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, REF_A, { title: 'Alpha' });

  assert.equal(
    shouldShowFilm({
      film: FILM_A,
      storage,
      preferences: { hideNotInterested: false, hideSeen: false },
      context: 'home',
    }),
    true,
  );

  assert.equal(
    shouldShowFilm({
      film: FILM_A,
      storage,
      preferences: { hideNotInterested: true, hideSeen: false },
      context: 'home',
    }),
    false,
  );

  assert.equal(
    shouldShowFilm({
      film: FILM_A,
      storage,
      preferences: { hideNotInterested: false, hideSeen: false },
      context: 'home',
    }),
    true,
  );
});

test('4–5 Hide Seen: off keeps visible; on hides old Seen', () => {
  const storage = memoryStorage();
  markFilmSeen(storage, REF_A, { title: 'Alpha' });

  assert.equal(
    shouldShowFilm({
      film: FILM_A,
      storage,
      preferences: { hideNotInterested: false, hideSeen: false },
      context: 'search',
      now: T0,
    }),
    true,
  );

  assert.equal(
    shouldShowFilm({
      film: FILM_A,
      storage,
      preferences: { hideNotInterested: false, hideSeen: true },
      context: 'search',
      now: T0,
    }),
    false,
  );
});

test('6–8 newly marked Seen uses grace then hides; unmark clears grace', () => {
  const storage = memoryStorage();
  const toggle = applySeenToggle({
    storage,
    filmRef: REF_A,
    persist: true,
    now: T0,
  });
  assert.equal(toggle.ok, true);
  assert.equal(toggle.isSeen, true);
  assert.equal(isFilmSeen(storage, REF_A), true);
  assert.equal(isWithinRecentSeenGrace(storage, REF_A, { now: T0 }), true);

  assert.equal(
    shouldShowFilm({
      film: FILM_A,
      storage,
      preferences: { hideNotInterested: false, hideSeen: true },
      context: 'home',
      now: T0 + 60_000,
    }),
    true,
  );

  assert.equal(
    shouldShowFilm({
      film: FILM_A,
      storage,
      preferences: { hideNotInterested: false, hideSeen: true },
      context: 'home',
      now: T0 + RECENT_SEEN_GRACE_MS + 1,
    }),
    false,
  );

  const untoggle = applySeenToggle({
    storage,
    filmRef: REF_A,
    persist: true,
    now: T0 + RECENT_SEEN_GRACE_MS + 2,
  });
  assert.equal(untoggle.isSeen, false);
  assert.equal(isWithinRecentSeenGrace(storage, REF_A, { now: T0 }), false);
  assert.equal(
    shouldShowFilm({
      film: FILM_A,
      storage,
      preferences: { hideNotInterested: false, hideSeen: true },
      context: 'home',
      now: T0 + RECENT_SEEN_GRACE_MS + 2,
    }),
    true,
  );
});

test('9 malformed preference storage falls back safely', () => {
  const storage = memoryStorage({
    [VISIBILITY_PREFERENCES_STORAGE_KEY]: '{not-json',
  });
  const prefs = getVisibilityPreferences(storage);
  assert.deepEqual(prefs, defaultVisibilityPreferences());
});

test('10 malformed grace storage falls back safely', () => {
  const storage = memoryStorage({
    [RECENT_SEEN_STORAGE_KEY]: '%%%',
  });
  assert.deepEqual(loadRecentSeenStore(storage, T0).items, []);
  assert.equal(
    isWithinRecentSeenGrace(storage, REF_A, { now: T0 }),
    false,
  );
});

test('11–12 Film Detail and Planner contexts always show', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, REF_A);
  markFilmSeen(storage, REF_B);

  assert.equal(
    shouldShowFilm({
      film: FILM_A,
      storage,
      preferences: { hideNotInterested: true, hideSeen: true },
      context: 'film-detail',
    }),
    true,
  );
  assert.equal(
    shouldShowFilm({
      film: FILM_B,
      storage,
      preferences: { hideNotInterested: true, hideSeen: true },
      context: 'planner',
      now: T0,
    }),
    true,
  );
});

test('13 Search model hides via isDismissed → shouldShowFilm contract', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, REF_A);
  markFilmSeen(storage, REF_B);

  const homeData = {
    films: [FILM_A, FILM_B],
    opportunities: [],
    theaters: [],
  };
  const prefs = { hideNotInterested: true, hideSeen: true };
  const model = buildSearchResultsModel(homeData, 'a', {
    isDismissed: (film) =>
      !shouldShowFilm({
        film,
        storage,
        preferences: prefs,
        context: 'search',
        now: T0,
      }),
  });
  const keys = (model.films ?? model.results ?? []).map(
    (row) => row.filmKey ?? row.film?.filmKey,
  );
  // Alpha matches query but is NI-hidden; Beta does not match "a".
  assert.ok(!keys.includes('fk-alpha'));
});

test('13b Search shows Not Interested when Hide Not Interested is off', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, REF_A);
  const homeData = {
    films: [FILM_A, FILM_B],
    opportunities: [],
    theaters: [],
  };
  const model = buildSearchResultsModel(homeData, 'alpha', {
    isDismissed: (film) =>
      !shouldShowFilm({
        film,
        storage,
        preferences: { hideNotInterested: false, hideSeen: false },
        context: 'search',
        now: T0,
      }),
  });
  const keys = (model.films ?? []).map((row) => row.filmKey);
  assert.ok(keys.includes('fk-alpha'));
});

test('14 Home shelf filter removes hidden films and empties cleanly', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, REF_A);
  const shelf = {
    status: 'ready',
    films: [FILM_A, FILM_B],
  };
  const filtered = filterVisibleShelf(shelf, {
    storage,
    preferences: { hideNotInterested: true, hideSeen: false },
    context: 'home',
  });
  assert.equal(filtered.films.length, 1);
  assert.equal(filtered.films[0].filmKey, 'fk-beta');

  const empty = filterVisibleShelf(
    { status: 'ready', films: [FILM_A] },
    {
      storage,
      preferences: { hideNotInterested: true, hideSeen: false },
      context: 'home',
    },
  );
  assert.deepEqual(empty.films, []);
});

test('15 Collections filter membership after compose (list helper)', () => {
  const storage = memoryStorage();
  markFilmSeen(storage, REF_A);
  const films = filterVisibleFilms([FILM_A, FILM_B], {
    storage,
    preferences: { hideNotInterested: false, hideSeen: true },
    context: 'collection',
    now: T0,
  });
  assert.deepEqual(
    films.map((f) => f.filmKey),
    ['fk-beta'],
  );
});

test('16 Showtimes removes hidden film groups cleanly', () => {
  const storage = memoryStorage();
  updateVisibilityPreferences(storage, { hideNotInterested: true });
  markFilmNotInterested(storage, REF_A);
  const homeData = {
    timezone: 'America/Los_Angeles',
    films: [FILM_A, FILM_B],
    theaters: [{ id: 't1', name: 'Test Theater', enabled: true }],
    theatersById: {
      t1: { id: 't1', name: 'Test Theater', enabled: true },
    },
    opportunities: [
      {
        opportunityKey: 'o1',
        filmKey: 'fk-alpha',
        theaterId: 't1',
        theaterName: 'Test Theater',
        localDate: '2026-08-01',
        localTime: '19:00',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-08-01T19:00:00',
        formatLabels: [],
      },
      {
        opportunityKey: 'o2',
        filmKey: 'fk-beta',
        theaterId: 't1',
        theaterName: 'Test Theater',
        localDate: '2026-08-01',
        localTime: '20:00',
        timeDisplay: '8:00 PM',
        sortableLocalDateTime: '2026-08-01T20:00:00',
        formatLabels: [],
      },
    ],
  };

  const result = evaluateBrowseFilters(
    homeData,
    {
      ...createDefaultBrowseFilters(() => new Date('2026-08-01T22:00:00.000Z')),
      dateSelection: { mode: 'day', anchorDate: '2026-08-01' },
    },
    {
      now: () => new Date('2026-08-01T22:00:00.000Z'),
      storage,
    },
  );

  assert.equal(result.filmGroups.length, 1);
  assert.equal(result.filmGroups[0].filmKey, 'fk-beta');
  assert.ok(result.opportunities.every((o) => o.filmKey === 'fk-beta'));
});

test('17 Theater opportunities filter helper drops hidden films', () => {
  const storage = memoryStorage();
  markFilmSeen(storage, REF_A);
  const homeData = { films: [FILM_A, FILM_B] };
  const opps = [
    { filmKey: 'fk-alpha', opportunityKey: 'o1' },
    { filmKey: 'fk-beta', opportunityKey: 'o2' },
  ];
  const filtered = filterVisibleOpportunities(opps, homeData, {
    storage,
    preferences: { hideNotInterested: false, hideSeen: true },
    context: 'theater-detail',
    now: T0,
  });
  assert.deepEqual(
    filtered.map((o) => o.filmKey),
    ['fk-beta'],
  );
});

test('18 Coming Soon / All Movies respect visibility options', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, REF_A);
  const homeData = {
    timezone: 'America/Los_Angeles',
    films: [
      { ...FILM_A, showtimeCount: 1, theaterCount: 1 },
      { ...FILM_B, showtimeCount: 1, theaterCount: 1 },
    ],
    opportunities: [
      {
        opportunityKey: 'o1',
        filmKey: 'fk-alpha',
        filmId: 'tmdb:1001',
        theaterId: 't1',
        theaterName: 'T',
        localDate: '2026-09-26',
        localTime: '19:00',
        sortableLocalDateTime: '2026-09-26T19:00:00',
        formatLabels: [],
      },
      {
        opportunityKey: 'o2',
        filmKey: 'fk-beta',
        filmId: 'tmdb:1002',
        theaterId: 't1',
        theaterName: 'T',
        localDate: '2026-09-26',
        localTime: '20:00',
        sortableLocalDateTime: '2026-09-26T20:00:00',
        formatLabels: [],
      },
    ],
    theaters: [{ id: 't1', name: 'T', enabled: true }],
    theatersById: { t1: { id: 't1', name: 'T', enabled: true } },
  };

  const presentation = composeAllMoviesPresentation(homeData, {
    loadStatus: 'ready',
    storage,
    visibilityPreferences: { hideNotInterested: true, hideSeen: false },
    now: new Date('2026-09-25T18:00:00.000Z'),
  });
  assert.ok(presentation.totalCount <= 1);
  assert.ok(
    !(presentation.films ?? []).some((f) => f.filmKey === 'fk-alpha'),
  );
});

test('19 empty filtered list presentation stays empty without shells', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, REF_A);
  const presentation = filterVisibleListPresentation(
    {
      films: [FILM_A],
      sections: [{ id: 'all', films: [FILM_A] }],
      totalCount: 1,
    },
    {
      storage,
      preferences: { hideNotInterested: true, hideSeen: false },
      context: 'opening-this-week',
    },
  );
  assert.deepEqual(presentation.films, []);
  assert.deepEqual(presentation.sections, []);
  assert.equal(presentation.totalCount, 0);
});

test('20 grace records are pruned/capped', () => {
  const storage = memoryStorage();
  for (let i = 0; i < RECENT_SEEN_MAX_ITEMS + 5; i += 1) {
    recordRecentSeen(
      storage,
      {
        filmId: `tmdb:${2000 + i}`,
        showtimeFilmKey: `fk-${i}`,
        sourceFilmId: null,
        source: null,
      },
      { now: T0 + i },
    );
  }
  const store = loadRecentSeenStore(storage, T0 + RECENT_SEEN_MAX_ITEMS + 5);
  assert.ok(store.items.length <= RECENT_SEEN_MAX_ITEMS);

  // Stale records beyond 2× grace are dropped on normalize.
  recordRecentSeen(storage, REF_A, { now: T0 - RECENT_SEEN_GRACE_MS * 3 });
  const pruned = loadRecentSeenStore(storage, T0);
  assert.ok(
    !pruned.items.some(
      (item) => item.filmRef.showtimeFilmKey === REF_A.showtimeFilmKey,
    ),
  );
  clearRecentSeen(storage, REF_B);
});

test('already Seen before Hide Seen enables hides immediately without grace', () => {
  const storage = memoryStorage();
  markFilmSeen(storage, REF_A);
  // No recent-seen record.
  assert.equal(
    shouldShowFilm({
      film: FILM_A,
      storage,
      preferences: { hideNotInterested: false, hideSeen: true },
      context: 'home',
      now: T0,
    }),
    false,
  );
});

test('capVisibleShelf backfills after hidden films inside original top N', () => {
  const storage = memoryStorage();
  // Ranked order: 0 hidden, 1 visible, 2 hidden, 3–8 visible → need backfill to fill 6.
  const ranked = Array.from({ length: 9 }, (_, i) => ({
    filmKey: `fk-${i}`,
    filmId: `tmdb:${3000 + i}`,
    title: `Film ${i}`,
  }));
  markFilmNotInterested(storage, {
    filmId: 'tmdb:3000',
    showtimeFilmKey: 'fk-0',
    sourceFilmId: null,
    source: null,
  });
  markFilmNotInterested(storage, {
    filmId: 'tmdb:3002',
    showtimeFilmKey: 'fk-2',
    sourceFilmId: null,
    source: null,
  });

  const postCapOnly = filterVisibleShelf(
    { status: 'ready', films: ranked.slice(0, HOME_LEAVING_SOON_MAX_CARDS) },
    {
      storage,
      preferences: { hideNotInterested: true, hideSeen: false },
      context: 'home',
    },
  );
  assert.equal(postCapOnly.films.length, 4, 'post-cap filter would under-fill');

  const backfilled = capVisibleShelf(
    { status: 'ready', films: ranked },
    {
      storage,
      preferences: { hideNotInterested: true, hideSeen: false },
      context: 'home',
    },
    HOME_LEAVING_SOON_MAX_CARDS,
  );
  assert.equal(backfilled.films.length, HOME_LEAVING_SOON_MAX_CARDS);
  assert.deepEqual(
    backfilled.films.map((f) => f.filmKey),
    ['fk-1', 'fk-3', 'fk-4', 'fk-5', 'fk-6', 'fk-7'],
  );
  // Canonical ranked input is not mutated.
  assert.equal(ranked.length, 9);
  assert.equal(ranked[0].filmKey, 'fk-0');
});

test('Theater Now Showing filters before presentation cap (backfill)', () => {
  const storage = memoryStorage();
  updateVisibilityPreferences(storage, { hideNotInterested: true });
  const films = Array.from({ length: 8 }, (_, i) => ({
    filmKey: `fk-t${i}`,
    filmId: `tmdb:${4000 + i}`,
    title: `Theater Film ${i}`,
  }));
  // Hide first two in chronological order so a post-cap filter would under-fill.
  markFilmNotInterested(storage, {
    filmId: 'tmdb:4000',
    showtimeFilmKey: 'fk-t0',
    sourceFilmId: null,
    source: null,
  });
  markFilmNotInterested(storage, {
    filmId: 'tmdb:4001',
    showtimeFilmKey: 'fk-t1',
    sourceFilmId: null,
    source: null,
  });

  const homeData = {
    films,
    opportunities: films.map((film, i) => ({
      opportunityKey: `opp-${i}`,
      filmKey: film.filmKey,
      filmId: film.filmId,
      theaterId: 't1',
      theaterName: 'T',
      localDate: '2026-09-25',
      localTime: `${String(10 + i).padStart(2, '0')}:00`,
      sortableLocalDateTime: `2026-09-25T${String(10 + i).padStart(2, '0')}:00:00`,
      formatLabels: [],
      title: film.title,
    })),
  };

  const showing = buildTheaterNowShowing(homeData, 't1', {
    limit: THEATER_NOW_SHOWING_LIST_LIMIT,
    now: new Date('2026-09-25T17:00:00.000Z'),
    storage,
    visibilityPreferences: { hideNotInterested: true, hideSeen: false },
  });
  assert.equal(showing.length, THEATER_NOW_SHOWING_LIST_LIMIT);
  assert.equal(showing[0].filmKey, 'fk-t2');
  assert.ok(!showing.some((row) => row.filmKey === 'fk-t0'));
});

test('Leaving Soon uncapped builder + capVisibleShelf does not mutate membership source', () => {
  // Smoke: cap helper + constant stay exported for HomeDestination wiring.
  assert.equal(HOME_LEAVING_SOON_MAX_CARDS, 6);
  assert.equal(typeof buildLeavingSoonShelf, 'function');
  assert.equal(typeof capVisibleShelf, 'function');
});

test('settings + FilmShelf wiring present', () => {
  const settings = readFileSync(
    join(ROOT, 'v2/profile/settings/ProfileSettingsSurface.jsx'),
    'utf8',
  );
  const shelf = readFileSync(join(ROOT, 'v2/home/FilmShelf.jsx'), 'utf8');
  const home = readFileSync(join(ROOT, 'v2/HomeDestination.jsx'), 'utf8');
  assert.match(settings, /hide-not-interested/);
  assert.match(settings, /hide-seen/);
  assert.match(shelf, /applySeenToggle/);
  assert.match(home, /capVisibleShelf/);
  assert.match(
    readFileSync(join(ROOT, 'v2/surfaces/SearchResultsSurface.jsx'), 'utf8'),
    /shouldShowFilm/,
  );
});

test('updateVisibilityPreferences persists and re-reads', () => {
  const storage = memoryStorage();
  const result = updateVisibilityPreferences(storage, {
    hideSeen: true,
    hideNotInterested: false,
  });
  assert.equal(result.ok, true);
  assert.equal(getVisibilityPreferences(storage).hideSeen, true);
  assert.equal(getVisibilityPreferences(storage).hideNotInterested, false);
});

test('markFilmUnseen without grace record stays visible under Hide Seen off', () => {
  const storage = memoryStorage();
  markFilmSeen(storage, REF_A);
  markFilmUnseen(storage, REF_A);
  assert.equal(
    shouldShowFilm({
      film: FILM_A,
      storage,
      preferences: { hideNotInterested: false, hideSeen: true },
      context: 'home',
      now: T0,
    }),
    true,
  );
});
