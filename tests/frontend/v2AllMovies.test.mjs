import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import { buildEnrichmentIndex } from '../../v2/enrichment/enrichmentIndex.js';
import { composeFilmDetailPresentation } from '../../v2/filmDetail/composeFilmDetailPresentation.js';
import { resolveFilmDetailBackLabel } from '../../v2/filmDetail/filmDetailModel.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import {
  ALL_MOVIES_PAGE_TAGLINE,
  ALL_MOVIES_PAGE_TITLE,
  buildAllMoviesInventory,
  collectAllMoviesCanonicalFilmIds,
  composeAllMoviesPresentation,
  formatAllMoviesNextWhen,
  groupAllMoviesFilms,
  normalizeAllMoviesUi,
} from '../../v2/allMovies/composeAllMoviesPresentation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const PAGE_SRC = readFileSync(
  join(ROOT, 'v2/allMovies/AllMoviesSurface.jsx'),
  'utf8',
);
const COMPOSER_SRC = readFileSync(
  join(ROOT, 'v2/allMovies/composeAllMoviesPresentation.js'),
  'utf8',
);
const COLLECTION_SRC = readFileSync(
  join(ROOT, 'v2/surfaces/CollectionSurface.jsx'),
  'utf8',
);

const NOW = new Date('2026-09-19T18:00:00-07:00');
const TODAY = '2026-09-19';
const THIS_WEEK = '2026-09-22';
const LATER = '2026-11-20';
const PAST = '2026-09-10';

function enrichmentIndex(films = []) {
  return buildEnrichmentIndex({
    version: 1,
    image_config: {
      secure_base_url: 'https://image.tmdb.org/t/p/',
      poster_size: 'w500',
      backdrop_size: 'w780',
    },
    films,
  });
}

function opp(overrides = {}) {
  const localDate = overrides.localDate ?? THIS_WEEK;
  const localTime = overrides.localTime ?? '19:00';
  return {
    opportunityKey: `${overrides.filmKey ?? 'alpha'}-${localDate}-${localTime}`,
    filmKey: 'alpha',
    theaterId: 'siff-uptown',
    theaterName: 'SIFF Uptown',
    localDate,
    localTime,
    timeDisplay: '7:00 PM',
    sortableLocalDateTime: `${localDate}T${localTime}`,
    formatLabels: [],
    ...overrides,
  };
}

function film(overrides = {}) {
  return {
    filmKey: 'alpha',
    filmId: 'tmdb:101',
    title: 'Alpha Night',
    sourceTitle: 'ALPHA NIGHT RAW',
    posterUrl: null,
    runtimeMin: 100,
    ...overrides,
  };
}

function home(films, opportunities) {
  return { films, opportunities };
}

test('All Movies is a dedicated production surface, not the Explore scaffold', () => {
  assert.match(APP_SRC, /AllMoviesSurface/);
  assert.match(APP_SRC, /isAllMovies/);
  assert.match(APP_SRC, /COLLECTION_IDS\.allMovies/);
  assert.equal(PAGE_SRC.includes('Explore · scaffold'), false);
  assert.equal(PAGE_SRC.includes('CollectionSurface'), false);
  assert.equal(COMPOSER_SRC.includes('coming_soon_current'), false);
  assert.equal(COMPOSER_SRC.includes('comingSoon'), false);
  assert.match(COMPOSER_SRC, /Coming Soon/);
  assert.match(PAGE_SRC, /LIST_RESTORE_ATTR/);
  assert.match(COLLECTION_SRC, /Explore · scaffold/);
});

