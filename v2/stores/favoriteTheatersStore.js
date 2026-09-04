/**
 * Versioned Favorite Theaters store (T-FAV-01).
 *
 * Device-local persistence for theaters the user wants Reel Seattle to
 * prioritize or surface more prominently. Distinct from memberships, Planner
 * hard filters, recent visits, Saved/Seen/Not interested, and Schedule.
 * Not synced to accounts.
 *
 * Identity:
 * 1. Canonical registry `theaterId` is primary (e.g. siff-cinema-uptown).
 * 2. Distinct locations stay distinct (SIFF Downtown / Uptown / Film Center).
 * 3. `source` + `sourceTheaterId` are reconciliation hints only.
 * 4. Never use display name, URL, address, or auditorium id as identity.
 *
 * v1 is the first persisted format — there is no legacy favorite-theater
 * payload to migrate. Cross-tab live sync and export/import are deferred.
 */

export const FAVORITE_THEATERS_STORAGE_KEY = 'reel-seattle.v2.favoriteTheaters';
export const FAVORITE_THEATERS_VERSION = 1;
export const FAVORITE_THEATERS_MAX = 100;

/**
 * @typedef {{
 *   theaterId?: string | null,
 *   sourceTheaterId?: string | null,
 *   source?: string | null,
 *   name?: string | null,
 *   imageUrl?: string | null,
 *   neighborhood?: string | null,
 *   id?: string | null,
 *   source_external_id?: string | null,
 *   auditoriumId?: string | null,
 * }} FavoriteTheaterRefInput
 */

/**
 * @typedef {{
 *   theaterId: string,
 *   sourceTheaterId: string | null,
 *   source: string | null,
 * }} FavoriteTheaterRef
 */

/**
 * @typedef {{
 *   theaterRef: FavoriteTheaterRef,
 *   favoritedAt: string,
 *   name?: string | null,
 *   imageUrl?: string | null,
 *   neighborhood?: string | null,
 * }} FavoriteTheaterItem
 */

/**
 * @typedef {{
 *   version: number,
 *   items: FavoriteTheaterItem[],
 * }} FavoriteTheatersStorePayload
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   store: FavoriteTheatersStorePayload,
 *   error?: string | null,
 *   changed?: boolean,
 * }} FavoriteTheatersWriteResult
 */

/**
 * @typedef {{
 *   store: FavoriteTheatersStorePayload,
 *   status: 'ok' | 'empty' | 'corrupt' | 'unsupported_version' | 'storage_unavailable',
 *   error?: string | null,
 * }} FavoriteTheatersReadResult
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
 * Normalize canonical theater registry id (trim only).
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeTheaterId(value) {
  return asOptionalString(value);
}

/**
 * Build a portable theater reference for favorite/unfavorite/toggle.
 * Requires a usable canonical theaterId. Name or auditorium alone is insufficient.
 *
 * @param {FavoriteTheaterRefInput | string | null | undefined} input
 * @returns {FavoriteTheaterRef | null}
 */
export function normalizeFavoriteTheaterRef(input) {
  if (typeof input === 'string') {
    const theaterId = normalizeTheaterId(input);
    if (!theaterId) return null;
    return {
      theaterId,
      sourceTheaterId: null,
      source: null,
    };
  }
  if (!input || typeof input !== 'object') return null;

  const theaterId = normalizeTheaterId(
    input.theaterId ??
      // Common registry alias callers may pass.
      input.id,
  );
  if (!theaterId) return null;

  return {
    theaterId,
    sourceTheaterId: asOptionalString(
      input.sourceTheaterId ?? input.source_external_id,
    ),
    source: asOptionalString(input.source),
  };
}

/**
 * Equality for favorite-theater identity (canonical theaterId only).
 * @param {FavoriteTheaterRefInput | string | null | undefined} a
 * @param {FavoriteTheaterRefInput | string | null | undefined} b
 */
