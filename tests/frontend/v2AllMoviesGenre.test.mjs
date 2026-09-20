import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import { buildEnrichmentIndex } from '../../v2/enrichment/enrichmentIndex.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import { BROWSE_ROWS } from '../../v2/explore/exploreBrowseBy.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import {
  buildAllMoviesGenreOptions,
  buildAllMoviesInventory,
  composeAllMoviesPresentation,
  countAllMoviesMatchingGenreKeys,
  extractAllMoviesGenres,
  filmMatchesAllMoviesGenres,
  normalizeAllMoviesGenreKeys,
  normalizeAllMoviesUi,
} from '../../v2/allMovies/composeAllMoviesPresentation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PAGE_SRC = readFileSync(
  join(ROOT, 'v2/allMovies/AllMoviesSurface.jsx'),
  'utf8',
);
const COMPOSER_SRC = readFileSync(
  join(ROOT, 'v2/allMovies/composeAllMoviesPresentation.js'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const BROWSE_SRC = readFileSync(
  join(ROOT, 'v2/explore/exploreBrowseBy.js'),
  'utf8',
);

const NOW = new Date('2026-09-19T18:00:00-07:00');
const THIS_WEEK = '2026-09-22';
const LATER = '2026-11-20';

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

function enrich(filmId, title, genres, extras = {}) {
  return {
    film_id: filmId,
    tmdb_id: Number(String(filmId).replace('tmdb:', '')),
    display_title: title,
    release_year: 1991,
    runtime_minutes: 110,
    genres: genres.map((name) => ({ name })),
    poster: { path: `/${filmId}.jpg`, url: null },
    ...extras,
  };
}

const INDEX = enrichmentIndex([
  enrich('tmdb:101', 'Canonical Alpha', ['Drama', 'Romance', 'Thriller']),
  enrich('tmdb:202', 'Beta Dawn', ['Horror']),
  enrich('tmdb:303', 'Gamma Love', ['Comedy', 'Romance']),
  enrich('tmdb:404', 'Delta Doc', ['Documentary']),
  enrich('tmdb:50', 'The Weight', ['Drama']),
  enrich('tmdb:949', 'Heat', ['Crime', 'Drama', 'Thriller']),
  enrich('tmdb:10865', 'Heat', ['Action', 'Crime']),
]);

function catalog() {
  return home(
    [
      film({ title: 'ALPHA RAW' }),
      film({
        filmKey: 'beta',
        filmId: 'tmdb:202',
        title: 'Beta Dawn',
        sourceTitle: 'Beta Dawn',
      }),
      film({
        filmKey: 'gamma',
        filmId: 'tmdb:303',
        title: 'Gamma Love',
        sourceTitle: 'Gamma Love',
      }),
      film({
        filmKey: 'delta',
        filmId: 'tmdb:404',
        title: 'Delta Doc',
        sourceTitle: 'Delta Doc',
      }),
      film({
        filmKey: 'source-only',
        filmId: null,
        title: 'Rocket League Live',
        sourceTitle: 'Rocket League Live',
      }),
    ],
    [
      opp(),
      opp({ filmKey: 'beta', localDate: LATER }),
      opp({ filmKey: 'gamma', localDate: THIS_WEEK, localTime: '18:00' }),
      opp({ filmKey: 'delta', localDate: LATER }),
      opp({ filmKey: 'source-only', localDate: THIS_WEEK, localTime: '16:00' }),
    ],
  );
}

test('Genre is an All Movies filter, not a Browse By destination', () => {
  assert.equal(
    BROWSE_ROWS.some((row) => /genre/i.test(`${row.id} ${row.label}`)),
    false,
  );
  assert.equal(BROWSE_SRC.includes("id: COLLECTION_IDS.genres"), false);
  assert.match(PAGE_SRC, /Genres/);
  assert.match(PAGE_SRC, /aria-expanded/);
  assert.match(PAGE_SRC, /role="dialog"/);
  assert.match(PAGE_SRC, /type="checkbox"/);
  assert.match(PAGE_SRC, /Clear genres/);
  assert.match(PAGE_SRC, /Apply/);
  assert.equal(PAGE_SRC.includes('genresOpen'), true);
  assert.equal(COMPOSER_SRC.includes('URLSearchParams'), false);
  assert.match(APP_SRC, /allMoviesUi/);
  assert.match(COMPOSER_SRC, /session state/);
});

test('normalizeAllMoviesUi keeps genreKeys defensive and sorted', () => {
  assert.deepEqual(
    normalizeAllMoviesGenreKeys(['Horror', 'horror', '', 'Comedy', '  Drama  ']),
    ['comedy', 'drama', 'horror'],
  );
  assert.deepEqual(normalizeAllMoviesUi({ genreKeys: 'Drama' }).genreKeys, []);
  assert.deepEqual(
    normalizeAllMoviesUi({ genreKeys: ['Romance', 'Comedy'] }).genreKeys,
    ['comedy', 'romance'],
  );
});

test('full genre list is retained after film-level consolidation', () => {
  const data = home(
    [
      film({ filmKey: 'weight', filmId: 'tmdb:50', title: 'The Weight' }),
      film({
        filmKey: 'weight-early',
        filmId: 'tmdb:50',
        title: 'The Weight Early Access',
        parentFilmKey: 'weight',
      }),
    ],
    [
      opp({ filmKey: 'weight' }),
      opp({ filmKey: 'weight-early', localTime: '20:00' }),
      opp({ filmKey: 'weight-early', localTime: '21:00', theaterId: 'beacon' }),
    ],
  );
  const page = composeAllMoviesPresentation(data, {
    now: NOW,
    enrichmentIndex: INDEX,
  });
  assert.equal(page.totalCount, 1);
  const row = page.films[0];
  assert.deepEqual(row.genres, ['Drama']);
  assert.deepEqual(row.genreKeys, ['drama']);
  assert.equal(row.genre, 'Drama');
  const drama = page.genreInventory.find((option) => option.key === 'drama');
  assert.equal(drama.count, 1);
  assert.equal(page.films[0].showtimeCount, 3);
});

test('a film keeps every structured genre without duplicates', () => {
  const page = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
  });
  const alpha = page.films.find((row) => row.filmId === 'tmdb:101');
  assert.deepEqual(alpha.genres, ['Drama', 'Romance', 'Thriller']);
  assert.deepEqual(alpha.genreKeys, ['drama', 'romance', 'thriller']);
  assert.equal(alpha.genre, 'Drama');
  assert.equal(new Set(alpha.genres).size, alpha.genres.length);
  assert.equal(
    extractAllMoviesGenres(INDEX, 'tmdb:101').join('|'),
    'Drama|Romance|Thriller',
  );
});