test('inclusion uses booked future Seattle showtimes, not Coming Soon inventory', () => {
  const data = home(
    [
      film({ filmKey: 'playing', filmId: 'tmdb:1', title: 'Playing Now' }),
      film({ filmKey: 'past-only', filmId: 'tmdb:2', title: 'Already Left' }),
      film({
        filmKey: 'far-future',
        filmId: 'tmdb:3',
        title: 'November Booking',
      }),
      film({
        filmKey: 'coming-soon-only',
        filmId: 'tmdb:4',
        title: 'Announced Without Showtimes',
      }),
    ],
    [
      opp({ filmKey: 'playing', localDate: THIS_WEEK }),
      opp({ filmKey: 'past-only', localDate: PAST, localTime: '19:00' }),
      opp({ filmKey: 'far-future', localDate: LATER }),
    ],
  );

  const page = composeAllMoviesPresentation(data, { now: NOW });
  const titles = page.films.map((row) => row.title).sort();
  assert.deepEqual(titles, ['November Booking', 'Playing Now']);
  assert.equal(
    page.films.some((row) => row.title === 'Already Left'),
    false,
  );
  assert.equal(
    page.films.some((row) => row.title === 'Announced Without Showtimes'),
    false,
  );

  const thisWeek = page.sections.find((section) => section.id === 'this-week');
  const later = page.sections.find((section) => section.id === 'later');
  assert.equal(thisWeek.films[0].title, 'Playing Now');
  assert.equal(later.films[0].title, 'November Booking');
  assert.equal(page.thisWeekCount + page.laterCount, page.totalCount);
  assert.equal(page.totalCount, 2);
});

test('This Week / Later split uses the rolling 7-day Pacific window', () => {
  const data = home(
    [
      film({ filmKey: 'today-film', filmId: 'tmdb:11', title: 'Today Film' }),
      film({ filmKey: 'week-film', filmId: 'tmdb:12', title: 'Week Film' }),
      film({ filmKey: 'later-film', filmId: 'tmdb:13', title: 'Later Film' }),
    ],
    [
      opp({ filmKey: 'today-film', localDate: TODAY, localTime: '21:00' }),
      opp({ filmKey: 'week-film', localDate: '2026-09-25', localTime: '18:00' }),
      opp({ filmKey: 'later-film', localDate: '2026-09-26', localTime: '18:00' }),
    ],
  );
  const page = composeAllMoviesPresentation(data, { now: NOW });
  assert.equal(page.thisWeekCount, 2);
  assert.equal(page.laterCount, 1);
  assert.equal(page.thisWeekCount + page.laterCount, page.totalCount);
  const later = composeAllMoviesPresentation(data, {
    now: NOW,
    availability: 'later',
  });
  assert.equal(later.visibleCount, 1);
  assert.equal(later.films[0].title, 'Later Film');
});

test('screening variants consolidate; distinct canonical films do not', () => {
  const data = home(
    [
      film({
        filmKey: 'weight',
        filmId: 'tmdb:50',
        title: 'The Weight',
      }),
      film({
        filmKey: 'weight-early',
        filmId: 'tmdb:50',
        title: 'The Weight Early Access',
        parentFilmKey: 'weight',
      }),
      film({
        filmKey: 'heat-1995',
        filmId: 'tmdb:949',
        title: 'Heat',
      }),
      film({
        filmKey: 'heat-1986',
        filmId: 'tmdb:10865',
        title: 'Heat',
      }),
      film({
        filmKey: 'mystery-a',
        filmId: null,
        title: 'Mystery Movie',
      }),
      film({
        filmKey: 'mystery-b',
        filmId: null,
        title: 'Mystery Movie',
      }),
    ],
    [
      opp({ filmKey: 'weight', localDate: THIS_WEEK }),
      opp({ filmKey: 'weight-early', localDate: THIS_WEEK, localTime: '20:00' }),
      opp({ filmKey: 'heat-1995', localDate: THIS_WEEK }),
      opp({ filmKey: 'heat-1986', localDate: LATER }),
      opp({ filmKey: 'mystery-a', localDate: THIS_WEEK }),
      opp({ filmKey: 'mystery-b', localDate: LATER }),
    ],
  );

  const groups = groupAllMoviesFilms(data.films);
  assert.equal(
    [...groups.values()].some(
      (members) =>
        members.some((row) => row.filmKey === 'weight') &&
        members.some((row) => row.filmKey === 'weight-early'),
    ),
    true,
  );

  const page = composeAllMoviesPresentation(data, { now: NOW });
  const titles = page.films.map((row) => `${row.title}::${row.filmId || row.filmKey}`);
  assert.equal(page.films.filter((row) => row.title === 'The Weight').length, 1);
  assert.equal(page.films.filter((row) => row.title === 'Heat').length, 2);
  assert.equal(page.films.filter((row) => row.title === 'Mystery Movie').length, 2);
  assert.equal(
    titles.includes('The Weight Early Access::tmdb:50'),
    false,
  );
  const weight = page.films.find((row) => row.filmId === 'tmdb:50');
  assert.equal(weight.filmKey, 'weight');
  assert.equal(weight.showtimeCount, 2);
});

