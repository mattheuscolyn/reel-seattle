/**
 * Versioned Seen Films store (T-SEEN-01).
 *
 * Device-local persistence for films the user has watched. Distinct from
 * Saved, Not interested, Planner drafts, and My Schedule. Not synced to
 * accounts. Does not implement D15 ranking.
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
 * first successful intentional write (or saveSeenFilmKeys compatibility write).
 *
 * Timestamp: `seenAt` is record time for generic toggles (`seenAtSource:
 * "user-recorded"`). Legacy migration uses `seenAtSource: "migrated-unknown"`
 * with a shared migration clock — not historical viewing time.
 */

import {
  normalizeSavedFilmRef,
  normalizeShowtimeFilmKey,
  savedFilmRefsEqual,
} from './savedFilmsStore.js';

export const SEEN_FILMS_STORAGE_KEY = 'reel-seattle.v2.seenFilms';
export const SEEN_FILMS_VERSION = 1;
export const SEEN_FILMS_MAX = 100;

/** @typedef {import('./savedFilmsStore.js').SavedFilmRefInput} SeenFilmRefInput */
/** @typedef {import('./savedFilmsStore.js').SavedFilmRef} SeenFilmRef */

/**
 * @typedef {{
 *   publicShowtimeId?: string | null,
 *   sourceShowtimeId?: string | null,
 *   theaterId?: string | null,
 *   startsAt?: string | null,
 * }} SeenShowtimeRef
 */

/**
 * @typedef {{
 *   filmRef: SeenFilmRef,
 *   seenAt: string,
 *   seenAtSource?: 'user-recorded' | 'migrated-unknown' | 'showtime' | 'user-edited',
 *   showtimeRef?: SeenShowtimeRef | null,
 *   title?: string | null,
 *   posterUrl?: string | null,
 * }} SeenFilmItem
 */

/**
 * @typedef {{
 *   version: number,
 *   items: SeenFilmItem[],
 * }} SeenFilmsStorePayload
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   store: SeenFilmsStorePayload,
 *   error?: string | null,
 *   changed?: boolean,
 * }} SeenFilmsWriteResult
 */

/**
 * @typedef {{
 *   store: SeenFilmsStorePayload,
 *   status:
 *     | 'ok'
 *     | 'empty'
 *     | 'corrupt'
 *     | 'legacy_migrated'
 *     | 'unsupported_version'
 *     | 'storage_unavailable',
 *   error?: string | null,
 *   legacyRaw?: unknown,
 * }} SeenFilmsReadResult
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
 * @param {unknown} raw
 * @returns {SeenShowtimeRef | null}
 */
export function normalizeSeenShowtimeRef(raw) {
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const publicShowtimeId = asOptionalString(record.publicShowtimeId);
  const sourceShowtimeId = asOptionalString(record.sourceShowtimeId);
  const theaterId = asOptionalString(record.theaterId);
  const startsAt = normalizeIsoTimestamp(record.startsAt);
  if (!publicShowtimeId && !sourceShowtimeId && !theaterId && !startsAt) {
    return null;
  }
  /** @type {SeenShowtimeRef} */
  const ref = {
    publicShowtimeId: publicShowtimeId,
    sourceShowtimeId: sourceShowtimeId,
    theaterId: theaterId,
    startsAt: startsAt,
  };
  return ref;
}

/**
 * @param {unknown} value
 * @returns {'user-recorded' | 'migrated-unknown' | 'showtime' | 'user-edited' | null}
 */