export function favoriteTheaterRefsEqual(a, b) {
  const left = normalizeFavoriteTheaterRef(a);
  const right = normalizeFavoriteTheaterRef(b);
  if (!left || !right) return false;
  return left.theaterId === right.theaterId;
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
 * @returns {FavoriteTheaterItem | null}
 */
function normalizeFavoriteTheaterItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const theaterRef = normalizeFavoriteTheaterRef(
    record.theaterRef && typeof record.theaterRef === 'object'
      ? /** @type {FavoriteTheaterRefInput} */ (record.theaterRef)
      : {
          theaterId: record.theaterId,
          sourceTheaterId: record.sourceTheaterId,
          source: record.source,
          id: record.id,
          source_external_id: record.source_external_id,
        },
  );
  if (!theaterRef) return null;
  const favoritedAt = normalizeIsoTimestamp(record.favoritedAt);
  if (!favoritedAt) return null;

  /** @type {FavoriteTheaterItem} */
  const item = { theaterRef, favoritedAt };
  const name = asOptionalString(record.name);
  const imageUrl = asOptionalString(record.imageUrl);
  const neighborhood = asOptionalString(record.neighborhood);
  if (name) item.name = name;
  if (imageUrl) item.imageUrl = imageUrl;
  if (neighborhood) item.neighborhood = neighborhood;
  return item;
}

/**
 * Deduplicate + order newest-first. Invalid items dropped.
 * @param {unknown} items
 * @returns {FavoriteTheaterItem[]}
 */
export function normalizeFavoriteTheaterItems(items) {
  if (!Array.isArray(items)) return [];
  /** @type {FavoriteTheaterItem[]} */
  const out = [];
  for (const raw of items) {
    const item = normalizeFavoriteTheaterItem(raw);
    if (!item) continue;
    const idx = out.findIndex((existing) =>
      favoriteTheaterRefsEqual(existing.theaterRef, item.theaterRef),
    );
    if (idx >= 0) {
      if (item.favoritedAt > out[idx].favoritedAt) out[idx] = item;
      continue;
    }
    out.push(item);
  }
  out.sort((a, b) => {
    if (a.favoritedAt !== b.favoritedAt) {
      return a.favoritedAt < b.favoritedAt ? 1 : -1;
    }
    return a.theaterRef.theaterId < b.theaterRef.theaterId ? -1 : 1;
  });
  return out.slice(0, FAVORITE_THEATERS_MAX);
}

/**
 * @returns {FavoriteTheatersStorePayload}
 */
export function emptyFavoriteTheatersStore() {
  return { version: FAVORITE_THEATERS_VERSION, items: [] };
}

/**
 * Normalize a parsed payload. Does not write storage.
 * v1 is the first format — unversioned shapes are corrupt (no legacy migrate).
 *
 * @param {unknown} payload
 * @returns {FavoriteTheatersReadResult}
 */
export function normalizeFavoriteTheatersPayload(payload) {
  if (payload == null) {
    return { store: emptyFavoriteTheatersStore(), status: 'empty' };
  }
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      store: emptyFavoriteTheatersStore(),
      status: 'corrupt',
      error: 'invalid_root',
    };
  }

  const root = /** @type {Record<string, unknown>} */ (payload);

  if (!('version' in root)) {
    return {
      store: emptyFavoriteTheatersStore(),
      status: 'corrupt',
      error: 'missing_version',
    };
  }

  const version = root.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return {
      store: emptyFavoriteTheatersStore(),
      status: 'corrupt',
      error: 'invalid_version',
    };
  }

  if (version > FAVORITE_THEATERS_VERSION) {
    return {
      store: emptyFavoriteTheatersStore(),
      status: 'unsupported_version',
      error: `unsupported_version:${version}`,
    };
  }

  if (!('items' in root)) {
    return {
      store: emptyFavoriteTheatersStore(),
      status: 'corrupt',
      error: 'missing_items',
    };
  }

  if (!Array.isArray(root.items)) {
    return {
      store: emptyFavoriteTheatersStore(),
      status: 'corrupt',
      error: 'invalid_items',
    };
  }

  return {
    store: {
      version: FAVORITE_THEATERS_VERSION,
      items: normalizeFavoriteTheaterItems(root.items),
    },
    status: 'ok',
  };
}

