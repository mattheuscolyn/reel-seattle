/**
 * Cross-surface canonical film presentation consistency.
 *
 * Fixture: Ice Cream Man with deliberately conflicting TMDB vs theater metadata.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnrichmentIndex } from '../../v2/enrichment/enrichmentIndex.js';
import { enrichHomeFilm } from '../../v2/enrichment/enrichHomeFilm.js';
import { resolveEnrichedFilmPresentation } from '../../v2/enrichment/resolveEnrichedFilmPresentation.js';
import { buildSearchFilmResult } from '../../v2/explore/searchResultsModel.js';
import { groupBrowseOpportunitiesByFilm } from '../../v2/showtimes/showtimesBrowseModel.js';
import { composeTheaterDetailPresentation } from '../../v2/theaters/composeTheaterDetailPresentation.js';
import { composeFilmDetailPresentation } from '../../v2/filmDetail/composeFilmDetailPresentation.js';
import { listPlannerEligibleFilms } from '../../v2/planner/buildPlanFilmCatalog.js';
import { homeDataToPlannerRows } from '../../v2/planner/homeDataToPlannerRows.js';
import { filmsForKeys } from '../../v2/explore/exploreCatalog.js';

const TMDB_POSTER_PATH = '/tmdb-poster.jpg';
const TMDB_BACKDROP_PATH = '/tmdb-backdrop.jpg';
const AMC_POSTER = 'https://example.com/amc-poster.jpg';

function makeEnrichmentIndex() {
  return buildEnrichmentIndex({
    version: 1,
    generated_at: '2026-08-06T00:00:00Z',
    image_config: {
      secure_base_url: 'https://image.tmdb.org/t/p/',
      poster_size: 'w500',
      backdrop_size: 'w780',
    },
    films: [
      {
        film_id: 'tmdb:1477712',
        display_title: 'Ice Cream Man',
        original_title: 'Ice Cream Man',
        release_year: 2026,
        runtime_minutes: 86,
        us_certification: 'NR',
        overview: 'TMDB synopsis for Ice Cream Man.',
        genres: [
          { id: 1, name: 'Horror' },
          { id: 2, name: 'Comedy' },
          { id: 3, name: 'Thriller' },
        ],
        directors: [{ id: 9, name: 'Jane Director' }],
        poster: { path: TMDB_POSTER_PATH },
        backdrop: { path: TMDB_BACKDROP_PATH },
        field_provenance: {},
      },
      {
        film_id: 'tmdb:414906',
        display_title: 'The Batman',
        release_year: 2022,
        runtime_minutes: 176,
        us_certification: 'PG-13',
        overview: 'Batman 2022 overview.',
        genres: [{ id: 1, name: 'Action' }],
        directors: [],
        poster: { path: '/batman-2022.jpg' },
        backdrop: { path: '/batman-2022-bd.jpg' },
        field_provenance: {},
      },
      {
        film_id: 'tmdb:268',
        display_title: 'Batman',
        release_year: 1989,
        runtime_minutes: 126,
        us_certification: 'PG-13',
        overview: 'Batman 1989 overview.',
        genres: [{ id: 1, name: 'Action' }],
        directors: [],
        poster: { path: '/batman-1989.jpg' },
        backdrop: null,
        field_provenance: {},
      },
    ],
  });
}

function makeHomeData() {
  return {
    theatersById: {
      'amc-pacific-place-11': {
        id: 'amc-pacific-place-11',
        name: 'AMC Pacific Place 11',
        city: 'Seattle',
        enabled: true,
        opportunityCount: 4,
      },
    },
    films: [
      {
        filmKey: 'ice-cream-man',
        filmId: 'tmdb:1477712',
        title: 'Ice Cream Man',
        posterUrl: AMC_POSTER,
        runtimeMin: 85,
        synopsis: 'AMC synopsis',
        parentFilmKey: null,
      },
      {
        filmKey: 'ice-cream-man-sensory',
        filmId: 'tmdb:1477712',
        title: 'Ice Cream Man: Sensory Friendly Screening',
        posterUrl: 'https://example.com/variant-poster.jpg',
        runtimeMin: 85,
        parentFilmKey: 'ice-cream-man',
        screeningVariantType: 'sensory_friendly',
      },
      {
        filmKey: 'batman-2022',
        filmId: 'tmdb:414906',
        title: 'The Batman',
        posterUrl: 'https://example.com/source-batman-2022.jpg',
        runtimeMin: 170,
        parentFilmKey: null,
      },
      {
        filmKey: 'batman-1989',
        filmId: 'tmdb:268',
        title: 'The Batman',
        posterUrl: 'https://example.com/source-batman-1989.jpg',
        runtimeMin: 120,
        parentFilmKey: null,
      },
      {
        filmKey: 'local-shorts-night',
        filmId: null,
        title: 'Local Shorts Night',
        posterUrl: 'https://example.com/shorts.jpg',
        runtimeMin: 90,
        parentFilmKey: null,
      },
      {
        filmKey: 'tmdb-no-poster',
        filmId: 'tmdb:999001',
        title: 'No Poster Film',
        posterUrl: 'https://example.com/source-only-poster.jpg',
        runtimeMin: 100,
        parentFilmKey: null,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'o-icm-1',
        filmKey: 'ice-cream-man',
        filmId: 'tmdb:1477712',
        title: 'Ice Cream Man',
        theaterId: 'amc-pacific-place-11',
        theaterName: 'AMC Pacific Place 11',
        localDate: '2026-08-10',
        localTime: '19:00',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-08-10T19:00',
        formatLabels: ['Digital'],
        ticketUrl: 'https://example.com/tickets/icm',
        runtimeMin: 85,
      },
      {
        opportunityKey: 'o-icm-sf',
        filmKey: 'ice-cream-man-sensory',
        filmId: 'tmdb:1477712',
        title: 'Ice Cream Man: Sensory Friendly Screening',
        theaterId: 'amc-pacific-place-11',
        theaterName: 'AMC Pacific Place 11',
        localDate: '2026-08-10',
        localTime: '21:00',
        timeDisplay: '9:00 PM',
        sortableLocalDateTime: '2026-08-10T21:00',
        formatLabels: ['Sensory Friendly'],
        screeningVariantType: 'sensory_friendly',
        parentFilmKey: 'ice-cream-man',
        ticketUrl: 'https://example.com/tickets/icm-sf',
      },
      {
        opportunityKey: 'o-bat-22',
        filmKey: 'batman-2022',
        filmId: 'tmdb:414906',
        title: 'The Batman',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-10',
        localTime: '18:00',
        sortableLocalDateTime: '2026-08-10T18:00',
        formatLabels: [],
      },
      {
        opportunityKey: 'o-bat-89',
        filmKey: 'batman-1989',
        filmId: 'tmdb:268',
        title: 'The Batman',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-10',
        localTime: '20:00',
        sortableLocalDateTime: '2026-08-10T20:00',
        formatLabels: [],
      },
      {
        opportunityKey: 'o-shorts',
        filmKey: 'local-shorts-night',
        filmId: null,
        title: 'Local Shorts Night',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-10',
        localTime: '22:00',
        sortableLocalDateTime: '2026-08-10T22:00',
        formatLabels: [],
      },
    ],
  };
}

function expectedTmdbPosterUrl() {
  return `https://image.tmdb.org/t/p/w500${TMDB_POSTER_PATH}`;
}

test('shared resolver prefers TMDB poster/runtime/year/cert/genres over theater source', () => {
  const index = makeEnrichmentIndex();
  const home = makeHomeData();
  const film = home.films[0];
  const enriched = enrichHomeFilm(film, index, 'theater', home);
  assert.equal(enriched.displayTitle, 'Ice Cream Man');
  assert.equal(enriched.posterUrl, expectedTmdbPosterUrl());
  assert.equal(enriched.posterSource, 'tmdb');
  assert.equal(enriched.runtimeMin, 86);
  assert.equal(enriched.canonicalYear, 2026);
  assert.equal(enriched.usCertification, 'NR');
  assert.deepEqual(enriched.genres, ['Horror', 'Comedy']);
  assert.match(enriched.overview, /TMDB synopsis/);
  assert.equal(enriched.directors, 'Jane Director');
});

test('TMDB poster absent falls back to source poster', () => {
  const index = buildEnrichmentIndex({
    version: 1,
    generated_at: '2026-08-06T00:00:00Z',
    image_config: {
      secure_base_url: 'https://image.tmdb.org/t/p/',
      poster_size: 'w500',
      backdrop_size: 'w780',
    },
    films: [
      {
        film_id: 'tmdb:999001',
        display_title: 'No Poster Film',
        release_year: 2024,
        runtime_minutes: null,
        us_certification: null,
        overview: null,
        genres: [],
        directors: [],
        poster: null,
        backdrop: null,
      },
    ],
  });
  const enriched = resolveEnrichedFilmPresentation({
    sourceFilm: {
      filmId: 'tmdb:999001',
      title: 'No Poster Film',
      posterUrl: 'https://example.com/source-only-poster.jpg',
      runtimeMin: 100,
      synopsis: 'Source synopsis only.',
    },
    enrichmentIndex: index,
    context: 'search',
  });
  assert.equal(enriched.posterUrl, 'https://example.com/source-only-poster.jpg');
  assert.equal(enriched.posterSource, 'source');
  assert.equal(enriched.runtimeMin, 100);
  assert.match(enriched.overview, /Source synopsis/);
});

test('source-based event does not invent TMDB presentation', () => {
  const index = makeEnrichmentIndex();
  const home = makeHomeData();
  const film = home.films.find((f) => f.filmKey === 'local-shorts-night');
  const enriched = enrichHomeFilm(film, index, 'theater', home);
  assert.equal(enriched.filmId, null);
  assert.equal(enriched.hasEnrichment, false);
  assert.equal(enriched.displayTitle, 'Local Shorts Night');
  assert.equal(enriched.posterUrl, 'https://example.com/shorts.jpg');
  assert.equal(enriched.canonicalYear, null);
  assert.equal(enriched.usCertification, null);
  assert.equal(enriched.genres.length, 0);
});

test('screening variant uses parent canonical presentation', () => {
  const index = makeEnrichmentIndex();
  const home = makeHomeData();
  const variant = home.films.find((f) => f.filmKey === 'ice-cream-man-sensory');
  const enriched = enrichHomeFilm(variant, index, 'theater', home);
  assert.equal(enriched.displayTitle, 'Ice Cream Man');
  assert.equal(enriched.posterUrl, expectedTmdbPosterUrl());
  assert.equal(enriched.runtimeMin, 86);
});

test('same-title different TMDB IDs keep distinct metadata', () => {
  const index = makeEnrichmentIndex();
  const home = makeHomeData();
  const a = enrichHomeFilm(
    home.films.find((f) => f.filmKey === 'batman-2022'),
    index,
    'search',
    home,
  );
  const b = enrichHomeFilm(
    home.films.find((f) => f.filmKey === 'batman-1989'),
    index,
    'search',
    home,
  );
  assert.equal(a.filmId, 'tmdb:414906');
  assert.equal(b.filmId, 'tmdb:268');
  assert.equal(a.canonicalYear, 2022);
  assert.equal(b.canonicalYear, 1989);
  assert.notEqual(a.posterUrl, b.posterUrl);
});

test('cross-surface adapters agree on Ice Cream Man canonical fields', () => {
  const index = makeEnrichmentIndex();
  const home = makeHomeData();
  const film = home.films[0];

  const search = buildSearchFilmResult(home, film, {}, index);
  const theater = composeTheaterDetailPresentation(
    home,
    'amc-pacific-place-11',
    index,
  );
  const icmGroup = theater.todaysShowtimes.filmGroups.find(
    (g) => g.filmId === 'tmdb:1477712',
  );
  assert.ok(icmGroup);

  const showtimes = groupBrowseOpportunitiesByFilm(
    home.opportunities.filter((o) => o.filmKey === 'ice-cream-man'),
    home,
    'today',
    index,
  );
  assert.equal(showtimes.length, 1);

  const detail = composeFilmDetailPresentation(home, 'ice-cream-man', null, {
    enrichmentIndex: index,
  });

  const planner = listPlannerEligibleFilms(home, {
    dateIso: '2026-08-10',
    enrichmentIndex: index,
    now: () => new Date('2026-08-10T10:00:00-07:00'),
  }).find((f) => f.filmId === 'tmdb:1477712');

  const collection = filmsForKeys(home, ['ice-cream-man'], index)[0];

  const expectedPoster = expectedTmdbPosterUrl();
  assert.equal(search.posterUrl, expectedPoster);
  assert.equal(icmGroup.posterUrl, expectedPoster);
  assert.equal(showtimes[0].posterUrl, expectedPoster);
  assert.equal(detail.hero?.posterUrl ?? detail.posterUrl, expectedPoster);
  assert.equal(planner.posterUrl, expectedPoster);
  assert.equal(collection.posterUrl, expectedPoster);

  assert.equal(search.title, 'Ice Cream Man');
  assert.equal(icmGroup.title, 'Ice Cream Man');
  assert.equal(showtimes[0].title, 'Ice Cream Man');

  assert.equal(search.runtimeMin, 86);
  assert.equal(showtimes[0].runtimeMin, 86);
  assert.equal(planner.runtimeMin, 86);

  assert.equal(search.year, 2026);
  assert.equal(search.rating, 'NR');

  // Theater showtimes remain source-owned.
  assert.ok(icmGroup.times.some((t) => t.label === '19:00' || t.label === '7:00 PM' || t.id === 'o-icm-1'));
  assert.ok(icmGroup.times.length >= 2); // parent + sensory merged
});

test('Theater Detail no longer nests source poster from first film for later films', () => {
  const index = makeEnrichmentIndex();
  const home = makeHomeData();
  const theater = composeTheaterDetailPresentation(
    home,
    'amc-pacific-place-11',
    index,
  );
  assert.equal(theater.todaysShowtimes.featuredFilm, null);
  const groups = theater.todaysShowtimes.filmGroups;
  assert.ok(groups.length >= 3);
  const posters = new Set(groups.map((g) => g.posterUrl));
  assert.ok(posters.has(expectedTmdbPosterUrl()));
  // Shorts keep source poster
  const shorts = groups.find((g) => g.filmKey === 'local-shorts-night');
  assert.equal(shorts.posterUrl, 'https://example.com/shorts.jpg');
});

test('planner rows use enriched posterDynamic when filmId present', () => {
  const index = makeEnrichmentIndex();
  const home = makeHomeData();
  const rows = homeDataToPlannerRows(home, { enrichmentIndex: index });
  const icm = rows.find((r) => r.filmId === 'tmdb:1477712');
  assert.ok(icm);
  assert.equal(icm.posterDynamic, expectedTmdbPosterUrl());
  assert.equal(icm.Runtime, 86);
});

test('enrichment lookup failure does not break rendering', () => {
  const home = makeHomeData();
  const theater = composeTheaterDetailPresentation(home, 'amc-pacific-place-11', null);
  assert.ok(theater.todaysShowtimes.filmGroups.length > 0);
  const icm = theater.todaysShowtimes.filmGroups.find(
    (g) => g.filmId === 'tmdb:1477712' || g.filmKey === 'ice-cream-man',
  );
  assert.ok(icm);
  assert.equal(icm.posterUrl, AMC_POSTER);
});
