/**
 * Local ↔ cloud film preference merge + conflict rules
 * (T-ACCOUNT-CLOUD-SYNC-FILMS-01).
 *
 * Cross-state product rules (store-level):
 * - Saved and Seen may coexist.
 * - Not Interested does not automatically clear Saved or Seen.
 * - Saved / Seen do not automatically clear Not Interested.
 * Planner Results may clear Seen↔NI in the UI before stores mutate; sync
 * mirrors whatever ends up in local stores.
 *
 * First-attachment tombstone bias: when local has no reliable item-level
 * removal timestamp, prefer an active local row over an older/unprovable
 * cloud tombstone (one-time safety). After attachment, mutations carry
 * timestamps for normal last-write-wins.
 */

import {
  mergeSavedFilmItems,
  mergeSavedFilmRefs,
  normalizeSavedFilmRef,
} from '../stores/savedFilmsStore.js';
import { mergeSeenFilmItems } from '../stores/seenFilmsStore.js';
import { mergeNotInterestedFilmItems } from '../stores/notInterestedFilmsStore.js';
import {
  filmPreferenceKeyFromRef,
  filmRefFromPreferenceRow,
  isFilmPreferenceType,
} from './filmPreferenceIdentity.js';

/**
 * @typedef {{
 *   film_key: string,
 *   preference_type: 'saved' | 'seen' | 'not_interested',
 *   is_active: boolean,
 *   film_id?: string | null,
 *   showtime_film_key?: string | null,
 *   alias_keys?: unknown,
 *   title_snapshot?: string | null,
 *   year_snapshot?: number | null,
 *   poster_url_snapshot?: string | null,
 *   preference_at?: string | null,
 *   preference_meta?: Record<string, unknown>,
 *   updated_at: string,
 *   device_mutation_id?: string | null,
 * }} PreferenceRecord
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asIso(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * @param {import('../stores/savedFilmsStore.js').SavedFilmItem} item
 * @returns {PreferenceRecord | null}
 */
export function localSavedItemToRecord(item, mutatedAt) {
  const ref = normalizeSavedFilmRef(item?.filmRef);
  const film_key = filmPreferenceKeyFromRef(ref);
  if (!ref || !film_key) return null;
  const updated_at = asIso(mutatedAt) ?? asIso(item.savedAt) ?? new Date().toISOString();
  return {
    film_key,
    preference_type: 'saved',
    is_active: true,
    film_id: ref.filmId,
    showtime_film_key: ref.showtimeFilmKey,
    alias_keys: ref.aliasKeys ?? [],
    title_snapshot: item.title ?? null,
    year_snapshot: null,
    poster_url_snapshot: item.posterUrl ?? null,
    preference_at: asIso(item.savedAt),
    preference_meta: {},
    updated_at,
  };
}

/**
 * @param {import('../stores/seenFilmsStore.js').SeenFilmItem} item
 */
export function localSeenItemToRecord(item, mutatedAt) {
  const ref = normalizeSavedFilmRef(item?.filmRef);
  const film_key = filmPreferenceKeyFromRef(ref);
  if (!ref || !film_key) return null;
  const updated_at = asIso(mutatedAt) ?? asIso(item.seenAt) ?? new Date().toISOString();
  /** @type {Record<string, unknown>} */
  const meta = {};
  if (item.seenAtSource) meta.seenAtSource = item.seenAtSource;
  if (item.showtimeRef) meta.showtimeRef = item.showtimeRef;
  return {
    film_key,
    preference_type: 'seen',
    is_active: true,
    film_id: ref.filmId,
    showtime_film_key: ref.showtimeFilmKey,
    alias_keys: ref.aliasKeys ?? [],
    title_snapshot: item.title ?? null,
    year_snapshot: null,
    poster_url_snapshot: item.posterUrl ?? null,
    preference_at: asIso(item.seenAt),
    preference_meta: meta,
    updated_at,
  };
}

/**
 * @param {import('../stores/notInterestedFilmsStore.js').NotInterestedFilmItem} item
 */
