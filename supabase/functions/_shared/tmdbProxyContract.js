/**
 * Shared TMDB proxy contract for Reel Seattle Search Phase 1.
 *
 * Used by:
 * - local Vite middleware (`vite.v2.config.js`)
 * - production Supabase Edge Function (`supabase/functions/tmdb-api`)
 *
 * Whitelists only movie search + movie detail. Never a generic TMDB proxy.
 * Works in Node and Deno (plain ESM, no Node-only APIs).
 */

export const TMDB_PROXY_MAX_QUERY_LENGTH = 80;
export const TMDB_PROXY_MAX_RESULTS = 5;

/** Browser origins allowed to call the production Edge Function. */
export const TMDB_PROXY_ALLOWED_ORIGINS = Object.freeze([
  'https://www.reelseattle.com',
  'https://reelseattle.com',
  'http://127.0.0.1:5175',
  'http://localhost:5175',
]);

/**
 * @param {string | null | undefined} origin
 * @returns {string | null}
 */
export function normalizeOrigin(origin) {
  if (typeof origin !== 'string') return null;
  const trimmed = origin.trim().replace(/\/$/, '');
  return trimmed || null;
}

/**
 * @param {string | null | undefined} origin
 */
export function isTmdbProxyOriginAllowed(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return TMDB_PROXY_ALLOWED_ORIGINS.includes(normalized);
}

/**
 * CORS headers for allowlisted browser origins only (no credentials).
 * @param {string | null | undefined} origin
 * @returns {Record<string, string>}
 */
export function tmdbProxyCorsHeaders(origin) {
  const normalized = normalizeOrigin(origin);
  /** @type {Record<string, string>} */
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (normalized && isTmdbProxyOriginAllowed(normalized)) {
    headers['Access-Control-Allow-Origin'] = normalized;
  }
  return headers;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, query: string } | { ok: false, error: string }}
 */
export function sanitizeTmdbSearchQuery(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'invalid_query' };
  }
  const query = raw.trim().replace(/\s+/g, ' ');
  if (!query) return { ok: false, error: 'empty_query' };
  if (query.length > TMDB_PROXY_MAX_QUERY_LENGTH) {
    return { ok: false, error: 'query_too_long' };
  }
  return { ok: true, query };
}

/**
 * @param {unknown} rawLimit
 * @returns {number}
 */
export function sanitizeTmdbSearchLimit(rawLimit) {
  const n = typeof rawLimit === 'number' ? rawLimit : Number(rawLimit);
  if (!Number.isFinite(n)) return TMDB_PROXY_MAX_RESULTS;
  return Math.min(Math.max(1, Math.floor(n)), TMDB_PROXY_MAX_RESULTS);
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, id: string } | { ok: false, error: string }}
 */
export function sanitizeTmdbMovieId(raw) {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return { ok: true, id: String(raw) };
  }
  if (typeof raw !== 'string') return { ok: false, error: 'invalid_id' };
  const trimmed = raw.trim();
  const fromPrefixed = /^tmdb:([1-9][0-9]*)$/.exec(trimmed);
  if (fromPrefixed) return { ok: true, id: fromPrefixed[1] };
  if (/^[1-9][0-9]*$/.test(trimmed)) return { ok: true, id: trimmed };
  return { ok: false, error: 'invalid_id' };
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ mode: 'bearer' | 'api_key', value: string } | null}
 */
export function resolveTmdbCredential(env) {
  const bearer = String(env?.TMDB_READ_ACCESS_TOKEN || '').trim();
  if (bearer) return { mode: 'bearer', value: bearer };
  const apiKey = String(env?.TMDB_API_KEY || '').trim();
  if (apiKey) return { mode: 'api_key', value: apiKey };
  return null;
}

