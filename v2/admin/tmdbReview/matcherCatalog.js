/**
 * Load local film-identity matcher artifacts for admin review telemetry.
 * Served only by the local v2 Vite middleware (not public Pages allowlist).
 */

import { sourceIdentityKey } from './sourceIdentity.js';
import { buildMatcherContextFromCatalogFilm } from './reviewSnapshot.js';

const CATALOG_URL = '/admin-data/film_identity_catalog.json';

/**
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ ok: boolean, byKey: Map<string, object>, error?: string }>}
 */
export async function fetchMatcherCatalogIndex(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl(CATALOG_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return {
        ok: false,
        byKey: new Map(),
        error: `matcher_catalog_http_${response.status}`,
      };
    }
    const doc = await response.json();
    const byKey = indexCatalogFilms(doc?.films);
    return { ok: true, byKey };
  } catch (error) {
    return {
      ok: false,
      byKey: new Map(),
      error: error instanceof Error ? error.message : 'matcher_catalog_fetch_failed',
    };
  }
}

/**
 * @param {unknown} films
 * @returns {Map<string, object>}
 */
export function indexCatalogFilms(films) {
  /** @type {Map<string, object>} */
  const byKey = new Map();
  if (!Array.isArray(films)) return byKey;
  for (const film of films) {
    if (!film || typeof film !== 'object') continue;
    const identities = Array.isArray(film.source_identities)
      ? film.source_identities
      : [];
    const src = identities[0] && typeof identities[0] === 'object' ? identities[0] : {};
    const key =
      film.provenance?.source_identity_key ||
      sourceIdentityKey({
        source: src.source,
        sourceFilmId: src.source_film_id,
        showtimeFilmKey: src.showtime_film_key,
      });
    if (!key) continue;
    byKey.set(key, film);
  }
  return byKey;
}

/**
 * @param {Map<string, object> | null | undefined} byKey
 * @param {string | null | undefined} sourceIdentityKeyValue
 */
export function matcherContextForIdentity(byKey, sourceIdentityKeyValue) {
  if (!byKey || !sourceIdentityKeyValue) return null;
  const film = byKey.get(sourceIdentityKeyValue);
  return buildMatcherContextFromCatalogFilm(film);
}
