import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  asCanonicalFilmId,
  buildEnrichmentIndex,
  lookupEnrichment,
} from '../../v2/enrichment/enrichmentIndex.js';
import { resolveTmdbImageUrl } from '../../v2/enrichment/resolveTmdbImageUrl.js';
import { resolveEnrichedFilmPresentation } from '../../v2/enrichment/resolveEnrichedFilmPresentation.js';
import { loadFilmEnrichment } from '../../v2/enrichment/loadFilmEnrichment.js';
import {
  buildInlineQuickDetail,
  buildOpeningThisWeekShelf,
} from '../../v2/home/shelfData.js';
import { buildSearchResultsModel } from '../../v2/explore/searchResultsModel.js';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import { TMDB_ATTRIBUTION } from '../../v2/enrichment/tmdbAttributionCopy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EXAMPLE = JSON.parse(
  readFileSync(
    join(ROOT, 'tests/fixtures/enrichment/film_enrichment_v1_example.json'),
    'utf8',
  ),
);
const SHOWTIMES = JSON.parse(
  readFileSync(
    join(ROOT, 'tests/fixtures/frontend/v2_showtimes_home_mini.json'),
    'utf8',
  ),
);
const THEATERS = JSON.parse(
  readFileSync(
    join(ROOT, 'tests/fixtures/frontend/v2_theaters_home_mini.json'),
    'utf8',
  ),
);
const NEWLY = JSON.parse(
  readFileSync(
    join(ROOT, 'tests/fixtures/frontend/v2_newly_added_home_mini.json'),
    'utf8',
  ),
);
const OPENING_THIS_WEEK = JSON.parse(
  readFileSync(
    join(ROOT, 'tests/fixtures/frontend/v2_opening_this_week_mini.json'),
    'utf8',
  ),
);

test('enrichment index loads v1 artifact by film_id', () => {
  const frozen = structuredClone(EXAMPLE);
  const index = buildEnrichmentIndex(frozen);
  assert.equal(index.status, 'ready');
  assert.equal(index.rowCount, 1);
  assert.ok(index.byFilmId.has('tmdb:15080'));
  assert.equal(lookupEnrichment(index, 'tmdb:15080')?.display_title, 'Only Yesterday');
  // Raw artifact not mutated.
  assert.deepEqual(frozen, EXAMPLE);
});

test('enrichment index degrades on missing/invalid artifacts', () => {
  assert.equal(buildEnrichmentIndex(null).status, 'unavailable');
  assert.equal(buildEnrichmentIndex({ version: 2, films: [] }).status, 'unavailable');
  assert.equal(
    buildEnrichmentIndex({ version: 1, films: 'nope', image_config: {} }).status,
    'unavailable',
  );
});

test('join uses exact filmId only', () => {
  const index = buildEnrichmentIndex(EXAMPLE);
  assert.equal(asCanonicalFilmId('15080'), null);
  assert.equal(asCanonicalFilmId('amc-sinners'), null);
  assert.equal(lookupEnrichment(index, null), null);
  assert.equal(lookupEnrichment(index, 'tmdb:999'), null);
  assert.ok(lookupEnrichment(index, 'tmdb:15080'));
});

