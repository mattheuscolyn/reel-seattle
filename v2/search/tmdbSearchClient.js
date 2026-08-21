/**
 * TMDB search/detail client for v2 Search Phase 1.
 *
 * Dev: local Vite `/api/tmdb/*` middleware (secrets server-side).
 * Prod: Supabase Edge Function `tmdb-api` via VITE_SUPABASE_URL
 *       (TMDB credentials live in Supabase secrets — never in the SPA).
 */

import { normalizeTmdbImagePath } from '../enrichment/resolveTmdbImageUrl.js';
import {
  buildTmdbMovieRequestUrl,
  buildTmdbSearchRequestUrl,
  resolveTmdbApiConfig,
} from './tmdbApiConfig.js';

export const TMDB_SEARCH_LIMIT = 5;
export const TMDB_SEARCH_DEBOUNCE_MS = 350;
/** @deprecated Prefer resolveTmdbApiConfig(); kept for tests/docs. */
export const TMDB_SEARCH_API_PATH = '/api/tmdb/search';
/** @deprecated Prefer resolveTmdbApiConfig(); kept for tests/docs. */
export const TMDB_MOVIE_API_PATH = '/api/tmdb/movie';

/** Public TMDB image CDN (paths only; not an API credential). */
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * @returns {ReturnType<typeof resolveTmdbApiConfig>}
 */
function defaultTmdbApiConfig() {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env
      : null;
  // Vite injects DEV/PROD/MODE. Outside Vite (Node tests), fall back to
  // relative /api/tmdb paths so callers can inject fetchImpl.
  if (env && (env.DEV === true || env.PROD === true || env.MODE)) {
    return resolveTmdbApiConfig(env);
  }
  return resolveTmdbApiConfig({}, { isDev: true });
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asTmdbFilmId(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return `tmdb:${value}`;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^tmdb:[1-9][0-9]*$/.test(trimmed)) return trimmed;
  if (/^[1-9][0-9]*$/.test(trimmed)) return `tmdb:${trimmed}`;
  return null;
}

/**
 * @param {string | null | undefined} filmKeyOrId
 * @returns {string | null} numeric TMDB id
 */
export function tmdbNumericIdFromFilmKey(filmKeyOrId) {
  const id = asTmdbFilmId(filmKeyOrId);
  if (!id) return null;
  return id.slice('tmdb:'.length);
}

/**
 * @param {string | null | undefined} posterPath
 * @param {'w185' | 'w342' | 'w500' | 'w780' | 'original'} [size]
 */
