/**
 * Shared-plan Supabase RPC wrappers (T-SHARED-PLANS-01).
 * Keep Planner UI free of this module until a later surface PR.
 */

import { getSupabaseClient } from '../auth/supabaseClient.js';
import {
  SHARED_PLAN_RPC,
  normalizeGetSharedPlanPayload,
  normalizeSharedPlanRpcPlan,
} from './sharedPlansRpcModel.js';
import { normalizeFriendFilmUserState } from '../filmState/filmUserStateModel.js';

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
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function getSharedPlanRemote(planId, options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(resolved.client, SHARED_PLAN_RPC.get, {
    p_plan_id: planId,
  });
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  const payload = normalizeGetSharedPlanPayload(data);
  if (!payload) return { ok: false, reason: 'plan_not_found' };
  return { ok: true, ...payload };
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
