/**
 * Versioned Not Interested Films store (T-NI-01).
 *
 * Device-local persistence for films the user does not want in ordinary
 * discovery. Distinct from Saved, Seen, Planner drafts, and My Schedule.
 * Not synced to accounts. Does not implement ranking/suppression changes.
 *
 * Storage key remains `reel-seattle.v2.dismissedFilms` for continuity with
 * the legacy key-array store (user-facing label: “Not interested”).
 *
 * Identity reuses Saved Films filmRef helpers:
 * 1. Prefer real `filmId` when both sides have one (future migration).
 * 2. Otherwise equality is normalized `showtimeFilmKey`.
 * 3. Prefer parent-level keys via `filmRefFromHomeFilm` when callers pass a
 *    HomeData film; string keys are stored as-is (legacy migration fidelity).
 * 4. Never use source_showtime_id / opportunity keys as film identity.
 *
 * Legacy payload: JSON array of film-key strings under the same storage key.
 * Reads migrate in memory only; the normalized v1 payload is persisted on the
 * first successful intentional write (or saveDismissedFilmKeys write).
 *
 * Timestamp: `markedAt` is record time for generic toggles
 * (`markedAtSource: "user-recorded"`). Legacy migration uses
 * `markedAtSource: "migrated-unknown"` — not the original decision time.
 * `reason` is reserved null for this task.
 */

import {
  normalizeSavedFilmRef,
  normalizeShowtimeFilmKey,
  savedFilmRefsEqual,
} from './savedFilmsStore.js';

/** Same key as the legacy dismissedFilms array store. */
export const NOT_INTERESTED_FILMS_STORAGE_KEY = 'reel-seattle.v2.dismissedFilms';
/** @deprecated Prefer NOT_INTERESTED_FILMS_STORAGE_KEY; kept for callers. */
export const DISMISSED_FILMS_STORAGE_KEY = NOT_INTERESTED_FILMS_STORAGE_KEY;
export const NOT_INTERESTED_FILMS_VERSION = 1;
export const NOT_INTERESTED_FILMS_MAX = 100;

/** @typedef {import('./savedFilmsStore.js').SavedFilmRefInput} NotInterestedFilmRefInput */
/** @typedef {import('./savedFilmsStore.js').SavedFilmRef} NotInterestedFilmRef */

/**
 * @typedef {{
 *   filmRef: NotInterestedFilmRef,
 *   markedAt: string,
 *   markedAtSource?: 'user-recorded' | 'migrated-unknown' | 'user-edited',
 *   reason?: string | null,
 *   title?: string | null,
 *   posterUrl?: string | null,
 * }} NotInterestedFilmItem
 */

/**
 * @typedef {{
 *   version: number,
 *   items: NotInterestedFilmItem[],
 * }} NotInterestedFilmsStorePayload
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   store: NotInterestedFilmsStorePayload,
 *   error?: string | null,
 *   changed?: boolean,
 * }} NotInterestedFilmsWriteResult
 */

