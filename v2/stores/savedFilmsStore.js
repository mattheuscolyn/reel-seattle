/**
 * Versioned Saved Films store (T-SAVE-01 / T-FILMID-03).
 *
 * Device-local persistence for films the user wants to retain for later
 * consideration. Distinct from Seen, Not interested, Planner drafts, and
 * My Schedule. Not synced to accounts.
 *
 * Identity (T-FILMID-03):
 * 1. Prefer valid canonical `filmId` (`tmdb:<positive-int>`) when both sides have one.
 * 2. Otherwise equality is showtimeFilmKey overlap (primary key + aliasKeys).
 * 3. `source` + `sourceFilmId` are reconciliation hints only — never sole identity.
 * 4. Never use source_showtime_id / opportunity keys / title hashes as identity.
 * 5. Callers should pass the film-level HomeData `filmKey` they intend to save.
 *    Variants are distinct keys unless the caller intentionally passes a parent key
 *    or both resolve to the same canonical filmId.
 *
 * Cross-tab: same-tab reads see writes immediately. Other tabs require a later
 * `storage` listener (not required in T-SAVE-01). Compatible with T-XPORT-01.
 */

export const SAVED_FILMS_STORAGE_KEY = 'reel-seattle.v2.savedFilms';
/** v2: validated canonical filmId + aliasKeys; v1 payloads migrate on read. */
export const SAVED_FILMS_VERSION = 2;
export const SAVED_FILMS_MAX = 100;

/**
 * @typedef {{
 *   filmId?: string | null,
 *   showtimeFilmKey?: string | null,
 *   aliasKeys?: string[] | null,
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
 *   aliasKeys?: string[],
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
 * Accept only namespaced canonical IDs from the film-identity contract.
 * @param {unknown} value
 * @returns {string | null}
 */
export function asCanonicalStoreFilmId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^tmdb:[1-9][0-9]*$/.test(trimmed)) return null;
  return trimmed;
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
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeAliasKeys(value, primaryKey) {
  if (!Array.isArray(value)) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  if (primaryKey) seen.add(primaryKey);
  for (const entry of value) {
    const key = normalizeShowtimeFilmKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  out.sort();
  return out;
}

/**
 * @param {SavedFilmRef} ref
 * @returns {Set<string>}
 */
export function filmRefKeySet(ref) {
  const keys = new Set();
  if (!ref) return keys;
  if (ref.showtimeFilmKey) keys.add(ref.showtimeFilmKey);
  for (const alias of ref.aliasKeys ?? []) {
    if (alias) keys.add(alias);
  }
  return keys;
}

/**
 * @param {SavedFilmRef} left
 * @param {SavedFilmRef} right
 */
function filmRefKeysOverlap(left, right) {
  const a = filmRefKeySet(left);
  for (const key of filmRefKeySet(right)) {
    if (a.has(key)) return true;
  }
  return false;
}

/**
 * Build a portable film reference for save/unsave/toggle.
 * Requires a usable showtimeFilmKey (canonical filmId alone is not enough without
 * a catalog resolver). Invalid filmId values are dropped to null.
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

  const aliasKeys = normalizeAliasKeys(input.aliasKeys, showtimeFilmKey);
  /** @type {SavedFilmRef} */
  const ref = {
    filmId: asCanonicalStoreFilmId(input.filmId),
    showtimeFilmKey,
    sourceFilmId: asOptionalString(input.sourceFilmId),
    source: asOptionalString(input.source),
  };
  if (aliasKeys.length) ref.aliasKeys = aliasKeys;
  return ref;
}

/**
 * Merge two normalized refs that already share identity.
 * @param {SavedFilmRef} a
 * @param {SavedFilmRef} b
 * @returns {SavedFilmRef}
 */