test('canonical presentation matches Film Detail via the shared resolver', () => {
  const index = enrichmentIndex([
    {
      film_id: 'tmdb:101',
      tmdb_id: 101,
      display_title: 'Canonical Alpha',
      release_year: 1991,
      runtime_minutes: 110,
      genres: [{ name: 'Crime' }],
      poster: { path: '/alpha.jpg', url: null },
    },
  ]);
  const data = home(
    [film({ title: 'ALPHA RAW', sourceTitle: 'ALPHA RAW' })],
    [opp()],
  );
  const page = composeAllMoviesPresentation(data, {
    now: NOW,
    enrichmentIndex: index,
  });
  const detail = composeFilmDetailPresentation(data, 'alpha', 'alpha-2026-09-22-19:00', {
    enrichmentIndex: index,
    now: NOW,
  });
  assert.equal(page.films[0].title, 'Canonical Alpha');
  assert.equal(detail.displayTitle, 'Canonical Alpha');
  assert.equal(page.films[0].year, 1991);
  assert.match(page.films[0].posterUrl ?? '', /alpha\.jpg/);
  assert.match(detail.hero.posterUrl ?? '', /alpha\.jpg/);
});

test('search matches canonical and source titles, then clears', () => {
  const index = enrichmentIndex([
    {
      film_id: 'tmdb:101',
      tmdb_id: 101,
      display_title: 'Canonical Alpha',
      release_year: 1991,
      runtime_minutes: 110,
      genres: [{ name: 'Crime' }],
      poster: { path: '/alpha.jpg', url: null },
    },
  ]);
  const data = home(
    [
      film({ title: 'ALPHA RAW', sourceTitle: 'BEACON PRESENTS ALPHA' }),
      film({
        filmKey: 'beta',
        filmId: 'tmdb:202',
        title: 'Beta Dawn',
        sourceTitle: 'Beta Dawn',
      }),
    ],
    [opp(), opp({ filmKey: 'beta', localDate: LATER })],
  );

  const canonical = composeAllMoviesPresentation(data, {
    now: NOW,
    enrichmentIndex: index,
    query: 'Canonical Alpha',
  });
  assert.equal(canonical.visibleCount, 1);
  assert.equal(canonical.films[0].title, 'Canonical Alpha');

  const source = composeAllMoviesPresentation(data, {
    now: NOW,
    enrichmentIndex: index,
    query: 'BEACON PRESENTS',
  });
  assert.equal(source.visibleCount, 1);
  assert.equal(source.films[0].title, 'Canonical Alpha');

  const empty = composeAllMoviesPresentation(data, {
    now: NOW,
    query: 'xyzzy',
  });
  assert.equal(empty.state, 'search-empty');
  assert.match(empty.emptyMessage, /xyzzy/);
  assert.equal(empty.emptyAction.id, 'clear-search');

  const cleared = composeAllMoviesPresentation(data, {
    now: NOW,
    enrichmentIndex: index,
    query: '',
  });
  assert.equal(cleared.visibleCount, 2);
});