/**
 * @param {string} path
 * @param {Record<string, string | number | boolean>} query
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function fetchTmdbUpstream(path, query, env, options = {}) {
  const cred = resolveTmdbCredential(env);
  if (!cred) {
    const error = new Error('tmdb_unconfigured');
    error.status = 503;
    throw error;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  /** @type {Record<string, string>} */
  const headers = { Accept: 'application/json' };
  if (cred.mode === 'bearer') {
    headers.Authorization = `Bearer ${cred.value}`;
  } else {
    url.searchParams.set('api_key', cred.value);
  }
  const response = await fetchImpl(url, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`TMDB HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

/**
 * Slim search payload — only fields the SPA maps.
 * @param {object} body
 * @param {number} limit
 */
export function shapeTmdbSearchResponse(body, limit) {
  const capped = sanitizeTmdbSearchLimit(limit);
  const rows = Array.isArray(body?.results) ? body.results : [];
  return {
    results: rows.slice(0, capped).map((row) => ({
      id: row?.id ?? null,
      title: row?.title ?? null,
      original_title: row?.original_title ?? null,
      release_date: row?.release_date ?? null,
      overview: row?.overview ?? null,
      poster_path: row?.poster_path ?? null,
      popularity: row?.popularity ?? null,
    })),
  };
}

/**
 * Slim movie detail payload — only fields Film Detail needs.
 * @param {object} body
 */
export function shapeTmdbMovieResponse(body) {
  const usEntry = (body?.release_dates?.results || []).find(
    (row) => row?.iso_3166_1 === 'US',
  );
  const usCert =
    (usEntry?.release_dates || []).find(
      (row) =>
        typeof row?.certification === 'string' && row.certification.trim(),
    )?.certification || null;

  const crew = Array.isArray(body?.credits?.crew) ? body.credits.crew : [];
  return {
    id: body?.id ?? null,
    title: body?.title ?? null,
    original_title: body?.original_title ?? null,
    release_date: body?.release_date ?? null,
    runtime: body?.runtime ?? null,
    overview: body?.overview ?? null,
    poster_path: body?.poster_path ?? null,
    backdrop_path: body?.backdrop_path ?? null,
    genres: Array.isArray(body?.genres)
      ? body.genres.map((g) => ({ id: g?.id ?? null, name: g?.name ?? null }))
      : [],
    credits: {
      crew: crew
        .filter((person) => person?.job === 'Director')
        .slice(0, 4)
        .map((person) => ({
          job: person.job,
          name: person.name,
        })),
    },
    us_certification: usCert,
  };
}

/**
 * Run whitelist search.
 * @param {{ query: unknown, limit?: unknown }} params
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function runTmdbSearch(params, env, options = {}) {
  const sanitized = sanitizeTmdbSearchQuery(params?.query);
  if (!sanitized.ok) {
    if (sanitized.error === 'empty_query') {
      return { status: 200, body: { results: [] } };
    }
    return { status: 400, body: { error: sanitized.error } };
  }
  const limit = sanitizeTmdbSearchLimit(params?.limit);
  const upstream = await fetchTmdbUpstream(
    '/search/movie',
    {
      query: sanitized.query,
      include_adult: 'false',
      language: 'en-US',
      page: '1',
    },
    env,
    options,
  );
  return {
    status: 200,
    body: shapeTmdbSearchResponse(upstream, limit),
    cacheControl: 'public, max-age=60',
  };
}

/**
 * Run whitelist movie detail.
 * @param {{ id: unknown }} params
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function runTmdbMovieDetail(params, env, options = {}) {
  const sanitized = sanitizeTmdbMovieId(params?.id);
  if (!sanitized.ok) {
    return { status: 400, body: { error: sanitized.error } };
  }
  const upstream = await fetchTmdbUpstream(
    `/movie/${sanitized.id}`,
    {
      language: 'en-US',
      append_to_response: 'credits,release_dates',
    },
    env,
    options,
  );
  return {
    status: 200,
    body: shapeTmdbMovieResponse(upstream),
    cacheControl: 'public, max-age=300',
  };
}
