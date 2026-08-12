/**
 * Production TMDB whitelist proxy (Supabase Edge Function).
 *
 * GET ?action=search&query=...&limit=5
 * GET ?action=movie&id=<numeric>
 *
 * Auth: none required for Phase 1 search (verify_jwt = false).
 * Secrets: TMDB_READ_ACCESS_TOKEN (preferred) or TMDB_API_KEY.
 */

import {
  isTmdbProxyOriginAllowed,
  normalizeOrigin,
  runTmdbMovieDetail,
  runTmdbSearch,
  tmdbProxyCorsHeaders,
} from '../_shared/tmdbProxyContract.js';

function jsonResponse(status, body, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...tmdbProxyCorsHeaders(origin),
      ...extraHeaders,
    },
  });
}

Deno.serve(async (req) => {
  const origin = normalizeOrigin(req.headers.get('Origin'));

  if (req.method === 'OPTIONS') {
    if (origin && !isTmdbProxyOriginAllowed(origin)) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, {
      status: 204,
      headers: tmdbProxyCorsHeaders(origin),
    });
  }

  if (req.method !== 'GET') {
    return jsonResponse(405, { error: 'method_not_allowed' }, origin);
  }

  // Browser calls include Origin; non-browser/health checks may omit it.
  if (origin && !isTmdbProxyOriginAllowed(origin)) {
    return jsonResponse(403, { error: 'origin_not_allowed' }, origin);
  }

  const url = new URL(req.url);
  const action = (url.searchParams.get('action') || '').trim().toLowerCase();
  const env = {
    TMDB_READ_ACCESS_TOKEN: Deno.env.get('TMDB_READ_ACCESS_TOKEN') ?? '',
    TMDB_API_KEY: Deno.env.get('TMDB_API_KEY') ?? '',
  };

  try {
    if (action === 'search') {
      const result = await runTmdbSearch(
        {
          query: url.searchParams.get('query'),
          limit: url.searchParams.get('limit'),
        },
        env,
      );
      return jsonResponse(result.status, result.body, origin, {
        ...(result.cacheControl
          ? { 'Cache-Control': result.cacheControl }
          : {}),
      });
    }

    if (action === 'movie') {
      const result = await runTmdbMovieDetail(
        { id: url.searchParams.get('id') },
        env,
      );
      return jsonResponse(result.status, result.body, origin, {
        ...(result.cacheControl
          ? { 'Cache-Control': result.cacheControl }
          : {}),
      });
    }

    return jsonResponse(404, { error: 'unknown_action' }, origin);
  } catch (error) {
    const status = Number(error?.status) || 502;
    return jsonResponse(
      status,
      {
        error: status === 503 ? 'tmdb_unconfigured' : 'tmdb_unavailable',
      },
      origin,
    );
  }
});