test('poster precedence: TMDB wins, source fills gap', () => {
  const index = buildEnrichmentIndex(EXAMPLE);
  const withSource = resolveEnrichedFilmPresentation({
    sourceFilm: {
      filmId: 'tmdb:15080',
      title: 'Only Yesterday 35th Anniversary',
      posterUrl: 'https://example.com/source.jpg',
      runtimeMin: 119,
    },
    enrichmentIndex: index,
    context: 'film-detail',
  });
  assert.equal(withSource.displayTitle, 'Only Yesterday');
  assert.equal(withSource.canonicalTitle, 'Only Yesterday');
  assert.match(withSource.posterUrl, /image\.tmdb\.org/);
  assert.equal(withSource.posterSource, 'tmdb');
  assert.equal(withSource.canonicalYear, 1991);
  assert.ok(withSource.synopsisPreview);
  assert.equal(withSource.runtimeMin, 118);
  assert.equal(withSource.runtimeSource, 'tmdb');
  assert.equal(withSource.usCertification, 'G');
  assert.match(withSource.backdropUrl, /image\.tmdb\.org/);

  const withoutTmdbPoster = resolveEnrichedFilmPresentation({
    sourceFilm: {
      filmId: 'tmdb:15080',
      title: 'Only Yesterday 35th Anniversary',
      posterUrl: 'https://example.com/source.jpg',
      runtimeMin: 119,
    },
    enrichment: {
      ...EXAMPLE.films[0],
      poster: null,
      runtime_minutes: null,
      us_certification: null,
    },
    enrichmentIndex: index,
    context: 'film-detail',
  });
  assert.equal(withoutTmdbPoster.posterSource, 'source');
  assert.equal(withoutTmdbPoster.posterUrl, 'https://example.com/source.jpg');
  assert.equal(withoutTmdbPoster.runtimeMin, 119);
  assert.equal(withoutTmdbPoster.runtimeSource, 'theater_source');
});

test('null filmId suppresses enrichment fields but keeps film', () => {
  const index = buildEnrichmentIndex(EXAMPLE);
  const presentation = resolveEnrichedFilmPresentation({
    sourceFilm: {
      filmId: null,
      title: 'Mystery Screening',
      posterUrl: 'https://example.com/p.jpg',
      runtimeMin: 90,
    },
    enrichmentIndex: index,
  });
  assert.equal(presentation.hasEnrichment, false);
  assert.equal(presentation.canonicalYear, null);
  assert.equal(presentation.genreLine, null);
  assert.equal(presentation.synopsisPreview, null);
  assert.equal(presentation.displayTitle, 'Mystery Screening');
  assert.equal(presentation.posterUrl, 'https://example.com/p.jpg');
});

test('resolveTmdbImageUrl validates paths', () => {
  const config = {
    secureBaseUrl: 'https://image.tmdb.org/t/p/',
    posterSize: 'w500',
  };
  assert.equal(resolveTmdbImageUrl({ path: 'bad.jpg' }, config), null);
  assert.equal(
    resolveTmdbImageUrl({ path: '/abc.jpg' }, config),
    'https://image.tmdb.org/t/p/w500/abc.jpg',
  );
});