test('no selected genre keeps the comprehensive catalog, including no-genre films', () => {
  const page = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
  });
  assert.equal(page.totalCount, 5);
  assert.equal(page.visibleCount, 5);
  assert.equal(
    page.films.some((row) => row.title === 'Rocket League Live'),
    true,
  );
  assert.equal(
    page.genreInventory.some((option) => option.key === 'unknown'),
    false,
  );
  assert.equal(page.thisWeekCount + page.laterCount, page.totalCount);
});

test('one genre and multi-select OR semantics', () => {
  const data = catalog();
  const horror = composeAllMoviesPresentation(data, {
    now: NOW,
    enrichmentIndex: INDEX,
    genreKeys: ['horror'],
  });
  assert.deepEqual(
    horror.films.map((row) => row.title),
    ['Beta Dawn'],
  );

  const orPage = composeAllMoviesPresentation(data, {
    now: NOW,
    enrichmentIndex: INDEX,
    genreKeys: ['horror', 'comedy'],
  });
  assert.deepEqual(
    orPage.films.map((row) => row.title).sort(),
    ['Beta Dawn', 'Gamma Love'],
  );
  assert.equal(orPage.visibleCount, 2);

  const romance = composeAllMoviesPresentation(data, {
    now: NOW,
    enrichmentIndex: INDEX,
    genreKeys: ['romance'],
  });
  assert.deepEqual(
    romance.films.map((row) => row.title).sort(),
    ['Canonical Alpha', 'Gamma Love'],
  );
});

test('no-genre films disappear only when a genre is selected', () => {
  const empty = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
    genreKeys: ['western'],
  });
  assert.equal(empty.state, 'genre-empty');
  assert.equal(empty.emptyMessage, 'No movies match these genres.');
  assert.equal(empty.emptyAction.id, 'clear-genres');
  assert.equal(
    empty.films.some((row) => row.title === 'Rocket League Live'),
    false,
  );
});