test('Soonest and A–Z sorts are deterministic', () => {
  const data = home(
    [
      film({ filmKey: 'zeta', filmId: 'tmdb:1', title: 'Zeta' }),
      film({ filmKey: 'alpha', filmId: 'tmdb:2', title: 'Alpha' }),
      film({ filmKey: 'mu', filmId: 'tmdb:3', title: 'Mu' }),
    ],
    [
      opp({ filmKey: 'zeta', localDate: '2026-09-24', localTime: '21:00' }),
      opp({ filmKey: 'alpha', localDate: '2026-09-24', localTime: '18:00' }),
      opp({ filmKey: 'mu', localDate: LATER, localTime: '19:00' }),
    ],
  );

  const soonest = composeAllMoviesPresentation(data, {
    now: NOW,
    sort: 'soonest',
  });
  assert.deepEqual(
    soonest.sections.find((section) => section.id === 'this-week').films.map(
      (row) => row.title,
    ),
    ['Alpha', 'Zeta'],
  );
  assert.equal(soonest.sections.find((section) => section.id === 'later').films[0].title, 'Mu');

  const az = composeAllMoviesPresentation(data, { now: NOW, sort: 'az' });
  assert.deepEqual(
    az.sections.find((section) => section.id === 'this-week').films.map(
      (row) => row.title,
    ),
    ['Alpha', 'Zeta'],
  );

  const laterAz = composeAllMoviesPresentation(data, {
    now: NOW,
    availability: 'all',
    sort: 'az',
  });
  const laterSoonest = composeAllMoviesPresentation(data, {
    now: NOW,
    availability: 'all',
    sort: 'soonest',
  });
  assert.deepEqual(
    laterAz.films.map((row) => row.groupId),
    composeAllMoviesPresentation(data, { now: NOW, sort: 'az' }).films.map(
      (row) => row.groupId,
    ),
  );
  assert.deepEqual(
    laterSoonest.films.map((row) => row.groupId),
    soonest.films.map((row) => row.groupId),
  );
});

test('navigation opens Film Detail identity and back returns to All Movies', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, { collectionId: COLLECTION_IDS.allMovies });
  assert.equal(nav.surface.collectionId, COLLECTION_IDS.allMovies);
  nav = openFilmDetail(nav, {
    filmKey: 'weight',
    filmId: 'tmdb:50',
    opportunityKey: 'weight-next',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface.type, 'film-detail');
  assert.equal(nav.surface.filmKey, 'weight');
  assert.equal(nav.surface.filmId, 'tmdb:50');
  assert.equal(
    resolveFilmDetailBackLabel(nav.surface.originPrimary, nav.surface.returnSurface),
    'All Movies',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'collection');
  assert.equal(nav.surface?.collectionId, COLLECTION_IDS.allMovies);
  assert.match(APP_SRC, /allMoviesUi/);
  assert.match(APP_SRC, /allMoviesListRestore/);
  assert.match(PAGE_SRC, /listRestore/);
});

test('Seen / Saved / Not Interested films stay in the comprehensive inventory', () => {
  const data = home(
    [
      film({ filmKey: 'saved', filmId: 'tmdb:1', title: 'Saved Film' }),
      film({ filmKey: 'seen', filmId: 'tmdb:2', title: 'Seen Film' }),
      film({ filmKey: 'hidden', filmId: 'tmdb:3', title: 'Hidden Film' }),
    ],
    [
      opp({ filmKey: 'saved' }),
      opp({ filmKey: 'seen' }),
      opp({ filmKey: 'hidden' }),
    ],
  );
  const page = composeAllMoviesPresentation(data, {
    now: NOW,
    dismissedKeys: ['hidden'],
    seenKeys: ['seen'],
    savedKeys: ['saved'],
  });
  assert.equal(page.totalCount, 3);
  assert.deepEqual(
    page.films.map((row) => row.title).sort(),
    ['Hidden Film', 'Saved Film', 'Seen Film'],
  );
});

test('composer indexes opportunities once instead of scanning per film', () => {
  const data = home(
    [film({ filmKey: 'a' }), film({ filmKey: 'b', filmId: 'tmdb:2', title: 'B' })],
    [opp({ filmKey: 'a' }), opp({ filmKey: 'b', localDate: LATER })],
  );
  let reads = 0;
  const proxied = new Proxy(data, {
    get(target, prop) {
      if (prop === 'opportunities') reads += 1;
      return target[prop];
    },
  });
  composeAllMoviesPresentation(proxied, { now: NOW });
  assert.equal(reads, 1);
  assert.match(COMPOSER_SRC, /Single pass over HomeData opportunities/);
});

