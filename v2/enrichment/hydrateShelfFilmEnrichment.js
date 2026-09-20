/**
 * Shared batch hydration of canonical filmIds missing static enrichment.
 *
 * Surfaces declare the exact tmdb:* IDs they need. One fetch per ID,
 * cache-aware, concurrency-limited — never a per-card TMDB effect.
 *
 * hydrateShelfFilmEnrichment() remains the Home startup path and stays
 * shelf-only (opening / leaving / just-announced). Other surfaces must
 * pass their own ID lists into hydrateFilmEnrichmentForIds().
 */

import { asCanonicalFilmId, lookupEnrichment } from './enrichmentIndex.js';
import { mergeEnrichmentIndexWithSnapshots } from './mergeEnrichmentIndexWithSnapshots.js';
import {
  cacheTmdbMovieDetail,
  getCachedTmdbOnlyFilm,
} from '../filmDetail/tmdbOnlyFilmCache.js';
import { fetchTmdbMovieDetail } from '../search/tmdbSearchClient.js';

export const DEFAULT_HYDRATION_CONCURRENCY = 4;
export const MAX_HYDRATION_CONCURRENCY = 8;
export const MAX_SURFACE_HYDRATION_IDS = 48;

/** @type {Map<string, Promise<object | null>>} */
const inFlightById = new Map();
/** @type {Set<string>} */
const attemptedNetworkIds = new Set();

/**
 * Test-only: clear in-flight and attempted-fetch bookkeeping.
 */
export function resetFilmEnrichmentHydrationState() {
  inFlightById.clear();
  attemptedNetworkIds.clear();
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function cachedSnapshotUsable(value) {
  if (!value || typeof value !== 'object') return false;
  return Boolean(
    value.title && (value.posterUrl || value.overview || value.year),
  );
}

/**
 * Dedupe and cap an ID list. Exact canonical filmIds only.
 *
 * @param {Iterable<unknown>} ids
 * @param {number} [maxIds]
 * @returns {string[]}
 */
export function uniqueCanonicalFilmIds(ids, maxIds = Infinity) {
  /** @type {Set<string>} */
  const unique = new Set();
  for (const raw of ids ?? []) {
    const id = asCanonicalFilmId(raw);
    if (!id) continue;
    unique.add(id);
    if (unique.size >= maxIds) break;
  }
  return [...unique];
}

/**
 * @param {Iterable<unknown>} ids
 * @param {object | null | undefined} enrichmentIndex
 * @returns {string[]}
 */
export function collectCanonicalFilmIdsNeedingEnrichment(
  ids,
  enrichmentIndex = null,
) {
  /** @type {string[]} */
  const needed = [];
  for (const id of uniqueCanonicalFilmIds(ids)) {
    if (lookupEnrichment(enrichmentIndex, id)) continue;
    needed.push(id);
  }
  return needed;
}

/**
 * Collect durable filmIds from Home-related shelf artifacts that still need
 * enrichment metadata.
 *
 * @param {object | null | undefined} homeData
 * @param {object | null | undefined} enrichmentIndex
 * @returns {string[]}
 */
export function collectShelfFilmIdsNeedingEnrichment(
  homeData,
  enrichmentIndex = null,
) {
  /** @type {Set<string>} */
  const needed = new Set();

  const consider = (rawId) => {
    const id = asCanonicalFilmId(rawId);
    if (!id) return;
    if (lookupEnrichment(enrichmentIndex, id)) return;
    needed.add(id);
  };

  const openingEntries = homeData?.openingThisWeek?.entries;
  if (Array.isArray(openingEntries)) {
    for (const entry of openingEntries) {
      consider(entry?.filmId ?? entry?.film_id);
    }
  }

  const leavingEntries = homeData?.leavingSoon?.entries;
  if (Array.isArray(leavingEntries)) {
    for (const entry of leavingEntries) {
      consider(entry?.filmId ?? entry?.film_id);
    }
  }

  const newlyAdded = homeData?.newlyAdded;
  if (Array.isArray(newlyAdded)) {
    for (const entry of newlyAdded) {
      consider(entry?.filmId ?? entry?.film_id);
    }
  }

  // Shelf-only: do not fan out TMDB fetches for every live showtime film.
  // Live films already join via film_enrichment_current when matched.

  return [...needed].sort();
}

/**
 * @param {string} filmId
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   signal?: AbortSignal,
 * }} [options]
 * @returns {Promise<object | null>}
 */
function fetchOneSnapshot(filmId, options = {}) {
  const existing = inFlightById.get(filmId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const cached = getCachedTmdbOnlyFilm(filmId);
      if (cachedSnapshotUsable(cached)) return cached;
      if (attemptedNetworkIds.has(filmId)) return cached ?? null;
      attemptedNetworkIds.add(filmId);
      const result = await fetchTmdbMovieDetail(filmId, {
        fetchImpl: options.fetchImpl,
        signal: options.signal,
      });
      if (!result.ok || !result.movie) return null;
      return cacheTmdbMovieDetail(result.movie);
    } catch {
      return null;
    } finally {
      inFlightById.delete(filmId);
    }
  })();

  inFlightById.set(filmId, promise);
  return promise;
}