test('genre inventory counts unique films, not screenings or variants', () => {
  const options = buildAllMoviesGenreOptions([
    { genres: ['Drama', 'Romance'], genreKeys: ['drama', 'romance'] },
    { genres: ['Drama'], genreKeys: ['drama'] },
    { genres: ['Drama', 'Drama'], genreKeys: ['drama'] },
  ]);
  assert.equal(options.find((option) => option.key === 'drama').count, 3);
  assert.equal(options[0].key, 'drama');
  assert.deepEqual(
    options.map((option) => option.label),
    ['Drama', 'Romance'],
  );
});

test('faceted counts ignore the genre dimension itself', () => {
  const unfiltered = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
  });
  const filtered = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
    genreKeys: ['horror'],
  });
  const unfilteredHorror = unfiltered.genreOptions.find(
    (option) => option.key === 'horror',
  );
  const filteredHorror = filtered.genreOptions.find(
    (option) => option.key === 'horror',
  );
  const filteredComedy = filtered.genreOptions.find(
    (option) => option.key === 'comedy',
  );
  assert.equal(unfilteredHorror.count, filteredHorror.count);
  assert.ok(filteredComedy.count > 0);
  assert.equal(filtered.visibleCount, 1);
});

test('search combines with genre and does not treat genre names as title search', () => {
  const combined = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
    query: 'love',
    genreKeys: ['horror'],
  });
  assert.equal(combined.visibleCount, 0);
  assert.equal(combined.state, 'genre-empty');

  const romanceLove = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
    query: 'love',
    genreKeys: ['romance'],
  });
  assert.equal(romanceLove.visibleCount, 1);
  assert.equal(romanceLove.films[0].title, 'Gamma Love');

  const titleHorror = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
    query: 'Horror',
  });
  assert.equal(titleHorror.visibleCount, 0);
  assert.equal(titleHorror.state, 'search-empty');
});

test('genre plus This Week / Later stays internally consistent', () => {
  const laterDocs = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
    availability: 'later',
    genreKeys: ['documentary'],
  });
  assert.equal(laterDocs.visibleCount, 1);
  assert.equal(laterDocs.films[0].title, 'Delta Doc');

  const thisWeekDocs = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
    availability: 'this-week',
    genreKeys: ['documentary'],
  });
  assert.equal(thisWeekDocs.visibleCount, 0);

  const allRomance = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
    genreKeys: ['romance'],
  });
  assert.equal(
    allRomance.matchedThisWeekCount + allRomance.matchedLaterCount,
    allRomance.matchedCount,
  );
  assert.equal(allRomance.matchedCount, allRomance.visibleCount);
  assert.equal(allRomance.thisWeekCount + allRomance.laterCount, allRomance.totalCount);
});

test('genre filtering does not change Soonest / A–Z semantics', () => {
  const soonest = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
    genreKeys: ['romance'],
    sort: 'soonest',
  });
  const az = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
    genreKeys: ['romance'],
    sort: 'az',
  });
  assert.deepEqual(
    soonest.films.map((row) => row.title),
    ['Gamma Love', 'Canonical Alpha'],
  );
  assert.deepEqual(
    az.films.map((row) => row.title),
    ['Canonical Alpha', 'Gamma Love'],
  );
});

test('same-title distinct films stay distinct under a shared genre', () => {
  const data = home(
    [
      film({ filmKey: 'heat-1995', filmId: 'tmdb:949', title: 'Heat' }),
      film({ filmKey: 'heat-1986', filmId: 'tmdb:10865', title: 'Heat' }),
    ],
    [
      opp({ filmKey: 'heat-1995' }),
      opp({ filmKey: 'heat-1986', localDate: LATER }),
    ],
  );
  const page = composeAllMoviesPresentation(data, {
    now: NOW,
    enrichmentIndex: INDEX,
    genreKeys: ['crime'],
  });
  assert.equal(page.films.filter((row) => row.title === 'Heat').length, 2);
  const crime = page.genreInventory.find((option) => option.key === 'crime');
  assert.equal(crime.count, 2);
});