test('next-showtime copy keeps a date for far-future bookings', () => {
  const tonight = formatAllMoviesNextWhen(
    opp({ localDate: TODAY, localTime: '19:10', theaterName: 'SIFF Uptown' }),
    { todayIso: TODAY, timeFormatId: '12h' },
  );
  assert.match(tonight, /Tonight/);
  assert.match(tonight, /SIFF Uptown/);
  const later = formatAllMoviesNextWhen(
    opp({
      localDate: LATER,
      localTime: '19:00',
      theaterName: 'AMC Pacific Place',
    }),
    { todayIso: TODAY, timeFormatId: '12h' },
  );
  assert.match(later, /Nov 20/);
  assert.equal(/^\d/.test(later.split(' · ')[0]) || later.includes('Nov'), true);
  assert.equal(later.startsWith('7:00'), false);
});

test('empty and loading states stay user-facing', () => {
  const loading = composeAllMoviesPresentation(null, { loadStatus: 'loading' });
  assert.equal(loading.state, 'loading');
  const unavailable = composeAllMoviesPresentation(null, {
    loadStatus: 'unavailable',
  });
  assert.equal(unavailable.state, 'unavailable');
  const empty = composeAllMoviesPresentation(home([], []), { now: NOW });
  assert.equal(empty.state, 'empty');
  assert.equal(
    empty.emptyMessage,
    'No upcoming Seattle showtimes are available.',
  );
  const thisWeekEmpty = composeAllMoviesPresentation(
    home(
      [film({ filmKey: 'later-only', filmId: 'tmdb:9', title: 'Later Only' })],
      [opp({ filmKey: 'later-only', localDate: LATER })],
    ),
    { now: NOW, availability: 'this-week' },
  );
  assert.equal(thisWeekEmpty.state, 'filter-empty');
  assert.equal(thisWeekEmpty.emptyAction.id, 'show-later');
});

test('UI defaults and hydration IDs stay capped', () => {
  assert.deepEqual(normalizeAllMoviesUi({ query: '  Heat  ', availability: 'nope', sort: 'nope' }), {
    query: 'Heat',
    availability: 'all',
    sort: 'soonest',
  });
  const films = [];
  const opportunities = [];
  for (let i = 1; i <= 60; i += 1) {
    films.push(
      film({
        filmKey: `f${i}`,
        filmId: `tmdb:${i}`,
        title: `Film ${String(i).padStart(2, '0')}`,
      }),
    );
    opportunities.push(opp({ filmKey: `f${i}`, localDate: THIS_WEEK }));
  }
  const page = composeAllMoviesPresentation(home(films, opportunities), {
    now: NOW,
  });
  const ids = collectAllMoviesCanonicalFilmIds(page);
  assert.equal(ids.length, 48);
  assert.equal(page.pageTitle, ALL_MOVIES_PAGE_TITLE);
  assert.equal(page.pageTagline, ALL_MOVIES_PAGE_TAGLINE);
});

test('live HomeData inventory stays film-level and groups far-future bookings as Later', () => {
  const showtimes = JSON.parse(
    readFileSync(join(ROOT, 'public/data/showtimes_current.json'), 'utf8'),
  );
  const theaters = JSON.parse(
    readFileSync(join(ROOT, 'public/data/theaters.json'), 'utf8'),
  );
  const newly = JSON.parse(
    readFileSync(join(ROOT, 'public/data/newly_added_current.json'), 'utf8'),
  );
  const liveHome = buildHomeData({
    showtimesCurrent: showtimes,
    theatersRegistry: theaters,
    newlyAdded: newly,
  });
  const inventory = buildAllMoviesInventory(liveHome, { now: NOW });
  const page = composeAllMoviesPresentation(liveHome, { now: NOW });
  assert.ok(liveHome.films.length > 0);
  assert.ok(inventory.items.length > 0);
  assert.ok(inventory.items.length <= liveHome.films.length);
  assert.equal(inventory.thisWeekCount + inventory.laterCount, inventory.items.length);
  assert.equal(page.thisWeekCount + page.laterCount, page.totalCount);
  assert.equal(page.visibleCount, page.totalCount);
  const laterItems = inventory.items.filter((item) => item.availability === 'later');
  if (laterItems.length > 0) {
    assert.ok(laterItems.every((item) => item.nextOpportunity.localDate > '2026-09-25'));
    assert.equal(PAGE_SRC.includes('Now Playing'), false);
    assert.equal(COMPOSER_SRC.includes('Now Playing'), false);
  }
});
