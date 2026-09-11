/**
 * Central hydration of durable filmIds that appear on shelves but lack
 * static enrichment rows. One shared fetch path — not per React card.
 */

import { asCanonicalFilmId, lookupEnrichment } from './enrichmentIndex.js';
import { mergeEnrichmentIndexWithSnapshots } from './mergeEnrichmentIndexWithSnapshots.js';
import {
  cacheTmdbMovieDetail,
  getCachedTmdbOnlyFilm,
} from '../filmDetail/tmdbOnlyFilmCache.js';
import { fetchTmdbMovieDetail } from '../search/tmdbSearchClient.js';

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
    if (getCachedTmdbOnlyFilm(id)) {
      needed.add(id);
      return;
    }
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
  const ids = (Array.isArray(filmIds) ? filmIds : [])
    .map((id) => asCanonicalFilmId(id))
    .filter(Boolean);
  /** @type {object[]} */
  const snapshots = [];
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));

  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (filmId) => {
        const cached = getCachedTmdbOnlyFilm(filmId);
        if (cached?.title && (cached.posterUrl || cached.overview || cached.year)) {
          return cached;
        }
        const result = await fetchTmdbMovieDetail(filmId, {
          fetchImpl: options.fetchImpl,
          signal: options.signal,
        });
        if (!result.ok || !result.movie) return null;
        return cacheTmdbMovieDetail(result.movie);
      }),
    );
    for (const snapshot of results) {
      if (snapshot) snapshots.push(snapshot);
    }
  }
  return snapshots;
}

/**
 * Hydrate enrichment index for shelf filmIds missing static rows.
 *
 * @param {object | null | undefined} homeData
 * @param {object | null | undefined} enrichmentIndex
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   signal?: AbortSignal,
 * }} [options]
 */
export async function hydrateShelfFilmEnrichment(
  homeData,
  enrichmentIndex,
  options = {},
) {
  const needed = collectShelfFilmIdsNeedingEnrichment(homeData, enrichmentIndex);
  if (needed.length === 0) {
    return {
      index: enrichmentIndex ?? null,
      hydratedIds: [],
      snapshots: [],
    };
  }

  // Prefer already-cached Detail/search snapshots first.
  /** @type {object[]} */
  const cachedSnapshots = [];
  /** @type {string[]} */
  const toFetch = [];
  for (const id of needed) {
    const cached = getCachedTmdbOnlyFilm(id);
    if (cached?.title) cachedSnapshots.push(cached);
    else toFetch.push(id);
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
  };
}
