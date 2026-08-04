/**
 * Shared automatic-sync coordinator (T-ACCOUNT-CLOUD-SYNC-AUTO-01).
 *
 * Owns visibility / online lifecycle, pull throttling, category registration,
 * and forced Sync now. Category adapters own domain merge, tables, and outbox.
 *
 * Future categories (e.g. favorite theaters) register an adapter — they should
 * not copy visibility/online/retry listeners.
 */

/** @typedef {'init' | 'visibility' | 'online' | 'mutation' | 'manual' | 'retry'} SyncTriggerReason */

/**
 * @typedef {{
 *   id: string,
 *   isAttached: (userId: string | null, storage: Storage | null) => boolean,
 *   hasPendingWork: () => boolean,
 *   flushPending: () => Promise<void>,
 *   pullRemote: (options: { force?: boolean, reason?: SyncTriggerReason }) => Promise<{ ok: boolean, error?: unknown }>,
 *   runSyncCycle?: (options: { force?: boolean, reason?: SyncTriggerReason }) => Promise<{ ok: boolean, error?: unknown }>,
 *   cancel: () => void,
 * }} SyncCategoryAdapter
 */

export const VISIBILITY_PULL_MIN_MS = 20_000;
export const SYNC_COORDINATOR_VERSION = 1;

/** @type {Map<string, SyncCategoryAdapter>} */
const adapters = new Map();
/** @type {Set<(summary: object) => void>} */
const listeners = new Set();

let started = false;
/** @type {number} */
let coordinatorGeneration = 0;
/** @type {string | null} */
let authUserId = null;
/** @type {Storage | null} */
let storageRef = null;
/** @type {(() => void) | null} */
let visibilityUnsub = null;
/** @type {(() => void) | null} */
let onlineUnsub = null;
/** @type {(() => void) | null} */
let offlineUnsub = null;

/** @type {Map<string, number>} */
const lastVisibilityPullAt = new Map();
/** @type {Map<string, Promise<unknown>>} */
const inFlightByCategory = new Map();
/** @type {Map<string, { force: boolean, reason: SyncTriggerReason }>} */
const queuedFollowUp = new Map();

/**
 * @returns {object}
 */
export function getSyncCoordinatorSummary() {
  return {
    version: SYNC_COORDINATOR_VERSION,
    started,
    userIdPresent: Boolean(authUserId),
    categories: [...adapters.keys()],
    inFlight: [...inFlightByCategory.keys()],
  };
}

/**
 * @param {(summary: object) => void} listener
 * @returns {() => void}
 */
export function subscribeSyncCoordinator(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  const summary = getSyncCoordinatorSummary();
  for (const listener of listeners) {
    try {
      listener(summary);
    } catch {
      // ignore
    }
  }
}

/**
 * @param {SyncCategoryAdapter} adapter
 */
export function registerSyncCategory(adapter) {
  if (!adapter?.id || typeof adapter.id !== 'string') return;
  adapters.set(adapter.id, adapter);
  emit();
}

/**
 * @param {string} categoryId
 */
export function unregisterSyncCategory(categoryId) {
  adapters.delete(categoryId);
  inFlightByCategory.delete(categoryId);
  queuedFollowUp.delete(categoryId);
  lastVisibilityPullAt.delete(categoryId);
  emit();
}

/**
 * @param {{
 *   userId?: string | null,
 *   storage?: Storage | null,
 * }} [input]
 */
export function setSyncCoordinatorAuthContext(input = {}) {
  const nextUserId = input.userId ?? null;
  if (input.storage !== undefined) {
    storageRef = input.storage;
  }
  if (nextUserId !== authUserId) {
    coordinatorGeneration += 1;
    for (const adapter of adapters.values()) {
      try {
        adapter.cancel();
      } catch {
        // ignore
      }
    }
    inFlightByCategory.clear();
    queuedFollowUp.clear();
    authUserId = nextUserId;
  } else {
    authUserId = nextUserId;
  }
  emit();
}

/**
 * @param {string} categoryId
 * @param {{
 *   force?: boolean,
 *   reason?: SyncTriggerReason,
 * }} [options]
 */