export function mergeSavedFilmRefs(a, b) {
  const filmId = a.filmId ?? b.filmId ?? null;
  // Prefer the primary key from the side that already carries canonical identity.
  const showtimeFilmKey =
    (a.filmId && a.showtimeFilmKey) ||
    (b.filmId && b.showtimeFilmKey) ||
    a.showtimeFilmKey ||
    b.showtimeFilmKey;
  const keys = filmRefKeySet(a);
  for (const key of filmRefKeySet(b)) keys.add(key);
  keys.delete(showtimeFilmKey);
  const aliasKeys = [...keys].sort();
  /** @type {SavedFilmRef} */
  const ref = {
    filmId,
    showtimeFilmKey,
    sourceFilmId: a.sourceFilmId ?? b.sourceFilmId ?? null,
    source: a.source ?? b.source ?? null,
  };
  if (aliasKeys.length) ref.aliasKeys = aliasKeys;
  return ref;
}

/**
 * Equality for saved-film identity (canonical filmId, else key/alias overlap).
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
  return filmRefKeysOverlap(left, right);
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
          aliasKeys: record.aliasKeys,
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
 * Merge two Saved items that share identity (T-FILMID-03).
 * savedAt keeps the earliest; title/poster prefer the newer non-empty values.
 * @param {SavedFilmItem} a
 * @param {SavedFilmItem} b
 * @returns {SavedFilmItem}
 */
export function mergeSavedFilmItems(a, b) {
  const earlier = a.savedAt <= b.savedAt ? a : b;
  const newer = a.savedAt >= b.savedAt ? a : b;
  /** @type {SavedFilmItem} */
  const merged = {
    filmRef: mergeSavedFilmRefs(a.filmRef, b.filmRef),
    savedAt: earlier.savedAt,
  };
  const title = newer.title ?? earlier.title ?? null;
  const posterUrl = newer.posterUrl ?? earlier.posterUrl ?? null;
  if (title) merged.title = title;
  if (posterUrl) merged.posterUrl = posterUrl;
  return merged;
}

/**
 * Deduplicate + order newest-first. Invalid items dropped.
 * Duplicate identity collapses with earliest savedAt (T-FILMID-03).
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
      out[idx] = mergeSavedFilmItems(out[idx], item);
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
 * Migration entry point. v1 → v2 validates filmIds, merges alias duplicates.
 * @param {unknown} payload
 * @returns {SavedFilmsReadResult}
 */
export function migrateSavedFilmsPayload(payload) {
  return normalizeSavedFilmsPayload(payload);
}

/**
 * Upgrade stored items using live film refs (same showtimeFilmKey / alias → attach filmId).
 * Does not invent identity; only applies deterministic key overlap.
 *
 * @param {SavedFilmItem[]} items
 * @param {Array<SavedFilmRefInput | string | null | undefined>} liveRefs
 * @returns {{ items: SavedFilmItem[], changed: boolean, upgraded: number }}
 */
