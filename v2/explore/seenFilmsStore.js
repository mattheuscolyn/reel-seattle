/**
 * Seen Films compatibility surface for Explore Film Activity consumers.
 *
 * Durable contract lives in `v2/stores/seenFilmsStore.js` (T-SEEN-01).
 * This module keeps the prior key-array helpers so CollectionSurface /
 * ExploreDestination continue to work without a UI redesign.
 *
 * `saveSeenFilmKeys` / `loadSeenFilmKeys` read and write the versioned store.
 * Legacy string-array payloads migrate in memory on read and are rewritten to
 * v1 on the next successful intentional write through these helpers.
 */

import {
  SEEN_FILMS_MAX as STORE_MAX,
  SEEN_FILMS_STORAGE_KEY,
  SEEN_FILMS_VERSION,
  clearSeenFilms,
  getSeenFilms,
  isFilmSeen,
  markFilmSeen as markFilmSeenInStore,
  markFilmUnseen as markFilmUnseenInStore,
  normalizeShowtimeFilmKey,
  readSeenFilmsStore,
  toggleFilmSeen,
} from '../stores/seenFilmsStore.js';

export { SEEN_FILMS_STORAGE_KEY, SEEN_FILMS_VERSION };
export const SEEN_FILMS_MAX = STORE_MAX;

export {
  clearSeenFilms,
  getSeenFilms,
  isFilmSeen,
  toggleFilmSeen,
  readSeenFilmsStore,
};

/**
 * Normalize an in-memory list of film keys (newest-first helpers).
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeSeenFilmKeys(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const item of value) {
    const key = normalizeShowtimeFilmKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= SEEN_FILMS_MAX) break;
  }
  return out;
}

/**
 * Mark a film as seen in an in-memory key list (newest first).
 * @param {string} filmKey
 * @param {string[]} existing
 */
export function markFilmSeen(filmKey, existing) {
  const key = normalizeShowtimeFilmKey(filmKey);
  if (!key) return normalizeSeenFilmKeys(existing);
  const rest = normalizeSeenFilmKeys(existing).filter((item) => item !== key);
  return [key, ...rest].slice(0, SEEN_FILMS_MAX);
}

/**
 * Remove a film from an in-memory Seen key list.
 * @param {string} filmKey
 * @param {string[]} existing
 */
export function unmarkFilmSeen(filmKey, existing) {
  const key = normalizeShowtimeFilmKey(filmKey);
  if (!key) return normalizeSeenFilmKeys(existing);
  return normalizeSeenFilmKeys(existing).filter((item) => item !== key);
}

/**
 * Load Seen film keys from the versioned store (legacy arrays migrate in memory).
 * @param {Storage | null | undefined} storage
 * @returns {string[]}
 */
export function loadSeenFilmKeys(storage) {
  return getSeenFilms(storage).map((item) => item.filmRef.showtimeFilmKey);
}

/**
 * Persist a key list as a versioned Seen store.
 * Preserves existing seenAt / hints when the key already exists.
 *
 * @param {Storage | null | undefined} storage
 * @param {string[]} keys
 * @param {{ now?: () => Date }} [options]
 * @returns {boolean}
 */
export function saveSeenFilmKeys(storage, keys, options = {}) {
  const normalized = normalizeSeenFilmKeys(keys);
  const read = readSeenFilmsStore(storage, {
    migratedAt: options.now?.().toISOString(),
  });
  if (read.status === 'unsupported_version') return false;

  const existingByKey = new Map(
    read.store.items.map((item) => [item.filmRef.showtimeFilmKey, item]),
  );
  const nowFn = options.now ?? (() => new Date());
  const baseMs = nowFn().getTime();

  /** @type {import('../stores/seenFilmsStore.js').SeenFilmItem[]} */
  const items = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const key = normalized[index];
    const prior = existingByKey.get(key);
    if (prior) {
      items.push(prior);
      continue;
    }
    // Stagger new timestamps so newest-first key-list order survives sort.
    items.push({
      filmRef: {
        filmId: null,
        showtimeFilmKey: key,
        sourceFilmId: null,
        source: null,
      },
      seenAt: new Date(baseMs - index).toISOString(),
      seenAtSource: 'user-recorded',
      showtimeRef: null,
    });
  }

  try {
    if (!storage) return false;
    storage.setItem(
      SEEN_FILMS_STORAGE_KEY,
      JSON.stringify({
        version: SEEN_FILMS_VERSION,
        items: items,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Versioned store mark helper (storage-first). Kept for future FD wiring.
 * @param {Storage | null | undefined} storage
 * @param {string | object} filmRef
 * @param {object} [options]
 */
export function markFilmSeenInStorage(storage, filmRef, options) {
  return markFilmSeenInStore(storage, filmRef, options);
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string | object} filmRef
 */
export function markFilmUnseenInStorage(storage, filmRef) {
  return markFilmUnseenInStore(storage, filmRef);
}
