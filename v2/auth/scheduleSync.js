/**
 * My Schedule / accepted-plans sync client (T-ACCOUNT-CLOUD-SYNC-SCHEDULE-01).
 *
 * Separate from film preference sync. Login alone never attaches or syncs.
 */

import { getSupabaseClient } from './supabaseClient.js';
import {
  isBrowserScheduleAttachedToUser,
  readScheduleSyncAttachment,
  writeScheduleSyncAttachment,
} from './scheduleSyncAttachmentStore.js';
import {
  subscribeScheduleStoreMutations,
  suppressScheduleStoreMutationNotifications,
} from './scheduleStoreMutationBridge.js';
import {
  activeRecordsToLocalItems,
  diffLocalAcceptedPlanMaps,
  localPlanToRecord,
  mergeAcceptedPlanCollections,
  normalizeAcceptedPlanRecord,
} from './acceptedPlanSnapshot.js';
import {
  ACCEPTED_PLANS_STORAGE_KEY,
  ACCEPTED_PLANS_VERSION,
  getAcceptedPlans,
} from '../stores/acceptedPlansStore.js';

/** @typedef {'signed_out' | 'local_only' | 'prompt' | 'attaching' | 'synced' | 'degraded'} ScheduleSyncUiStatus */

/**
 * @typedef {{
 *   uiStatus: ScheduleSyncUiStatus,
 *   attached: boolean,
 *   attaching: boolean,
 *   degraded: boolean,
 *   lastSuccessfulSyncAt: string | null,
 *   lastSuccessfulPullAt: string | null,
 *   lastError: string | null,
 *   userId: string | null,
 *   localHasPlans: boolean,
 * }} ScheduleSyncSnapshot
 */

const VISIBILITY_PULL_MIN_MS = 45_000;
const WRITE_DEBOUNCE_MS = 400;
const MAX_RETRY_DELAY_MS = 30_000;

/** @type {ScheduleSyncSnapshot} */
let snapshot = createSnapshot();
/** @type {Set<(s: ScheduleSyncSnapshot) => void>} */
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

/** @type {Map<string, import('./acceptedPlanSnapshot.js').AcceptedPlanRecord>} */
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

/** @type {Map<string, import('./acceptedPlanSnapshot.js').AcceptedPlanRecord>} */
let observedLocalActive = new Map();

function createSnapshot() {
  return {
    uiStatus: /** @type {ScheduleSyncUiStatus} */ ('signed_out'),
    attached: false,
    attaching: false,
    degraded: false,
    lastSuccessfulSyncAt: null,
    lastSuccessfulPullAt: null,
    lastError: null,
    userId: null,
    localHasPlans: false,
  };
}

function emit() {
  for (const listener of listeners) listener(snapshot);
}

/**
 * @param {Partial<ScheduleSyncSnapshot>} patch
 */
function setSnapshot(patch) {
  snapshot = { ...snapshot, ...patch };
  snapshot.uiStatus = deriveUiStatus(snapshot);
  emit();
}

/**
 * @param {ScheduleSyncSnapshot} s
 */
function deriveUiStatus(s) {
  if (!s.userId) return 'signed_out';
  if (s.attaching) return 'attaching';
  if (s.attached && s.degraded) return 'degraded';
  if (s.attached) return 'synced';
  return 'prompt';
}

export function getScheduleSyncSnapshot() {
  return snapshot;
}

/**
 * @param {(s: ScheduleSyncSnapshot) => void} listener
 */
export function subscribeScheduleSync(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {ScheduleSyncSnapshot} [s]
 */
export function getScheduleSyncLabel(s = snapshot) {
  switch (s.uiStatus) {
    case 'attaching':
      return 'Combining schedules…';
    case 'synced':
      return 'My Schedule is synced';
    case 'degraded':
      return 'Schedule changes are saved on this device · Cloud sync will retry';
    case 'prompt':
    case 'local_only':
    case 'signed_out':
    default:
      return 'My Schedule is stored on this device';
  }
}

/**
 * @param {Storage | null | undefined} storage
 */
function readLocalActiveMap(storage) {
  /** @type {Map<string, import('./acceptedPlanSnapshot.js').AcceptedPlanRecord>} */
  const map = new Map();
  for (const plan of getAcceptedPlans(storage)) {
    const rec = localPlanToRecord(plan, plan.acceptedAt);
    if (rec) map.set(rec.plan_id, rec);
  }
  return map;
}

function localHasAnyPlans(storage) {
  return getAcceptedPlans(storage).length > 0;
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
    return 'Network unavailable. Schedule stays on this device.';
  }
  if (/jwt|session|auth|token/i.test(message)) {
    return 'Account session needs refresh. Schedule stays on this device.';
  }
  return fallback;
}

