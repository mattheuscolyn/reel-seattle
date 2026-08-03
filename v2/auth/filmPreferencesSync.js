/**
 * Film preferences sync client (T-ACCOUNT-CLOUD-SYNC-FILMS-01).
 *
 * Local-first: UI mutations stay synchronous. Cloud writes are async,
 * coalesced, and never revert local state on failure.
 *
 * Login alone never uploads, downloads, merges, or attaches.
 */

import { getSupabaseClient } from './supabaseClient.js';
import {
  clearFilmSyncAttachment,
  isBrowserAttachedToUser,
  readFilmSyncAttachment,
  writeFilmSyncAttachment,
} from './filmSyncAttachmentStore.js';
import {
  subscribeFilmStoreMutations,
} from './filmStoreMutationBridge.js';
import { suppressFilmStoreMutationNotifications } from './filmStoreMutationBridge.js';
import {
  applyCrossStateConflictRules,
  diffLocalPreferenceMaps,
  localNotInterestedItemToRecord,
  localSavedItemToRecord,
  localSeenItemToRecord,
  mergePreferenceCollections,
  normalizePreferenceRecord,
  recordToLocalNotInterestedItem,
  recordToLocalSavedItem,
  recordToLocalSeenItem,
} from './filmPreferenceMerge.js';
import {
  getSavedFilms,
  normalizeSavedFilmItems,
  SAVED_FILMS_STORAGE_KEY,
  SAVED_FILMS_VERSION,
} from '../stores/savedFilmsStore.js';
import {
  getSeenFilms,
  normalizeSeenFilmItems,
  SEEN_FILMS_STORAGE_KEY,
  SEEN_FILMS_VERSION,
} from '../stores/seenFilmsStore.js';
import {
  getNotInterestedFilms,
  normalizeNotInterestedFilmItems,
  NOT_INTERESTED_FILMS_STORAGE_KEY,
  NOT_INTERESTED_FILMS_VERSION,
} from '../stores/notInterestedFilmsStore.js';

/** @typedef {'signed_out' | 'local_only' | 'prompt' | 'attaching' | 'synced' | 'degraded'} FilmSyncUiStatus */

/**
 * @typedef {{
 *   uiStatus: FilmSyncUiStatus,
 *   attached: boolean,
 *   attaching: boolean,
 *   degraded: boolean,
 *   lastSuccessfulSyncAt: string | null,
 *   lastSuccessfulPullAt: string | null,
 *   lastError: string | null,
 *   userId: string | null,
 *   cloudHasPreferences: boolean | null,
 *   localHasPreferences: boolean,
 * }} FilmSyncSnapshot
 */

const VISIBILITY_PULL_MIN_MS = 45_000;
const WRITE_DEBOUNCE_MS = 400;
const MAX_RETRY_DELAY_MS = 30_000;

/** @type {FilmSyncSnapshot} */
let snapshot = createSnapshot();
/** @type {Set<(s: FilmSyncSnapshot) => void>} */
const listeners = new Set();

/** @type {Storage | null} */
let storageRef = null;
/** @type {ReturnType<typeof getSupabaseClient> | null} */
let clientRef = null;
/** @type {string | null} */
let authUserId = null;
/** @type {number} */
let authGeneration = 0;
/** @type {boolean} */
let started = false;
/** @type {(() => void) | null} */
let mutationUnsub = null;
/** @type {(() => void) | null} */
let visibilityUnsub = null;

/** @type {Map<string, import('./filmPreferenceMerge.js').PreferenceRecord>} */
let pendingById = new Map();
/** @type {ReturnType<typeof setTimeout> | null} */
let writeTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let retryTimer = null;
/** @type {number} */
let retryAttempt = 0;
/** @type {boolean} */
let writeInFlight = false;
/** @type {boolean} */
let pullInFlight = false;
/** @type {number} */
let lastVisibilityPullAt = 0;

/** @type {Map<string, import('./filmPreferenceMerge.js').PreferenceRecord>} */
let observedLocalActive = new Map();