/**
 * @typedef {{
 *   store: NotInterestedFilmsStorePayload,
 *   status:
 *     | 'ok'
 *     | 'empty'
 *     | 'corrupt'
 *     | 'legacy_migrated'
 *     | 'unsupported_version'
 *     | 'storage_unavailable',
 *   error?: string | null,
 *   legacyRaw?: unknown,
 * }} NotInterestedFilmsReadResult
 */

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
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeIsoTimestamp(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * @param {unknown} value
 * @returns {'user-recorded' | 'migrated-unknown' | 'user-edited' | null}
 */
function normalizeMarkedAtSource(value) {
  if (
    value === 'user-recorded' ||
    value === 'migrated-unknown' ||
    value === 'user-edited'
  ) {
    return value;
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {NotInterestedFilmItem | null}
 */
function normalizeNotInterestedFilmItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const filmRef = normalizeSavedFilmRef(
    record.filmRef && typeof record.filmRef === 'object'
      ? /** @type {NotInterestedFilmRefInput} */ (record.filmRef)
      : {
          showtimeFilmKey: record.showtimeFilmKey,
          filmId: record.filmId,
          sourceFilmId: record.sourceFilmId,
          source: record.source,
        },
  );
  if (!filmRef) return null;
  const markedAt = normalizeIsoTimestamp(record.markedAt);
  if (!markedAt) return null;

  /** @type {NotInterestedFilmItem} */
  const item = {
    filmRef,
    markedAt,
  };
  const markedAtSource = normalizeMarkedAtSource(record.markedAtSource);
  if (markedAtSource) item.markedAtSource = markedAtSource;
  // Reason reserved; do not invent values. Only retain non-empty strings if present.
  const reason = asOptionalString(record.reason);
  item.reason = reason;
  const title = asOptionalString(record.title);
  const posterUrl = asOptionalString(record.posterUrl);
  if (title) item.title = title;
  if (posterUrl) item.posterUrl = posterUrl;
  return item;
}

/**
 * @param {unknown} items
 * @returns {NotInterestedFilmItem[]}
 */
export function normalizeNotInterestedFilmItems(items) {
  if (!Array.isArray(items)) return [];
  /** @type {NotInterestedFilmItem[]} */
  const out = [];
  for (const raw of items) {
    const item = normalizeNotInterestedFilmItem(raw);
    if (!item) continue;
    const idx = out.findIndex((existing) =>
      savedFilmRefsEqual(existing.filmRef, item.filmRef),
    );
    if (idx >= 0) {
      if (item.markedAt > out[idx].markedAt) out[idx] = item;
      continue;
    }
    out.push(item);
  }
  out.sort((a, b) => {
    if (a.markedAt !== b.markedAt) return a.markedAt < b.markedAt ? 1 : -1;
    return a.filmRef.showtimeFilmKey < b.filmRef.showtimeFilmKey ? -1 : 1;
  });
  return out.slice(0, NOT_INTERESTED_FILMS_MAX);
}

/**
 * @returns {NotInterestedFilmsStorePayload}
 */
export function emptyNotInterestedFilmsStore() {
  return { version: NOT_INTERESTED_FILMS_VERSION, items: [] };
}

/**
 * @param {unknown} legacy
 * @param {{ migratedAt?: string }} [options]
 * @returns {NotInterestedFilmItem[]}
 */
export function migrateLegacyNotInterestedFilmKeys(legacy, options = {}) {
  if (!Array.isArray(legacy)) return [];
  const migratedAt =
    normalizeIsoTimestamp(options.migratedAt) ??
    new Date(0).toISOString();
  /** @type {NotInterestedFilmItem[]} */
  const items = [];
  for (const entry of legacy) {
    const key = normalizeShowtimeFilmKey(entry);
    if (!key) continue;
    items.push({
      filmRef: {
        filmId: null,
        showtimeFilmKey: key,
        sourceFilmId: null,
        source: null,
      },
      markedAt: migratedAt,
      markedAtSource: 'migrated-unknown',
      reason: null,
    });
  }
  return normalizeNotInterestedFilmItems(items);
}

/**
 * @param {unknown} payload
 * @param {{ migratedAt?: string }} [options]
 * @returns {NotInterestedFilmsReadResult}
 */
export function normalizeNotInterestedFilmsPayload(payload, options = {}) {
  if (payload == null) {
    return { store: emptyNotInterestedFilmsStore(), status: 'empty' };
  }

  if (Array.isArray(payload)) {
    return {
      store: {
        version: NOT_INTERESTED_FILMS_VERSION,
        items: migrateLegacyNotInterestedFilmKeys(payload, options),
      },
      status: 'legacy_migrated',
      legacyRaw: payload,
    };
  }

  if (typeof payload !== 'object') {
    return {
      store: emptyNotInterestedFilmsStore(),
      status: 'corrupt',
      error: 'invalid_root',
    };
  }

  const root = /** @type {Record<string, unknown>} */ (payload);

  if (!('version' in root)) {
    return {
      store: emptyNotInterestedFilmsStore(),
      status: 'corrupt',
      error: 'missing_version',
    };
  }

  const version = root.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return {
      store: emptyNotInterestedFilmsStore(),
      status: 'corrupt',
      error: 'invalid_version',
    };
  }

  if (version > NOT_INTERESTED_FILMS_VERSION) {
    return {
      store: emptyNotInterestedFilmsStore(),
      status: 'unsupported_version',
      error: `unsupported_version:${version}`,
      legacyRaw: payload,
    };
  }

  if (!('items' in root)) {
    return {
      store: emptyNotInterestedFilmsStore(),
      status: 'corrupt',
      error: 'missing_items',
    };
  }

  if (!Array.isArray(root.items)) {
    return {
      store: emptyNotInterestedFilmsStore(),
      status: 'corrupt',
      error: 'invalid_items',
    };
  }

  return {
    store: {
      version: NOT_INTERESTED_FILMS_VERSION,
      items: normalizeNotInterestedFilmItems(root.items),
    },
    status: 'ok',
  };
}

/**
 * @param {unknown} payload
 * @param {{ migratedAt?: string }} [options]
 * @returns {NotInterestedFilmsReadResult}
 */
export function migrateNotInterestedFilmsPayload(payload, options = {}) {
  return normalizeNotInterestedFilmsPayload(payload, options);
}

/**
 * @param {Storage | null | undefined} storage
 * @param {{ migratedAt?: string }} [options]
 * @returns {NotInterestedFilmsReadResult}
 */
export function readNotInterestedFilmsStore(storage, options = {}) {
  try {
    if (!storage) {
      return {
        store: emptyNotInterestedFilmsStore(),
        status: 'storage_unavailable',
        error: 'storage_unavailable',
      };
    }
    const raw = storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY);
    if (raw == null || raw === '') {
      return { store: emptyNotInterestedFilmsStore(), status: 'empty' };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        store: emptyNotInterestedFilmsStore(),
        status: 'corrupt',
        error: 'invalid_json',
      };
    }
    return migrateNotInterestedFilmsPayload(parsed, options);
  } catch {
    return {
      store: emptyNotInterestedFilmsStore(),
      status: 'storage_unavailable',
      error: 'storage_get_failed',
    };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {NotInterestedFilmItem[]}
 */
export function getNotInterestedFilms(storage) {
  return readNotInterestedFilmsStore(storage).store.items;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {NotInterestedFilmRefInput | string | null | undefined} filmRef
 */
export function isFilmNotInterested(storage, filmRef) {
  const ref = normalizeSavedFilmRef(filmRef);
  if (!ref) return false;
  return getNotInterestedFilms(storage).some((item) =>
    savedFilmRefsEqual(item.filmRef, ref),
  );
}

/**
 * @param {Storage | null | undefined} storage
 * @param {NotInterestedFilmsStorePayload} store
 * @returns {NotInterestedFilmsWriteResult}
 */
function writeNotInterestedFilmsStore(storage, store) {
  const normalized = {
    version: NOT_INTERESTED_FILMS_VERSION,
    items: normalizeNotInterestedFilmItems(store.items),
  };
  try {
    if (!storage) {
      return {
        ok: false,
        store: normalized,
        error: 'storage_unavailable',
        changed: false,
      };
    }
    storage.setItem(NOT_INTERESTED_FILMS_STORAGE_KEY, JSON.stringify(normalized));
    return { ok: true, store: normalized, error: null, changed: true };
  } catch (error) {
    const name = error && typeof error === 'object' ? error.name : '';
    const message =
      error instanceof Error ? error.message : String(error ?? 'write_failed');
    const quota =
      name === 'QuotaExceededError' ||
      /quota/i.test(message) ||
      /** @type {{ code?: number }} */ (error)?.code === 22;
    return {
      ok: false,
      store: normalized,
      error: quota ? 'quota_exceeded' : 'storage_set_failed',
      changed: false,
    };
  }
}

/**
 * @param {NotInterestedFilmRefInput | string} filmRef
 * @param {{
 *   now?: () => Date,
 *   title?: string | null,
 *   posterUrl?: string | null,
 *   reason?: string | null,
 *   markedAtSource?: NotInterestedFilmItem['markedAtSource'],
 * }} [options]
 * @returns {NotInterestedFilmItem | null}
 */
function buildNotInterestedItem(filmRef, options = {}) {
  const ref = normalizeSavedFilmRef(filmRef);
  if (!ref) return null;
  const nowFn = options.now ?? (() => new Date());
  /** @type {NotInterestedFilmItem} */
  const item = {
    filmRef: { ...ref },
    markedAt: nowFn().toISOString(),
    markedAtSource: options.markedAtSource ?? 'user-recorded',
    reason: asOptionalString(options.reason),
  };
  const title = asOptionalString(options.title);
  const posterUrl = asOptionalString(options.posterUrl);
  if (title) item.title = title;
  else if (typeof filmRef === 'object' && filmRef) {
    const hint = asOptionalString(filmRef.title);
    if (hint) item.title = hint;
  }
  if (posterUrl) item.posterUrl = posterUrl;
  else if (typeof filmRef === 'object' && filmRef) {
    const hint = asOptionalString(filmRef.posterUrl);
    if (hint) item.posterUrl = hint;
  }
  return item;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {NotInterestedFilmRefInput | string} filmRef
 * @param {{
 *   now?: () => Date,
 *   title?: string | null,
 *   posterUrl?: string | null,
 *   reason?: string | null,
 *   markedAtSource?: NotInterestedFilmItem['markedAtSource'],
 * }} [options]
 * @returns {NotInterestedFilmsWriteResult}
 */
export function markFilmNotInterested(storage, filmRef, options = {}) {
  const item = buildNotInterestedItem(filmRef, options);
  if (!item) {
    return {
      ok: false,
      store: readNotInterestedFilmsStore(storage).store,
      error: 'invalid_ref',
      changed: false,
    };
  }

  const read = readNotInterestedFilmsStore(storage, {
    migratedAt: options.now?.().toISOString(),
  });
  if (read.status === 'unsupported_version') {
    return {
      ok: false,
      store: read.store,
      error: read.error ?? 'unsupported_version',
      changed: false,
    };
  }

  const existing = read.store.items;
  const already = existing.find((row) =>
    savedFilmRefsEqual(row.filmRef, item.filmRef),
  );
  if (already) {
    const written = writeNotInterestedFilmsStore(storage, {
      version: NOT_INTERESTED_FILMS_VERSION,
      items: existing,
    });
    return {
      ...written,
      changed: false,
      error: written.ok ? null : written.error,
    };
  }

  return writeNotInterestedFilmsStore(storage, {
    version: NOT_INTERESTED_FILMS_VERSION,
    items: [item, ...existing],
  });
}

/**
 * @param {Storage | null | undefined} storage
 * @param {NotInterestedFilmRefInput | string} filmRef
 * @returns {NotInterestedFilmsWriteResult}
 */
export function clearFilmNotInterested(storage, filmRef) {
  const ref = normalizeSavedFilmRef(filmRef);
  const read = readNotInterestedFilmsStore(storage);
  if (read.status === 'unsupported_version') {
    return {
      ok: false,
      store: read.store,
      error: read.error ?? 'unsupported_version',
      changed: false,
    };
  }
  if (!ref) {
    return {
      ok: true,
      store: read.store,
      error: null,
      changed: false,
    };
  }
  const nextItems = read.store.items.filter(
    (item) => !savedFilmRefsEqual(item.filmRef, ref),
  );
  if (nextItems.length === read.store.items.length) {
    return {
      ok: true,
      store: read.store,
      error: null,
      changed: false,
    };
  }
  return writeNotInterestedFilmsStore(storage, {
    version: NOT_INTERESTED_FILMS_VERSION,
    items: nextItems,
  });
}

/**
 * @param {Storage | null | undefined} storage
 * @param {NotInterestedFilmRefInput | string} filmRef
 * @param {{
 *   now?: () => Date,
 *   title?: string | null,
 *   posterUrl?: string | null,
 * }} [options]
 * @returns {NotInterestedFilmsWriteResult & { notInterested?: boolean }}
 */
export function toggleFilmNotInterested(storage, filmRef, options = {}) {
  if (isFilmNotInterested(storage, filmRef)) {
    const result = clearFilmNotInterested(storage, filmRef);
    return { ...result, notInterested: false };
  }
  const result = markFilmNotInterested(storage, filmRef, options);
  return {
    ...result,
    notInterested: result.ok ? true : isFilmNotInterested(storage, filmRef),
  };
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {NotInterestedFilmsWriteResult}
 */
export function clearNotInterestedFilms(storage) {
  const read = readNotInterestedFilmsStore(storage);
  if (read.status === 'unsupported_version') {
    return {
      ok: false,
      store: read.store,
      error: read.error ?? 'unsupported_version',
      changed: false,
    };
  }
  try {
    if (!storage) {
      return {
        ok: false,
        store: emptyNotInterestedFilmsStore(),
        error: 'storage_unavailable',
        changed: false,
      };
    }
    storage.removeItem(NOT_INTERESTED_FILMS_STORAGE_KEY);
    return {
      ok: true,
      store: emptyNotInterestedFilmsStore(),
      error: null,
      changed: true,
    };
  } catch {
    return {
      ok: false,
      store: read.store,
      error: 'storage_set_failed',
      changed: false,
    };
  }
}

export {
  normalizeSavedFilmRef as normalizeNotInterestedFilmRef,
  savedFilmRefsEqual as notInterestedFilmRefsEqual,
  normalizeShowtimeFilmKey,
};