/**
 * @param {unknown} error
 */
export function isRetryableScheduleSyncError(error) {
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
  if (/malformed|schema|22P02|check constraint/i.test(message)) return false;
  if (/permission|rls|row-level|403/i.test(message) && !/jwt|token|401/i.test(message)) {
    return false;
  }
  return true;
}

/**
 * @param {object} client
 * @param {string} userId
 * @param {string | null} [sinceIso]
 */
export async function fetchUserAcceptedPlans(client, userId, sinceIso = null) {
  if (!client || !userId) {
    return { ok: false, rows: [], error: 'missing_client_or_user' };
  }
  let query = client
    .from('user_accepted_plans')
    .select('*')
    .eq('user_id', userId);
  if (sinceIso) {
    query = query.gt('updated_at', sinceIso);
  }
  const { data, error } = await query;
  if (error) return { ok: false, rows: [], error };
  /** @type {import('./acceptedPlanSnapshot.js').AcceptedPlanRecord[]} */
  const rows = [];
  for (const raw of data ?? []) {
    const n = normalizeAcceptedPlanRecord(raw);
    if (n) rows.push(n);
  }
  return { ok: true, rows, error: null };
}

/**
 * @param {object} client
 * @param {string} userId
 * @param {import('./acceptedPlanSnapshot.js').AcceptedPlanRecord[]} records
 */
export async function upsertUserAcceptedPlans(client, userId, records) {
  if (!client || !userId) {
    return { ok: false, error: 'missing_client_or_user' };
  }
  if (!records.length) return { ok: true, error: null };

  const payload = records.map((r) => ({
    user_id: userId,
    plan_id: r.plan_id,
    is_active: r.is_active !== false,
    plan_snapshot: r.plan_snapshot,
    schema_version: r.schema_version ?? 1,
    accepted_at: r.accepted_at,
    device_mutation_id: r.device_mutation_id ?? null,
    updated_at: r.updated_at,
  }));

  const { error } = await client
    .from('user_accepted_plans')
    .upsert(payload, { onConflict: 'user_id,plan_id' });

  if (error) return { ok: false, error };
  return { ok: true, error: null };
}

/**
 * @param {object} client
 * @param {string} userId
 * @param {{ attachedAt?: string | null, lastSyncedAt?: string | null }} markers
 */
export async function upsertScheduleSyncState(client, userId, markers) {
  if (!client || !userId) {
    return { ok: false, error: 'missing_client_or_user' };
  }
  /** @type {Record<string, unknown>} */
  const clean = { user_id: userId };
  if ('attachedAt' in markers) {
    clean.schedule_attached_at = markers.attachedAt ?? null;
  }
  if ('lastSyncedAt' in markers) {
    clean.schedule_last_synced_at = markers.lastSyncedAt ?? null;
  }
  const { error } = await client
    .from('user_sync_state')
    .upsert(clean, { onConflict: 'user_id' });
  if (error) return { ok: false, error };
  return { ok: true, error: null };
}

/**
 * @param {Storage} storage
 * @param {import('./acceptedPlanSnapshot.js').AcceptedPlanRecord[]} records
 */
export function applyAcceptedPlanRecordsToLocalStore(storage, records) {
  const items = activeRecordsToLocalItems(records);
  suppressScheduleStoreMutationNotifications(() => {
    try {
      storage.setItem(
        ACCEPTED_PLANS_STORAGE_KEY,
        JSON.stringify({
          version: ACCEPTED_PLANS_VERSION,
          items,
        }),
      );
    } catch {
      // keep prior local state
    }
  });
  observedLocalActive = readLocalActiveMap(storage);
}

