/**
 * Shared film reference builder for Saved Films (T-SAVE-03).
 *
 * Temporary identity until canonical film_id exists. Never uses
 * source_showtime_id / opportunity keys / title-only hashes.
 */

import { normalizeShowtimeFilmKey } from '../stores/savedFilmsStore.js';

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
 * Build a portable Saved filmRef (+ optional display hints) from a HomeData film
 * or any object exposing the same identity fields.
 *
 * @param {object | null | undefined} film
 * @returns {{
 *   filmId: null,
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
   *   filmId: null,
   *   showtimeFilmKey: string,
   *   sourceFilmId: string | null,
   *   source: string | null,
   *   title?: string | null,
   *   posterUrl?: string | null,
   * }} */
  const ref = {
    filmId: null,
    showtimeFilmKey,
    sourceFilmId: asOptionalString(film.sourceFilmId),
    source: asOptionalString(film.source),
  };
  if (title) ref.title = title;
  if (posterUrl) ref.posterUrl = posterUrl;
  return ref;
}
