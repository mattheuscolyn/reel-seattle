/**
 * Device-local cache of "Share my film activity with friends".
 *
 * When the user is signed in and cloud profiles are available, the profile
 * column `share_film_activity_with_friends` is authoritative. Local storage is
 * only a cache / offline fallback — never a successful privacy change without
 * a confirmed cloud write for authenticated sessions.
 *
 * Default OFF (opt-in): existing friendships must not retroactively expose
 * Saved / Seen / Not Interested history.
 */

export const FRIEND_ACTIVITY_PRIVACY_STORAGE_KEY =
  'reel-seattle.v2.friendActivityPrivacy';
export const FRIEND_ACTIVITY_PRIVACY_VERSION = 1;

/**
 * @typedef {{
 *   shareFilmActivityWithFriends: boolean,
 * }} FriendActivityPrivacyState
 */

/**
 * Opt-in default: sharing OFF until the user explicitly enables it.
 * @returns {FriendActivityPrivacyState}
 */
export function defaultFriendActivityPrivacy() {
  return {
    shareFilmActivityWithFriends: false,
  };
}

export function emptyFriendActivityPrivacyStore() {
  return {
    version: FRIEND_ACTIVITY_PRIVACY_VERSION,
    settings: defaultFriendActivityPrivacy(),
  };
}

/**
 * @param {unknown} raw
 * @returns {FriendActivityPrivacyState}
 */
export function normalizeFriendActivityPrivacy(raw) {
  const base = defaultFriendActivityPrivacy();
  if (!raw || typeof raw !== 'object') return base;
  const row = /** @type {Record<string, unknown>} */ (raw);
  return {
    shareFilmActivityWithFriends:
      typeof row.shareFilmActivityWithFriends === 'boolean'
        ? row.shareFilmActivityWithFriends
        : typeof row.share_film_activity_with_friends === 'boolean'
          ? row.share_film_activity_with_friends
          : base.shareFilmActivityWithFriends,
  };
}

/**
 * @param {Storage | null | undefined} storage
 */
export function readFriendActivityPrivacyStore(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return {
      store: emptyFriendActivityPrivacyStore(),
      status: 'storage_unavailable',
      error: 'storage_unavailable',
    };
  }
  let raw;
  try {
    raw = storage.getItem(FRIEND_ACTIVITY_PRIVACY_STORAGE_KEY);
  } catch {
    return {
      store: emptyFriendActivityPrivacyStore(),
      status: 'storage_unavailable',
      error: 'storage_read_failed',
    };
  }
  if (raw == null || raw === '') {
    return { store: emptyFriendActivityPrivacyStore(), status: 'empty' };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {
        store: emptyFriendActivityPrivacyStore(),
        status: 'corrupt',
        error: 'invalid_json_shape',
      };
    }
    const version = Number(parsed.version);
    if (!Number.isInteger(version) || version < 1) {
      return {
        store: emptyFriendActivityPrivacyStore(),
        status: 'corrupt',
        error: 'invalid_version',
      };
    }
    if (version > FRIEND_ACTIVITY_PRIVACY_VERSION) {
      return {
        store: emptyFriendActivityPrivacyStore(),
        status: 'unsupported_version',
        error: 'unsupported_version',
      };
    }
    return {
      store: {
        version: FRIEND_ACTIVITY_PRIVACY_VERSION,
        settings: normalizeFriendActivityPrivacy(parsed.settings ?? parsed),
      },
      status: 'ok',
    };
  } catch {
    return {
      store: emptyFriendActivityPrivacyStore(),
      status: 'corrupt',
      error: 'json_parse_failed',
    };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {FriendActivityPrivacyState}
 */
export function getFriendActivityPrivacy(storage) {
  return readFriendActivityPrivacyStore(storage).store.settings;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {object} store
 */
function writeStore(storage, store) {
  if (!storage || typeof storage.setItem !== 'function') {
    return { ok: false, error: 'storage_unavailable' };
  }
  try {
    storage.setItem(FRIEND_ACTIVITY_PRIVACY_STORAGE_KEY, JSON.stringify(store));
    return { ok: true };
  } catch {
    return { ok: false, error: 'storage_write_failed' };
  }
}

/**
 * Write local cache only. Prefer setShareFilmActivityWithFriends for
 * authenticated privacy mutations so cloud remains authoritative.
 *
 * @param {Storage | null | undefined} storage
 * @param {Partial<FriendActivityPrivacyState>} patch
 */
export function updateFriendActivityPrivacy(storage, patch) {
  const read = readFriendActivityPrivacyStore(storage);
  if (read.status === 'unsupported_version') {
    return {
      ok: false,
      store: read.store,
      error: 'unsupported_version',
      changed: false,
      settings: read.store.settings,
    };
  }
  const nextSettings = normalizeFriendActivityPrivacy({
    ...read.store.settings,
    ...patch,
  });
  const nextStore = {
    version: FRIEND_ACTIVITY_PRIVACY_VERSION,
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
    emitFriendActivityPrivacyChange();
  }
  return {
    ok: written.ok,
    store: written.ok ? nextStore : read.store,
    error: written.error ?? null,
    changed: written.ok,
    settings: written.ok ? nextSettings : read.store.settings,
  };
}

/**
 * Overwrite local cache with a confirmed server value.
 *
 * @param {Storage | null | undefined} storage
 * @param {boolean} shareFilmActivityWithFriends
 */
export function applyAuthoritativeFriendActivityPrivacy(
  storage,
  shareFilmActivityWithFriends,
) {
  return updateFriendActivityPrivacy(storage, {
    shareFilmActivityWithFriends: shareFilmActivityWithFriends === true,
  });
}

/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeFriendActivityPrivacy(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitFriendActivityPrivacyChange() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}