test('hydration introduces genres and recomposes an active filter', () => {
  const data = home([film()], [opp()]);
  const missing = composeAllMoviesPresentation(data, { now: NOW });
  assert.deepEqual(missing.films[0].genres, []);
  assert.equal(missing.genreInventory.length, 0);

  const selectedMissing = composeAllMoviesPresentation(data, {
    now: NOW,
    genreKeys: ['drama'],
  });
  assert.equal(selectedMissing.visibleCount, 0);
  assert.equal(selectedMissing.state, 'genre-empty');

  const hydrated = composeAllMoviesPresentation(data, {
    now: NOW,
    enrichmentIndex: INDEX,
    genreKeys: ['drama'],
  });
  assert.equal(hydrated.visibleCount, 1);
  assert.deepEqual(hydrated.films[0].genres, ['Drama', 'Romance', 'Thriller']);
  assert.equal(
    hydrated.genreInventory.find((option) => option.key === 'drama').count,
    1,
  );
});

test('All Movies UI restore includes two selected genres', () => {
  const restored = normalizeAllMoviesUi({
    query: 'love',
    availability: 'later',
    sort: 'az',
    genreKeys: ['Romance', 'Comedy'],
  });
  assert.deepEqual(restored, {
    query: 'love',
    availability: 'later',
    sort: 'az',
    genreKeys: ['comedy', 'romance'],
  });

  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, { collectionId: COLLECTION_IDS.allMovies });
  nav = openFilmDetail(nav, {
    filmKey: 'gamma',
    filmId: 'tmdb:303',
    opportunityKey: 'gamma-next',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  nav = navigateBack(nav);
  assert.equal(nav.surface?.collectionId, COLLECTION_IDS.allMovies);
  assert.match(PAGE_SRC, /genreKeys/);
  assert.equal(PAGE_SRC.includes('setGenresOpen(true)'), true);
  assert.equal(PAGE_SRC.includes('genresOpen:'), false);
});

test('preview counts use faceted rows rather than applying the draft filter to options', () => {
  const page = composeAllMoviesPresentation(catalog(), {
    now: NOW,
    enrichmentIndex: INDEX,
    genreKeys: ['horror'],
  });
  assert.equal(
    countAllMoviesMatchingGenreKeys(page.facetGenreKeys, ['horror', 'comedy']),
    2,
  );
  assert.equal(countAllMoviesMatchingGenreKeys(page.facetGenreKeys, []), 5);
  assert.equal(filmMatchesAllMoviesGenres(['drama'], []), true);
  assert.equal(filmMatchesAllMoviesGenres([], ['drama']), false);
});

test('live All Movies genre coverage is derived after consolidation', () => {
  const showtimes = JSON.parse(
    readFileSync(join(ROOT, 'public/data/showtimes_current.json'), 'utf8'),
  );
  const theaters = JSON.parse(
    readFileSync(join(ROOT, 'public/data/theaters.json'), 'utf8'),
  );
  const newly = JSON.parse(
    readFileSync(join(ROOT, 'public/data/newly_added_current.json'), 'utf8'),
  );
  const enrichmentDoc = JSON.parse(
    readFileSync(join(ROOT, 'public/data/film_enrichment_current.json'), 'utf8'),
  );
  const liveHome = buildHomeData({
    showtimesCurrent: showtimes,
    theatersRegistry: theaters,
    newlyAdded: newly,
  });
  const index = buildEnrichmentIndex(enrichmentDoc);
  const inventory = buildAllMoviesInventory(liveHome, { now: NOW });
  const page = composeAllMoviesPresentation(liveHome, {
    now: NOW,
    enrichmentIndex: index,
  });
  assert.equal(page.totalCount, inventory.items.length);
  assert.equal(page.thisWeekCount + page.laterCount, page.totalCount);
  const known = page.films.filter((row) => row.genres.length > 0).length;
  const unknown = page.films.filter((row) => row.genres.length === 0).length;
  assert.equal(known + unknown, page.totalCount);
  assert.ok(known > 0);
  assert.ok(page.genreInventory.length > 0);
  assert.equal(
    page.genreInventory.some((option) => option.label === 'Unknown'),
    false,
  );
  const drama = page.genreInventory.find((option) => option.key === 'drama');
  if (drama) {
    const filtered = composeAllMoviesPresentation(liveHome, {
      now: NOW,
      enrichmentIndex: index,
      genreKeys: ['drama'],
    });
    assert.equal(filtered.visibleCount, drama.count);
    assert.equal(
      filtered.matchedThisWeekCount + filtered.matchedLaterCount,
      filtered.matchedCount,
    );
  }
});
