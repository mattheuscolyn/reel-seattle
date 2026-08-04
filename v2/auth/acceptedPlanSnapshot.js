/**
 * Durable accepted-plan snapshot normalize / merge
 * (T-ACCOUNT-CLOUD-SYNC-SCHEDULE-01).
 *
 * Cloud plan_id = local AcceptedPlanItem.planId (deterministic content id).
 * Snapshots must render My Schedule without HomeData.
 */

import {
  ACCEPTED_PLANS_MAX,
  ACCEPTED_PLANS_TIMEZONE,
  ACCEPTED_PLANS_VERSION,
  buildAcceptedPlanItem,
  normalizeAcceptedPlansStore,
} from '../stores/acceptedPlansStore.js';

export const ACCEPTED_PLAN_SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * @typedef {{
 *   plan_id: string,
 *   is_active: boolean,
 *   schema_version: number,
 *   accepted_at: string,
 *   updated_at: string,
 *   plan_snapshot: Record<string, unknown>,
 *   device_mutation_id?: string | null,
 * }} AcceptedPlanRecord
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
 * Normalize a local AcceptedPlanItem into a cloud record (active).
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanItem} plan
 * @param {string} [mutatedAt]
 * @returns {AcceptedPlanRecord | null}
 */
export function localPlanToRecord(plan, mutatedAt) {
  if (!plan || typeof plan !== 'object') return null;
  const built = buildAcceptedPlanItem({
    performances: plan.performances,
    label: plan.label,
    date: plan.date,
    provenance: plan.provenance,
    settingsSnapshot: plan.settingsSnapshot,
    now: () => new Date(plan.acceptedAt || Date.now()),
  });
  if (!built.ok || !built.plan) return null;

  // Preserve stable stored identity / timestamps when valid.
  const planId =
    typeof plan.planId === 'string' && plan.planId.trim()
      ? plan.planId.trim()
      : built.plan.planId;
  const acceptedAt = asIso(plan.acceptedAt) ?? built.plan.acceptedAt;
  const updated_at =
    asIso(mutatedAt) ?? asIso(plan.acceptedAt) ?? new Date().toISOString();

  /** @type {Record<string, unknown>} */
  const snapshot = {
    schema_version: ACCEPTED_PLAN_SNAPSHOT_SCHEMA_VERSION,
    planId,
    acceptedAt,
    label: plan.label ?? built.plan.label ?? null,
    date: built.plan.date,
    timezone: built.plan.timezone || ACCEPTED_PLANS_TIMEZONE,
    provenance: 'live',
    performances: built.plan.performances,
    settingsSnapshot: plan.settingsSnapshot ?? null,
  };

  return {
    plan_id: planId,
    is_active: true,
    schema_version: ACCEPTED_PLAN_SNAPSHOT_SCHEMA_VERSION,
    accepted_at: acceptedAt,
    updated_at,
    plan_snapshot: snapshot,
  };
}

/**
 * @param {unknown} raw
 * @returns {AcceptedPlanRecord | null}
 */
export function normalizeAcceptedPlanRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  if (typeof row.plan_id !== 'string' || !row.plan_id.trim()) return null;
  const updated_at = asIso(row.updated_at);
  const accepted_at = asIso(row.accepted_at);
  if (!updated_at || !accepted_at) return null;
  if (!row.plan_snapshot || typeof row.plan_snapshot !== 'object') return null;
  const schema_version =
    typeof row.schema_version === 'number' && Number.isFinite(row.schema_version)
      ? row.schema_version
      : ACCEPTED_PLAN_SNAPSHOT_SCHEMA_VERSION;
  if (schema_version < 1 || schema_version > 10) return null;

  return {
    plan_id: row.plan_id.trim(),
    is_active: row.is_active !== false,
    schema_version,
    accepted_at,
    updated_at,
    plan_snapshot: /** @type {Record<string, unknown>} */ (row.plan_snapshot),
    device_mutation_id:
      typeof row.device_mutation_id === 'string'
        ? row.device_mutation_id
        : null,
  };
}

/**
 * Convert an active cloud record into a local AcceptedPlanItem.
 * @param {AcceptedPlanRecord} record
 * @returns {import('../stores/acceptedPlansStore.js').AcceptedPlanItem | null}
 */
export function recordToLocalPlan(record) {
  if (!record?.is_active) return null;
  const snap = record.plan_snapshot;
  if (!snap || typeof snap !== 'object') return null;

  const built = buildAcceptedPlanItem({
    performances: snap.performances,
    label: typeof snap.label === 'string' ? snap.label : null,
    date: typeof snap.date === 'string' ? snap.date : null,
    provenance: 'live',
    settingsSnapshot:
      snap.settingsSnapshot && typeof snap.settingsSnapshot === 'object'
        ? /** @type {Record<string, unknown>} */ (snap.settingsSnapshot)
        : null,
    now: () => new Date(record.accepted_at),
  });
  if (!built.ok || !built.plan) return null;

  return {
    ...built.plan,
    planId: record.plan_id,
    acceptedAt: record.accepted_at,
  };
}

