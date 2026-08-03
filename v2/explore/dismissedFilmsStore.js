/**
 * Not Interested compatibility surface (legacy “dismissedFilms” helpers).
 *
 * Durable contract lives in `v2/stores/notInterestedFilmsStore.js` (T-NI-01).
 * This module keeps key-array helpers so Search, CollectionSurface, and
 * Explore Film Activity continue without a UI redesign.
 *
 * `saveDismissedFilmKeys` / `loadDismissedFilmKeys` read and write the
 * versioned store. Legacy string-array payloads migrate in memory on read and
 * rewrite to v1 on the next successful intentional write.
 */

import { notifyFilmStoreMutation } from '../auth/filmStoreMutationBridge.js';
import {
  DISMISSED_FILMS_STORAGE_KEY,
  NOT_INTERESTED_FILMS_MAX as STORE_MAX,
  NOT_INTERESTED_FILMS_STORAGE_KEY,
  NOT_INTERESTED_FILMS_VERSION,
  clearFilmNotInterested,
  clearNotInterestedFilms,
  getNotInterestedFilms,
  isFilmNotInterested,
  markFilmNotInterested,
  normalizeShowtimeFilmKey,
  readNotInterestedFilmsStore,
  toggleFilmNotInterested,
} from '../stores/notInterestedFilmsStore.js';

export {
  DISMISSED_FILMS_STORAGE_KEY,
  NOT_INTERESTED_FILMS_STORAGE_KEY,
  NOT_INTERESTED_FILMS_VERSION,
};
export const DISMISSED_FILMS_MAX = STORE_MAX;
export const NOT_INTERESTED_FILMS_MAX = STORE_MAX;

export {
  clearFilmNotInterested,
  clearNotInterestedFilms,
  getNotInterestedFilms,
  isFilmNotInterested,
  markFilmNotInterested,
  toggleFilmNotInterested,
  readNotInterestedFilmsStore,
};

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeDismissedFilmKeys(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const item of value) {
    const key = normalizeShowtimeFilmKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= DISMISSED_FILMS_MAX) break;
  }
  return out;
}

/**
 * @param {string} filmKey
 * @param {string[]} existing
 */
export function dismissFilm(filmKey, existing) {
  const key = normalizeShowtimeFilmKey(filmKey);
  if (!key) return normalizeDismissedFilmKeys(existing);
  const rest = normalizeDismissedFilmKeys(existing).filter((item) => item !== key);
  return [key, ...rest].slice(0, DISMISSED_FILMS_MAX);
}

/**
 * @param {string} filmKey
 * @param {string[]} existing
 */
export function undismissFilm(filmKey, existing) {
  const key = normalizeShowtimeFilmKey(filmKey);
  if (!key) return normalizeDismissedFilmKeys(existing);
  return normalizeDismissedFilmKeys(existing).filter((item) => item !== key);
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {string[]}
 */
export function loadDismissedFilmKeys(storage) {
  return getNotInterestedFilms(storage).map(
    (item) => item.filmRef.showtimeFilmKey,
  );
}

/**
 * Persist a key list as a versioned Not Interested store.
 *
 * @param {Storage | null | undefined} storage
 * @param {string[]} keys
 * @param {{ now?: () => Date }} [options]
 * @returns {boolean}
 */
export function saveDismissedFilmKeys(storage, keys, options = {}) {
  const normalized = normalizeDismissedFilmKeys(keys);
  const read = readNotInterestedFilmsStore(storage, {
    migratedAt: options.now?.().toISOString(),
  });
  if (read.status === 'unsupported_version') return false;

  const existingByKey = new Map(
    read.store.items.map((item) => [item.filmRef.showtimeFilmKey, item]),
  );
  const nowFn = options.now ?? (() => new Date());
  const baseMs = nowFn().getTime();

  /** @type {import('../stores/notInterestedFilmsStore.js').NotInterestedFilmItem[]} */
  const items = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const key = normalized[index];
    const prior = existingByKey.get(key);
    if (prior) {
      items.push(prior);
      continue;
    }
    items.push({
      filmRef: {
        filmId: null,
        showtimeFilmKey: key,
        sourceFilmId: null,
        source: null,
      },
      markedAt: new Date(baseMs - index).toISOString(),
      markedAtSource: 'user-recorded',
      reason: null,
    });
  }

  try {
    if (!storage) return false;
    storage.setItem(
      NOT_INTERESTED_FILMS_STORAGE_KEY,
      JSON.stringify({
        version: NOT_INTERESTED_FILMS_VERSION,
        items,
      }),
    );
    notifyFilmStoreMutation({
      preferenceType: 'not_interested',
      mutatedAt: new Date().toISOString(),
      source: 'saveDismissedFilmKeys',
    });
    return true;
  } catch {
    return false;
  }
}