function enqueuePending(records) {
  for (const rec of records) {
    const n = normalizeAcceptedPlanRecord(rec);
    if (!n) continue;
    const prev = pendingById.get(n.plan_id);
    if (!prev || n.updated_at >= prev.updated_at) {
      pendingById.set(n.plan_id, n);
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
    !isBrowserScheduleAttachedToUser(storage, userId) ||
    writeInFlight ||
    pendingById.size === 0
  ) {
    return;
  }

  writeInFlight = true;
  const batch = [...pendingById.values()];
  pendingById.clear();

  try {
    const result = await upsertUserAcceptedPlans(client, userId, batch);
    if (generation !== authGeneration || authUserId !== userId) return;
    if (!result.ok) {
      for (const rec of batch) pendingById.set(rec.plan_id, rec);
      setSnapshot({
        degraded: true,
        lastError: friendlySyncError(
          result.error,
          'Cloud sync could not save schedule changes.',
        ),
      });
      if (isRetryableScheduleSyncError(result.error)) scheduleRetry();
      return;
    }

    const now = new Date().toISOString();
    await upsertScheduleSyncState(client, userId, { lastSyncedAt: now });
    if (generation !== authGeneration || authUserId !== userId) return;

    const attachment = readScheduleSyncAttachment(storage);
    if (attachment && attachment.attachedUserId === userId) {
      writeScheduleSyncAttachment(storage, {
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
    for (const rec of batch) pendingById.set(rec.plan_id, rec);
    if (generation === authGeneration && authUserId === userId) {
      setSnapshot({
        degraded: true,
        lastError: friendlySyncError(
          error,
          'Cloud sync could not save schedule changes.',
        ),
      });
      if (isRetryableScheduleSyncError(error)) scheduleRetry();
    }
  } finally {
    writeInFlight = false;
    if (pendingById.size > 0 && authUserId === userId) scheduleFlush();
  }
}

/**
 * @param {{ force?: boolean }} [options]
 */
export async function pullSchedule(options = {}) {
  const generation = authGeneration;
  const userId = authUserId;
  const client = clientRef;
  const storage = storageRef;
  if (!userId || !client || !storage) {
    return { ok: false, error: 'not_ready' };
  }
  if (!isBrowserScheduleAttachedToUser(storage, userId)) {
    return { ok: false, error: 'not_attached' };
  }
  if (pullInFlight && !options.force) {
    return { ok: false, error: 'busy' };
  }

  pullInFlight = true;
  try {
    const attachment = readScheduleSyncAttachment(storage);
    const since = options.force ? null : attachment?.lastSuccessfulPullAt ?? null;
    const fetched = await fetchUserAcceptedPlans(client, userId, since);
    if (generation !== authGeneration || authUserId !== userId) {
      return { ok: false, error: 'stale_session' };
    }
    if (!fetched.ok) {
      setSnapshot({
        degraded: true,
        lastError: friendlySyncError(
          fetched.error,
          'Could not refresh synced schedule.',
        ),
      });
      return { ok: false, error: fetched.error };
    }

    const localMap = readLocalActiveMap(storage);
    const locals = [...localMap.values()];
    const merged = mergeAcceptedPlanCollections(locals, fetched.rows, {
      phase: 'ongoing',
    });
    applyAcceptedPlanRecordsToLocalStore(storage, merged);

    const now = new Date().toISOString();
    writeScheduleSyncAttachment(storage, {
      version: 1,
      attachedUserId: userId,
      lastSuccessfulPullAt: now,
      lastSuccessfulSyncAt:
        readScheduleSyncAttachment(storage)?.lastSuccessfulSyncAt ?? now,
    });
    await upsertScheduleSyncState(client, userId, { lastSyncedAt: now });

    if (generation !== authGeneration || authUserId !== userId) {
      return { ok: false, error: 'stale_session' };
    }

    setSnapshot({
      degraded: false,
      lastError: null,
      lastSuccessfulPullAt: now,
      lastSuccessfulSyncAt: now,
      attached: true,
      localHasPlans: localHasAnyPlans(storage),
    });
    return { ok: true, error: null };
  } catch (error) {
    if (generation === authGeneration && authUserId === userId) {
      setSnapshot({
        degraded: true,
        lastError: friendlySyncError(
          error,
          'Could not refresh synced schedule.',
        ),
      });
    }
    return { ok: false, error };
  } finally {
    pullInFlight = false;
  }
}

export async function attachScheduleMerge() {
  const generation = authGeneration;
  const userId = authUserId;
  const client = clientRef;
  const storage = storageRef;
  if (!userId || !client || !storage) {
    return { ok: false, error: 'not_ready' };
  }
  if (isBrowserScheduleAttachedToUser(storage, userId)) {
    return { ok: true, error: null, alreadyAttached: true };
  }

  setSnapshot({ attaching: true, lastError: null });

  try {
    const fetched = await fetchUserAcceptedPlans(client, userId, null);
    if (generation !== authGeneration || authUserId !== userId) {
      setSnapshot({ attaching: false });
      return { ok: false, error: 'stale_session' };
    }
    if (!fetched.ok) {
      setSnapshot({
        attaching: false,
        lastError: friendlySyncError(
          fetched.error,
          'Could not combine schedules. Try again.',
        ),
      });
      return { ok: false, error: fetched.error };
    }

    const localMap = readLocalActiveMap(storage);
    const locals = [...localMap.values()];
    const merged = mergeAcceptedPlanCollections(locals, fetched.rows, {
      phase: 'first_attachment',
    });

    const writeResult = await upsertUserAcceptedPlans(client, userId, merged);
    if (generation !== authGeneration || authUserId !== userId) {
      setSnapshot({ attaching: false });
      return { ok: false, error: 'stale_session' };
    }
    if (!writeResult.ok) {
      setSnapshot({
        attaching: false,
        lastError: friendlySyncError(
          writeResult.error,
          'Could not combine schedules. Try again.',
        ),
      });
      return { ok: false, error: writeResult.error };
    }

    applyAcceptedPlanRecordsToLocalStore(storage, merged);

    const now = new Date().toISOString();
    await upsertScheduleSyncState(client, userId, {
      attachedAt: now,
      lastSyncedAt: now,
    });

    if (generation !== authGeneration || authUserId !== userId) {
      setSnapshot({ attaching: false });
      return { ok: false, error: 'stale_session' };
    }

    writeScheduleSyncAttachment(storage, {
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
      localHasPlans: localHasAnyPlans(storage),
    });
    return { ok: true, error: null };
  } catch (error) {
    if (generation === authGeneration && authUserId === userId) {
      setSnapshot({
        attaching: false,
        lastError: friendlySyncError(
          error,
          'Could not combine schedules. Try again.',
        ),
      });
    }
    return { ok: false, error };
  }
}

export function declineScheduleAttach() {
  setSnapshot({
    attaching: false,
    attached: false,
    lastError: null,
  });
  return { ok: true };
}

export async function syncScheduleNow() {
  const result = await pullSchedule({ force: true });
  if (result.ok) await flushPendingWrites();
  return result;
}

function onLocalMutation(event) {
  const storage = storageRef;
  const userId = authUserId;
  if (!storage || !userId) return;
  if (!isBrowserScheduleAttachedToUser(storage, userId)) {
    setSnapshot({ localHasPlans: localHasAnyPlans(storage) });
    return;
  }

  const next = readLocalActiveMap(storage);
  const changes = diffLocalAcceptedPlanMaps(
    observedLocalActive,
    next,
    event?.mutatedAt ?? new Date().toISOString(),
  );
  observedLocalActive = next;
  if (changes.length) enqueuePending(changes);
}

function onVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - lastVisibilityPullAt < VISIBILITY_PULL_MIN_MS) return;
  if (!authUserId || !storageRef) return;
  if (!isBrowserScheduleAttachedToUser(storageRef, authUserId)) return;
  lastVisibilityPullAt = now;
  void pullSchedule();
}

/**
 * @param {{
 *   userId: string | null,
 *   client?: object | null,
 *   storage?: Storage | null,
 * }} input
 */
export function setScheduleAuthContext(input) {
  const nextUserId = input.userId ?? null;
  const storage =
    input.storage ??
    storageRef ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  const client = input.client ?? clientRef ?? getSupabaseClient();

  storageRef = storage;
  clientRef = client;

  if (nextUserId !== authUserId) {
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
  }

  authUserId = nextUserId;
  const attached = isBrowserScheduleAttachedToUser(storage, nextUserId);
  const attachment = readScheduleSyncAttachment(storage);
  const localHas = localHasAnyPlans(storage);

  if (!nextUserId) {
    setSnapshot({
      ...createSnapshot(),
      localHasPlans: localHas,
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
    localHasPlans: localHas,
  });

  if (attached) void pullSchedule();
}

export function startScheduleSyncController(options = {}) {
  if (started) return;
  started = true;
  storageRef =
    options.storage ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  clientRef = options.client ?? getSupabaseClient();
  mutationUnsub = subscribeScheduleStoreMutations(onLocalMutation);

  if (typeof document !== 'undefined') {
    const handler = () => onVisibilityChange();
    document.addEventListener('visibilitychange', handler);
    visibilityUnsub = () =>
      document.removeEventListener('visibilitychange', handler);
  }
}

export function stopScheduleSyncController() {
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
export function resetScheduleSyncForTests() {
  stopScheduleSyncController();
  observedLocalActive = new Map();
  lastVisibilityPullAt = 0;
  retryAttempt = 0;
  clientRef = null;
  storageRef = null;
  snapshot = createSnapshot();
}

/** @internal */
export function getSchedulePendingCountForTests() {
  return pendingById.size;
}
