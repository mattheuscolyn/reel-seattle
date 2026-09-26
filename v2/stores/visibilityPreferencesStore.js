/**
 * Device-local discovery visibility preferences.
 * Controls whether Seen / Not Interested films appear on discovery surfaces.
 * Distinct from film membership stores and soft experience preferences.
 */

export const VISIBILITY_PREFERENCES_STORAGE_KEY =
  'reel-seattle.v2.visibilityPreferences';
export const VISIBILITY_PREFERENCES_VERSION = 1;

/**
 * @typedef {{
 *   hideNotInterested: boolean,
 *   hideSeen: boolean,
 * }} VisibilityPreferencesState
 */

/**
 * @typedef {{
 *   version: number,
 *   settings: VisibilityPreferencesState,
 * }} VisibilityPreferencesStorePayload
 */

/**
 * Defaults are opt-in: both off so deploying this feature does not silently
 * hide films on surfaces that previously showed Seen / Not Interested.
 * @returns {VisibilityPreferencesState}
 */
export function defaultVisibilityPreferences() {
  return {
    hideNotInterested: false,
    hideSeen: false,
  };
}

export function emptyVisibilityPreferencesStore() {
  return {
    version: VISIBILITY_PREFERENCES_VERSION,
    settings: defaultVisibilityPreferences(),
  };
}

/**
 * @param {unknown} raw
 * @returns {VisibilityPreferencesState}
 */
export function normalizeVisibilityPreferences(raw) {
  const base = defaultVisibilityPreferences();
  if (!raw || typeof raw !== 'object') return base;
  const row = /** @type {Record<string, unknown>} */ (raw);
  return {
    hideNotInterested:
      typeof row.hideNotInterested === 'boolean'
        ? row.hideNotInterested
        : base.hideNotInterested,
    hideSeen:
      typeof row.hideSeen === 'boolean' ? row.hideSeen : base.hideSeen,
  };
}

/**
 * @param {Storage | null | undefined} storage
 */
export function readVisibilityPreferencesStore(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return {
      store: emptyVisibilityPreferencesStore(),
      status: 'storage_unavailable',
      error: 'storage_unavailable',
    };
  }
  let raw;
  try {
    raw = storage.getItem(VISIBILITY_PREFERENCES_STORAGE_KEY);
  } catch {
    return {
      store: emptyVisibilityPreferencesStore(),
      status: 'storage_unavailable',
      error: 'storage_read_failed',
    };
  }
  if (raw == null || raw === '') {
    return { store: emptyVisibilityPreferencesStore(), status: 'empty' };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {
        store: emptyVisibilityPreferencesStore(),
        status: 'corrupt',
        error: 'invalid_json_shape',
      };
    }
    const version = Number(parsed.version);
    if (!Number.isInteger(version) || version < 1) {
      return {
        store: emptyVisibilityPreferencesStore(),
        status: 'corrupt',
        error: 'invalid_version',
      };
    }
    if (version > VISIBILITY_PREFERENCES_VERSION) {
      return {
        store: emptyVisibilityPreferencesStore(),
        status: 'unsupported_version',
        error: 'unsupported_version',
      };
    }
    return {
      store: {
        version: VISIBILITY_PREFERENCES_VERSION,
        settings: normalizeVisibilityPreferences(parsed.settings ?? parsed),
      },
      status: 'ok',
    };
  } catch {
    return {
      store: emptyVisibilityPreferencesStore(),
      status: 'corrupt',
      error: 'json_parse_failed',
    };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {VisibilityPreferencesState}
 */
export function getVisibilityPreferences(storage) {
  return readVisibilityPreferencesStore(storage).store.settings;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {VisibilityPreferencesStorePayload} store
 */
function writeStore(storage, store) {
  if (!storage || typeof storage.setItem !== 'function') {
    return { ok: false, error: 'storage_unavailable' };
  }
  try {
    storage.setItem(VISIBILITY_PREFERENCES_STORAGE_KEY, JSON.stringify(store));
    return { ok: true };
  } catch {
    return { ok: false, error: 'storage_write_failed' };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {Partial<VisibilityPreferencesState>} patch
 */
export function updateVisibilityPreferences(storage, patch) {
  const read = readVisibilityPreferencesStore(storage);
  if (read.status === 'unsupported_version') {
    return {
      ok: false,
      store: read.store,
      error: 'unsupported_version',
      changed: false,
      settings: read.store.settings,
    };
  }
  const nextSettings = normalizeVisibilityPreferences({
    ...read.store.settings,
    ...patch,
  });
  const nextStore = {
    version: VISIBILITY_PREFERENCES_VERSION,
    settings: nextSettings,
  };
  const changed =
    JSON.stringify(nextSettings) !== JSON.stringify(read.store.settings);
  if (!changed) {
    return {
      ok: true,
      store: read.store,
      error: null,
      changed: false,
      settings: nextSettings,
    };
  }
  const written = writeStore(storage, nextStore);
  if (written.ok && changed) {
    emitVisibilityPreferencesChange();
  }
  return {
    ok: written.ok,
    store: written.ok ? nextStore : read.store,
    error: written.error ?? null,
    changed: written.ok,
    settings: written.ok ? nextSettings : read.store.settings,
  };
}

/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeVisibilityPreferences(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitVisibilityPreferencesChange() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}