function normalizeSeenAtSource(value) {
  if (
    value === 'user-recorded' ||
    value === 'migrated-unknown' ||
    value === 'showtime' ||
    value === 'user-edited'
  ) {
    return value;
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {SeenFilmItem | null}
 */
function normalizeSeenFilmItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const filmRef = normalizeSavedFilmRef(
    record.filmRef && typeof record.filmRef === 'object'
      ? /** @type {SeenFilmRefInput} */ (record.filmRef)
      : {
          showtimeFilmKey: record.showtimeFilmKey,
          filmId: record.filmId,
          sourceFilmId: record.sourceFilmId,
          source: record.source,
        },
  );
  if (!filmRef) return null;
  const seenAt = normalizeIsoTimestamp(record.seenAt);
  if (!seenAt) return null;

  /** @type {SeenFilmItem} */
  const item = {
    filmRef,
    seenAt,
  };
  const seenAtSource = normalizeSeenAtSource(record.seenAtSource);
  if (seenAtSource) item.seenAtSource = seenAtSource;
  const showtimeRef = normalizeSeenShowtimeRef(record.showtimeRef);
  if (showtimeRef) item.showtimeRef = showtimeRef;
  const title = asOptionalString(record.title);
  const posterUrl = asOptionalString(record.posterUrl);
  if (title) item.title = title;
  if (posterUrl) item.posterUrl = posterUrl;
  return item;
}

/**
 * @param {unknown} items
 * @returns {SeenFilmItem[]}
 */
export function normalizeSeenFilmItems(items) {
  if (!Array.isArray(items)) return [];
  /** @type {SeenFilmItem[]} */
  const out = [];
  for (const raw of items) {
    const item = normalizeSeenFilmItem(raw);
    if (!item) continue;
    const idx = out.findIndex((existing) =>
      savedFilmRefsEqual(existing.filmRef, item.filmRef),
    );
    if (idx >= 0) {
      if (item.seenAt > out[idx].seenAt) out[idx] = item;
      continue;
    }
    out.push(item);
  }
  out.sort((a, b) => {
    if (a.seenAt !== b.seenAt) return a.seenAt < b.seenAt ? 1 : -1;
    return a.filmRef.showtimeFilmKey < b.filmRef.showtimeFilmKey ? -1 : 1;
  });
  return out.slice(0, SEEN_FILMS_MAX);
}

/**
 * @returns {SeenFilmsStorePayload}
 */
export function emptySeenFilmsStore() {
  return { version: SEEN_FILMS_VERSION, items: [] };
}

/**
 * Convert a legacy string[] payload into v1 items (in memory).
 *
 * @param {unknown} legacy
 * @param {{ migratedAt?: string }} [options]
 * @returns {SeenFilmItem[]}
 */
export function migrateLegacySeenFilmKeys(legacy, options = {}) {
  if (!Array.isArray(legacy)) return [];
  const migratedAt =
    normalizeIsoTimestamp(options.migratedAt) ??
    new Date(0).toISOString();
  /** @type {SeenFilmItem[]} */
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
      seenAt: migratedAt,
      seenAtSource: 'migrated-unknown',
      showtimeRef: null,
    });
  }
  return normalizeSeenFilmItems(items);
}

/**
 * Normalize a parsed payload. Does not write storage.
 * Legacy string arrays become `legacy_migrated` in-memory v1 stores.
 *
 * @param {unknown} payload
 * @param {{ migratedAt?: string }} [options]
 * @returns {SeenFilmsReadResult}
 */
export function normalizeSeenFilmsPayload(payload, options = {}) {
  if (payload == null) {
    return { store: emptySeenFilmsStore(), status: 'empty' };
  }

  // Legacy: bare string array of film keys.
  if (Array.isArray(payload)) {
    return {
      store: {
        version: SEEN_FILMS_VERSION,
        items: migrateLegacySeenFilmKeys(payload, options),
      },
      status: 'legacy_migrated',
      legacyRaw: payload,
    };
  }

  if (typeof payload !== 'object') {
    return {
      store: emptySeenFilmsStore(),
      status: 'corrupt',
      error: 'invalid_root',
    };
  }

  const root = /** @type {Record<string, unknown>} */ (payload);

  if (!('version' in root)) {
    return {
      store: emptySeenFilmsStore(),
      status: 'corrupt',
      error: 'missing_version',
    };
  }

  const version = root.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return {
      store: emptySeenFilmsStore(),
      status: 'corrupt',
      error: 'invalid_version',
    };
  }

  if (version > SEEN_FILMS_VERSION) {
    return {
      store: emptySeenFilmsStore(),
      status: 'unsupported_version',
      error: `unsupported_version:${version}`,
      legacyRaw: payload,
    };
  }

  if (!('items' in root)) {
    return {
      store: emptySeenFilmsStore(),
      status: 'corrupt',
      error: 'missing_items',
    };
  }

  if (!Array.isArray(root.items)) {
    return {
      store: emptySeenFilmsStore(),
      status: 'corrupt',
      error: 'invalid_items',
    };
  }

  return {
    store: {
      version: SEEN_FILMS_VERSION,
      items: normalizeSeenFilmItems(root.items),
    },
    status: 'ok',
  };
}

/**
 * @param {unknown} payload
 * @param {{ migratedAt?: string }} [options]
 * @returns {SeenFilmsReadResult}
 */
export function migrateSeenFilmsPayload(payload, options = {}) {
  return normalizeSeenFilmsPayload(payload, options);
}

/**
 * Read store. Legacy arrays migrate in memory only — raw storage is unchanged
 * until an intentional write.
 *
 * @param {Storage | null | undefined} storage
 * @param {{ migratedAt?: string }} [options]
 * @returns {SeenFilmsReadResult}
 */
