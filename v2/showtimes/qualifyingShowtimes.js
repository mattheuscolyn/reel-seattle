/**
 * Shared Pacific “qualifying future Seattle showtimes” definition.
 *
 * Used by Saved “Available / Watching for showtimes” and SHOWTIMES_AVAILABLE
 * notification detection so both surfaces mean the same thing.
 *
 * Qualifying = opportunity in HomeData for the film, with a resolvable film,
 * on/after today’s Pacific calendar date, and not already started (Pacific).
 * No browse date-window cap (any future date present in the artifact counts).
 */

import { pacificDateString } from '../explore/exploreCatalog.js';
import {
  opportunityDedupeKey,
  opportunitySortableKey,
  pacificSortableDateTime,
} from './showtimeEligibility.js';

/**
 * @param {Date | (() => Date)} [now]
 * @returns {Date}
 */
function resolveNow(now = new Date()) {
  return typeof now === 'function' ? now() : now;
}

/**
 * @param {object | null | undefined} homeData
 * @returns {Map<string, object>}
 */
export function filmsByKeyFromHomeData(homeData) {
  return new Map(
    (Array.isArray(homeData?.films) ? homeData.films : [])
      .filter((f) => f && typeof f.filmKey === 'string' && f.filmKey.trim())
      .map((f) => [f.filmKey.trim(), f]),
  );
}

/**
 * Whether a single opportunity is a qualifying future Seattle showtime.
 *
 * @param {object} opportunity
 * @param {{
 *   filmsByKey: Map<string, object> | Record<string, object>,
 *   now?: Date | (() => Date),
 * }} options
 */
export function isQualifyingFutureOpportunity(opportunity, options) {
  if (!opportunity || typeof opportunity !== 'object') return false;
  const filmKey =
    typeof opportunity.filmKey === 'string' ? opportunity.filmKey.trim() : '';
  if (!filmKey) return false;

  const filmsByKey = options.filmsByKey;
  const film =
    filmsByKey instanceof Map
      ? filmsByKey.get(filmKey)
      : filmsByKey?.[filmKey];
  if (!film) return false;

  const sortable = opportunitySortableKey(opportunity);
  if (!sortable) return false;

  let localDate = opportunity.localDate;
  if (typeof localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    localDate = sortable.slice(0, 10);
  }

  const today = pacificDateString(resolveNow(options.now));
  if (localDate < today) return false;

  const nowKey = pacificSortableDateTime(options.now);
  if (localDate === today && sortable < nowKey) return false;

  return true;
}

/**
 * All qualifying future opportunities for one filmKey (deduped, sorted earliest first).
 *
 * @param {object | null | undefined} homeData
 * @param {string} filmKey
 * @param {Date | (() => Date)} [now]
 * @returns {object[]}
 */
export function listQualifyingFutureOpportunitiesForFilm(
  homeData,
  filmKey,
  now = new Date(),
) {
  const key = typeof filmKey === 'string' ? filmKey.trim() : '';
  if (!key) return [];
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const filmsByKey = filmsByKeyFromHomeData(homeData);

  /** @type {Map<string, object>} */
  const seen = new Map();
  for (const opp of opportunities) {
    if (opp?.filmKey !== key) continue;
    if (!isQualifyingFutureOpportunity(opp, { filmsByKey, now })) continue;
    const dedupe = opportunityDedupeKey(opp);
    if (seen.has(dedupe)) continue;
    seen.set(dedupe, opp);
  }

  return [...seen.values()].sort((a, b) => {
    const ka = opportunitySortableKey(a) ?? '';
    const kb = opportunitySortableKey(b) ?? '';
    if (ka !== kb) return ka < kb ? -1 : 1;
    const theaterCmp = String(a.theaterId ?? '').localeCompare(
      String(b.theaterId ?? ''),
    );
    if (theaterCmp !== 0) return theaterCmp;
    return String(a.opportunityKey ?? '').localeCompare(
      String(b.opportunityKey ?? ''),
    );
  });
}

/**
 * @param {object | null | undefined} homeData
 * @param {string} filmKey
 * @param {Date | (() => Date)} [now]
 */
export function hasQualifyingFutureShowtimes(homeData, filmKey, now = new Date()) {
  return listQualifyingFutureOpportunitiesForFilm(homeData, filmKey, now).length > 0;
}

/**
 * Earliest qualifying future opportunity (deterministic tie-break).
 *
 * @param {object | null | undefined} homeData
 * @param {string} filmKey
 * @param {Date | (() => Date)} [now]
 * @returns {object | null}
 */
export function pickEarliestQualifyingOpportunity(
  homeData,
  filmKey,
  now = new Date(),
) {
  const list = listQualifyingFutureOpportunitiesForFilm(homeData, filmKey, now);
  return list[0] ?? null;
}