/**
 * Migration entry point for later versions. v1 → v1 is identity.
 * @param {unknown} payload
 * @returns {FavoriteTheatersReadResult}
 */
export function migrateFavoriteTheatersPayload(payload) {
  return normalizeFavoriteTheatersPayload(payload);
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {FavoriteTheatersReadResult}
 */
export function readFavoriteTheatersStore(storage) {
  try {
    if (!storage) {
      return {
        store: emptyFavoriteTheatersStore(),
        status: 'storage_unavailable',
        error: 'storage_unavailable',
      };
    }
    const raw = storage.getItem(FAVORITE_THEATERS_STORAGE_KEY);
    if (raw == null || raw === '') {
      return { store: emptyFavoriteTheatersStore(), status: 'empty' };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        store: emptyFavoriteTheatersStore(),
        status: 'corrupt',
        error: 'invalid_json',
      };
    }
    return migrateFavoriteTheatersPayload(parsed);
  } catch {
    return {
      store: emptyFavoriteTheatersStore(),
      status: 'storage_unavailable',
      error: 'storage_get_failed',
    };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {FavoriteTheaterItem[]}
 */
export function getFavoriteTheaters(storage) {
  return readFavoriteTheatersStore(storage).store.items;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {FavoriteTheaterRefInput | string | null | undefined} theaterRef
 */
export function isTheaterFavorite(storage, theaterRef) {
  const ref = normalizeFavoriteTheaterRef(theaterRef);
  if (!ref) return false;
  return getFavoriteTheaters(storage).some((item) =>
    favoriteTheaterRefsEqual(item.theaterRef, ref),
  );
}

/** @type {Set<() => void>} */
const favoriteTheatersListeners = new Set();

/**
 * Subscribe to local favorite-theater mutations (same-tab).
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeFavoriteTheaters(listener) {
  if (typeof listener !== 'function') return () => {};
  favoriteTheatersListeners.add(listener);
  return () => {
    favoriteTheatersListeners.delete(listener);
  };
}

function emitFavoriteTheatersChange() {
  for (const listener of favoriteTheatersListeners) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {FavoriteTheatersStorePayload} store
 * @returns {FavoriteTheatersWriteResult}
 */
function writeFavoriteTheatersStore(storage, store) {
  const normalized = {
    version: FAVORITE_THEATERS_VERSION,
    items: normalizeFavoriteTheaterItems(store.items),
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
    storage.setItem(
      FAVORITE_THEATERS_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    const result = {
      ok: true,
      store: normalized,
      error: null,
      changed: true,
    };
    emitFavoriteTheatersChange();
    return result;
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
 * @param {FavoriteTheaterRefInput | string} theaterRef
 * @param {{
 *   now?: () => Date,
 *   name?: string | null,
 *   imageUrl?: string | null,
 *   neighborhood?: string | null,
 * }} [options]
 * @returns {FavoriteTheaterItem | null}
 */
function buildFavoriteItem(theaterRef, options = {}) {
  const ref = normalizeFavoriteTheaterRef(theaterRef);
  if (!ref) return null;
  const nowFn = options.now ?? (() => new Date());
  /** @type {FavoriteTheaterItem} */
  const item = {
    theaterRef: { ...ref },
    favoritedAt: nowFn().toISOString(),
  };
  const name = asOptionalString(options.name);
  const imageUrl = asOptionalString(options.imageUrl);
  const neighborhood = asOptionalString(options.neighborhood);
  if (name) item.name = name;
  else if (typeof theaterRef === 'object' && theaterRef) {
    const hint = asOptionalString(theaterRef.name);
    if (hint) item.name = hint;
  }
  if (imageUrl) item.imageUrl = imageUrl;
  else if (typeof theaterRef === 'object' && theaterRef) {
    const hint = asOptionalString(theaterRef.imageUrl);
    if (hint) item.imageUrl = hint;
  }
  if (neighborhood) item.neighborhood = neighborhood;
  else if (typeof theaterRef === 'object' && theaterRef) {
    const hint = asOptionalString(theaterRef.neighborhood);
    if (hint) item.neighborhood = hint;
  }
  return item;
}

/**
 * Favorite a theater. Idempotent: existing favorites are not duplicated and
 * favoritedAt is kept.
 *
 * @param {Storage | null | undefined} storage
 * @param {FavoriteTheaterRefInput | string} theaterRef
 * @param {{
 *   now?: () => Date,
 *   name?: string | null,
 *   imageUrl?: string | null,
 *   neighborhood?: string | null,
 * }} [options]
 * @returns {FavoriteTheatersWriteResult}
 */
export function favoriteTheater(storage, theaterRef, options = {}) {
  const item = buildFavoriteItem(theaterRef, options);
  if (!item) {
    return {
      ok: false,
      store: readFavoriteTheatersStore(storage).store,
      error: 'invalid_ref',
      changed: false,
    };
  }

  const read = readFavoriteTheatersStore(storage);
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
    favoriteTheaterRefsEqual(row.theaterRef, item.theaterRef),
  );
  if (already) {
    const written = writeFavoriteTheatersStore(storage, {
      version: FAVORITE_THEATERS_VERSION,
      items: existing,
    });
    return {
      ...written,
      changed: false,
      error: written.ok ? null : written.error,
    };
  }

  return writeFavoriteTheatersStore(storage, {
    version: FAVORITE_THEATERS_VERSION,
    items: [item, ...existing],
  });
}

/**
 * @param {Storage | null | undefined} storage
 * @param {FavoriteTheaterRefInput | string} theaterRef
 * @returns {FavoriteTheatersWriteResult}
 */
export function unfavoriteTheater(storage, theaterRef) {
  const ref = normalizeFavoriteTheaterRef(theaterRef);
  const read = readFavoriteTheatersStore(storage);
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
    (item) => !favoriteTheaterRefsEqual(item.theaterRef, ref),
  );
  if (nextItems.length === read.store.items.length) {
    return {
      ok: true,
      store: read.store,
      error: null,
      changed: false,
    };
  }
  return writeFavoriteTheatersStore(storage, {
    version: FAVORITE_THEATERS_VERSION,
    items: nextItems,
  });
}

/**
 * @param {Storage | null | undefined} storage
 * @param {FavoriteTheaterRefInput | string} theaterRef
 * @param {{
 *   now?: () => Date,
 *   name?: string | null,
 *   imageUrl?: string | null,
 *   neighborhood?: string | null,
 * }} [options]
 * @returns {FavoriteTheatersWriteResult & { favorite?: boolean }}
 */
export function toggleFavoriteTheater(storage, theaterRef, options = {}) {
  if (isTheaterFavorite(storage, theaterRef)) {
    const result = unfavoriteTheater(storage, theaterRef);
    return { ...result, favorite: false };
  }
  const result = favoriteTheater(storage, theaterRef, options);
  return {
    ...result,
    favorite: result.ok ? true : isTheaterFavorite(storage, theaterRef),
  };
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {FavoriteTheatersWriteResult}
 */
export function clearFavoriteTheaters(storage) {
  const read = readFavoriteTheatersStore(storage);
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
        store: emptyFavoriteTheatersStore(),
        error: 'storage_unavailable',
        changed: false,
      };
    }
    storage.removeItem(FAVORITE_THEATERS_STORAGE_KEY);
    const result = {
      ok: true,
      store: emptyFavoriteTheatersStore(),
      error: null,
      changed: true,
    };
    emitFavoriteTheatersChange();
    return result;
  } catch {
    return {
      ok: false,
      store: read.store,
      error: 'storage_set_failed',
      changed: false,
    };
  }
}
