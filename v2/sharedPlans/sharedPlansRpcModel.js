/**
 * Shared-plan RPC names + payload normalizers (T-SHARED-PLANS-01).
 */

import {
  normalizePlanMember,
  normalizeSharedPlan,
  normalizeSharedPlanScreenings,
} from './sharedPlanModel.js';

export const SHARED_PLAN_RPC = Object.freeze({
  create: 'create_shared_plan',
  get: 'get_shared_plan',
  listOpenFriend: 'list_open_friend_shared_plans',
  listFriendFilmStates: 'list_friend_film_states',
});

/**
 * @param {unknown} raw
 */
export function normalizeSharedPlanRpcPlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const snapshot =
    row.plan_snapshot && typeof row.plan_snapshot === 'object'
      ? /** @type {Record<string, unknown>} */ (row.plan_snapshot)
      : row;
  const screenings = normalizeSharedPlanScreenings(
    snapshot.performances ?? snapshot.screenings ?? row.screenings,
  );
  return normalizeSharedPlan({
    planId: row.plan_id ?? row.planId,
    ownerId: row.owner_id ?? row.ownerId,
    type: row.type ?? row.plan_type,
    visibility: row.visibility,
    label: row.label,
    date:
      typeof row.date === 'string'
        ? row.date
        : row.plan_date != null
          ? String(row.plan_date)
          : snapshot.date,
    timezone: row.timezone ?? snapshot.timezone,
    screenings,
    sourceAcceptedPlanId:
      row.source_accepted_plan_id ?? row.sourceAcceptedPlanId,
    schemaVersion: row.schema_version ?? row.schemaVersion,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  });
}

/**
 * @param {unknown} raw
 */
export function normalizeGetSharedPlanPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const plan = normalizeSharedPlanRpcPlan(row.plan ?? row);
  if (!plan) return null;
  const members = Array.isArray(row.members)
    ? row.members.map(normalizePlanMember).filter(Boolean)
    : [];
  return { plan, members };
}