export function localNotInterestedItemToRecord(item, mutatedAt) {
  const ref = normalizeSavedFilmRef(item?.filmRef);
  const film_key = filmPreferenceKeyFromRef(ref);
  if (!ref || !film_key) return null;
  const updated_at = asIso(mutatedAt) ?? asIso(item.markedAt) ?? new Date().toISOString();
  /** @type {Record<string, unknown>} */
  const meta = {};
  if (item.markedAtSource) meta.markedAtSource = item.markedAtSource;
  if (item.reason != null) meta.reason = item.reason;
  return {
    film_key,
    preference_type: 'not_interested',
    is_active: true,
    film_id: ref.filmId,
    showtime_film_key: ref.showtimeFilmKey,
    alias_keys: ref.aliasKeys ?? [],
    title_snapshot: item.title ?? null,
    year_snapshot: null,
    poster_url_snapshot: item.posterUrl ?? null,
    preference_at: asIso(item.markedAt),
    preference_meta: meta,
    updated_at,
  };
}

/**
 * @param {PreferenceRecord} record
 * @returns {import('../stores/savedFilmsStore.js').SavedFilmItem | null}
 */
export function recordToLocalSavedItem(record) {
  if (!record?.is_active || record.preference_type !== 'saved') return null;
  const filmRef = filmRefFromPreferenceRow(record);
  if (!filmRef) return null;
  const savedAt =
    asIso(record.preference_at) ?? asIso(record.updated_at) ?? new Date().toISOString();
  /** @type {import('../stores/savedFilmsStore.js').SavedFilmItem} */
  const item = { filmRef, savedAt };
  if (record.title_snapshot) item.title = record.title_snapshot;
  if (record.poster_url_snapshot) item.posterUrl = record.poster_url_snapshot;
  return item;
}

/**
 * @param {PreferenceRecord} record
 * @returns {import('../stores/seenFilmsStore.js').SeenFilmItem | null}
 */
export function recordToLocalSeenItem(record) {
  if (!record?.is_active || record.preference_type !== 'seen') return null;
  const filmRef = filmRefFromPreferenceRow(record);
  if (!filmRef) return null;
  const seenAt =
    asIso(record.preference_at) ?? asIso(record.updated_at) ?? new Date().toISOString();
  const meta =
    record.preference_meta && typeof record.preference_meta === 'object'
      ? record.preference_meta
      : {};
  /** @type {import('../stores/seenFilmsStore.js').SeenFilmItem} */
  const item = {
    filmRef,
    seenAt,
    seenAtSource:
      /** @type {any} */ (meta.seenAtSource) ?? 'user-recorded',
    showtimeRef: /** @type {any} */ (meta.showtimeRef) ?? null,
  };
  if (record.title_snapshot) item.title = record.title_snapshot;
  if (record.poster_url_snapshot) item.posterUrl = record.poster_url_snapshot;
  return item;
}

/**
 * @param {PreferenceRecord} record
 * @returns {import('../stores/notInterestedFilmsStore.js').NotInterestedFilmItem | null}
 */
export function recordToLocalNotInterestedItem(record) {
  if (!record?.is_active || record.preference_type !== 'not_interested') {
    return null;
  }
  const filmRef = filmRefFromPreferenceRow(record);
  if (!filmRef) return null;
  const markedAt =
    asIso(record.preference_at) ?? asIso(record.updated_at) ?? new Date().toISOString();
  const meta =
    record.preference_meta && typeof record.preference_meta === 'object'
      ? record.preference_meta
      : {};
  /** @type {import('../stores/notInterestedFilmsStore.js').NotInterestedFilmItem} */
  const item = {
    filmRef,
    markedAt,
    markedAtSource:
      /** @type {any} */ (meta.markedAtSource) ?? 'user-recorded',
    reason: /** @type {any} */ (meta.reason) ?? null,
  };
  if (record.title_snapshot) item.title = record.title_snapshot;
  if (record.poster_url_snapshot) item.posterUrl = record.poster_url_snapshot;
  return item;
}

/**
 * Normalize a cloud/API row into PreferenceRecord or null.
 * @param {unknown} raw
 * @returns {PreferenceRecord | null}
 */
