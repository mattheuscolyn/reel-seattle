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
 * Project membership for a viewer.
 *
 * - owner / member → full membership list
 * - non-member discoverer (friends-visible) → empty list (no invite/RSVP leakage)
 *
 * @param {import('./sharedPlanModel.js').SharedPlan | null | undefined} plan
 * @param {import('./sharedPlanModel.js').PlanMember[] | null | undefined} members
 * @param {string | null | undefined} viewerId
 * @returns {import('./sharedPlanModel.js').PlanMember[]}
 */
export function projectSharedPlanMembersForViewer(plan, members, viewerId) {
  const viewer =
    typeof viewerId === 'string' && viewerId.trim() ? viewerId.trim() : null;
  if (!plan || !viewer) return [];
  const list = Array.isArray(members)
    ? members.map(normalizePlanMember).filter(Boolean)
    : [];
  if (plan.ownerId === viewer) return list;
  if (list.some((member) => member.userId === viewer)) return list;
  return [];
}

/**
 * @param {unknown} raw
 * @param {{ viewerId?: string | null }} [options]
 */
export function normalizeGetSharedPlanPayload(raw, options = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const plan = normalizeSharedPlanRpcPlan(row.plan ?? row);
  if (!plan) return null;
  const members = Array.isArray(row.members)
    ? row.members.map(normalizePlanMember).filter(Boolean)
    : [];
  const viewerId = options.viewerId ?? null;
  return {
    plan,
    members:
      viewerId != null
        ? projectSharedPlanMembersForViewer(plan, members, viewerId)
        : members,
  };
}