export function reconcileSavedItemsWithLiveRefs(items, liveRefs = []) {
  const liveEntries = (Array.isArray(liveRefs) ? liveRefs : [])
    .map((input) => {
      const ref = normalizeSavedFilmRef(input);
      if (!ref) return null;
      const title =
        input && typeof input === 'object'
          ? asOptionalString(/** @type {SavedFilmRefInput} */ (input).title)
          : null;
      const posterUrl =
        input && typeof input === 'object'
          ? asOptionalString(/** @type {SavedFilmRefInput} */ (input).posterUrl)
          : null;
      return { ref, title, posterUrl };
    })
    .filter(Boolean);
  if (!items.length || !liveEntries.length) {
    return { items: normalizeSavedFilmItems(items), changed: false, upgraded: 0 };
  }

  /** @type {SavedFilmItem[]} */
  let next = items.map((item) => ({
    ...item,
    filmRef: {
      ...item.filmRef,
      aliasKeys: item.filmRef.aliasKeys ? [...item.filmRef.aliasKeys] : undefined,
    },
  }));
  let upgraded = 0;

  for (const live of liveEntries) {
    if (!live.ref.filmId) continue;
    const idx = next.findIndex((row) => savedFilmRefsEqual(row.filmRef, live.ref));
    if (idx < 0) continue;
    const before = next[idx];
    const mergedRef = mergeSavedFilmRefs(before.filmRef, live.ref);
    const title = live.title ?? before.title;
    const posterUrl = live.posterUrl ?? before.posterUrl;
    /** @type {SavedFilmItem} */
    const merged = {
      filmRef: mergedRef,
      savedAt: before.savedAt,
    };
    if (title) merged.title = title;
    if (posterUrl) merged.posterUrl = posterUrl;
    const changedRef =
      JSON.stringify(before.filmRef) !== JSON.stringify(merged.filmRef) ||
      before.title !== merged.title ||
      before.posterUrl !== merged.posterUrl;
    if (changedRef) {
      next[idx] = merged;
      upgraded += 1;
    }
  }

  const normalized = normalizeSavedFilmItems(next);
  const changed =
    upgraded > 0 ||
    normalized.length !== items.length ||
    JSON.stringify(normalized) !== JSON.stringify(normalizeSavedFilmItems(items));
  return { items: normalized, changed, upgraded };
}

/**
 * Persist Saved store after reconciling with live HomeData-style film refs.
 * @param {Storage | null | undefined} storage
 * @param {Array<SavedFilmRefInput | string | null | undefined>} liveRefs
 * @returns {SavedFilmsWriteResult & { upgraded?: number }}
 */
export function reconcileSavedFilmsStore(storage, liveRefs = []) {
  const read = readSavedFilmsStore(storage);
  if (
    read.status === 'unsupported_version' ||
    read.status === 'storage_unavailable'
  ) {
    return {
      ok: false,
      store: read.store,
      error: read.error ?? read.status,
      changed: false,
      upgraded: 0,
    };
  }
  const reconciled = reconcileSavedItemsWithLiveRefs(read.store.items, liveRefs);
  if (!reconciled.changed && read.store.version === SAVED_FILMS_VERSION) {
    return {
      ok: true,
      store: read.store,
      error: null,
      changed: false,
      upgraded: 0,
    };
  }
  const written = writeSavedFilmsStore(storage, {
    version: SAVED_FILMS_VERSION,
    items: reconciled.items,
  });
  return { ...written, upgraded: reconciled.upgraded };
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
  const alreadyIdx = existing.findIndex((row) =>
    savedFilmRefsEqual(row.filmRef, item.filmRef),
  );
  if (alreadyIdx >= 0) {
    const already = existing[alreadyIdx];
    const mergedRef = mergeSavedFilmRefs(already.filmRef, item.filmRef);
    const nextTitle = item.title ?? already.title ?? null;
    const nextPoster = item.posterUrl ?? already.posterUrl ?? null;
    const refChanged =
      JSON.stringify(already.filmRef) !== JSON.stringify(mergedRef);
    const metaChanged =
      (nextTitle ?? null) !== (already.title ?? null) ||
      (nextPoster ?? null) !== (already.posterUrl ?? null);
    if (!refChanged && !metaChanged) {
      if (read.store.version === SAVED_FILMS_VERSION) {
        return {
          ok: true,
          store: read.store,
          error: null,
          changed: false,
        };
      }
      return writeSavedFilmsStore(storage, {
        version: SAVED_FILMS_VERSION,
        items: existing,
      });
    }
    const nextItems = existing.slice();
    /** @type {SavedFilmItem} */
    const nextItem = {
      filmRef: mergedRef,
      savedAt: already.savedAt,
    };
    if (nextTitle) nextItem.title = nextTitle;
    if (nextPoster) nextItem.posterUrl = nextPoster;
    nextItems[alreadyIdx] = nextItem;
    return writeSavedFilmsStore(storage, {
      version: SAVED_FILMS_VERSION,
      items: nextItems,
    });
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
