/**
 * Same film → same canonical presentation across product composers.
 *
 * Source record stays raw/provider; enrichment supplies TMDB canonical fields.
 * Screening/collection identity stays listing-level.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnrichmentIndex } from '../../v2/enrichment/enrichmentIndex.js';
import {
  hydrateFilmEnrichmentForIds,
  resetFilmEnrichmentHydrationState,
} from '../../v2/enrichment/hydrateShelfFilmEnrichment.js';
import { composeCollectionDetail } from '../../v2/exploreCollections/composeCollectionDetail.js';
import { buildOpeningThisWeekShelf } from '../../v2/home/shelfData.js';
import { buildSearchFilmResult } from '../../v2/explore/searchResultsModel.js';
import { groupBrowseOpportunitiesByFilm } from '../../v2/showtimes/showtimesBrowseModel.js';
import { buildTheaterNowShowing } from '../../v2/theaters/resolveTheaterPresentation.js';
import { composePlannerSavedFilmsPresentation } from '../../v2/planner/composePlannerSavedFilmsPresentation.js';
import { composeFilmDetailPresentation } from '../../v2/filmDetail/composeFilmDetailPresentation.js';
import { composeAllMoviesPresentation } from '../../v2/allMovies/composeAllMoviesPresentation.js';
import { saveFilm } from '../../v2/stores/savedFilmsStore.js';
import {
  clearTmdbOnlyFilmCache,
  setCachedTmdbOnlyFilm,
} from '../../v2/filmDetail/tmdbOnlyFilmCache.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FILM_ID = 'tmdb:123';
const SOURCE_TITLE = 'BEACON PRESENTS: SOME RAW TITLE';
const CANONICAL_TITLE = 'Canonical Movie';
const NOW = new Date('2026-09-19T18:00:00-07:00');

function emptyEnrichmentIndex(extraFilms = []) {
  return buildEnrichmentIndex({
    version: 1,
    image_config: {
      secure_base_url: 'https://image.tmdb.org/t/p/',
      poster_size: 'w500',
      backdrop_size: 'w780',
    },
    films: extraFilms,
  });
}

function canonicalRow() {
  return {
    film_id: FILM_ID,
    tmdb_id: 123,
    display_title: CANONICAL_TITLE,
    original_title: CANONICAL_TITLE,
    release_year: 1984,
    release_date: '1984-06-01',
    overview: 'Canonical overview.',
    runtime_minutes: 117,
    genres: [{ name: 'Drama' }, { name: 'Mystery' }],
    directors: [{ name: 'Ada Director' }],
    us_certification: 'PG',
    poster: { path: '/canonical.jpg', url: null },
    backdrop: null,
    provenance: { source: 'tmdb' },
    field_provenance: {},
  };
}

function sourceFilm(overrides = {}) {
  return {
    filmKey: 'beacon-raw-film',
    filmId: FILM_ID,
    title: SOURCE_TITLE,
    sourceTitle: SOURCE_TITLE,
    posterUrl: null,
    runtimeMin: 90,
    source: 'beacon',
    sourceFilmId: 'some-raw-title',
    ...overrides,
  };
}

function sharedHome(overrides = {}) {
  const film = sourceFilm();
  return {
    films: [film],
    opportunities: [
      {
        opportunityKey: 'beacon-raw-1',
        filmKey: film.filmKey,
        filmId: FILM_ID,
        source: 'beacon',
        sourceFilmId: 'some-raw-title',
        theaterId: 'the-beacon',
        theaterName: 'The Beacon',
        localDate: '2026-09-22',
        localTime: '19:30',
        timeDisplay: '7:30 PM',
        sortableLocalDateTime: '2026-09-22T19:30:00',
        formatLabels: ['35mm'],
        specialEvent: {
          is_special_event: true,
          labels: ['Q&A'],
          types: ['qa'],
        },
      },
      {
        opportunityKey: 'unrelated-amc',
        filmKey: 'amc-canonical-elsewhere',
        filmId: FILM_ID,
        source: 'amc',
        sourceFilmId: '99999',
        theaterId: 'amc-pacific-place',
        theaterName: 'AMC Pacific Place',
        localDate: '2026-09-21',
        localTime: '20:00',
        timeDisplay: '8:00 PM',
        sortableLocalDateTime: '2026-09-21T20:00:00',
        formatLabels: [],
      },
    ],
    openingThisWeek: {
      status: 'ready',
      entries: [
        {
          filmKey: film.filmKey,
          filmId: FILM_ID,
          title: SOURCE_TITLE,
          openingDate: '2026-09-22',
          theaterCountOnOpeningDate: 1,
          visibleShowtimeCount: 1,
        },
      ],
    },
    ...overrides,
  };
}

function beaconCollectionArtifact({ canonicalFilmId = FILM_ID } = {}) {
  return {
    schema_version: '1.0.0',
    generated_at: '2026-09-11T11:20:44-07:00',
    timezone: 'America/Los_Angeles',
    collections: [
      {
        collectionId: 'beacon:program:raw-program',
        productType: 'collection',
        source: 'beacon',
        sourceCollectionType: 'program',
        title: 'Beacon Program',
        status: 'active',
        memberCount: 1,
        currentShowtimeCount: 1,
      },
    ],
    memberships: [
      {
        collectionId: 'beacon:program:raw-program',
        source: 'beacon',
        sourceFilmUrl: 'https://thebeacon.film/calendar/movie/some-raw-title',
        sourceFilmId: 'some-raw-title',
        sourceListingKey: 'beacon|id|some-raw-title',
        canonicalFilmId,
        rawTitle: SOURCE_TITLE,
        identityTitleCandidate: null,
      },
    ],
  };
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function assertCanonicalCard(card, label) {
  assert.equal(card.title, CANONICAL_TITLE, `${label} title`);
  assert.match(card.posterUrl ?? '', /canonical\.jpg/, `${label} poster`);
  if (card.year != null) {
    assert.equal(card.year, 1984, `${label} year`);
  }
  if (card.runtimeMin != null) {
    assert.equal(card.runtimeMin, 117, `${label} runtime`);
  }
  if (card.directors) {
    assert.equal(card.directors, 'Ada Director', `${label} director`);
  }
  if (card.genreLine) {
    assert.match(card.genreLine, /Drama/, `${label} genre`);
  }
}

test('same film has the same canonical presentation across composers', () => {
  const index = emptyEnrichmentIndex([canonicalRow()]);
  const home = sharedHome();
  const film = home.films[0];

  const collection = composeCollectionDetail(
    beaconCollectionArtifact(),
    'beacon:program:raw-program',
    { homeData: home, enrichmentIndex: index, now: NOW },
  );
  const collectionRow = collection.upcoming[0];
  assertCanonicalCard(collectionRow, 'collection');
  assert.equal(collectionRow.sourceTitle, SOURCE_TITLE);
  assert.equal(collectionRow.theaterName, 'The Beacon');
  assert.equal(collectionRow.theaterName.includes('Pacific Place'), false);

  const shelf = buildOpeningThisWeekShelf(home, index);
  assertCanonicalCard(shelf.films[0], 'home/shelf');

  const search = buildSearchFilmResult(home, film, {}, index);
  assertCanonicalCard(search, 'search');
  assert.equal(search.sourceTitle, SOURCE_TITLE);

  const showtimes = groupBrowseOpportunitiesByFilm(
    home.opportunities.filter((row) => row.filmKey === film.filmKey),
    home,
    'week',
    index,
  );
  assertCanonicalCard(showtimes[0], 'showtimes');

  const theater = buildTheaterNowShowing(home, 'the-beacon', {
    enrichmentIndex: index,
    now: NOW,
    daySpan: 14,
  });
  assertCanonicalCard(theater[0], 'theater');

  const storage = memoryStorage();
  saveFilm(storage, film.filmKey, {
    now: () => NOW,
    title: SOURCE_TITLE,
    filmId: FILM_ID,
  });
  const planner = composePlannerSavedFilmsPresentation({
    storage,
    homeData: home,
    enrichmentIndex: index,
    now: NOW,
  });
  assertCanonicalCard(planner.rows[0], 'planner');

  const detail = composeFilmDetailPresentation(
    home,
    film.filmKey,
    'beacon-raw-1',
    { enrichmentIndex: index, now: NOW },
  );
  assert.equal(detail.displayTitle, CANONICAL_TITLE);
  assert.equal(detail.hero.title, CANONICAL_TITLE);
  assert.match(detail.hero.posterUrl ?? '', /canonical\.jpg/);
  assert.equal(detail.hero.year, '1984');
  assert.match(detail.hero.director ?? '', /Ada Director/);
  assert.equal(detail.sourceTitle, SOURCE_TITLE);

  const allMovies = composeAllMoviesPresentation(home, {
    enrichmentIndex: index,
    now: NOW,
  });
  const allMoviesRow = allMovies.films.find((row) => row.filmId === FILM_ID);
  assertCanonicalCard(allMoviesRow, 'all-movies');
  assert.equal(allMoviesRow.sourceTitle, SOURCE_TITLE);
  assert.equal(allMoviesRow.year, 1984);
  assert.match(allMoviesRow.metaLine ?? '', /1984/);
  assert.match(allMoviesRow.metaLine ?? '', /Drama/);
});

test('Beacon collection joins home/showtime filmId when membership stamp is null', () => {
  const index = emptyEnrichmentIndex([canonicalRow()]);
  const home = sharedHome();
  const detail = composeCollectionDetail(
    beaconCollectionArtifact({ canonicalFilmId: null }),
    'beacon:program:raw-program',
    { homeData: home, enrichmentIndex: index, now: NOW },
  );
  const row = detail.upcoming[0];
  assert.equal(row.filmId, FILM_ID);
  assertCanonicalCard(row, 'beacon listing join');
  assert.equal(row.sourceTitle, SOURCE_TITLE);
});

test('missing enrichment falls back to source, then batch hydration switches presentation', async () => {
  resetFilmEnrichmentHydrationState();
  clearTmdbOnlyFilmCache();
  const empty = emptyEnrichmentIndex([]);
  const home = sharedHome();
  const before = composeCollectionDetail(
    beaconCollectionArtifact(),
    'beacon:program:raw-program',
    { homeData: home, enrichmentIndex: empty, now: NOW },
  );
  assert.equal(before.upcoming[0].title, SOURCE_TITLE);
  assert.equal(before.upcoming[0].posterUrl, null);

  const hydrated = await hydrateFilmEnrichmentForIds([FILM_ID], empty, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 123,
        title: CANONICAL_TITLE,
        release_date: '1984-06-01',
        runtime: 117,
        overview: 'Canonical overview.',
        poster_path: '/canonical.jpg',
        genres: [{ name: 'Drama' }, { name: 'Mystery' }],
        credits: { crew: [{ job: 'Director', name: 'Ada Director' }] },
      }),
    }),
  });
  assert.ok(hydrated.hydratedIds.includes(FILM_ID));
  const after = composeCollectionDetail(
    beaconCollectionArtifact(),
    'beacon:program:raw-program',
    { homeData: home, enrichmentIndex: hydrated.index, now: NOW },
  );
  assertCanonicalCard(after.upcoming[0], 'hydrated collection');
});

test('cached Film Detail snapshot hydrates another surface with no second fetch', async () => {
  resetFilmEnrichmentHydrationState();
  clearTmdbOnlyFilmCache();
  setCachedTmdbOnlyFilm(FILM_ID, {
    filmId: FILM_ID,
    title: CANONICAL_TITLE,
    year: 1984,
    runtimeMin: 117,
    posterUrl: 'https://image.tmdb.org/t/p/w500/canonical.jpg',
    overview: 'Canonical overview.',
    genres: ['Drama'],
    directors: ['Ada Director'],
    fetchedAt: new Date().toISOString(),
  });
  let fetches = 0;
  const hydrated = await hydrateFilmEnrichmentForIds(
    [FILM_ID],
    emptyEnrichmentIndex([]),
    {
      fetchImpl: async () => {
        fetches += 1;
        throw new Error('network should not run for warm cache');
      },
    },
  );
  assert.equal(fetches, 0);
  assert.ok(hydrated.hydratedIds.includes(FILM_ID));
  const shelf = buildOpeningThisWeekShelf(sharedHome(), hydrated.index);
  assert.equal(shelf.films[0].title, CANONICAL_TITLE);
});

test('five cards requesting the same ID issue one hydration request', async () => {
  resetFilmEnrichmentHydrationState();
  clearTmdbOnlyFilmCache();
  let fetches = 0;
  const fetchImpl = async () => {
    fetches += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 123,
        title: CANONICAL_TITLE,
        release_date: '1984-06-01',
        runtime: 117,
        poster_path: '/canonical.jpg',
        overview: 'Canonical overview.',
      }),
    };
  };
  const empty = emptyEnrichmentIndex([]);
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      hydrateFilmEnrichmentForIds([FILM_ID], empty, { fetchImpl }),
    ),
  );
  assert.equal(fetches, 1);
  assert.ok(results.every((row) => row.hydratedIds.includes(FILM_ID)));
});

test('no canonical filmId keeps source title/poster and never title-matches', () => {
  const index = emptyEnrichmentIndex([canonicalRow()]);
  const home = sharedHome({
    films: [
      sourceFilm({
        filmKey: 'unresolved-beacon',
        filmId: null,
        posterUrl: 'https://thebeacon.film/raw.jpg',
      }),
    ],
    opportunities: [
      {
        opportunityKey: 'unresolved-1',
        filmKey: 'unresolved-beacon',
        filmId: null,
        source: 'beacon',
        sourceFilmId: 'some-raw-title',
        theaterId: 'the-beacon',
        theaterName: 'The Beacon',
        localDate: '2026-09-22',
        localTime: '19:30',
        timeDisplay: '7:30 PM',
        sortableLocalDateTime: '2026-09-22T19:30:00',
        formatLabels: [],
      },
    ],
  });
  const detail = composeCollectionDetail(
    beaconCollectionArtifact({ canonicalFilmId: null }),
    'beacon:program:raw-program',
    { homeData: home, enrichmentIndex: index, now: NOW },
  );
  const row = detail.upcoming[0];
  assert.equal(row.filmId, null);
  assert.equal(row.title, SOURCE_TITLE);
  assert.equal(row.posterUrl, 'https://thebeacon.film/raw.jpg');
  assert.equal(row.year, null);
  assert.equal(row.unresolved, true);
});

test('collection upcoming stays listing-level and does not leak an unrelated screening', () => {
  const index = emptyEnrichmentIndex([canonicalRow()]);
  const detail = composeCollectionDetail(
    beaconCollectionArtifact(),
    'beacon:program:raw-program',
    { homeData: sharedHome(), enrichmentIndex: index, now: NOW },
  );
  const row = detail.upcoming[0];
  assert.equal(row.theaterName, 'The Beacon');
  assert.match(row.nextWhenLabel, /Sep 22/);
  assert.equal(row.nextWhenLabel.includes('Sep 21'), false);
  assert.equal(
    detail.upcoming.some((item) => item.theaterName === 'AMC Pacific Place'),
    false,
  );
});

test('screening qualifier stays source-specific while film-level title is canonical', () => {
  const index = emptyEnrichmentIndex([canonicalRow()]);
  const home = sharedHome();
  const variant = sourceFilm({
    filmKey: 'beacon-raw-film-qa',
    parentFilmKey: 'beacon-raw-film',
    title: 'BEACON PRESENTS: SOME RAW TITLE: Q&A',
    screeningVariantType: 'q_and_a',
    isSpecialScreening: true,
  });
  home.films.push(variant);
  const search = buildSearchFilmResult(home, variant, {}, index);
  assert.equal(search.title, CANONICAL_TITLE);
  assert.match(search.posterUrl ?? '', /canonical\.jpg/);
});

test('V2App uses shared hydrateFilmEnrichmentForIds and Collection Detail declares IDs', () => {
  const appSrc = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
  const collectionSrc = readFileSync(
    join(ROOT, 'v2/exploreCollections/CollectionDetailSurface.jsx'),
    'utf8',
  );
  const composerSrc = readFileSync(
    join(ROOT, 'v2/exploreCollections/composeCollectionDetail.js'),
    'utf8',
  );
  const filmDetailSrc = readFileSync(
    join(ROOT, 'v2/filmDetail/composeFilmDetailPresentation.js'),
    'utf8',
  );
  assert.match(appSrc, /hydrateFilmEnrichmentForIds/);
  assert.match(appSrc, /hydrateShelfFilmEnrichment/);
  assert.match(collectionSrc, /onHydrateFilmIds/);
  assert.match(composerSrc, /resolveCanonicalFilmPresentation/);
  assert.match(filmDetailSrc, /resolveCanonicalFilmPresentation/);
  assert.doesNotMatch(collectionSrc, /fetchTmdbMovieDetail/);
});
