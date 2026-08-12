import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTmdbMovieRequestUrl,
  buildTmdbSearchRequestUrl,
  resolveTmdbApiConfig,
  TMDB_EDGE_FUNCTION_NAME,
} from '../../v2/search/tmdbApiConfig.js';
import {
  isTmdbProxyOriginAllowed,
  sanitizeTmdbMovieId,
  sanitizeTmdbSearchLimit,
  sanitizeTmdbSearchQuery,
  shapeTmdbMovieResponse,
  shapeTmdbSearchResponse,
  runTmdbSearch,
  runTmdbMovieDetail,
  TMDB_PROXY_MAX_QUERY_LENGTH,
  TMDB_PROXY_MAX_RESULTS,
} from '../../supabase/functions/_shared/tmdbProxyContract.js';
import { fetchTmdbSearchResults } from '../../v2/search/tmdbSearchClient.js';

test('resolveTmdbApiConfig prefers explicit VITE_TMDB_PROXY_BASE', () => {
  const config = resolveTmdbApiConfig(
    {
      VITE_TMDB_PROXY_BASE: 'https://example.test/api/tmdb/',
      VITE_SUPABASE_URL: 'https://proj.supabase.co',
      DEV: false,
    },
    { isDev: false },
  );
  assert.equal(config.mode, 'custom');
  assert.equal(config.searchPath, 'https://example.test/api/tmdb/search');
  assert.equal(config.usesQueryAction, false);

  const edgeOverride = resolveTmdbApiConfig(
    {
      VITE_TMDB_PROXY_BASE:
        'https://proj.supabase.co/functions/v1/tmdb-api',
    },
    { isDev: false },
  );
  assert.equal(edgeOverride.usesQueryAction, true);
  assert.equal(
    edgeOverride.searchPath,
    'https://proj.supabase.co/functions/v1/tmdb-api',
  );
});

test('resolveTmdbApiConfig uses Vite proxy in development', () => {
  const config = resolveTmdbApiConfig(
    { VITE_SUPABASE_URL: 'https://proj.supabase.co', DEV: true },
    { isDev: true },
  );
  assert.equal(config.mode, 'vite-proxy');
  assert.equal(config.searchPath, '/api/tmdb/search');
  assert.equal(config.moviePathPrefix, '/api/tmdb/movie');
});

test('resolveTmdbApiConfig uses Supabase Edge Function in production', () => {
  const config = resolveTmdbApiConfig(
    {
      VITE_SUPABASE_URL: 'https://proj.supabase.co/',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'anon-key',
      DEV: false,
      PROD: true,
    },
    { isDev: false },
  );
  assert.equal(config.mode, 'supabase-edge');
  assert.equal(
    config.searchPath,
    `https://proj.supabase.co/functions/v1/${TMDB_EDGE_FUNCTION_NAME}`,
  );
  assert.equal(config.usesQueryAction, true);
  assert.equal(config.headers.apikey, 'anon-key');
  assert.match(config.headers.Authorization, /^Bearer anon-key$/);
});

test('resolveTmdbApiConfig is unavailable without supabase in production', () => {
  const config = resolveTmdbApiConfig({ DEV: false, PROD: true }, { isDev: false });
  assert.equal(config.mode, 'unavailable');
  assert.equal(config.available, false);
});