export function posterUrlFromTmdbPath(posterPath, size = 'w342') {
  const path = normalizeTmdbImagePath(posterPath);
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

/**
 * @param {string | null | undefined} backdropPath
 * @param {'w780' | 'w1280' | 'original'} [size]
 */
export function backdropUrlFromTmdbPath(backdropPath, size = 'w780') {
  const path = normalizeTmdbImagePath(backdropPath);
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

/**
 * @param {string | null | undefined} releaseDate
 * @returns {number | null}
 */
export function yearFromReleaseDate(releaseDate) {
  if (typeof releaseDate !== 'string') return null;
  const match = /^(\d{4})/.exec(releaseDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

/**
 * Map a TMDB /search/movie row into a Search Results film view-model.
 * @param {object} row
 */
export function mapTmdbSearchHitToFilmResult(row) {
  if (!row || typeof row !== 'object') return null;
  const filmId = asTmdbFilmId(row.id);
  if (!filmId) return null;
  const title =
    (typeof row.title === 'string' && row.title.trim()) ||
    (typeof row.original_title === 'string' && row.original_title.trim()) ||
    null;
  if (!title) return null;
  const year = yearFromReleaseDate(row.release_date);
  const overview =
    typeof row.overview === 'string' && row.overview.trim()
      ? row.overview.trim()
      : null;
  const metaParts = [year != null ? String(year) : null].filter(Boolean);

  const originalTitle =
    typeof row.original_title === 'string' && row.original_title.trim()
      ? row.original_title.trim()
      : null;

  const tmdbId = Number(filmId.slice('tmdb:'.length));

  return {
    origin: /** @type {'tmdb'} */ ('tmdb'),
    filmKey: filmId,
    filmId,
    tmdbId,
    parentFilmKey: null,
    showtimeFilmKey: filmId,
    title,
    originalTitle:
      originalTitle && originalTitle !== title ? originalTitle : null,
    sourceTitle: title,
    posterUrl: posterUrlFromTmdbPath(row.poster_path),
    runtimeMin: null,
    metaLine: metaParts.length ? metaParts.join(' · ') : null,
    year,
    genre: null,
    synopsis: overview,
    rating: null,
    language: null,
    director: null,
    hasEnrichment: false,
    showtimeChip: null,
    opportunityKey: null,
    alsoPlayingLabel: null,
    weekShowtimeLabel: null,
    availabilityLabel: 'No Seattle showtimes yet',
    badges: [],
    theaterCount: 0,
    showtimeCount: 0,
    tmdbPopularity:
      typeof row.popularity === 'number' && Number.isFinite(row.popularity)
        ? row.popularity
        : 0,
  };
}

/**
 * @param {string} query
 * @param {{
 *   signal?: AbortSignal,
 *   limit?: number,
 *   fetchImpl?: typeof fetch,
 *   apiConfig?: ReturnType<typeof resolveTmdbApiConfig>,
 * }} [options]
 * @returns {Promise<{ ok: boolean, results: object[], error?: string | null, status?: number }>}
 */
export async function fetchTmdbSearchResults(query, options = {}) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) {
    return { ok: true, results: [], error: null, status: 200 };
  }
  const limit =
    typeof options.limit === 'number' && options.limit > 0
      ? Math.min(options.limit, TMDB_SEARCH_LIMIT)
      : TMDB_SEARCH_LIMIT;
  const config = options.apiConfig ?? defaultTmdbApiConfig();
  const url = buildTmdbSearchRequestUrl(config, q, limit);
  if (!url) {
    return {
      ok: false,
      results: [],
      error: 'tmdb_unavailable',
      status: 0,
    };
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(config.headers || {}),
      },
      signal: options.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        results: [],
        error: 'tmdb_unavailable',
        status: response.status,
      };
    }
    const body = await response.json().catch(() => ({}));
    const rows = Array.isArray(body?.results) ? body.results : [];
    const results = [];
    for (const row of rows) {
      const mapped = mapTmdbSearchHitToFilmResult(row);
      if (mapped) results.push(mapped);
      if (results.length >= limit) break;
    }
    return { ok: true, results, error: null, status: response.status };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, results: [], error: 'aborted', status: 0 };
    }
    return {
      ok: false,
      results: [],
      error: 'tmdb_unavailable',
      status: 0,
    };
  }
}

/**
 * @param {string} tmdbFilmIdOrNumeric
 * @param {{
 *   signal?: AbortSignal,
 *   fetchImpl?: typeof fetch,
 *   apiConfig?: ReturnType<typeof resolveTmdbApiConfig>,
 * }} [options]
 */
export async function fetchTmdbMovieDetail(tmdbFilmIdOrNumeric, options = {}) {
  const numeric = tmdbNumericIdFromFilmKey(tmdbFilmIdOrNumeric);
  if (!numeric) {
    return { ok: false, movie: null, error: 'invalid_id', status: 400 };
  }
  const config = options.apiConfig ?? defaultTmdbApiConfig();
  const url = buildTmdbMovieRequestUrl(config, numeric);
  if (!url) {
    return { ok: false, movie: null, error: 'tmdb_unavailable', status: 0 };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(config.headers || {}),
      },
      signal: options.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        movie: null,
        error: 'tmdb_unavailable',
        status: response.status,
      };
    }
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return { ok: false, movie: null, error: 'invalid_payload', status: 502 };
    }
    return { ok: true, movie: body, error: null, status: response.status };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, movie: null, error: 'aborted', status: 0 };
    }
    return { ok: false, movie: null, error: 'tmdb_unavailable', status: 0 };
  }
}
