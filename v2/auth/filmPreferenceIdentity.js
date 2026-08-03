/**
 * Deterministic film preference identity for cloud sync
 * (T-ACCOUNT-CLOUD-SYNC-FILMS-01).
 *
 * Precedence (matches Saved/Seen/NI store equality):
 * 1. Canonical Reel Seattle film ID: `tmdb:<positive-int>`
 * 2. Showtime-scoped key: `showtime:<showtimeFilmKey>`
 *
 * Title / poster / year are snapshots only — never identity.
 */

import {
  asCanonicalStoreFilmId,
  normalizeSavedFilmRef,
  normalizeShowtimeFilmKey,
} from '../stores/savedFilmsStore.js';

export const FILM_PREFERENCE_TYPES = /** @type {const} */ ([
  'saved',
  'seen',
  'not_interested',
]);

/**
 * @param {import('../stores/savedFilmsStore.js').SavedFilmRefInput | string | null | undefined} filmRef
 * @returns {string | null}
 */
export function filmPreferenceKeyFromRef(filmRef) {
  const ref = normalizeSavedFilmRef(filmRef);
  if (!ref) return null;
  const filmId = asCanonicalStoreFilmId(ref.filmId);
  if (filmId) return filmId;
  const showtimeKey = normalizeShowtimeFilmKey(ref.showtimeFilmKey);
  if (!showtimeKey) return null;
  return `showtime:${showtimeKey}`;
}

/**
 * @param {string | null | undefined} filmKey
 * @returns {{ filmId: string | null, showtimeFilmKey: string | null }}
 */
export function parseFilmPreferenceKey(filmKey) {
  if (typeof filmKey !== 'string') {
    return { filmId: null, showtimeFilmKey: null };
  }
  const trimmed = filmKey.trim();
  const filmId = asCanonicalStoreFilmId(trimmed);
  if (filmId) return { filmId, showtimeFilmKey: null };
  if (trimmed.startsWith('showtime:')) {
    const showtimeFilmKey = normalizeShowtimeFilmKey(trimmed.slice('showtime:'.length));
    return { filmId: null, showtimeFilmKey };
  }
  // Legacy / raw showtime key fallback (should not be written by this client).
  const showtimeFilmKey = normalizeShowtimeFilmKey(trimmed);
  return { filmId: null, showtimeFilmKey };
}

/**
 * Rebuild a local filmRef from a preference row / record.
 * Requires a usable showtimeFilmKey (store contract).
 *
 * @param {{
 *   film_key?: string | null,
 *   film_id?: string | null,
 *   showtime_film_key?: string | null,
 *   alias_keys?: unknown,
 * }} row
 * @returns {import('../stores/savedFilmsStore.js').SavedFilmRef | null}
 */
export function filmRefFromPreferenceRow(row) {
  if (!row || typeof row !== 'object') return null;
  const parsed = parseFilmPreferenceKey(row.film_key);
  const filmId =
    asCanonicalStoreFilmId(row.film_id) ?? parsed.filmId;
  const showtimeFilmKey =
    normalizeShowtimeFilmKey(row.showtime_film_key) ??
    parsed.showtimeFilmKey;
  if (!showtimeFilmKey) {
    // Canonical-only rows still need a catalog key for local stores.
    // Use film_key / film_id as a synthetic showtime key only when no
    // showtime key exists (rare; preserves round-trip).
    if (filmId) {
      return normalizeSavedFilmRef({
        filmId,
        showtimeFilmKey: filmId,
        aliasKeys: row.alias_keys,
      });
    }
    return null;
  }
  return normalizeSavedFilmRef({
    filmId,
    showtimeFilmKey,
    aliasKeys: row.alias_keys,
  });
}

/**
 * @param {unknown} value
 * @returns {value is 'saved' | 'seen' | 'not_interested'}
 */
export function isFilmPreferenceType(value) {
  return (
    value === 'saved' ||
    value === 'seen' ||
    value === 'not_interested'
  );
}