export function normalizePreferenceRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  if (!isFilmPreferenceType(row.preference_type)) return null;
  if (typeof row.film_key !== 'string' || !row.film_key.trim()) return null;
  const updated_at = asIso(row.updated_at);
  if (!updated_at) return null;
  return {
    film_key: row.film_key.trim(),
    preference_type: row.preference_type,
    is_active: row.is_active !== false,
    film_id: typeof row.film_id === 'string' ? row.film_id : null,
    showtime_film_key:
      typeof row.showtime_film_key === 'string' ? row.showtime_film_key : null,
    alias_keys: Array.isArray(row.alias_keys) ? row.alias_keys : [],
    title_snapshot:
      typeof row.title_snapshot === 'string' ? row.title_snapshot : null,
    year_snapshot:
      typeof row.year_snapshot === 'number' ? row.year_snapshot : null,
    poster_url_snapshot:
      typeof row.poster_url_snapshot === 'string'
        ? row.poster_url_snapshot
        : null,
    preference_at: asIso(row.preference_at),
    preference_meta:
      row.preference_meta && typeof row.preference_meta === 'object'
        ? /** @type {Record<string, unknown>} */ (row.preference_meta)
        : {},
    updated_at,
    device_mutation_id:
      typeof row.device_mutation_id === 'string'
        ? row.device_mutation_id
        : null,
  };
}

/**
 * Merge metadata for two active records of the same key+type.
 * @param {PreferenceRecord} a
 * @param {PreferenceRecord} b
 * @returns {PreferenceRecord}
 */
function mergeActiveRecords(a, b) {
  const newer = a.updated_at >= b.updated_at ? a : b;
  const older = a.updated_at >= b.updated_at ? b : a;
  const leftItem =
    a.preference_type === 'saved'
      ? recordToLocalSavedItem(a)
      : a.preference_type === 'seen'
        ? recordToLocalSeenItem(a)
        : recordToLocalNotInterestedItem(a);
  const rightItem =
    b.preference_type === 'saved'
      ? recordToLocalSavedItem(b)
      : b.preference_type === 'seen'
        ? recordToLocalSeenItem(b)
        : recordToLocalNotInterestedItem(b);

  let mergedLocal = leftItem && rightItem
    ? a.preference_type === 'saved'
      ? mergeSavedFilmItems(
          /** @type {any} */ (leftItem),
          /** @type {any} */ (rightItem),
        )
      : a.preference_type === 'seen'
        ? mergeSeenFilmItems(
            /** @type {any} */ (leftItem),
            /** @type {any} */ (rightItem),
          )
        : mergeNotInterestedFilmItems(
            /** @type {any} */ (leftItem),
            /** @type {any} */ (rightItem),
          )
    : leftItem ?? rightItem;

  if (!mergedLocal) {
    return {
      ...newer,
      film_id: newer.film_id ?? older.film_id ?? null,
      showtime_film_key:
        newer.showtime_film_key ?? older.showtime_film_key ?? null,
      title_snapshot: newer.title_snapshot ?? older.title_snapshot ?? null,
      poster_url_snapshot:
        newer.poster_url_snapshot ?? older.poster_url_snapshot ?? null,
      preference_at: newer.preference_at ?? older.preference_at ?? null,
      updated_at: newer.updated_at,
      is_active: true,
    };
  }

  const converted =
    a.preference_type === 'saved'
      ? localSavedItemToRecord(/** @type {any} */ (mergedLocal), newer.updated_at)
      : a.preference_type === 'seen'
        ? localSeenItemToRecord(/** @type {any} */ (mergedLocal), newer.updated_at)
        : localNotInterestedItemToRecord(
            /** @type {any} */ (mergedLocal),
            newer.updated_at,
          );

  return converted ?? { ...newer, is_active: true };
}

/**
 * First-attachment / ongoing merge for one (film_key, preference_type).
 *
 * @param {PreferenceRecord | null | undefined} local
 * @param {PreferenceRecord | null | undefined} cloud
 * @param {{ phase: 'first_attachment' | 'ongoing' }} options
 * @returns {PreferenceRecord | null}
 */
