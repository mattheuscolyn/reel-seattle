/**
 * Shared-plan Supabase RPC wrappers (foundation + invites).
 */

import { getSupabaseClient } from '../auth/supabaseClient.js';
import {
  SHARED_PLAN_RPC,
  normalizeGetSharedPlanPayload,
  normalizeSharedPlanInvitationRow,
  normalizeSharedPlanRpcPlan,
} from './sharedPlansRpcModel.js';
import { normalizeFriendFilmUserState } from '../filmState/filmUserStateModel.js';
import { normalizePlanMember } from './sharedPlanModel.js';

/**
 * @param {{
 *   getClient?: () => unknown,
 *   requireSession?: boolean,
 * }} [options]
 */
async function resolveClient(options = {}) {
  const getClient = options.getClient ?? getSupabaseClient;
  const client = getClient();
  if (!client) {
    return { ok: false, reason: 'supabase_unconfigured' };
  }
  if (options.requireSession === false) {
    return { ok: true, client };
  }
  const sessionFn = client.auth?.getSession;
  if (typeof sessionFn === 'function') {
    const { data } = await sessionFn.call(client.auth);
    if (!data?.session) {
      return { ok: false, reason: 'not_authenticated' };
    }
  }
  return { ok: true, client };
}

/**
 * @param {object} client
 * @param {string} name
 * @param {Record<string, unknown>} [args]
 */
async function callRpc(client, name, args) {
  if (typeof client.rpc !== 'function') {
    return { data: null, error: { message: 'rpc_failed' } };
  }
  return args ? client.rpc(name, args) : client.rpc(name);
}

/**
 * @param {unknown} error
 */
function rpcFailureReason(error) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(/** @type {{ message?: unknown }} */ (error).message || '')
      : '';
  if (message.includes('not_authenticated')) return 'not_authenticated';
  if (message.includes('plan_not_found')) return 'plan_not_found';
  if (message.includes('empty_screenings')) return 'empty_screenings';
  if (message.includes('invalid_plan')) return 'invalid_plan';
  if (message.includes('not_owner')) return 'not_owner';
  if (message.includes('not_member')) return 'not_member';
  if (message.includes('not_friend')) return 'not_friend';
  if (message.includes('invalid_transition')) return 'invalid_transition';
  if (message.includes('invalid_message')) return 'invalid_message';
  if (message.includes('invalid_invitees')) return 'invalid_invitees';
  if (message.includes('already_member')) return 'already_member';
  return 'rpc_failed';
}

/**
 * @param {import('./sharedPlanModel.js').SharedPlan} plan
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function createSharedPlanRemote(plan, options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const snapshot = {
    schema_version: plan.schemaVersion ?? 1,
    planId: plan.planId,
    label: plan.label,
    date: plan.date,
    timezone: plan.timezone,
    provenance: 'live',
    performances: plan.screenings,
  };
  const { data, error } = await callRpc(
    resolved.client,
    SHARED_PLAN_RPC.create,
    {
      p_plan_id: plan.planId,
      p_plan_type: plan.type,
      p_visibility: plan.visibility,
      p_label: plan.label,
      p_plan_date: plan.date,
      p_timezone: plan.timezone,
      p_plan_snapshot: snapshot,
      p_source_accepted_plan_id: plan.sourceAcceptedPlanId,
    },
  );
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  const normalized = normalizeSharedPlanRpcPlan(data);
  if (!normalized) return { ok: false, reason: 'rpc_failed' };
  return { ok: true, plan: normalized };
}

/**
 * @param {string} planId
 * @param {{ getClient?: () => unknown, viewerId?: string | null }} [options]
 */
export async function getSharedPlanRemote(planId, options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(resolved.client, SHARED_PLAN_RPC.get, {
    p_plan_id: planId,
  });
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  const payload = normalizeGetSharedPlanPayload(data, {
    viewerId: options.viewerId ?? null,
  });
  if (!payload) return { ok: false, reason: 'plan_not_found' };
  return { ok: true, ...payload };
}

/**
 * @param {string} sourceAcceptedPlanId
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function getSharedPlanBySourceAcceptedRemote(
  sourceAcceptedPlanId,
  options = {},
) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(
    resolved.client,
    SHARED_PLAN_RPC.getBySourceAccepted,
    { p_source_accepted_plan_id: sourceAcceptedPlanId },
  );
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  if (data == null) return { ok: true, plan: null };
  const plan = normalizeSharedPlanRpcPlan(data);
  return { ok: true, plan };
}

/**
 * @param {string} planId
 * @param {string[]} inviteeIds
 * @param {{ message?: string | null, getClient?: () => unknown }} [options]
 */
export async function inviteFriendsToSharedPlanRemote(
  planId,
  inviteeIds,
  options = {},
) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(
    resolved.client,
    SHARED_PLAN_RPC.inviteFriends,
    {
      p_plan_id: planId,
      p_invitee_ids: inviteeIds,
      p_message: options.message ?? null,
    },
  );
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  if (!data || typeof data !== 'object') return { ok: false, reason: 'rpc_failed' };
  const row = /** @type {Record<string, unknown>} */ (data);
  const plan = normalizeSharedPlanRpcPlan(row.plan);
  const invited = Array.isArray(row.invited)
    ? row.invited.map(normalizePlanMember).filter(Boolean)
    : [];
  const skipped = Array.isArray(row.skipped) ? row.skipped : [];
  if (!plan) return { ok: false, reason: 'rpc_failed' };
  return { ok: true, plan, invited, skipped };
}

/**
 * @param {string} planId
 * @param {string} response
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function respondToSharedPlanRemote(planId, response, options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(
    resolved.client,
    SHARED_PLAN_RPC.respond,
    {
      p_plan_id: planId,
      p_response: response,
    },
  );
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  if (!data || typeof data !== 'object') return { ok: false, reason: 'rpc_failed' };
  const row = /** @type {Record<string, unknown>} */ (data);
  const plan = normalizeSharedPlanRpcPlan(row.plan);
  const member = normalizePlanMember(row.member);
  if (!plan || !member) return { ok: false, reason: 'rpc_failed' };
  return { ok: true, plan, member };
}

/**
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function listPendingSharedPlanInvitationsRemote(options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(
    resolved.client,
    SHARED_PLAN_RPC.listPendingInvitations,
  );
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    invitations: rows.map(normalizeSharedPlanInvitationRow).filter(Boolean),
  };
}

/**
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function listMySharedPlansRemote(options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(
    resolved.client,
    SHARED_PLAN_RPC.listMySharedPlans,
  );
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    items: rows.map(normalizeSharedPlanInvitationRow).filter(Boolean),
  };
}

/**
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function listOpenFriendSharedPlansRemote(options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(
    resolved.client,
    SHARED_PLAN_RPC.listOpenFriend,
  );
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    plans: rows.map(normalizeSharedPlanRpcPlan).filter(Boolean),
  };
}

/**
 * @param {string} filmKey
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function listFriendFilmStatesRemote(filmKey, options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(
    resolved.client,
    SHARED_PLAN_RPC.listFriendFilmStates,
    { p_film_key: filmKey },
  );
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    states: rows.map(normalizeFriendFilmUserState).filter(Boolean),
  };
}

export { SHARED_PLAN_RPC };
