/**
 * Shared canonical film presentation join for product surfaces.
 *
 * Precedence for film-level fields:
 * 1. homeData.films by filmKey / aliases
 * 2. homeData.films by durable filmId
 * 3. enrichment index (and hydrated TMDB snapshots merged into it)
 * 4. shelf/source fallback record
 *
 * Screening/shelf fields (opening date, theaters, formats, Early Access, etc.)
 * stay on the caller — this helper only resolves film-level metadata.
 */

import { asCanonicalFilmId } from './enrichmentIndex.js';
import { resolveEnrichedFilmPresentation } from './resolveEnrichedFilmPresentation.js';
import { normalizeShowtimeFilmKey } from '../stores/savedFilmsStore.js';

/**
 * @param {object | null | undefined} homeData
 * @returns {object[]}
 */
function listHomeFilms(homeData) {
  return Array.isArray(homeData?.films) ? homeData.films : [];
}

/**
 * @param {object | null | undefined} film
 * @param {string} key
 */
function filmMatchesKey(film, key) {
  if (!film || !key) return false;
  if (film.filmKey === key) return true;
  if (film.parentFilmKey === key) return true;
  if (film.showtimeFilmKey === key) return true;
  if (Array.isArray(film.aliasKeys) && film.aliasKeys.includes(key)) return true;
  return false;
}

/**
 * Resolve a live Home film row by showtime key and/or durable filmId.
 *
 * @param {{
 *   filmKey?: string | null,
 *   filmId?: string | null,
 *   homeData?: object | null,
 * }} args
 * @returns {object | null}
 */
export function findCanonicalHomeFilm({
  filmKey = null,
  filmId = null,
  homeData = null,
} = {}) {
  const films = listHomeFilms(homeData);
  const key = normalizeShowtimeFilmKey(filmKey);
  const id = asCanonicalFilmId(filmId);

  if (key) {
    if (homeData?.filmsByKey instanceof Map && homeData.filmsByKey.has(key)) {
      return homeData.filmsByKey.get(key) ?? null;
    }
    const byKey =
      films.find((film) => film.filmKey === key) ??
      films.find((film) => filmMatchesKey(film, key)) ??
      null;
    if (byKey) return byKey;
  }

  if (id) {
    return (
      films.find(
        (film) =>
          asCanonicalFilmId(film.filmId) === id &&
          !(
            typeof film.parentFilmKey === 'string' &&
            film.parentFilmKey.trim() &&
            film.parentFilmKey.trim() !== film.filmKey
          ),
      ) ??
      films.find((film) => asCanonicalFilmId(film.filmId) === id) ??
      null
    );
  }

  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Build the theater/source fallback film used underneath enrichment.
 *
 * Prefers clean parent/canonical titles from the home row when present
 * (P0B Early Access → "The Weight"), then shelf fallback.
 *
 * @param {{
 *   homeFilm?: object | null,
 *   fallbackRecord?: object | null,
 *   filmId?: string | null,
 * }} args
 */
export function buildCanonicalSourceFilm({
  homeFilm = null,
  fallbackRecord = null,
  filmId = null,
} = {}) {
  const fallback = fallbackRecord && typeof fallbackRecord === 'object' ? fallbackRecord : null;
  const resolvedId =
    asCanonicalFilmId(filmId) ??
    asCanonicalFilmId(homeFilm?.filmId) ??
    asCanonicalFilmId(fallback?.filmId) ??
    asCanonicalFilmId(fallback?.film_id) ??
    null;

  const title =
    asText(homeFilm?.title) ??
    asText(homeFilm?.parentDisplayTitle) ??
    asText(fallback?.title) ??
    asText(fallback?.film_title) ??
    asText(fallback?.parentDisplayTitle) ??
    null;

  return {
    filmId: resolvedId,
    title,
    posterUrl:
      asText(homeFilm?.posterUrl) ??
      asText(fallback?.posterUrl) ??
      asText(fallback?.poster_url) ??
      null,
    backdropUrl:
      asText(homeFilm?.backdropUrl) ??
      asText(fallback?.backdropUrl) ??
      null,
    runtimeMin:
      homeFilm?.runtimeMin ??
      fallback?.runtimeMin ??
      fallback?.runtime_min ??
      null,
    synopsis:
      asText(homeFilm?.synopsis) ??
      asText(fallback?.synopsis) ??
      asText(fallback?.overview) ??
      null,
    certification:
      asText(homeFilm?.certification) ??
      asText(fallback?.certification) ??
      asText(fallback?.rating) ??
      null,
  };
}

/**
 * Resolve film-level presentation metadata for any product surface.
 *
 * @param {{
 *   filmKey?: string | null,
 *   filmId?: string | null,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   fallbackRecord?: object | null,
 *   context?: string,
 * }} args
 */
export function resolveCanonicalFilmPresentation({
  filmKey = null,
  filmId = null,
  homeData = null,
  enrichmentIndex = null,
  fallbackRecord = null,
  context = 'home',
} = {}) {
  const fallback = fallbackRecord && typeof fallbackRecord === 'object' ? fallbackRecord : null;
  const resolvedKey =
    normalizeShowtimeFilmKey(filmKey) ??
    normalizeShowtimeFilmKey(fallback?.filmKey) ??
    normalizeShowtimeFilmKey(fallback?.showtimeFilmKey) ??
    normalizeShowtimeFilmKey(fallback?.showtime_film_key) ??
    null;
  const resolvedId =
    asCanonicalFilmId(filmId) ??
    asCanonicalFilmId(fallback?.filmId) ??
    asCanonicalFilmId(fallback?.film_id) ??
    null;

  const homeFilm = findCanonicalHomeFilm({
    filmKey: resolvedKey,
    filmId: resolvedId,
    homeData,
  });

  const sourceFilm = buildCanonicalSourceFilm({
    homeFilm,
    fallbackRecord: fallback,
    filmId: resolvedId ?? homeFilm?.filmId ?? null,
  });

  const enriched = resolveEnrichedFilmPresentation({
    sourceFilm,
    enrichmentIndex,
    context,
  });

  return {
    homeFilm,
    sourceFilm,
    enriched,
    filmKey: homeFilm?.filmKey ?? resolvedKey,
    filmId: enriched.filmId ?? sourceFilm.filmId,
  };
}
