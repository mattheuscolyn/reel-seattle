/**
 * Versioned Saved Films store (T-SAVE-01).
 *
 * Device-local persistence for films the user wants to retain for later
 * consideration. Distinct from Seen, Not interested, Planner drafts, and
 * My Schedule. Not synced to accounts.
 *
 * Temporary identity (canonical film_id does not exist yet):
 * 1. Prefer real `filmId` when both sides have one (future migration).
 * 2. Otherwise equality is normalized `showtimeFilmKey` (HomeData filmKey).
 * 3. `source` + `sourceFilmId` are reconciliation hints only — never sole identity.
 * 4. Never use source_showtime_id / opportunity keys / title hashes as identity.
 * 5. Callers should pass the film-level HomeData `filmKey` they intend to save.
 *    Variants are distinct keys unless the caller intentionally passes a parent key.
 *
 * Cross-tab: same-tab reads see writes immediately. Other tabs require a later
 * `storage` listener (not required in T-SAVE-01). Compatible with T-XPORT-01.
 */

export const SAVED_FILMS_STORAGE_KEY = 'reel-seattle.v2.savedFilms';
export const SAVED_FILMS_VERSION = 1;
export const SAVED_FILMS_MAX = 100;

/**
 * @typedef {{
 *   filmId?: string | null,
 *   showtimeFilmKey?: string | null,
 *   sourceFilmId?: string | null,
 *   source?: string | null,
 *   title?: string | null,
 *   posterUrl?: string | null,
 * }} SavedFilmRefInput
 */

/**
 * @typedef {{
 *   filmId: string | null,
 *   showtimeFilmKey: string,
 *   sourceFilmId: string | null,
 *   source: string | null,
 * }} SavedFilmRef
 */

/**
 * @typedef {{
 *   filmRef: SavedFilmRef,
 *   savedAt: string,
 *   title?: string | null,
 *   posterUrl?: string | null,
 * }} SavedFilmItem
 */

/**
 * @typedef {{
 *   version: number,
 *   items: SavedFilmItem[],
 * }} SavedFilmsStorePayload
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   store: SavedFilmsStorePayload,
 *   error?: string | null,
 *   changed?: boolean,
 * }} SavedFilmsWriteResult
 */

/**
 * @typedef {{
 *   store: SavedFilmsStorePayload,
 *   status: 'ok' | 'empty' | 'corrupt' | 'unsupported_version' | 'storage_unavailable',
 *   error?: string | null,
 * }} SavedFilmsReadResult
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
 * Normalize showtime film key the same way HomeData uses film keys (trim only).
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeShowtimeFilmKey(value) {
  return asOptionalString(value);
}

/**
 * Build a portable film reference for save/unsave/toggle.
 * Rejects refs without a usable showtimeFilmKey (or future filmId alone is not enough
 * until catalog resolution exists — v1 still requires showtimeFilmKey).
 *
 * @param {SavedFilmRefInput | string | null | undefined} input
 * @returns {SavedFilmRef | null}
 */
export function normalizeSavedFilmRef(input) {
  if (typeof input === 'string') {
    const key = normalizeShowtimeFilmKey(input);
    if (!key) return null;
    return {
      filmId: null,
      showtimeFilmKey: key,
      sourceFilmId: null,
      source: null,
    };
  }
  if (!input || typeof input !== 'object') return null;

  const showtimeFilmKey = normalizeShowtimeFilmKey(
    input.showtimeFilmKey ??
      // Common HomeData alias callers may pass.
      /** @type {{ filmKey?: unknown }} */ (input).filmKey,
  );
  if (!showtimeFilmKey) return null;

  return {
    filmId: asOptionalString(input.filmId),
    showtimeFilmKey,
    sourceFilmId: asOptionalString(input.sourceFilmId),
    source: asOptionalString(input.source),
  };
}

/**
 * Equality for saved-film identity.
 * @param {SavedFilmRefInput | string | null | undefined} a
 * @param {SavedFilmRefInput | string | null | undefined} b
 */
