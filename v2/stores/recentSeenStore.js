/**
 * Short-lived grace records for films newly marked Seen.
 * Keeps Hide Seen from instantly removing a card the user just marked.
 */

import {
  normalizeSavedFilmRef,
  savedFilmRefsEqual,
} from './savedFilmsStore.js';

export const RECENT_SEEN_STORAGE_KEY = 'reel-seattle.v2.recentSeen';
export const RECENT_SEEN_VERSION = 1;
/** How long a newly marked Seen film stays visible under Hide Seen. */
export const RECENT_SEEN_GRACE_MS = 5 * 60 * 1000; // 5 minutes
/** Soft cap on retained grace records. */
export const RECENT_SEEN_MAX_ITEMS = 40;

/**
 * @typedef {{
 *   filmRef: object,
 *   markedAt: string,
 * }} RecentSeenItem
 */

/**
 * @typedef {{
 *   version: number,
 *   items: RecentSeenItem[],
 * }} RecentSeenStorePayload
 */

function emptyStore() {
  return {
    version: RECENT_SEEN_VERSION,
    items: /** @type {RecentSeenItem[]} */ ([]),
  };
}

/**
 * @param {unknown} raw
 * @param {number} [nowMs]
 * @returns {RecentSeenStorePayload}
 */
export function normalizeRecentSeenStore(raw, nowMs = Date.now()) {
  if (!raw || typeof raw !== 'object') return emptyStore();
  if (raw.version !== RECENT_SEEN_VERSION) return emptyStore();
  const items = Array.isArray(raw.items) ? raw.items : [];
  const cutoff = nowMs - RECENT_SEEN_GRACE_MS * 2;
  /** @type {RecentSeenItem[]} */
  const normalized = [];
  for (const item of items) {
    const filmRef = normalizeSavedFilmRef(item?.filmRef ?? item);
    const markedAt =
      typeof item?.markedAt === 'string' ? item.markedAt.trim() : '';
    const atMs = Date.parse(markedAt);
    if (!filmRef || !Number.isFinite(atMs)) continue;
    if (atMs < cutoff) continue;
    normalized.push({ filmRef, markedAt: new Date(atMs).toISOString() });
  }
  normalized.sort((a, b) => Date.parse(b.markedAt) - Date.parse(a.markedAt));
  return {
    version: RECENT_SEEN_VERSION,
    items: normalized.slice(0, RECENT_SEEN_MAX_ITEMS),
  };
}

/**
 * @param {Storage | null | undefined} storage
 * @param {number | Date} [now]
 */
export function loadRecentSeenStore(storage, now = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  try {
    if (!storage || typeof storage.getItem !== 'function') return emptyStore();
    const raw = storage.getItem(RECENT_SEEN_STORAGE_KEY);
    if (!raw) return emptyStore();
    return normalizeRecentSeenStore(JSON.parse(raw), nowMs);
  } catch {
    return emptyStore();
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {RecentSeenStorePayload} store
 * @param {number | Date} [now]
 */
export function saveRecentSeenStore(storage, store, now = Date.now()) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    const nowMs =
      now instanceof Date ? now.getTime() : Number(now) || Date.now();
    const normalized = normalizeRecentSeenStore(store, nowMs);
    storage.setItem(RECENT_SEEN_STORAGE_KEY, JSON.stringify(normalized));
    emitRecentSeenChange();
    return true;
  } catch {
    return false;
  }
}

/**
 * Record not-seen → seen for discovery grace.
 *
 * @param {Storage | null | undefined} storage
 * @param {object | null | undefined} filmRef
 * @param {{ now?: number | Date }} [options]
 */
export function recordRecentSeen(storage, filmRef, options = {}) {
  const normalized = normalizeSavedFilmRef(filmRef);
  if (!normalized) return loadRecentSeenStore(storage);
  const nowMs =
    options.now instanceof Date
      ? options.now.getTime()
      : typeof options.now === 'number'
        ? options.now
        : Date.now();
  const store = loadRecentSeenStore(storage, nowMs);
  const items = store.items.filter(
    (item) => !savedFilmRefsEqual(item.filmRef, normalized),
  );
  items.unshift({
    filmRef: normalized,
    markedAt: new Date(nowMs).toISOString(),
  });
  const next = {
    version: RECENT_SEEN_VERSION,
    items: items.slice(0, RECENT_SEEN_MAX_ITEMS),
  };
  saveRecentSeenStore(storage, next, nowMs);
  return next;
}

/**
 * Clear grace when unmarking Seen.
 *
 * @param {Storage | null | undefined} storage
 * @param {object | null | undefined} filmRef
 * @param {{ now?: number | Date }} [options]
 */
export function clearRecentSeen(storage, filmRef, options = {}) {
  const normalized = normalizeSavedFilmRef(filmRef);
  if (!normalized) return loadRecentSeenStore(storage);
  const nowMs =
    options.now instanceof Date
      ? options.now.getTime()
      : typeof options.now === 'number'
        ? options.now
        : // Widen the prune window so clear still finds records written with an
          // injected clock that is behind wall time.
          Date.now() + RECENT_SEEN_GRACE_MS * 2;
  const store = loadRecentSeenStore(storage, nowMs);
  const items = store.items.filter(
    (item) => !savedFilmRefsEqual(item.filmRef, normalized),
  );
  if (items.length === store.items.length) return store;
  const next = { version: RECENT_SEEN_VERSION, items };
  saveRecentSeenStore(storage, next, nowMs);
  return next;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {object | null | undefined} filmRef
 * @param {{ now?: number | Date, graceMs?: number }} [options]
 */
export function isWithinRecentSeenGrace(storage, filmRef, options = {}) {
  const normalized = normalizeSavedFilmRef(filmRef);
  if (!normalized) return false;
  const nowMs =
    options.now instanceof Date
      ? options.now.getTime()
      : typeof options.now === 'number'
        ? options.now
        : Date.now();
  const graceMs =
    typeof options.graceMs === 'number' && Number.isFinite(options.graceMs)
      ? options.graceMs
      : RECENT_SEEN_GRACE_MS;
  const store = loadRecentSeenStore(storage, nowMs);
  const hit = store.items.find((item) =>
    savedFilmRefsEqual(item.filmRef, normalized),
  );
  if (!hit) return false;
  const atMs = Date.parse(hit.markedAt);
  if (!Number.isFinite(atMs)) return false;
  return nowMs - atMs >= 0 && nowMs - atMs < graceMs;
}

/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * @param {() => void} listener
 */
export function subscribeRecentSeen(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitRecentSeenChange() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}