test('build URLs for edge vs vite shapes', () => {
  const edge = resolveTmdbApiConfig(
    {
      VITE_SUPABASE_URL: 'https://proj.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    { isDev: false },
  );
  const search = buildTmdbSearchRequestUrl(edge, 'dune', 5);
  assert.match(search, /action=search/);
  assert.match(search, /query=dune/);
  const movie = buildTmdbMovieRequestUrl(edge, '123');
  assert.match(movie, /action=movie/);
  assert.match(movie, /id=123/);

  const vite = resolveTmdbApiConfig({}, { isDev: true });
  assert.equal(
    buildTmdbSearchRequestUrl(vite, 'dune', 5),
    '/api/tmdb/search?query=dune&limit=5',
  );
  assert.equal(buildTmdbMovieRequestUrl(vite, '9'), '/api/tmdb/movie/9');
});

test('sanitize search query and movie id', () => {
  assert.equal(sanitizeTmdbSearchQuery('  dune  ').ok, true);
  assert.equal(sanitizeTmdbSearchQuery('').error, 'empty_query');
  assert.equal(
    sanitizeTmdbSearchQuery('x'.repeat(TMDB_PROXY_MAX_QUERY_LENGTH + 1)).error,
    'query_too_long',
  );
  assert.equal(sanitizeTmdbMovieId('tmdb:42').id, '42');
  assert.equal(sanitizeTmdbMovieId('0').ok, false);
  assert.equal(sanitizeTmdbSearchLimit(99), TMDB_PROXY_MAX_RESULTS);
});

test('CORS allowlist matches Reel Seattle origins', () => {
  assert.equal(isTmdbProxyOriginAllowed('https://www.reelseattle.com'), true);
  assert.equal(isTmdbProxyOriginAllowed('http://127.0.0.1:5175'), true);
  assert.equal(isTmdbProxyOriginAllowed('https://evil.example'), false);
});

test('shape helpers only keep whitelist fields', () => {
  const search = shapeTmdbSearchResponse(
    {
      results: [
        {
          id: 1,
          title: 'A',
          adult: true,
          vote_average: 9,
          poster_path: '/a.jpg',
          popularity: 3,
        },
      ],
    },
    5,
  );
  assert.deepEqual(Object.keys(search.results[0]).sort(), [
    'id',
    'original_title',
    'overview',
    'popularity',
    'poster_path',
    'release_date',
    'title',
  ]);

  const movie = shapeTmdbMovieResponse({
    id: 2,
    title: 'B',
    runtime: 100,
    genres: [{ id: 1, name: 'Drama' }],
    credits: {
      crew: [
        { job: 'Director', name: 'Ada' },
        { job: 'Writer', name: 'Eve' },
      ],
    },
    release_dates: {
      results: [
        {
          iso_3166_1: 'US',
          release_dates: [{ certification: 'PG-13' }],
        },
      ],
    },
    secret_field: 'nope',
  });
  assert.equal(movie.us_certification, 'PG-13');
  assert.equal(movie.credits.crew.length, 1);
  assert.equal('secret_field' in movie, false);
});

test('runTmdbSearch uses shared contract with mocked upstream', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [{ id: 5, title: 'Mock', poster_path: null, popularity: 1 }],
    }),
  });
  const result = await runTmdbSearch(
    { query: 'mock', limit: 5 },
    { TMDB_API_KEY: 'test-key' },
    { fetchImpl },
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.results[0].title, 'Mock');
});

test('runTmdbMovieDetail validates id before fetch', async () => {
  const result = await runTmdbMovieDetail(
    { id: 'nope' },
    { TMDB_API_KEY: 'test-key' },
    {
      fetchImpl: async () => {
        throw new Error('should not fetch');
      },
    },
  );
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'invalid_id');
});

test('client soft-fails when api config unavailable', async () => {
  const result = await fetchTmdbSearchResults('dune', {
    apiConfig: resolveTmdbApiConfig({}, { isDev: false }),
    fetchImpl: async () => {
      throw new Error('should not fetch');
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.results, []);
});

test('client uses production edge URL shape with injected config', async () => {
  /** @type {string | null} */
  let seenUrl = null;
  const apiConfig = resolveTmdbApiConfig(
    {
      VITE_SUPABASE_URL: 'https://proj.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    { isDev: false },
  );
  const result = await fetchTmdbSearchResults('dune', {
    apiConfig,
    fetchImpl: async (url, init) => {
      seenUrl = String(url);
      assert.equal(init.headers.apikey, 'pk');
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      };
    },
  });
  assert.equal(result.ok, true);
  assert.match(seenUrl, /functions\/v1\/tmdb-api/);
  assert.match(seenUrl, /action=search/);
});
