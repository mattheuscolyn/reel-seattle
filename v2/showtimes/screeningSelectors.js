/**
 * Shared screening queries. Surfaces should read HomeData.opportunities
 * through these helpers instead of re-implementing past/date/dedupe rules.
 */

import {
  compareScreeningsByStart,
  dedupeScreeningsByContent,
  isActionableScreening,
  resolveClock,
} from './canonicalScreening.js';

/**
 * Family keys that share a parent or canonical filmId.
 * Kept local to avoid a filmDetail ↔ shelf import cycle.
 *
 * @param {object | null | undefined} homeData
 * @param {string} filmKey
 * @returns {Set<string>}
 */
function filmFamilyKeys(homeData, filmKey) {
  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  const keys = new Set([filmKey]);
  const seed = films.find((film) => film.filmKey === filmKey);
  if (!seed) return keys;
  const parentKey =
    (typeof seed.parentFilmKey === 'string' && seed.parentFilmKey.trim()) ||
    seed.filmKey;
  const filmId =
    typeof seed.filmId === 'string' && seed.filmId.startsWith('tmdb:')
      ? seed.filmId
      : null;
  for (const film of films) {
    if (film.filmKey === parentKey || film.parentFilmKey === parentKey) {
      keys.add(film.filmKey);
    }
    if (filmId && film.filmId === filmId) keys.add(film.filmKey);
  }
  return keys;
}

/**
 * @param {object | null | undefined} homeData
 * @returns {object[]}
 */
export function listCanonicalScreenings(homeData) {
  return Array.isArray(homeData?.opportunities) ? homeData.opportunities : [];
}

/**
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} screeningId
 * @returns {object | null}
 */
export function getCanonicalScreening(homeData, screeningId) {
  const id = typeof screeningId === 'string' ? screeningId.trim() : '';
  if (!id) return null;
  return (
    listCanonicalScreenings(homeData).find(
      (row) => row.opportunityKey === id || row.screeningId === id,
    ) ?? null
  );
}

/**
 * @param {object | null | undefined} homeData
 * @param {string} filmKey
 * @param {{ family?: boolean }} [options]
 */
export function listScreeningsForFilm(homeData, filmKey, options = {}) {
  const key = typeof filmKey === 'string' ? filmKey.trim() : '';
  if (!key) return [];
  const family =
    options.family === false
      ? new Set([key])
      : filmFamilyKeys(homeData, key);
  return listCanonicalScreenings(homeData)
    .filter((row) => family.has(row.filmKey))
    .slice()
    .sort(compareScreeningsByStart);
}

/**
 * @param {object | null | undefined} homeData
 * @param {string} theaterId
 */
export function listScreeningsForTheater(homeData, theaterId) {
  const id = typeof theaterId === 'string' ? theaterId.trim() : '';
  if (!id) return [];
  return listCanonicalScreenings(homeData)
    .filter((row) => row.theaterId === id)
    .slice()
    .sort(compareScreeningsByStart);
}

/**
 * @param {object | null | undefined} homeData
 * @param {Date | (() => Date) | string | number} [now]
 */
export function listActionableScreenings(homeData, now = new Date()) {
  const clock = resolveClock(now);
  return dedupeScreeningsByContent(
    listCanonicalScreenings(homeData).filter((row) =>
      isActionableScreening(row, clock),
    ),
  ).sort(compareScreeningsByStart);
}

/**
 * Next actionable screening for a film (Home shelves / Explore).
 *
 * @param {object | null | undefined} homeData
 * @param {string} filmKey
 * @param {Date | (() => Date) | string | number} [now]
 */
export function selectNextScreeningForFilm(homeData, filmKey, now = new Date()) {
  const clock = resolveClock(now);
  return (
    listScreeningsForFilm(homeData, filmKey, { family: false }).find((row) =>
      isActionableScreening(row, clock),
    ) ?? null
  );
}

/**
 * Whether a recommendation/screening id still exists in HomeData.
 *
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} screeningId
 */
export function screeningExists(homeData, screeningId) {
  return getCanonicalScreening(homeData, screeningId) != null;
}
