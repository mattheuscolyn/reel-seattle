/**
 * Shared film reference builder for Saved / Seen / Not Interested.
 *
 * Identity precedence (T-FILMID-03):
 * 1. Prefer valid canonical `filmId` (`tmdb:<positive-int>`) when present.
 * 2. Otherwise equality is normalized `showtimeFilmKey` (+ aliasKeys after merge).
 * 3. `source` + `sourceFilmId` are reconciliation hints only — never sole identity.
 *
 * Never uses source_showtime_id / opportunity keys / title-only hashes.
 */

import {
  asCanonicalStoreFilmId,
  normalizeShowtimeFilmKey,
} from '../stores/savedFilmsStore.js';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asOptionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolve which showtime film key to persist.
 *
 * Product default for Saved: prefer parent-level identity when present so
 * format variants of the same title share one Saved entry. Special-screening
 * rows without a usable parent keep their own filmKey.
 *
 * @param {{ filmKey?: unknown, parentFilmKey?: unknown }} film
 * @returns {string | null}
 */
export function resolveSavedShowtimeFilmKey(film) {
  if (!film || typeof film !== 'object') return null;
  const filmKey = normalizeShowtimeFilmKey(film.filmKey);
  const parentFilmKey = normalizeShowtimeFilmKey(film.parentFilmKey);
  return parentFilmKey || filmKey;
}

/**
 * Build a portable filmRef (+ optional display hints) from a HomeData film
 * or any object exposing the same identity fields.
 *
 * @param {object | null | undefined} film
 * @returns {{
 *   filmId: string | null,
 *   showtimeFilmKey: string,
 *   sourceFilmId: string | null,
 *   source: string | null,
 *   title?: string | null,
 *   posterUrl?: string | null,
 * } | null}
 */
export function filmRefFromHomeFilm(film) {
  const showtimeFilmKey = resolveSavedShowtimeFilmKey(film);
  if (!showtimeFilmKey) return null;

  const title =
    asOptionalString(film.title) ?? asOptionalString(film.parentDisplayTitle);
  const posterUrl = asOptionalString(film.posterUrl);

  /** @type {{
   *   filmId: string | null,
   *   showtimeFilmKey: string,
   *   sourceFilmId: string | null,
   *   source: string | null,
   *   title?: string | null,
   *   posterUrl?: string | null,
   * }} */
  const ref = {
    filmId: asCanonicalStoreFilmId(film.filmId),
    showtimeFilmKey,
    sourceFilmId: asOptionalString(film.sourceFilmId),
    source: asOptionalString(film.source),
  };
  if (title) ref.title = title;
  if (posterUrl) ref.posterUrl = posterUrl;
  return ref;
}
