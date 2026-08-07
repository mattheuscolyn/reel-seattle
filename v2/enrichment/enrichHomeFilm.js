/**
 * Thin HomeData → shared enrichment presentation adapter.
 * All film-level UI surfaces should use this (or resolveEnrichedFilmPresentation
 * directly) instead of reading source poster/title/runtime independently.
 */

import { asCanonicalFilmId } from './enrichmentIndex.js';
import { resolveEnrichedFilmPresentation } from './resolveEnrichedFilmPresentation.js';
import { normalizeShowtimeFilmKey } from '../stores/savedFilmsStore.js';

/** Contexts where film-entity headings prefer TMDB canonical title. */
export const CANONICAL_TITLE_CONTEXTS = Object.freeze([
  'search',
  'film-detail',
  'theater',
  'showtimes',
  'planner',
  'schedule',
  'collection',
]);

/**
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} filmKey
 * @returns {object | null}
 */
function findHomeFilm(homeData, filmKey) {
  const key = normalizeShowtimeFilmKey(filmKey);
  if (!key || !homeData) return null;
  if (homeData.filmsByKey instanceof Map) {
    return homeData.filmsByKey.get(key) ?? null;
  }
  const films = Array.isArray(homeData.films) ? homeData.films : [];
  return films.find((f) => f?.filmKey === key) ?? null;
}

/**
 * Resolve parent film when the record is a screening variant.
 * Enrichment joins by filmId; parent supplies filmId + source fallbacks.
 *
 * @param {object | null | undefined} film
 * @param {object | null | undefined} homeData
 * @returns {object | null | undefined}
 */
export function resolvePresentationSourceFilm(film, homeData = null) {
  if (!film || typeof film !== 'object') return film ?? null;

  const ownId = asCanonicalFilmId(film.filmId ?? film.film_id);
  const parentKey =
    normalizeShowtimeFilmKey(film.parentFilmKey) ??
    normalizeShowtimeFilmKey(film.parent_film_key);
  const ownKey =
    normalizeShowtimeFilmKey(film.filmKey) ??
    normalizeShowtimeFilmKey(film.showtimeFilmKey);

  // Self-parent or no parent → use as-is.
  if (!parentKey || parentKey === ownKey) {
    return {
      filmId: ownId,
      title: film.title ?? null,
      posterUrl: film.posterUrl ?? film.poster_url ?? null,
      backdropUrl: film.backdropUrl ?? film.backdrop_url ?? null,
      runtimeMin: film.runtimeMin ?? film.runtime_min ?? null,
      synopsis: film.synopsis ?? film.overview ?? null,
      certification:
        film.certification ?? film.rating ?? film.mpaaRating ?? null,
    };
  }

  const parent = findHomeFilm(homeData, parentKey);
  return {
    filmId: ownId ?? asCanonicalFilmId(parent?.filmId) ?? null,
    title: parent?.title ?? film.title ?? null,
    posterUrl:
      parent?.posterUrl ??
      film.posterUrl ??
      film.poster_url ??
      null,
    backdropUrl:
      parent?.backdropUrl ??
      film.backdropUrl ??
      null,
    runtimeMin:
      parent?.runtimeMin ??
      film.runtimeMin ??
      film.runtime_min ??
      null,
    synopsis: parent?.synopsis ?? film.synopsis ?? null,
    certification:
      parent?.certification ??
      parent?.rating ??
      film.certification ??
      film.rating ??
      null,
  };
}

/**
 * @param {object | null | undefined} film
 * @param {object | null | undefined} enrichmentIndex
 * @param {string} [context]
 * @param {object | null | undefined} [homeData]
 */
export function enrichHomeFilm(
  film,
  enrichmentIndex = null,
  context = 'search',
  homeData = null,
) {
  return resolveEnrichedFilmPresentation({
    sourceFilm: resolvePresentationSourceFilm(film, homeData),
    enrichmentIndex,
    context,
  });
}
