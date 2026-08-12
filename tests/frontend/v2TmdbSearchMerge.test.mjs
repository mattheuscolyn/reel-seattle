import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectLocalTmdbFilmIds,
  dedupeTmdbFilmsAgainstLocal,
  mergeLocalAndTmdbSearchResults,
  shouldSuppressTmdbSearch,
} from '../../v2/search/mergeTmdbSearchResults.js';
import {
  asTmdbFilmId,
  fetchTmdbMovieDetail,
  fetchTmdbSearchResults,
  mapTmdbSearchHitToFilmResult,
} from '../../v2/search/tmdbSearchClient.js';
import {
  cacheTmdbMovieDetail,
  clearTmdbOnlyFilmCache,
  getCachedTmdbOnlyFilm,
  seedTmdbOnlyFilmFromSearchHit,
} from '../../v2/filmDetail/tmdbOnlyFilmCache.js';
import { composeTmdbOnlyFilmDetailPresentation } from '../../v2/filmDetail/composeTmdbOnlyFilmDetail.js';
import { resolveFilmDetailPresentation } from '../../v2/fixtures/resolveFilmDetailPresentation.js';
import { SEARCH_NO_SEATTLE_SHOWTIMES } from '../../v2/explore/searchCopy.js';
import { openFilmDetail, createInitialNavState } from '../../v2/navigation/navState.js';

function localModel(films = [], query = 'dune') {
  return {
    query,
    films,
    theaters: [],
    formats: [],
    people: [],
    collections: [],
    totalCount: films.length,
    emptyBody: films.length ? null : 'Try another movie',
    emptyReason: films.length ? null : 'no-matches',
  };
}

function localFilm(overrides = {}) {
  return {
    filmKey: 'local-dune-2',
    filmId: 'tmdb:438631',
    title: 'Dune: Part Two',
    year: 2024,
    showtimeChip: { label: 'Tonight 7:00 PM', theaterName: 'SIFF', formatLabel: null },
    badges: [],
    ...overrides,
  };
}

function tmdbHit(overrides = {}) {
  return mapTmdbSearchHitToFilmResult({
    id: 123456,
    title: 'Dune: Part Three',
    release_date: '2026-12-18',
    overview: 'The next chapter.',
    poster_path: '/poster.jpg',
    popularity: 120,
    ...overrides,
  });
}

test('asTmdbFilmId normalizes numeric and prefixed ids', () => {
  assert.equal(asTmdbFilmId(42), 'tmdb:42');
  assert.equal(asTmdbFilmId('tmdb:42'), 'tmdb:42');
  assert.equal(asTmdbFilmId('0'), null);
  assert.equal(asTmdbFilmId('foo'), null);
});

test('local Reel Seattle film appears normally in merged results', () => {
  const film = localFilm();
  const merged = mergeLocalAndTmdbSearchResults(localModel([film]), [], {
    tmdbStatus: 'ready',
  });
  assert.equal(merged.films.length, 1);
  assert.equal(merged.films[0].title, 'Dune: Part Two');
  assert.equal(merged.films[0].origin, 'local');
  assert.equal(merged.moreFilms.length, 0);
  assert.ok(merged.films[0].showtimeChip);
});

test('TMDB-only result appears when no local film matches', () => {
  const hit = tmdbHit();
  const merged = mergeLocalAndTmdbSearchResults(localModel([], 'dune'), [hit], {
    tmdbStatus: 'ready',
  });
  assert.equal(merged.films.length, 0);
  assert.equal(merged.moreFilms.length, 1);
  assert.equal(merged.moreFilms[0].filmId, 'tmdb:123456');
  assert.equal(
    merged.moreFilms[0].availabilityLabel,
    SEARCH_NO_SEATTLE_SHOWTIMES,
  );
  assert.equal(merged.emptyReason, null);
});

test('local + TMDB results can coexist', () => {
  const merged = mergeLocalAndTmdbSearchResults(
    localModel([localFilm()]),
    [tmdbHit()],
    { tmdbStatus: 'ready' },
  );
  assert.equal(merged.films.length, 1);
  assert.equal(merged.moreFilms.length, 1);
  assert.equal(merged.totalCount, 2);
});

test('duplicate TMDB result is suppressed when same film exists locally', () => {
  const local = localFilm({ filmId: 'tmdb:438631' });
  const dup = tmdbHit({ id: 438631, title: 'Dune: Part Two' });
  const other = tmdbHit({ id: 999001, title: 'Dune: Part Three' });
  const merged = mergeLocalAndTmdbSearchResults(localModel([local]), [dup, other], {
    tmdbStatus: 'ready',
    catalogFilms: [local],
  });
  assert.equal(merged.moreFilms.length, 1);
  assert.equal(merged.moreFilms[0].filmId, 'tmdb:999001');
});

test('catalog-wide dedupe uses home filmIds not only search hits', () => {
  const catalogOnly = { filmKey: 'x', filmId: 'tmdb:55', title: 'Known' };
  const hit = tmdbHit({ id: 55, title: 'Known' });
  const merged = mergeLocalAndTmdbSearchResults(localModel([], 'known'), [hit], {
    tmdbStatus: 'ready',
    catalogFilms: [catalogOnly],
  });
  assert.equal(merged.moreFilms.length, 0);
});