function createSnapshot() {
  return {
    uiStatus: /** @type {FilmSyncUiStatus} */ ('signed_out'),
    attached: false,
    attaching: false,
    degraded: false,
    lastSuccessfulSyncAt: null,
    lastSuccessfulPullAt: null,
    lastError: null,
    userId: null,
    cloudHasPreferences: null,
    localHasPreferences: false,
  };
}

function emit() {
  for (const listener of listeners) listener(snapshot);
}

/**
 * @param {Partial<FilmSyncSnapshot>} patch
 */
function setSnapshot(patch) {
  snapshot = { ...snapshot, ...patch };
  snapshot.uiStatus = deriveUiStatus(snapshot);
  emit();
}

/**
 * @param {FilmSyncSnapshot} s
 * @returns {FilmSyncUiStatus}
 */
function deriveUiStatus(s) {
  if (!s.userId) return 'signed_out';
  if (s.attaching) return 'attaching';
  if (s.attached && s.degraded) return 'degraded';
  if (s.attached) return 'synced';
  return 'prompt';
}

/**
 * @returns {FilmSyncSnapshot}
 */
export function getFilmPreferencesSyncSnapshot() {
  return snapshot;
}

/**
 * @param {(s: FilmSyncSnapshot) => void} listener
 * @returns {() => void}
 */
