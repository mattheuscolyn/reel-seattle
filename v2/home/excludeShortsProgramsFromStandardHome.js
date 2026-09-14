/**
 * Home presentation exclusion for ShortsProgram listings.
 *
 * ShortsPrograms remain in homeData / schedule / collections. They must not
 * appear in standard Home editorial shelves (Top Opportunities, Leaving Soon,
 * Special Presentations, Opening This Week, Just Announced) or those shelves'
 * See-all destinations. The dedicated Short Films shelf is separate.
 *
 * Detection prefers explicit contentClassification — never title heuristics.
 */

import {
  isShortsProgramClassification,
  normalizeContentClassification,
} from '../adapters/contentClassification.js';
import { resolveShortsProgramIdForListing } from '../shortsPrograms/shortsProgramsModel.js';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asFilmKey(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} filmKey
 * @returns {object | null}
 */
export function findHomeFilmByKey(homeData, filmKey) {
  const key = asFilmKey(filmKey);
  if (!key || !homeData) return null;
  if (homeData.filmsByKey instanceof Map && homeData.filmsByKey.has(key)) {
    return homeData.filmsByKey.get(key) ?? null;
  }
  const films = Array.isArray(homeData.films) ? homeData.films : [];
  return films.find((film) => asFilmKey(film?.filmKey) === key) ?? null;
}

/**
 * Whether a listing is a ShortsProgram for standard Home shelf exclusion.
 *
 * @param {{
 *   contentClassification?: string | null,
 *   filmKey?: string | null,
 *   film?: object | null,
 *   opportunity?: object | null,
 *   homeData?: object | null,
 *   shortsIndex?: object | null,
 * }} [input]
 * @returns {boolean}
 */
export function isShortsProgramListing(input = {}) {
  const opportunity = input.opportunity ?? null;
  const film = input.film ?? null;
  const fromDirect = normalizeContentClassification(
    input.contentClassification ??
      opportunity?.contentClassification ??
      opportunity?.content_classification ??
      film?.contentClassification ??
      film?.content_classification,
  );
  if (isShortsProgramClassification(fromDirect)) return true;

  const filmKey =
    asFilmKey(input.filmKey) ||
    asFilmKey(opportunity?.filmKey) ||
    asFilmKey(film?.filmKey);
  const homeFilm = film ?? findHomeFilmByKey(input.homeData, filmKey);
  if (
    isShortsProgramClassification(
      homeFilm?.contentClassification ?? homeFilm?.content_classification,
    )
  ) {
    return true;
  }

  // Resilience when classification stamp is missing but shorts artifact joins.
  if (input.shortsIndex && filmKey) {
    return Boolean(
      resolveShortsProgramIdForListing({
        film: homeFilm,
        filmKey,
        sourceFilmId: homeFilm?.sourceFilmId ?? null,
        contentClassification:
          homeFilm?.contentClassification ??
          homeFilm?.content_classification ??
          null,
        index: input.shortsIndex,
      }),
    );
  }

  return false;
}

/**
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} filmKey
 * @param {object | null} [shortsIndex]
 * @returns {boolean}
 */
export function homeFilmKeyIsShortsProgram(
  homeData,
  filmKey,
  shortsIndex = null,
) {
  return isShortsProgramListing({
    filmKey,
    homeData,
    shortsIndex,
  });
}

/**
 * Standard Home editorial shelves (not Short Films, not schedule browse).
 *
 * @param {{
 *   filmKey?: string | null,
 *   film?: object | null,
 *   opportunity?: object | null,
 *   contentClassification?: string | null,
 *   homeData?: object | null,
 *   shortsIndex?: object | null,
 * }} [input]
 * @returns {boolean}
 */
export function isEligibleForStandardHomeShelf(input = {}) {
  return !isShortsProgramListing(input);
}