test('TMDB-only result displays No Seattle showtimes yet', () => {
  const hit = tmdbHit();
  assert.equal(hit.availabilityLabel, SEARCH_NO_SEATTLE_SHOWTIMES);
  const presentation = composeTmdbOnlyFilmDetailPresentation(
    {
      filmId: hit.filmId,
      title: hit.title,
      year: hit.year,
      posterUrl: hit.posterUrl,
      overview: hit.synopsis,
      genres: [],
      directors: [],
    },
    hit.filmId,
  );
  assert.equal(presentation.availabilityNote, SEARCH_NO_SEATTLE_SHOWTIMES);
  assert.equal(presentation.resolved, true);
});

test('TMDB-only Film Detail resolves via cache / deep-link filmKey', () => {
  clearTmdbOnlyFilmCache();
  const hit = tmdbHit();
  seedTmdbOnlyFilmFromSearchHit(hit);
  const resolved = resolveFilmDetailPresentation({
    homeData: { films: [] },
    filmKey: hit.filmId,
    forceMode: 'production',
  });
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.source, 'tmdb-live');
  assert.equal(resolved.presentation.displayTitle, 'Dune: Part Three');
  assert.equal(
    resolved.presentation.availabilityNote,
    SEARCH_NO_SEATTLE_SHOWTIMES,
  );

  const nav = openFilmDetail(createInitialNavState(), { filmKey: hit.filmId });
  assert.equal(nav.surface.type, 'film-detail');
  assert.equal(nav.surface.filmKey, 'tmdb:123456');
});

test('missing poster/release/runtime degrade gracefully', () => {
  const hit = mapTmdbSearchHitToFilmResult({
    id: 7,
    title: 'Obscure Title',
    release_date: '',
    poster_path: null,
    popularity: 1,
  });
  assert.ok(hit);
  assert.equal(hit.posterUrl, null);
  assert.equal(hit.year, null);
  assert.equal(hit.runtimeMin, null);
  assert.equal(hit.metaLine, null);

  const presentation = composeTmdbOnlyFilmDetailPresentation(
    {
      filmId: 'tmdb:7',
      title: 'Obscure Title',
      year: null,
      runtimeMin: null,
      posterUrl: null,
      overview: null,
      genres: [],
      directors: [],
    },
    'tmdb:7',
  );
  assert.equal(presentation.resolved, true);
  assert.equal(presentation.hero.posterUrl, null);
  assert.equal(presentation.hero.runtimeLabel, null);
  assert.equal(presentation.synopsis.available, false);
});

test('TMDB failure does not break local search results', () => {
  const film = localFilm();
  const merged = mergeLocalAndTmdbSearchResults(localModel([film]), [], {
    tmdbStatus: 'error',
  });
  assert.equal(merged.films.length, 1);
  assert.equal(merged.moreFilms.length, 0);
  assert.equal(merged.tmdbStatus, 'error');
});

test('fetchTmdbSearchResults maps mocked network payloads', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [
        {
          id: 1,
          title: 'Alpha',
          release_date: '2020-01-01',
          poster_path: '/a.jpg',
          popularity: 10,
        },
      ],
    }),
  });
  const result = await fetchTmdbSearchResults('alpha', { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].filmId, 'tmdb:1');
});

test('fetchTmdbSearchResults soft-fails without breaking callers', async () => {
  const fetchImpl = async () => {
    throw new Error('network down');
  };
  const result = await fetchTmdbSearchResults('alpha', { fetchImpl });
  assert.equal(result.ok, false);
  assert.deepEqual(result.results, []);
});

test('fetchTmdbMovieDetail caches normalized movie', async () => {
  clearTmdbOnlyFilmCache();
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 77,
      title: 'Cached Film',
      release_date: '2019-05-01',
      runtime: 121,
      overview: 'A synopsis.',
      poster_path: '/c.jpg',
      backdrop_path: '/b.jpg',
      genres: [{ name: 'Drama' }],
      credits: { crew: [{ job: 'Director', name: 'Ada' }] },
      us_certification: 'R',
    }),
  });
  const result = await fetchTmdbMovieDetail('tmdb:77', { fetchImpl });
  assert.equal(result.ok, true);
  const cached = cacheTmdbMovieDetail(result.movie);
  assert.equal(cached.filmId, 'tmdb:77');
  assert.equal(getCachedTmdbOnlyFilm('tmdb:77')?.title, 'Cached Film');
  assert.equal(cached.directors[0], 'Ada');
});

test('exhibition filters suppress TMDB search', () => {
  assert.equal(shouldSuppressTmdbSearch({ timeFilter: 'tonight' }), true);
  assert.equal(shouldSuppressTmdbSearch({ theaterIds: ['siFF'] }), true);
  assert.equal(shouldSuppressTmdbSearch({ formatTags: ['IMAX'] }), true);
  assert.equal(shouldSuppressTmdbSearch({ typeFilter: 'theaters' }), true);
  assert.equal(shouldSuppressTmdbSearch({ typeFilter: 'all' }), false);
});

test('collectLocalTmdbFilmIds ignores non-tmdb ids', () => {
  const ids = collectLocalTmdbFilmIds([
    { filmId: 'tmdb:1' },
    { filmId: 'local:abc' },
    { filmId: null },
  ]);
  assert.deepEqual([...ids], ['tmdb:1']);
});

test('dedupeTmdbFilmsAgainstLocal respects limit', () => {
  const hits = [1, 2, 3, 4, 5, 6].map((id) =>
    tmdbHit({ id, title: `Film ${id}`, popularity: id }),
  );
  const out = dedupeTmdbFilmsAgainstLocal(hits, new Set());
  assert.equal(out.length, 5);
});