export function subscribeFilmPreferencesSync(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Honest label for Account UI. Never claims schedule sync.
 * @param {FilmSyncSnapshot} [s]
 */
export function getFilmPreferencesSyncLabel(s = snapshot) {
  switch (s.uiStatus) {
    case 'signed_out':
      return 'Film activity is stored on this device';
    case 'prompt':
      return 'Film activity is stored on this device';
    case 'attaching':
      return 'Combining film activity…';
    case 'synced':
      return 'Saved, Seen, and Not Interested are synced';
    case 'degraded':
      return 'Changes are saved on this device · Cloud sync will retry';
    default:
      return 'Film activity is stored on this device';
  }
}

function recordId(record) {
  return `${record.preference_type}::${record.film_key}`;
}

/**
 * @param {Storage | null | undefined} storage
 */
function readLocalActiveMap(storage) {
  /** @type {Map<string, import('./filmPreferenceMerge.js').PreferenceRecord>} */
  const map = new Map();
  const now = new Date().toISOString();
  for (const item of getSavedFilms(storage)) {
    const rec = localSavedItemToRecord(item, item.savedAt ?? now);
    if (rec) map.set(recordId(rec), rec);
  }
  for (const item of getSeenFilms(storage)) {
    const rec = localSeenItemToRecord(item, item.seenAt ?? now);
    if (rec) map.set(recordId(rec), rec);
  }
  for (const item of getNotInterestedFilms(storage)) {
    const rec = localNotInterestedItemToRecord(item, item.markedAt ?? now);
    if (rec) map.set(recordId(rec), rec);
  }
  return map;
}

/**
 * @param {Storage | null | undefined} storage
 */
function localHasAnyPreferences(storage) {
  return (
    getSavedFilms(storage).length > 0 ||
    getSeenFilms(storage).length > 0 ||
    getNotInterestedFilms(storage).length > 0
  );
}

/**
 * @param {unknown} error
 * @param {string} fallback
 */
function friendlySyncError(error, fallback) {
  if (!error) return fallback;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error &&
          'message' in error &&
          typeof /** @type {{ message?: unknown }} */ (error).message ===
            'string'
        ? /** @type {{ message: string }} */ (error).message
        : '';
  if (/network|fetch|offline|failed to fetch/i.test(message)) {
    return 'Network unavailable. Changes stay on this device.';
  }
  if (/jwt|session|auth|token/i.test(message)) {
    return 'Account session needs refresh. Changes stay on this device.';
  }
  return fallback;
}

/**
 * Classify whether an error is worth retrying.
 * @param {unknown} error
 */
export function isRetryableSyncError(error) {
  if (!error) return false;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error &&
          'message' in error &&
          typeof /** @type {{ message?: unknown }} */ (error).message ===
            'string'
        ? /** @type {{ message: string }} */ (error).message
        : String(error);
  if (/permission|rls|row-level|jwt expired|invalid.*token|401|403/i.test(message)) {
    // Session issues may recover after refresh; still retry lightly.
    return /jwt|token|session|401/i.test(message);
  }
  if (/malformed|schema|22P02|check constraint/i.test(message)) return false;
  return true;
}

/**
 * @param {object} client
 * @param {string} userId
 * @param {string | null} [sinceIso]
 */
export async function fetchUserFilmPreferences(client, userId, sinceIso = null) {
  if (!client || !userId) {
    return { ok: false, rows: [], error: 'missing_client_or_user' };
  }
  let query = client
    .from('user_film_preferences')
    .select('*')
    .eq('user_id', userId);
  if (sinceIso) {
    query = query.gt('updated_at', sinceIso);
  }
  const { data, error } = await query;
  if (error) {
    return { ok: false, rows: [], error };
  }
  const rows = [];
  for (const raw of data ?? []) {
    const n = normalizePreferenceRecord(raw);
    if (n) rows.push(n);
  }
  return { ok: true, rows, error: null };
}

/**
 * @param {object} client
 * @param {string} userId
 * @param {import('./filmPreferenceMerge.js').PreferenceRecord[]} records
 */
export async function upsertUserFilmPreferences(client, userId, records) {
  if (!client || !userId) {
    return { ok: false, error: 'missing_client_or_user' };
  }
  if (!records.length) return { ok: true, error: null };

  const payload = records.map((r) => ({
    user_id: userId,
    film_key: r.film_key,
    preference_type: r.preference_type,
    is_active: r.is_active !== false,
    film_id: r.film_id ?? null,
    showtime_film_key: r.showtime_film_key ?? null,
    alias_keys: Array.isArray(r.alias_keys) ? r.alias_keys : [],
    title_snapshot: r.title_snapshot ?? null,
    year_snapshot: r.year_snapshot ?? null,
    poster_url_snapshot: r.poster_url_snapshot ?? null,
    preference_at: r.preference_at ?? null,
    preference_meta: r.preference_meta ?? {},
    device_mutation_id: r.device_mutation_id ?? null,
    updated_at: r.updated_at,
  }));

  const { error } = await client
    .from('user_film_preferences')
    .upsert(payload, { onConflict: 'user_id,film_key,preference_type' });

  if (error) return { ok: false, error };
  return { ok: true, error: null };
}

/**
 * @param {object} client
 * @param {string} userId
 * @param {{ attachedAt?: string | null, lastSyncedAt?: string | null }} markers
 */
export async function upsertUserSyncState(client, userId, markers) {
  if (!client || !userId) {
    return { ok: false, error: 'missing_client_or_user' };
  }
  const row = {
    user_id: userId,
    film_preferences_attached_at: markers.attachedAt ?? undefined,
    film_preferences_last_synced_at: markers.lastSyncedAt ?? undefined,
  };
  // Strip undefined so we don't null out other fields unintentionally on upsert
  // without select-merge. Prefer explicit null only when provided.
  /** @type {Record<string, unknown>} */
  const clean = { user_id: userId };
  if ('attachedAt' in markers) {
    clean.film_preferences_attached_at = markers.attachedAt ?? null;
  }
  if ('lastSyncedAt' in markers) {
    clean.film_preferences_last_synced_at = markers.lastSyncedAt ?? null;
  }
  const { error } = await client
    .from('user_sync_state')
    .upsert(clean, { onConflict: 'user_id' });
  if (error) return { ok: false, error };
  return { ok: true, error: null };
}

/**
 * Apply merged active preference records into local stores (suppressing bridge).
 * @param {Storage} storage
 * @param {import('./filmPreferenceMerge.js').PreferenceRecord[]} records
 */
export function applyPreferenceRecordsToLocalStores(storage, records) {
  const normalized = applyCrossStateConflictRules(
    records.map(normalizePreferenceRecord).filter(Boolean),
  );

  /** @type {import('../stores/savedFilmsStore.js').SavedFilmItem[]} */
  const saved = [];
  /** @type {import('../stores/seenFilmsStore.js').SeenFilmItem[]} */
  const seen = [];
  /** @type {import('../stores/notInterestedFilmsStore.js').NotInterestedFilmItem[]} */
  const ni = [];

  for (const rec of normalized) {
    if (!rec || !rec.is_active) continue;
    if (rec.preference_type === 'saved') {
      const item = recordToLocalSavedItem(rec);
      if (item) saved.push(item);
    } else if (rec.preference_type === 'seen') {
      const item = recordToLocalSeenItem(rec);
      if (item) seen.push(item);
    } else if (rec.preference_type === 'not_interested') {
      const item = recordToLocalNotInterestedItem(rec);
      if (item) ni.push(item);
    }
  }

  suppressFilmStoreMutationNotifications(() => {
    try {
      storage.setItem(
        SAVED_FILMS_STORAGE_KEY,
        JSON.stringify({
          version: SAVED_FILMS_VERSION,
          items: normalizeSavedFilmItems(saved),
        }),
      );
      storage.setItem(
        SEEN_FILMS_STORAGE_KEY,
        JSON.stringify({
          version: SEEN_FILMS_VERSION,
          items: normalizeSeenFilmItems(seen),
        }),
      );
      storage.setItem(
        NOT_INTERESTED_FILMS_STORAGE_KEY,
        JSON.stringify({
          version: NOT_INTERESTED_FILMS_VERSION,
          items: normalizeNotInterestedFilmItems(ni),
        }),
      );
    } catch {
      // Local write failure during apply — leave prior local state.
    }
  });

  observedLocalActive = readLocalActiveMap(storage);
}

function enqueuePending(records) {
  for (const rec of records) {
    const n = normalizePreferenceRecord(rec);
    if (!n) continue;
    const id = recordId(n);
    const prev = pendingById.get(id);
    if (!prev || n.updated_at >= prev.updated_at) {
      pendingById.set(id, n);
    }
  }
  scheduleFlush();
}

function scheduleFlush() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void flushPendingWrites();
  }, WRITE_DEBOUNCE_MS);
}

