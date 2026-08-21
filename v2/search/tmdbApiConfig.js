/**
 * Resolve TMDB search/detail endpoints for v2.
 *
 * Priority:
 * 1. VITE_TMDB_PROXY_BASE — explicit override (advanced / staging)
 * 2. import.meta.env.DEV — local Vite middleware at /api/tmdb/*
 * 3. VITE_SUPABASE_URL — production Supabase Edge Function tmdb-api
 * 4. unavailable — client soft-fails; local search still works
 *
 * Never reads server-only TMDB credential env vars (proxy/Edge Function only).
 */

export const TMDB_EDGE_FUNCTION_NAME = 'tmdb-api';

/**
 * @param {Record<string, unknown> | ImportMetaEnv | null | undefined} env
 * @param {{ isDev?: boolean }} [options]
 */
export function resolveTmdbApiConfig(env, options = {}) {
  const source = env && typeof env === 'object' ? env : {};
  const isDev =
    typeof options.isDev === 'boolean'
      ? options.isDev
      : Boolean(source.DEV);

  const override =
    typeof source.VITE_TMDB_PROXY_BASE === 'string'
      ? source.VITE_TMDB_PROXY_BASE.trim().replace(/\/$/, '')
      : '';

  if (override) {
    const usesQueryAction = /(?:^|\/)tmdb-api\/?$/.test(override);
    return {
      mode: /** @type {'custom'} */ ('custom'),
      available: true,
      searchPath: usesQueryAction ? override : `${override}/search`,
      moviePathPrefix: usesQueryAction ? override : `${override}/movie`,
      /** @type {Record<string, string>} */
      headers: {},
      usesQueryAction,
    };
  }

  if (isDev) {
    return {
      mode: /** @type {'vite-proxy'} */ ('vite-proxy'),
      available: true,
      searchPath: '/api/tmdb/search',
      moviePathPrefix: '/api/tmdb/movie',
      /** @type {Record<string, string>} */
      headers: {},
      usesQueryAction: false,
    };
  }

  const supabaseUrl =
    typeof source.VITE_SUPABASE_URL === 'string'
      ? source.VITE_SUPABASE_URL.trim().replace(/\/$/, '')
      : '';
  const anonKey =
    typeof source.VITE_SUPABASE_PUBLISHABLE_KEY === 'string'
      ? source.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
      : '';

  if (supabaseUrl) {
    /** @type {Record<string, string>} */
    const headers = { Accept: 'application/json' };
    // Supabase gateway expects apikey even when verify_jwt is false.
    if (anonKey) {
      headers.apikey = anonKey;
      headers.Authorization = `Bearer ${anonKey}`;
    }
    return {
      mode: /** @type {'supabase-edge'} */ ('supabase-edge'),
      available: true,
      searchPath: `${supabaseUrl}/functions/v1/${TMDB_EDGE_FUNCTION_NAME}`,
      moviePathPrefix: `${supabaseUrl}/functions/v1/${TMDB_EDGE_FUNCTION_NAME}`,
      headers,
      usesQueryAction: true,
    };
  }

  return {
    mode: /** @type {'unavailable'} */ ('unavailable'),
    available: false,
    searchPath: null,
    moviePathPrefix: null,
    /** @type {Record<string, string>} */
    headers: {},
    usesQueryAction: false,
  };
}

/**
 * @param {ReturnType<typeof resolveTmdbApiConfig>} config
 * @param {string} query
 * @param {number} limit
 */
export function buildTmdbSearchRequestUrl(config, query, limit) {
  if (!config?.available || !config.searchPath) return null;
  if (config.usesQueryAction) {
    const url = new URL(config.searchPath);
    url.searchParams.set('action', 'search');
    url.searchParams.set('query', query);
    url.searchParams.set('limit', String(limit));
    return url.toString();
  }
  const url = new URL(
    config.searchPath,
    typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1',
  );
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(limit));
  return url.pathname + url.search;
}

/**
 * @param {ReturnType<typeof resolveTmdbApiConfig>} config
 * @param {string} numericId
 */
export function buildTmdbMovieRequestUrl(config, numericId) {
  if (!config?.available || !config.moviePathPrefix) return null;
  if (config.usesQueryAction) {
    const url = new URL(config.moviePathPrefix);
    url.searchParams.set('action', 'movie');
    url.searchParams.set('id', numericId);
    return url.toString();
  }
  return `${config.moviePathPrefix}/${numericId}`;
}