export function savedFilmRefsEqual(a, b) {
  const left = normalizeSavedFilmRef(a);
  const right = normalizeSavedFilmRef(b);
  if (!left || !right) return false;
  if (left.filmId && right.filmId) {
    return left.filmId === right.filmId;
  }
  return left.showtimeFilmKey === right.showtimeFilmKey;
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
 * @returns {SavedFilmItem | null}
 */
function normalizeSavedFilmItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const filmRef = normalizeSavedFilmRef(
    record.filmRef && typeof record.filmRef === 'object'
      ? /** @type {SavedFilmRefInput} */ (record.filmRef)
      : {
          showtimeFilmKey: record.showtimeFilmKey,
          filmId: record.filmId,
          sourceFilmId: record.sourceFilmId,
          source: record.source,
        },
  );
  if (!filmRef) return null;
  const savedAt = normalizeIsoTimestamp(record.savedAt);
  if (!savedAt) return null;

  /** @type {SavedFilmItem} */
  const item = { filmRef, savedAt };
  const title = asOptionalString(record.title);
  const posterUrl = asOptionalString(record.posterUrl);
  if (title) item.title = title;
  if (posterUrl) item.posterUrl = posterUrl;
  return item;
}

/**
 * Deduplicate + order newest-first. Invalid items dropped.
 * @param {unknown} items
 * @returns {SavedFilmItem[]}
 */
export function normalizeSavedFilmItems(items) {
  if (!Array.isArray(items)) return [];
  /** @type {SavedFilmItem[]} */
  const out = [];
  for (const raw of items) {
    const item = normalizeSavedFilmItem(raw);
    if (!item) continue;
    const idx = out.findIndex((existing) =>
      savedFilmRefsEqual(existing.filmRef, item.filmRef),
    );
    if (idx >= 0) {
      // Keep the newer savedAt when duplicates collide.
      if (item.savedAt > out[idx].savedAt) out[idx] = item;
      continue;
    }
    out.push(item);
  }
  out.sort((a, b) => {
    if (a.savedAt !== b.savedAt) return a.savedAt < b.savedAt ? 1 : -1;
    return a.filmRef.showtimeFilmKey < b.filmRef.showtimeFilmKey ? -1 : 1;
  });
  return out.slice(0, SAVED_FILMS_MAX);
}

/**
 * @returns {SavedFilmsStorePayload}
 */
export function emptySavedFilmsStore() {
  return { version: SAVED_FILMS_VERSION, items: [] };
}

/**
 * Normalize a parsed payload. Does not write storage.
 * Unknown future versions return empty items with unsupported status (caller).
 *
 * @param {unknown} payload
 * @returns {SavedFilmsReadResult}
 */
export function normalizeSavedFilmsPayload(payload) {
  if (payload == null) {
    return { store: emptySavedFilmsStore(), status: 'empty' };
  }
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      store: emptySavedFilmsStore(),
      status: 'corrupt',
      error: 'invalid_root',
    };
  }

  const root = /** @type {Record<string, unknown>} */ (payload);

  // Unversioned legacy-like shapes: treat as corrupt/empty for v1 (no prior saved store).
  if (!('version' in root)) {
    // Allow a bare items array only if version omitted but items look like v1 records —
    // still require explicit version for durable contract; fail safely.
    return {
      store: emptySavedFilmsStore(),
      status: 'corrupt',
      error: 'missing_version',
    };
  }

  const version = root.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return {
      store: emptySavedFilmsStore(),
      status: 'corrupt',
      error: 'invalid_version',
    };
  }

  if (version > SAVED_FILMS_VERSION) {
    return {
      store: emptySavedFilmsStore(),
      status: 'unsupported_version',
      error: `unsupported_version:${version}`,
    };
  }

  if (!('items' in root)) {
    return {
      store: emptySavedFilmsStore(),
      status: 'corrupt',
      error: 'missing_items',
    };
  }

  if (!Array.isArray(root.items)) {
    return {
      store: emptySavedFilmsStore(),
      status: 'corrupt',
      error: 'invalid_items',
    };
  }

  return {
    store: {
      version: SAVED_FILMS_VERSION,
      items: normalizeSavedFilmItems(root.items),
    },
    status: 'ok',
  };
}

/**
 * Migration entry point for later versions. v1 → v1 is identity.
 * @param {unknown} payload
 * @returns {SavedFilmsReadResult}
 */