function scheduleRetry() {
  if (retryTimer) return;
  const delay = Math.min(
    MAX_RETRY_DELAY_MS,
    1000 * 2 ** Math.min(retryAttempt, 5),
  );
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushPendingWrites();
  }, delay);
}

async function flushPendingWrites() {
  const generation = authGeneration;
  const userId = authUserId;
  const client = clientRef;
  const storage = storageRef;
  if (
    !userId ||
    !client ||
    !storage ||
    !isBrowserAttachedToUser(storage, userId) ||
    writeInFlight ||
    pendingById.size === 0
  ) {
    return;
  }

  writeInFlight = true;
  const batch = [...pendingById.values()];
  pendingById.clear();

  try {
    const result = await upsertUserFilmPreferences(client, userId, batch);
    if (generation !== authGeneration || authUserId !== userId) {
      return;
    }
    if (!result.ok) {
      for (const rec of batch) pendingById.set(recordId(rec), rec);
      setSnapshot({
        degraded: true,
        lastError: friendlySyncError(
          result.error,
          'Cloud sync could not save changes.',
        ),
      });
      if (isRetryableSyncError(result.error)) scheduleRetry();
      return;
    }

    const now = new Date().toISOString();
    await upsertUserSyncState(client, userId, { lastSyncedAt: now });
    if (generation !== authGeneration || authUserId !== userId) return;

    const attachment = readFilmSyncAttachment(storage);
    if (attachment && attachment.attachedUserId === userId) {
      writeFilmSyncAttachment(storage, {
        ...attachment,
        lastSuccessfulSyncAt: now,
      });
    }
    retryAttempt = 0;
    setSnapshot({
      degraded: false,
      lastError: null,
      lastSuccessfulSyncAt: now,
    });
  } catch (error) {
    for (const rec of batch) pendingById.set(recordId(rec), rec);
    if (generation === authGeneration && authUserId === userId) {
      setSnapshot({
        degraded: true,
        lastError: friendlySyncError(error, 'Cloud sync could not save changes.'),
      });
      if (isRetryableSyncError(error)) scheduleRetry();
    }
  } finally {
    writeInFlight = false;
    if (pendingById.size > 0 && authUserId === userId) {
      scheduleFlush();
    }
  }
}

/**
 * Pull remote preferences and apply (attached browsers only).
 * @param {{ force?: boolean }} [options]
 */