/**
 * @param {AcceptedPlanRecord} a
 * @param {AcceptedPlanRecord} b
 * @returns {AcceptedPlanRecord}
 */
function mergeActivePlans(a, b) {
  const newer = a.updated_at >= b.updated_at ? a : b;
  const older = a.updated_at >= b.updated_at ? b : a;
  const earliestAccepted =
    a.accepted_at <= b.accepted_at ? a.accepted_at : b.accepted_at;
  return {
    ...newer,
    is_active: true,
    accepted_at: earliestAccepted,
    updated_at: newer.updated_at,
    plan_snapshot: newer.plan_snapshot ?? older.plan_snapshot,
  };
}

/**
 * @param {AcceptedPlanRecord | null | undefined} local
 * @param {AcceptedPlanRecord | null | undefined} cloud
 * @param {{ phase: 'first_attachment' | 'ongoing' }} options
 * @returns {AcceptedPlanRecord | null}
 */
export function mergeAcceptedPlanPair(local, cloud, options) {
  const phase = options?.phase ?? 'ongoing';
  if (!local && !cloud) return null;
  if (local && !cloud) return { ...local };
  if (!local && cloud) return { ...cloud };

  const left = /** @type {AcceptedPlanRecord} */ (local);
  const right = /** @type {AcceptedPlanRecord} */ (cloud);

  if (left.is_active && right.is_active) {
    return mergeActivePlans(left, right);
  }

  if (left.is_active && !right.is_active) {
    if (phase === 'first_attachment') {
      // Prefer active local over unprovable older tombstone.
      return { ...left };
    }
    return left.updated_at > right.updated_at ? { ...left } : { ...right };
  }

  if (!left.is_active && right.is_active) {
    if (phase === 'first_attachment') {
      // Empty/local tombstone must not wipe cloud actives.
      return { ...right };
    }
    return right.updated_at > left.updated_at ? { ...right } : { ...left };
  }

  return left.updated_at >= right.updated_at ? { ...left } : { ...right };
}

/**
 * @param {AcceptedPlanRecord[]} locals
 * @param {AcceptedPlanRecord[]} clouds
 * @param {{ phase: 'first_attachment' | 'ongoing' }} options
 * @returns {AcceptedPlanRecord[]}
 */
export function mergeAcceptedPlanCollections(locals, clouds, options) {
  /** @type {Map<string, AcceptedPlanRecord>} */
  const byId = new Map();
  for (const cloud of clouds) {
    const n = normalizeAcceptedPlanRecord(cloud);
    if (n) byId.set(n.plan_id, n);
  }

  /** @type {AcceptedPlanRecord[]} */
  const out = [];
  const seen = new Set();

  for (const localRaw of locals) {
    const local = normalizeAcceptedPlanRecord(localRaw);
    if (!local) continue;
    seen.add(local.plan_id);
    const cloud = byId.get(local.plan_id) ?? null;
    const merged = mergeAcceptedPlanPair(local, cloud, options);
    if (merged) out.push(merged);
  }

  for (const [id, cloud] of byId) {
    if (seen.has(id)) continue;
    const merged = mergeAcceptedPlanPair(null, cloud, options);
    if (merged) out.push(merged);
  }

  return out;
}

/**
 * @param {Map<string, AcceptedPlanRecord>} prevActive
 * @param {Map<string, AcceptedPlanRecord>} nextActive
 * @param {string} mutatedAt
 * @returns {AcceptedPlanRecord[]}
 */
export function diffLocalAcceptedPlanMaps(prevActive, nextActive, mutatedAt) {
  /** @type {AcceptedPlanRecord[]} */
  const changes = [];
  const at = asIso(mutatedAt) ?? new Date().toISOString();

  for (const [id, next] of nextActive) {
    const prev = prevActive.get(id);
    if (!prev || prev.updated_at !== next.updated_at) {
      changes.push({ ...next, is_active: true });
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
 * Apply active records into local accepted-plans store (caller suppresses bridge).
 * Ordering: newest acceptedAt first (matches store accept prepend semantics).
 *
 * @param {AcceptedPlanRecord[]} records
 * @returns {import('../stores/acceptedPlansStore.js').AcceptedPlanItem[]}
 */
export function activeRecordsToLocalItems(records) {
  /** @type {import('../stores/acceptedPlansStore.js').AcceptedPlanItem[]} */
  const items = [];
  for (const rec of records) {
    const n = normalizeAcceptedPlanRecord(rec);
    if (!n || !n.is_active) continue;
    const plan = recordToLocalPlan(n);
    if (plan) items.push(plan);
  }
  items.sort((a, b) => {
    if (a.acceptedAt === b.acceptedAt) return a.planId < b.planId ? -1 : 1;
    return a.acceptedAt < b.acceptedAt ? 1 : -1;
  });
  const normalized = normalizeAcceptedPlansStore({
    version: ACCEPTED_PLANS_VERSION,
    items: items.slice(0, ACCEPTED_PLANS_MAX),
  });
  return normalized.store.items;
}