export function readSeenFilmsStore(storage, options = {}) {
  try {
    if (!storage) {
      return {
        store: emptySeenFilmsStore(),
        status: 'storage_unavailable',
        error: 'storage_unavailable',
      };
    }
    const raw = storage.getItem(SEEN_FILMS_STORAGE_KEY);
    if (raw == null || raw === '') {
      return { store: emptySeenFilmsStore(), status: 'empty' };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        store: emptySeenFilmsStore(),
        status: 'corrupt',
        error: 'invalid_json',
      };
    }
    return migrateSeenFilmsPayload(parsed, options);
  } catch {
    return {
      store: emptySeenFilmsStore(),
      status: 'storage_unavailable',
      error: 'storage_get_failed',
    };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {SeenFilmItem[]}
 */
export function getSeenFilms(storage) {
  return readSeenFilmsStore(storage).store.items;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {SeenFilmRefInput | string | null | undefined} filmRef
 */
export function isFilmSeen(storage, filmRef) {
  const ref = normalizeSavedFilmRef(filmRef);
  if (!ref) return false;
  return getSeenFilms(storage).some((item) =>
    savedFilmRefsEqual(item.filmRef, ref),
  );
}

/**
 * @param {Storage | null | undefined} storage
 * @param {SeenFilmsStorePayload} store
 * @returns {SeenFilmsWriteResult}
 */
function writeSeenFilmsStore(storage, store) {
  const normalized = {
    version: SEEN_FILMS_VERSION,
    items: normalizeSeenFilmItems(store.items),
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
    storage.setItem(SEEN_FILMS_STORAGE_KEY, JSON.stringify(normalized));
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
 * @param {SeenFilmRefInput | string} filmRef
 * @param {{
 *   now?: () => Date,
 *   title?: string | null,
 *   posterUrl?: string | null,
 *   showtimeRef?: SeenShowtimeRef | null,
 *   seenAtSource?: SeenFilmItem['seenAtSource'],
 * }} [options]
 * @returns {SeenFilmItem | null}
 */
function buildSeenItem(filmRef, options = {}) {
  const ref = normalizeSavedFilmRef(filmRef);
  if (!ref) return null;
  const nowFn = options.now ?? (() => new Date());
  /** @type {SeenFilmItem} */
  const item = {
    filmRef: { ...ref },
    seenAt: nowFn().toISOString(),
    seenAtSource: options.seenAtSource ?? 'user-recorded',
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
  const showtimeRef = normalizeSeenShowtimeRef(options.showtimeRef);
  if (showtimeRef) item.showtimeRef = showtimeRef;
  else item.showtimeRef = null;
  return item;
}

/**
 * Mark a film Seen. Idempotent: existing rows keep original seenAt.
 *
 * @param {Storage | null | undefined} storage
 * @param {SeenFilmRefInput | string} filmRef
 * @param {{
 *   now?: () => Date,
 *   title?: string | null,
 *   posterUrl?: string | null,
 *   showtimeRef?: SeenShowtimeRef | null,
 *   seenAtSource?: SeenFilmItem['seenAtSource'],
 * }} [options]
 * @returns {SeenFilmsWriteResult}
 */
export function markFilmSeen(storage, filmRef, options = {}) {
  const item = buildSeenItem(filmRef, options);
  if (!item) {
    return {
      ok: false,
      store: readSeenFilmsStore(storage).store,
      error: 'invalid_ref',
      changed: false,
    };
  }

  const read = readSeenFilmsStore(storage, {
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
    const written = writeSeenFilmsStore(storage, {
      version: SEEN_FILMS_VERSION,
      items: existing,
    });
    return {
      ...written,
      changed: false,
      error: written.ok ? null : written.error,
    };
  }

  return writeSeenFilmsStore(storage, {
    version: SEEN_FILMS_VERSION,
    items: [item, ...existing],
  });
}

/**
 * @param {Storage | null | undefined} storage
 * @param {SeenFilmRefInput | string} filmRef
 * @returns {SeenFilmsWriteResult}
 */
export function markFilmUnseen(storage, filmRef) {
  const ref = normalizeSavedFilmRef(filmRef);
  const read = readSeenFilmsStore(storage);
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
  return writeSeenFilmsStore(storage, {
    version: SEEN_FILMS_VERSION,
    items: nextItems,
  });
}

/**
 * @param {Storage | null | undefined} storage
 * @param {SeenFilmRefInput | string} filmRef
 * @param {{
 *   now?: () => Date,
 *   title?: string | null,
 *   posterUrl?: string | null,
 *   showtimeRef?: SeenShowtimeRef | null,
 * }} [options]
 * @returns {SeenFilmsWriteResult & { seen?: boolean }}
 */
export function toggleFilmSeen(storage, filmRef, options = {}) {
  if (isFilmSeen(storage, filmRef)) {
    const result = markFilmUnseen(storage, filmRef);
    return { ...result, seen: false };
  }
  const result = markFilmSeen(storage, filmRef, options);
  return {
    ...result,
    seen: result.ok ? true : isFilmSeen(storage, filmRef),
  };
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {SeenFilmsWriteResult}
 */
export function clearSeenFilms(storage) {
  const read = readSeenFilmsStore(storage);
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
        store: emptySeenFilmsStore(),
        error: 'storage_unavailable',
        changed: false,
      };
    }
    storage.removeItem(SEEN_FILMS_STORAGE_KEY);
    return {
      ok: true,
      store: emptySeenFilmsStore(),
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
  normalizeSavedFilmRef as normalizeSeenFilmRef,
  savedFilmRefsEqual as seenFilmRefsEqual,
  normalizeShowtimeFilmKey,
};