export async function pullFilmPreferences(options = {}) {
  const generation = authGeneration;
  const userId = authUserId;
  const client = clientRef;
  const storage = storageRef;
  if (!userId || !client || !storage) {
    return { ok: false, error: 'not_ready' };
  }
  if (!isBrowserAttachedToUser(storage, userId)) {
    return { ok: false, error: 'not_attached' };
  }
  if (pullInFlight && !options.force) {
    return { ok: false, error: 'busy' };
  }

  pullInFlight = true;
  try {
    const attachment = readFilmSyncAttachment(storage);
    const since = options.force ? null : attachment?.lastSuccessfulPullAt ?? null;
    const fetched = await fetchUserFilmPreferences(client, userId, since);
    if (generation !== authGeneration || authUserId !== userId) {
      return { ok: false, error: 'stale_session' };
    }
    if (!fetched.ok) {
      setSnapshot({
        degraded: true,
        lastError: friendlySyncError(
          fetched.error,
          'Could not refresh synced film activity.',
        ),
      });
      return { ok: false, error: fetched.error };
    }

    // Incremental pull: merge with current local active+pending semantics.
    // Full pull when since is null.
    const localMap = readLocalActiveMap(storage);
    /** @type {import('./filmPreferenceMerge.js').PreferenceRecord[]} */
    const locals = [...localMap.values()];
    /** @type {import('./filmPreferenceMerge.js').PreferenceRecord[]} */
    let clouds = fetched.rows;

    if (since) {
      // Also need known tombstones from incremental rows — already in fetched.rows.
      // For keys not in incremental set, keep local.
      const cloudIds = new Set(clouds.map(recordId));
      const mergedIncremental = mergePreferenceCollections(
        locals,
        clouds,
        { phase: 'ongoing' },
      );
      // Preserve locals that had no cloud update in this batch.
      const mergedIds = new Set(mergedIncremental.map(recordId));
      for (const local of locals) {
        if (!cloudIds.has(recordId(local)) && !mergedIds.has(recordId(local))) {
          mergedIncremental.push(local);
        }
      }
      // Include inactive cloud tombstones that won.
      applyPreferenceRecordsToLocalStores(
        storage,
        mergedIncremental.filter((r) => r.is_active),
      );
      // Apply tombstones: remove local actives that lost to cloud tombstones.
      const tombstoned = mergedIncremental.filter((r) => !r.is_active);
      if (tombstoned.length) {
        const activeAfter = readLocalActiveMap(storage);
        for (const t of tombstoned) {
          activeAfter.delete(recordId(t));
        }
        applyPreferenceRecordsToLocalStores(storage, [...activeAfter.values()]);
      }
    } else {
      const merged = mergePreferenceCollections(locals, clouds, {
        phase: 'ongoing',
      });
      applyPreferenceRecordsToLocalStores(
        storage,
        merged.filter((r) => r.is_active),
      );
    }

    const now = new Date().toISOString();
    const nextAttachment = {
      version: 1,
      attachedUserId: userId,
      lastSuccessfulPullAt: now,
      lastSuccessfulSyncAt:
        readFilmSyncAttachment(storage)?.lastSuccessfulSyncAt ?? now,
    };
    writeFilmSyncAttachment(storage, nextAttachment);
    await upsertUserSyncState(client, userId, { lastSyncedAt: now });

    if (generation !== authGeneration || authUserId !== userId) {
      return { ok: false, error: 'stale_session' };
    }

    setSnapshot({
      degraded: false,
      lastError: null,
      lastSuccessfulPullAt: now,
      lastSuccessfulSyncAt: now,
      attached: true,
    });
    return { ok: true, error: null };
  } catch (error) {
    if (generation === authGeneration && authUserId === userId) {
      setSnapshot({
        degraded: true,
        lastError: friendlySyncError(
          error,
          'Could not refresh synced film activity.',
        ),
      });
    }
    return { ok: false, error };
  } finally {
    pullInFlight = false;
  }
}

/**
 * Explicit first attachment: merge local + cloud, write, mark attached.
 */
