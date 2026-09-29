/**
 * One batched Friends-list context read. Not a per-friend fan-out.
 */

import { getSupabaseClient } from '../auth/supabaseClient.js';
import { normalizeFriendsListContext } from './friendsListContextModel.js';

export const FRIENDS_LIST_CONTEXT_RPC = 'list_friends_list_context';

/**
 * @param {{ getClient?: () => unknown }} [options]
 */
async function resolveClient(options = {}) {
  const getClient = options.getClient ?? getSupabaseClient;
  const client = getClient();
  if (!client) return { ok: false, reason: 'supabase_unconfigured' };
  const sessionFn = client.auth?.getSession;
  if (typeof sessionFn === 'function') {
    const { data } = await sessionFn.call(client.auth);
    if (!data?.session) return { ok: false, reason: 'not_authenticated' };
  }
  return { ok: true, client };
}

/**
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function listFriendsListContext(options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason, friends: [] };
  }
  if (typeof resolved.client.rpc !== 'function') {
    return { ok: false, reason: 'rpc_failed', friends: [] };
  }
  const { data, error } = await resolved.client.rpc(FRIENDS_LIST_CONTEXT_RPC);
  if (error) {
    const message = String(error.message || '');
    return {
      ok: false,
      reason: message.includes('not_authenticated') ? 'not_authenticated' : 'rpc_failed',
      friends: [],
    };
  }
  return {
    ok: true,
    friends: normalizeFriendsListContext(data),
  };
}