export async function requestCategorySync(categoryId, options = {}) {
  const adapter = adapters.get(categoryId);
  if (!adapter) return { ok: false, error: 'unknown_category' };

  const force = Boolean(options.force);
  const reason = options.reason ?? 'manual';
  const generation = coordinatorGeneration;
  const userId = authUserId;
  const storage = storageRef;

  if (!userId) return { ok: false, error: 'signed_out' };
  if (!adapter.isAttached(userId, storage)) {
    return { ok: false, error: 'not_attached' };
  }

  if (!force && reason === 'visibility') {
    const last = lastVisibilityPullAt.get(categoryId) ?? 0;
    if (Date.now() - last < VISIBILITY_PULL_MIN_MS) {
      return { ok: false, error: 'throttled' };
    }
  }

  const existing = inFlightByCategory.get(categoryId);
  if (existing) {
    const prev = queuedFollowUp.get(categoryId);
    queuedFollowUp.set(categoryId, {
      force: Boolean(prev?.force) || force,
      reason: force ? 'manual' : reason,
    });
    await existing;
    return { ok: true, coalesced: true };
  }

  const run = (async () => {
    try {
      if (reason === 'visibility') {
        lastVisibilityPullAt.set(categoryId, Date.now());
      }

      // Local mutations / retries only need a write flush — not a remote pull.
      if (reason === 'mutation' || reason === 'retry') {
        await adapter.flushPending();
        if (generation !== coordinatorGeneration || authUserId !== userId) {
          return { ok: false, error: 'stale_session' };
        }
        return { ok: true };
      }

      if (typeof adapter.runSyncCycle === 'function') {
        return await adapter.runSyncCycle({ force, reason });
      }

      // Default order: flush pending writes, then pull (safe for LWW rows).
      await adapter.flushPending();
      if (generation !== coordinatorGeneration || authUserId !== userId) {
        return { ok: false, error: 'stale_session' };
      }
      return await adapter.pullRemote({ force, reason });
    } finally {
      inFlightByCategory.delete(categoryId);
      const follow = queuedFollowUp.get(categoryId);
      if (follow) {
        queuedFollowUp.delete(categoryId);
        if (generation === coordinatorGeneration && authUserId === userId) {
          void requestCategorySync(categoryId, follow);
        }
      }
      emit();
    }
  })();

  inFlightByCategory.set(categoryId, run);
  emit();
  return run;
}

/**
 * Flush + pull all attached categories.
 * @param {{
 *   force?: boolean,
 *   reason?: SyncTriggerReason,
 * }} [options]
 */
export async function requestAllAttachedSync(options = {}) {
  const userId = authUserId;
  const storage = storageRef;
  if (!userId) return { ok: false, error: 'signed_out' };

  const results = [];
  for (const adapter of adapters.values()) {
    if (!adapter.isAttached(userId, storage)) continue;
    results.push(
      await requestCategorySync(adapter.id, {
        force: options.force,
        reason: options.reason ?? 'init',
      }),
    );
  }
  return { ok: true, results };
}

/**
 * Notify coordinator that a category has local pending work (auto flush).
 * @param {string} categoryId
 */
export function notifyCategoryPending(categoryId) {
  void requestCategorySync(categoryId, {
    force: false,
    reason: 'mutation',
  });
}

function onVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState !== 'visible') return;
  void requestAllAttachedSync({ force: false, reason: 'visibility' });
}

function onOnline() {
  void requestAllAttachedSync({ force: true, reason: 'online' });
}

function onOffline() {
  emit();
}

/**
 * @param {{
 *   storage?: Storage | null,
 * }} [options]
 */
export function startSyncCoordinator(options = {}) {
  if (started) return;
  started = true;
  storageRef =
    options.storage ??
    storageRef ??
    (typeof localStorage !== 'undefined' ? localStorage : null);

  if (typeof document !== 'undefined') {
    const handler = () => onVisibilityChange();
    document.addEventListener('visibilitychange', handler);
    visibilityUnsub = () =>
      document.removeEventListener('visibilitychange', handler);
  }
  if (typeof window !== 'undefined') {
    const onlineHandler = () => onOnline();
    const offlineHandler = () => onOffline();
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    onlineUnsub = () => window.removeEventListener('online', onlineHandler);
    offlineUnsub = () => window.removeEventListener('offline', offlineHandler);
  }
  emit();
}

export function stopSyncCoordinator() {
  coordinatorGeneration += 1;
  started = false;
  visibilityUnsub?.();
  onlineUnsub?.();
  offlineUnsub?.();
  visibilityUnsub = null;
  onlineUnsub = null;
  offlineUnsub = null;
  inFlightByCategory.clear();
  queuedFollowUp.clear();
  lastVisibilityPullAt.clear();
  emit();
}

/** @internal */
export function resetSyncCoordinatorForTests() {
  stopSyncCoordinator();
  adapters.clear();
  authUserId = null;
  storageRef = null;
  listeners.clear();
}

/**
 * @returns {boolean}
 */
export function isSyncCoordinatorStarted() {
  return started;
}

/**
 * Browser online hint (not a guarantee Supabase is reachable).
 * @returns {boolean}
 */
export function isBrowserOnlineHint() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}