export async function attachFilmPreferencesMerge() {
  const generation = authGeneration;
  const userId = authUserId;
  const client = clientRef;
  const storage = storageRef;
  if (!userId || !client || !storage) {
    return { ok: false, error: 'not_ready' };
  }
  if (isBrowserAttachedToUser(storage, userId)) {
    return { ok: true, error: null, alreadyAttached: true };
  }

  setSnapshot({ attaching: true, lastError: null });

  try {
    const fetched = await fetchUserFilmPreferences(client, userId, null);
    if (generation !== authGeneration || authUserId !== userId) {
      setSnapshot({ attaching: false });
      return { ok: false, error: 'stale_session' };
    }
    if (!fetched.ok) {
      setSnapshot({
        attaching: false,
        lastError: friendlySyncError(
          fetched.error,
          'Could not combine film activity. Try again.',
        ),
      });
      return { ok: false, error: fetched.error };
    }

    const localMap = readLocalActiveMap(storage);
    const locals = [...localMap.values()];
    const merged = mergePreferenceCollections(locals, fetched.rows, {
      phase: 'first_attachment',
    });

    const writeResult = await upsertUserFilmPreferences(client, userId, merged);
    if (generation !== authGeneration || authUserId !== userId) {
      setSnapshot({ attaching: false });
      return { ok: false, error: 'stale_session' };
    }
    if (!writeResult.ok) {
      setSnapshot({
        attaching: false,
        lastError: friendlySyncError(
          writeResult.error,
          'Could not combine film activity. Try again.',
        ),
      });
      return { ok: false, error: writeResult.error };
    }

    applyPreferenceRecordsToLocalStores(
      storage,
      merged.filter((r) => r.is_active),
    );

    const now = new Date().toISOString();
    const syncState = await upsertUserSyncState(client, userId, {
      attachedAt: now,
      lastSyncedAt: now,
    });
    if (!syncState.ok) {
      // Preferences written; still treat attach as incomplete without markers? 
      // Mark local attach only if preference write succeeded — sync_state is best-effort.
    }

    if (generation !== authGeneration || authUserId !== userId) {
      setSnapshot({ attaching: false });
      return { ok: false, error: 'stale_session' };
    }

    writeFilmSyncAttachment(storage, {
      version: 1,
      attachedUserId: userId,
      lastSuccessfulPullAt: now,
      lastSuccessfulSyncAt: now,
    });

    observedLocalActive = readLocalActiveMap(storage);
    pendingById.clear();

    setSnapshot({
      attaching: false,
      attached: true,
      degraded: false,
      lastError: null,
      lastSuccessfulPullAt: now,
      lastSuccessfulSyncAt: now,
      cloudHasPreferences: merged.some((r) => r.is_active),
      localHasPreferences: localHasAnyPreferences(storage),
    });
    return { ok: true, error: null };
  } catch (error) {
    if (generation === authGeneration && authUserId === userId) {
      setSnapshot({
        attaching: false,
        lastError: friendlySyncError(
          error,
          'Could not combine film activity. Try again.',
        ),
      });
    }
    return { ok: false, error };
  }
}

/**
 * Keep using this device only — no upload/download/attach.
 */
export function declineFilmPreferencesAttach() {
  // Explicit no-op for cloud; remain on prompt until Enable sync.
  setSnapshot({
    attaching: false,
    attached: false,
    lastError: null,
  });
  return { ok: true };
}

/**
 * Manual Sync now (attached only).
 */
export async function syncFilmPreferencesNow() {
  const result = await pullFilmPreferences({ force: true });
  if (result.ok) {
    await flushPendingWrites();
  }
  return result;
}

function onLocalMutation(event) {
  const storage = storageRef;
  const userId = authUserId;
  if (!storage || !userId) return;
  if (!isBrowserAttachedToUser(storage, userId)) {
    setSnapshot({
      localHasPreferences: localHasAnyPreferences(storage),
    });
    return;
  }

  const next = readLocalActiveMap(storage);
  const changes = diffLocalPreferenceMaps(
    observedLocalActive,
    next,
    event?.mutatedAt ?? new Date().toISOString(),
  );
  observedLocalActive = next;
  if (changes.length) {
    enqueuePending(changes);
  }
}

function onVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - lastVisibilityPullAt < VISIBILITY_PULL_MIN_MS) return;
  if (!authUserId || !storageRef) return;
  if (!isBrowserAttachedToUser(storageRef, authUserId)) return;
  lastVisibilityPullAt = now;
  void pullFilmPreferences();
}

/**
 * Bind auth session to the sync controller. Does not auto-attach or sync.
 *
 * @param {{
 *   userId: string | null,
 *   client?: object | null,
 *   storage?: Storage | null,
 * }} input
 */
export function setFilmPreferencesAuthContext(input) {
  const nextUserId = input.userId ?? null;
  const storage =
    input.storage ??
    storageRef ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  const client = input.client ?? clientRef ?? getSupabaseClient();

  storageRef = storage;
  clientRef = client;

  if (nextUserId !== authUserId) {
    // Stop prior user work; never apply prior cloud data.
    authGeneration += 1;
    pendingById.clear();
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    retryAttempt = 0;
    writeInFlight = false;
    pullInFlight = false;

    // If attachment belongs to a different user, do not clear it here —
    // attachment is checked against current userId. Old attachment simply
    // does not match → prompt for new user. Local film data stays intact.
  }

  authUserId = nextUserId;

  const attached = isBrowserAttachedToUser(storage, nextUserId);
  const attachment = readFilmSyncAttachment(storage);
  const localHas = localHasAnyPreferences(storage);

  if (!nextUserId) {
    setSnapshot({
      ...createSnapshot(),
      localHasPreferences: localHas,
    });
    return;
  }

  observedLocalActive = readLocalActiveMap(storage);
  setSnapshot({
    userId: nextUserId,
    attached,
    attaching: false,
    degraded: false,
    lastError: null,
    lastSuccessfulPullAt: attachment?.lastSuccessfulPullAt ?? null,
    lastSuccessfulSyncAt: attachment?.lastSuccessfulSyncAt ?? null,
    localHasPreferences: localHas,
    cloudHasPreferences: null,
  });

  // Attached browsers may pull after sign-in / session init — not on mere login
  // for unattached browsers.
  if (attached) {
    void pullFilmPreferences();
  }
}

/**
 * Probe whether cloud already has preference rows (for attach prompt copy).
 * Does not download into local stores.
 */
export async function probeCloudFilmPreferences() {
  const userId = authUserId;
  const client = clientRef;
  if (!userId || !client) {
    return { ok: false, hasRows: false };
  }
  const fetched = await fetchUserFilmPreferences(client, userId, null);
  if (!fetched.ok) {
    return { ok: false, hasRows: false, error: fetched.error };
  }
  const hasRows = fetched.rows.some((r) => r.is_active);
  setSnapshot({ cloudHasPreferences: hasRows });
  return { ok: true, hasRows };
}

/**
 * Start mutation + visibility listeners once.
 */
export function startFilmPreferencesSyncController(options = {}) {
  if (started) return;
  started = true;
  storageRef =
    options.storage ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  clientRef = options.client ?? getSupabaseClient();

  mutationUnsub = subscribeFilmStoreMutations(onLocalMutation);

  if (typeof document !== 'undefined') {
    const handler = () => onVisibilityChange();
    document.addEventListener('visibilitychange', handler);
    visibilityUnsub = () =>
      document.removeEventListener('visibilitychange', handler);
  }
}

export function stopFilmPreferencesSyncController() {
  started = false;
  mutationUnsub?.();
  mutationUnsub = null;
  visibilityUnsub?.();
  visibilityUnsub = null;
  if (writeTimer) clearTimeout(writeTimer);
  if (retryTimer) clearTimeout(retryTimer);
  writeTimer = null;
  retryTimer = null;
  pendingById.clear();
  authUserId = null;
  authGeneration += 1;
  setSnapshot(createSnapshot());
}

/** @internal */
export function resetFilmPreferencesSyncForTests() {
  stopFilmPreferencesSyncController();
  observedLocalActive = new Map();
  lastVisibilityPullAt = 0;
  retryAttempt = 0;
  clientRef = null;
  storageRef = null;
  snapshot = createSnapshot();
}

/**
 * Test helper: inspect pending queue size.
 * @internal
 */
export function getFilmPreferencesPendingCountForTests() {
  return pendingById.size;
}