test('loadFilmEnrichment tolerates fetch failure', async () => {
  const result = await loadFilmEnrichment({
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(result.status, 'unavailable');
  assert.match(result.warning, /offline/);
});

test('Home shelf and quick detail activate enrichment fields', () => {
  const homeData = buildHomeData({
    showtimesCurrent: SHOWTIMES,
    theatersRegistry: THEATERS,
    newlyAdded: NEWLY,
    openingThisWeek: OPENING_THIS_WEEK,
    pipelineReport: null,
  });
  // Attach enrichment for sinners via filmId already in fixture.
  const enrichmentDoc = {
    version: 1,
    generated_at: '2026-07-28T00:00:00+00:00',
    provider: 'tmdb',
    language: 'en-US',
    image_config: EXAMPLE.image_config,
    films: [
      {
        ...EXAMPLE.films[0],
        film_id: 'tmdb:1133620',
        tmdb_id: 1133620,
        display_title: 'Sinners',
        release_year: 2025,
        overview: 'Twin brothers return home.',
        genres: [{ id: 28, name: 'Action' }, { id: 18, name: 'Drama' }],
        poster: { path: '/sinners.jpg', url: null },
      },
    ],
  };
  const index = buildEnrichmentIndex(enrichmentDoc);
  const shelf = buildOpeningThisWeekShelf(homeData, index);
  const sinnersCard = shelf.films.find((f) => f.filmKey === 'sinners');
  assert.ok(sinnersCard);
  assert.equal(sinnersCard.genre, 'Action');
  assert.ok(sinnersCard.posterUrl);

  const detail = buildInlineQuickDetail(homeData, sinnersCard, index);
  assert.match(detail.metaLine, /2025/);
  assert.match(detail.metaLine, /Action/);
  assert.match(detail.synopsis, /Twin brothers/);
  assert.equal(detail.rating, 'G'); // TMDB US certification via shared resolver
  assert.equal(detail.title, 'Sinners');
});

test('attribution copy includes required non-endorsement notice', () => {
  assert.match(TMDB_ATTRIBUTION.body, /not endorsed/i);
  assert.match(TMDB_ATTRIBUTION.body, /TMDB/);
  assert.ok(TMDB_ATTRIBUTION.logoSrc);
});

test('Search prefers canonical title and activates enrichment by filmId', () => {
  const homeData = buildHomeData({
    showtimesCurrent: SHOWTIMES,
    theatersRegistry: THEATERS,
    newlyAdded: NEWLY,
    openingThisWeek: OPENING_THIS_WEEK,
    pipelineReport: null,
  });
  const enrichmentDoc = {
    version: 1,
    generated_at: '2026-07-28T00:00:00+00:00',
    provider: 'tmdb',
    language: 'en-US',
    image_config: EXAMPLE.image_config,
    films: [
      {
        ...EXAMPLE.films[0],
        film_id: 'tmdb:1133620',
        tmdb_id: 1133620,
        display_title: 'Sinners',
        release_year: 2025,
        overview: 'Twin brothers return home to confront evil.',
        genres: [
          { id: 28, name: 'Action' },
          { id: 18, name: 'Drama' },
        ],
        poster: { path: '/sinners.jpg', url: null },
        directors: [{ tmdb_person_id: 1, name: 'Ryan Coogler' }],
      },
    ],
  };
  const index = buildEnrichmentIndex(enrichmentDoc);
  const model = buildSearchResultsModel(homeData, 'Sinners', {
    typeFilter: 'movies',
    enrichmentIndex: index,
  });
  const row = model.films.find((f) => f.filmKey === 'sinners');
  assert.ok(row);
  assert.equal(row.filmId, 'tmdb:1133620');
  assert.equal(row.title, 'Sinners');
  assert.equal(row.year, 2025);
  assert.equal(row.genre, 'Action, Drama');
  assert.match(row.metaLine, /2025/);
  assert.match(row.metaLine, /Action/);
  assert.match(row.synopsis, /Twin brothers/);
  assert.equal(row.rating, 'G'); // TMDB US certification from enrichment
  assert.equal(row.director, 'Ryan Coogler'); // carried; Search UI does not render
  assert.match(row.posterUrl, /image\.tmdb\.org\/t\/p\/w500\/sinners\.jpg/); // TMDB first
  assert.equal(row.hasEnrichment, true);

  const searchCtx = resolveEnrichedFilmPresentation({
    sourceFilm: {
      filmId: 'tmdb:1133620',
      title: 'Sinners — Special Presentation',
      posterUrl: null,
      runtimeMin: 138,
    },
    enrichmentIndex: index,
    context: 'search',
  });
  assert.equal(searchCtx.displayTitle, 'Sinners');
  assert.equal(searchCtx.sourceTitle, 'Sinners — Special Presentation');
  assert.equal(searchCtx.posterSource, 'tmdb');
});

test('Search does not join enrichment by title alone', () => {
  const homeData = buildHomeData({
    showtimesCurrent: SHOWTIMES,
    theatersRegistry: THEATERS,
    newlyAdded: NEWLY,
    openingThisWeek: OPENING_THIS_WEEK,
    pipelineReport: null,
  });
  const index = buildEnrichmentIndex(EXAMPLE); // only Yesterday / tmdb:15080
  const model = buildSearchResultsModel(homeData, 'Sinners', {
    typeFilter: 'movies',
    enrichmentIndex: index,
  });
  const row = model.films.find((f) => f.filmKey === 'sinners');
  assert.ok(row);
  assert.equal(row.filmId, 'tmdb:1133620');
  assert.equal(row.hasEnrichment, false);
  assert.equal(row.year, null);
  assert.equal(row.synopsis, null);
});
