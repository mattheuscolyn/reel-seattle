/**
 * Durable sync outbox (T-ACCOUNT-CLOUD-SYNC-AUTO-01).
 *
 * Persists pending cloud mutations across refresh so attached categories can
 * retry without Sync now. Account-scoped: never upload User A entries as User B.
 */

export const FILM_SYNC_OUTBOX_KEY = 'reel-seattle.v2.filmSyncOutbox';
export const SCHEDULE_SYNC_OUTBOX_KEY = 'reel-seattle.v2.scheduleSyncOutbox';
export const SYNC_OUTBOX_VERSION = 1;

/**
 * @typedef {{
 *   recordKey: string,
 *   updatedAt: string,
 *   mutationId: string,
 *   payload: object,
 * }} SyncOutboxEntry
 */

/**
 * @typedef {{
 *   version: number,
 *   userId: string,
 *   category: string,
 *   entries: SyncOutboxEntry[],
 * }} SyncOutboxPayload
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {string} category
 * @param {string} userId
 * @param {SyncOutboxEntry[]} entries
 * @returns {SyncOutboxPayload}
 */
export function buildSyncOutboxPayload(category, userId, entries) {
  return {
    version: SYNC_OUTBOX_VERSION,
    userId: String(userId),
    category: String(category),
    entries: Array.isArray(entries) ? entries : [],
  };
}

/**
 * @param {unknown} raw
 * @param {string} expectedCategory
 * @returns {SyncOutboxPayload | null}
 */
export function normalizeSyncOutboxPayload(raw, expectedCategory) {
  if (!raw || typeof raw !== 'object') return null;
  const root = /** @type {Record<string, unknown>} */ (raw);
  if (root.version !== SYNC_OUTBOX_VERSION) return null;
  const userId = asString(root.userId);
  const category = asString(root.category);
  if (!userId || !category) return null;
  if (expectedCategory && category !== expectedCategory) return null;
  if (!Array.isArray(root.entries)) return null;

  /** @type {SyncOutboxEntry[]} */
  const entries = [];
  for (const item of root.entries) {
    if (!item || typeof item !== 'object') continue;
    const row = /** @type {Record<string, unknown>} */ (item);
    const recordKey = asString(row.recordKey);
    const updatedAt = asString(row.updatedAt);
    const mutationId = asString(row.mutationId) || `${recordKey}:${updatedAt}`;
    if (!recordKey || !updatedAt || !row.payload || typeof row.payload !== 'object') {
      continue;
    }
    entries.push({
      recordKey,
      updatedAt,
      mutationId,
      payload: /** @type {object} */ (row.payload),
    });
  }
  return { version: SYNC_OUTBOX_VERSION, userId, category, entries };
}

/**
 * Coalesce entries by recordKey, keeping newest updatedAt.
 * @param {SyncOutboxEntry[]} entries
 * @returns {SyncOutboxEntry[]}
 */
export function coalesceOutboxEntries(entries) {
  /** @type {Map<string, SyncOutboxEntry>} */
  const map = new Map();
  for (const entry of entries) {
    if (!entry?.recordKey) continue;
    const prev = map.get(entry.recordKey);
    if (!prev || entry.updatedAt >= prev.updatedAt) {
      map.set(entry.recordKey, entry);
    }
  }
  return [...map.values()];
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string} key
 * @param {string} expectedCategory
 * @param {string | null | undefined} userId
 * @returns {SyncOutboxEntry[]}
 */
export function readSyncOutboxEntries(storage, key, expectedCategory, userId) {
  if (!storage || !userId) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = normalizeSyncOutboxPayload(JSON.parse(raw), expectedCategory);
    if (!parsed) return [];
    if (parsed.userId !== userId) return [];
    return coalesceOutboxEntries(parsed.entries);
  } catch {
    return [];
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string} key
 * @param {string} category
 * @param {string} userId
 * @param {SyncOutboxEntry[]} entries
 * @returns {boolean}
 */
export function writeSyncOutboxEntries(
  storage,
  key,
  category,
  userId,
  entries,
) {
  if (!storage || !userId) return false;
  const coalesced = coalesceOutboxEntries(entries);
  try {
    if (coalesced.length === 0) {
      storage.removeItem(key);
      return true;
    }
    storage.setItem(
      key,
      JSON.stringify(buildSyncOutboxPayload(category, userId, coalesced)),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear outbox only when it belongs to userId (or clear any if userId null).
 * @param {Storage | null | undefined} storage
 * @param {string} key
 * @param {string | null | undefined} [userId]
 */
export function clearSyncOutbox(storage, key, userId = null) {
  if (!storage) return;
  if (!userId) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.userId === userId) {
      storage.removeItem(key);
    }
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
