/**
 * Device-local experience preferences (captions / audio description).
 * Soft preferences only — do not hide or hard-filter showtimes.
 * Not synced to accounts. Distinct from scheduleSettingsStore.
 */

export const EXPERIENCE_PREFERENCES_STORAGE_KEY =
  'reel-seattle.v2.experiencePreferences';
export const EXPERIENCE_PREFERENCES_VERSION = 1;

export const CAPTIONS_PREFERENCE_IDS = Object.freeze([
  'none',
  'prefer_open_caption',
]);

export const AUDIO_DESCRIPTION_PREFERENCE_IDS = Object.freeze([
  'none',
  'prefer_audio_description',
]);

/**
 * @typedef {{
 *   captionsPreference: 'none' | 'prefer_open_caption',
 *   audioDescriptionPreference: 'none' | 'prefer_audio_description',
 * }} ExperiencePreferencesState
 */

/**
 * @typedef {{
 *   version: number,
 *   settings: ExperiencePreferencesState,
 * }} ExperiencePreferencesStorePayload
 */

/**
 * @returns {ExperiencePreferencesState}
 */
export function defaultExperiencePreferences() {
  return {
    captionsPreference: 'none',
    audioDescriptionPreference: 'none',
  };
}

/**
 * @returns {ExperiencePreferencesStorePayload}
 */
export function emptyExperiencePreferencesStore() {
  return {
    version: EXPERIENCE_PREFERENCES_VERSION,
    settings: defaultExperiencePreferences(),
  };
}

/**
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {string} fallback
 */
function normalizeEnum(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

/**
 * @param {unknown} raw
 * @returns {ExperiencePreferencesState}
 */
export function normalizeExperiencePreferences(raw) {
  const base = defaultExperiencePreferences();
  if (!raw || typeof raw !== 'object') return base;
  const row = /** @type {Record<string, unknown>} */ (raw);
  return {
    captionsPreference: /** @type {ExperiencePreferencesState['captionsPreference']} */ (
      normalizeEnum(
        row.captionsPreference,
        CAPTIONS_PREFERENCE_IDS,
        base.captionsPreference,
      )
    ),
    audioDescriptionPreference:
      /** @type {ExperiencePreferencesState['audioDescriptionPreference']} */ (
        normalizeEnum(
          row.audioDescriptionPreference,
          AUDIO_DESCRIPTION_PREFERENCE_IDS,
          base.audioDescriptionPreference,
        )
      ),
  };
}

/**
 * @param {Storage | null | undefined} storage
 */
export function readExperiencePreferencesStore(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return {
      store: emptyExperiencePreferencesStore(),
      status: 'storage_unavailable',
      error: 'storage_unavailable',
    };
  }
  let raw;
  try {
    raw = storage.getItem(EXPERIENCE_PREFERENCES_STORAGE_KEY);
  } catch {
    return {
      store: emptyExperiencePreferencesStore(),
      status: 'storage_unavailable',
      error: 'storage_read_failed',
    };
  }
  if (raw == null || raw === '') {
    return { store: emptyExperiencePreferencesStore(), status: 'empty' };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {
        store: emptyExperiencePreferencesStore(),
        status: 'corrupt',
        error: 'invalid_json_shape',
      };
    }
    const version = Number(parsed.version);
    if (!Number.isInteger(version) || version < 1) {
      return {
        store: emptyExperiencePreferencesStore(),
        status: 'corrupt',
        error: 'invalid_version',
      };
    }
    if (version > EXPERIENCE_PREFERENCES_VERSION) {
      return {
        store: emptyExperiencePreferencesStore(),
        status: 'unsupported_version',
        error: 'unsupported_version',
      };
    }
    return {
      store: {
        version: EXPERIENCE_PREFERENCES_VERSION,
        settings: normalizeExperiencePreferences(parsed.settings ?? parsed),
      },
      status: 'ok',
    };
  } catch {
    return {
      store: emptyExperiencePreferencesStore(),
      status: 'corrupt',
      error: 'json_parse_failed',
    };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {ExperiencePreferencesState}
 */
export function getExperiencePreferences(storage) {
  return readExperiencePreferencesStore(storage).store.settings;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {ExperiencePreferencesStorePayload} store
 */
function writeStore(storage, store) {
  if (!storage || typeof storage.setItem !== 'function') {
    return { ok: false, error: 'storage_unavailable' };
  }
  try {
    storage.setItem(EXPERIENCE_PREFERENCES_STORAGE_KEY, JSON.stringify(store));
    return { ok: true };
  } catch {
    return { ok: false, error: 'storage_write_failed' };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {Partial<ExperiencePreferencesState>} patch
 */
export function updateExperiencePreferences(storage, patch) {
  const read = readExperiencePreferencesStore(storage);
  if (read.status === 'unsupported_version') {
    return {
      ok: false,
      store: read.store,
      error: 'unsupported_version',
      changed: false,
      settings: read.store.settings,
    };
  }
  const nextSettings = normalizeExperiencePreferences({
    ...read.store.settings,
    ...patch,
  });
  const nextStore = {
    version: EXPERIENCE_PREFERENCES_VERSION,
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
    emitExperiencePreferencesChange();
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
export function subscribeExperiencePreferences(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitExperiencePreferencesChange() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}