export function mergePreferencePair(local, cloud, options) {
  const phase = options?.phase ?? 'ongoing';
  if (!local && !cloud) return null;
  if (local && !cloud) return { ...local };
  if (!local && cloud) return { ...cloud };

  const left = /** @type {PreferenceRecord} */ (local);
  const right = /** @type {PreferenceRecord} */ (cloud);

  if (left.is_active && right.is_active) {
    return mergeActiveRecords(left, right);
  }

  if (left.is_active && !right.is_active) {
    // Cloud tombstone vs local active.
    if (phase === 'first_attachment') {
      // One-time safety: prefer active local when removal timestamp is
      // unprovable on the local side (stores delete rows on remove).
      return { ...left, updated_at: left.updated_at };
    }
    return left.updated_at > right.updated_at
      ? { ...left }
      : { ...right };
  }

  if (!left.is_active && right.is_active) {
    if (phase === 'first_attachment') {
      // Blank browser must not deactivate cloud actives.
      // Local tombstone without attachment history: keep cloud active.
      return { ...right };
    }
    return right.updated_at > left.updated_at
      ? { ...right }
      : { ...left };
  }

  // Both inactive — keep newer tombstone.
  return left.updated_at >= right.updated_at ? { ...left } : { ...right };
}

/**
 * @param {PreferenceRecord[]} locals
 * @param {PreferenceRecord[]} clouds
 * @param {{ phase: 'first_attachment' | 'ongoing' }} options
 * @returns {PreferenceRecord[]}
 */
export function mergePreferenceCollections(locals, clouds, options) {
  /** @type {Map<string, PreferenceRecord>} */
  const byId = new Map();
  const keyOf = (r) => `${r.preference_type}::${r.film_key}`;

  for (const cloud of clouds) {
    const n = normalizePreferenceRecord(cloud);
    if (!n) continue;
    byId.set(keyOf(n), n);
  }

  /** @type {PreferenceRecord[]} */
  const out = [];
  const seen = new Set();

  for (const localRaw of locals) {
    const local = normalizePreferenceRecord(localRaw);
    if (!local) continue;
    const id = keyOf(local);
    seen.add(id);
    const cloud = byId.get(id) ?? null;
    const merged = mergePreferencePair(local, cloud, options);
    if (merged) out.push(merged);
  }

  for (const [id, cloud] of byId) {
    if (seen.has(id)) continue;
    const merged = mergePreferencePair(null, cloud, options);
    if (merged) out.push(merged);
  }

  return out;
}

/**
 * Diff observed local active maps → upsert/tombstone records.
 *
 * @param {Map<string, PreferenceRecord>} prevActive
 * @param {Map<string, PreferenceRecord>} nextActive
 * @param {string} mutatedAt
 * @returns {PreferenceRecord[]}
 */
export function diffLocalPreferenceMaps(prevActive, nextActive, mutatedAt) {
  /** @type {PreferenceRecord[]} */
  const changes = [];
  const at = asIso(mutatedAt) ?? new Date().toISOString();

  for (const [id, next] of nextActive) {
    const prev = prevActive.get(id);
    if (
      !prev ||
      prev.updated_at !== next.updated_at ||
      prev.film_id !== next.film_id ||
      prev.title_snapshot !== next.title_snapshot
    ) {
      changes.push({ ...next, is_active: true, updated_at: next.updated_at || at });
    }
  }

  for (const [id, prev] of prevActive) {
    if (nextActive.has(id)) continue;
    changes.push({
      ...prev,
      is_active: false,
      updated_at: at,
    });
  }

  return changes;
}

/**
 * Enforce documented cross-state rules on a set of active records.
 * Store-level: no automatic mutual exclusion. Function is a no-op passthrough
 * documented for tests / future shared enforcement points.
 *
 * @param {PreferenceRecord[]} records
 * @returns {PreferenceRecord[]}
 */
export function applyCrossStateConflictRules(records) {
  // Saved ∩ Seen allowed. NI independent of Saved/Seen at store layer.
  return records.slice();
}

/**
 * Merge two filmRefs when applying cloud identity upgrades.
 * @param {import('../stores/savedFilmsStore.js').SavedFilmRef} a
 * @param {import('../stores/savedFilmsStore.js').SavedFilmRef} b
 */
export function mergePreferenceFilmRefs(a, b) {
  return mergeSavedFilmRefs(a, b);
}