export function migrateSavedFilmsPayload(payload) {
  return normalizeSavedFilmsPayload(payload);
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {SavedFilmsReadResult}
 */
export function readSavedFilmsStore(storage) {
  try {
    if (!storage) {
      return {
        store: emptySavedFilmsStore(),
        status: 'storage_unavailable',
        error: 'storage_unavailable',
      };
    }
    const raw = storage.getItem(SAVED_FILMS_STORAGE_KEY);
    if (raw == null || raw === '') {
      return { store: emptySavedFilmsStore(), status: 'empty' };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        store: emptySavedFilmsStore(),
        status: 'corrupt',
        error: 'invalid_json',
      };
    }
    return migrateSavedFilmsPayload(parsed);
  } catch {
    return {
      store: emptySavedFilmsStore(),
      status: 'storage_unavailable',
      error: 'storage_get_failed',
    };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {SavedFilmItem[]}
 */
export function getSavedFilms(storage) {
  return readSavedFilmsStore(storage).store.items;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {SavedFilmRefInput | string | null | undefined} filmRef
 */
export function isFilmSaved(storage, filmRef) {
  const ref = normalizeSavedFilmRef(filmRef);
  if (!ref) return false;
  return getSavedFilms(storage).some((item) =>
    savedFilmRefsEqual(item.filmRef, ref),
  );
}

/**
 * @param {Storage | null | undefined} storage
 * @param {SavedFilmsStorePayload} store
 * @returns {SavedFilmsWriteResult}
 */
function writeSavedFilmsStore(storage, store) {
  const normalized = {
    version: SAVED_FILMS_VERSION,
    items: normalizeSavedFilmItems(store.items),
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
    storage.setItem(SAVED_FILMS_STORAGE_KEY, JSON.stringify(normalized));
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
 * @param {SavedFilmRefInput | string} filmRef
 * @param {{ now?: () => Date, title?: string | null, posterUrl?: string | null }} [options]
 * @returns {SavedFilmItem | null}
 */
function buildSavedItem(filmRef, options = {}) {
  const ref = normalizeSavedFilmRef(filmRef);
  if (!ref) return null;
  const nowFn = options.now ?? (() => new Date());
  const savedAt = nowFn().toISOString();
  /** @type {SavedFilmItem} */
  const item = { filmRef: { ...ref }, savedAt };
  const title = asOptionalString(options.title);
  const posterUrl = asOptionalString(options.posterUrl);
  // Prefer non-authoritative display hints from the ref input when provided.
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
 * Save a film. Idempotent: existing saves are not duplicated and savedAt is kept.
 *
 * @param {Storage | null | undefined} storage
 * @param {SavedFilmRefInput | string} filmRef
 * @param {{ now?: () => Date, title?: string | null, posterUrl?: string | null }} [options]
 * @returns {SavedFilmsWriteResult}
 */
export function saveFilm(storage, filmRef, options = {}) {
  const item = buildSavedItem(filmRef, options);
  if (!item) {
    const current = readSavedFilmsStore(storage).store;
    return {
      ok: false,
      store: current,
      error: 'invalid_ref',
      changed: false,
    };
  }

  const read = readSavedFilmsStore(storage);
  // Do not overwrite unsupported/corrupt payloads until a successful intentional write
  // of a valid v1 store — but saving is intentional; we replace with a clean v1 store
  // built from any recoverable items when status is corrupt/empty.
  // Unsupported future versions: refuse to write so we do not destroy data.
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
    // Idempotent re-save: persist normalized store if needed, keep original savedAt.
    const store = {
      version: SAVED_FILMS_VERSION,
      items: existing,
    };
    const written = writeSavedFilmsStore(storage, store);
    return {
      ...written,
      changed: false,
      error: written.ok ? null : written.error,
    };
  }

  const store = {
    version: SAVED_FILMS_VERSION,
    items: [item, ...existing],
  };
  return writeSavedFilmsStore(storage, store);
}

/**
 * @param {Storage | null | undefined} storage
 * @param {SavedFilmRefInput | string} filmRef
 * @returns {SavedFilmsWriteResult}
 */
export function unsaveFilm(storage, filmRef) {
  const ref = normalizeSavedFilmRef(filmRef);
  const read = readSavedFilmsStore(storage);
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
  return writeSavedFilmsStore(storage, {
    version: SAVED_FILMS_VERSION,
    items: nextItems,
  });
}

/**
 * @param {Storage | null | undefined} storage
 * @param {SavedFilmRefInput | string} filmRef
 * @param {{ now?: () => Date, title?: string | null, posterUrl?: string | null }} [options]
 * @returns {SavedFilmsWriteResult & { saved?: boolean }}
 */
export function toggleSavedFilm(storage, filmRef, options = {}) {
  if (isFilmSaved(storage, filmRef)) {
    const result = unsaveFilm(storage, filmRef);
    return { ...result, saved: false };
  }
  const result = saveFilm(storage, filmRef, options);
  return { ...result, saved: result.ok ? true : isFilmSaved(storage, filmRef) };
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {SavedFilmsWriteResult}
 */
export function clearSavedFilms(storage) {
  const read = readSavedFilmsStore(storage);
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
        store: emptySavedFilmsStore(),
        error: 'storage_unavailable',
        changed: false,
      };
    }
    storage.removeItem(SAVED_FILMS_STORAGE_KEY);
    return {
      ok: true,
      store: emptySavedFilmsStore(),
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