/**
 * @param {string[]} filmIds
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   signal?: AbortSignal,
 *   concurrency?: number,
 * }} [options]
 * @returns {Promise<object[]>}
 */
export async function fetchMissingShelfEnrichmentSnapshots(
  filmIds,
  options = {},
) {
  const ids = uniqueCanonicalFilmIds(filmIds);
  /** @type {object[]} */
  const snapshots = [];
  const concurrency = Math.max(
    1,
    Math.min(
      options.concurrency ?? DEFAULT_HYDRATION_CONCURRENCY,
      MAX_HYDRATION_CONCURRENCY,
    ),
  );

  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((filmId) => fetchOneSnapshot(filmId, options)),
    );
    for (const snapshot of results) {
      if (snapshot) snapshots.push(snapshot);
    }
  }
  return snapshots;
}

/**
 * Hydrate exact canonical filmIds into the shared enrichment index.
 *
 * @param {Iterable<unknown>} ids
 * @param {object | null | undefined} enrichmentIndex
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   signal?: AbortSignal,
 *   concurrency?: number,
 *   maxIds?: number,
 * }} [options]
 */
export async function hydrateFilmEnrichmentForIds(
  ids,
  enrichmentIndex,
  options = {},
) {
  const maxIds =
    typeof options.maxIds === 'number' && Number.isFinite(options.maxIds)
      ? Math.max(0, options.maxIds)
      : Infinity;
  const requested = uniqueCanonicalFilmIds(ids, maxIds);
  const needed = collectCanonicalFilmIdsNeedingEnrichment(
    requested,
    enrichmentIndex,
  );
  if (needed.length === 0) {
    return {
      index: enrichmentIndex ?? null,
      hydratedIds: [],
      snapshots: [],
      requestedIds: requested,
      networkAttemptedIds: [],
    };
  }

  /** @type {object[]} */
  const cachedSnapshots = [];
  /** @type {string[]} */
  const toFetch = [];
  for (const id of needed) {
    const cached = getCachedTmdbOnlyFilm(id);
    if (cachedSnapshotUsable(cached) || cached?.title) {
      cachedSnapshots.push(cached);
    } else {
      toFetch.push(id);
    }
  }

  const fetched = await fetchMissingShelfEnrichmentSnapshots(toFetch, options);
  const snapshots = [...cachedSnapshots, ...fetched];
  const index = mergeEnrichmentIndexWithSnapshots(enrichmentIndex, snapshots);
  return {
    index,
    hydratedIds: snapshots
      .map((row) => asCanonicalFilmId(row.filmId ?? row.film_id))
      .filter(Boolean),
    snapshots,
    requestedIds: requested,
    networkAttemptedIds: toFetch,
  };
}

/**
 * Hydrate enrichment index for shelf filmIds missing static rows.
 *
 * @param {object | null | undefined} homeData
 * @param {object | null | undefined} enrichmentIndex
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   signal?: AbortSignal,
 *   concurrency?: number,
 * }} [options]
 */
export async function hydrateShelfFilmEnrichment(
  homeData,
  enrichmentIndex,
  options = {},
) {
  return hydrateFilmEnrichmentForIds(
    collectShelfFilmIdsNeedingEnrichment(homeData, enrichmentIndex),
    enrichmentIndex,
    options,
  );
}
