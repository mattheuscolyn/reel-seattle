/**
 * Friends + invite RPC wrappers (T-FRIENDS-INVITES-01).
 *
 * Keep Supabase out of future Profile / invite UI. No social store.
 * No public user search lives here — only invite token/code and own friends.
 */

import { getSupabaseClient } from '../auth/supabaseClient.js';
import {
  FRIEND_RPC,
  buildFriendInviteUrl,
  normalizeFriendInvite,
  normalizeFriendRpcFailure,
  normalizeFriendSummary,
  omitPrivateAccountFields,
  compareFriendSummaries,
} from './friendsModel.js';

export {
  FRIEND_INVITE_PATH_PREFIX,
  FRIEND_INVITE_PUBLIC_ORIGIN,
  FRIEND_INVITE_TTL_DAYS,
  FRIEND_RPC,
  buildFriendInviteUrl,
  compareFriendSummaries,
  normalizeFriendInvite,
  normalizeFriendSummary,
  parseInviteTokenFromPath,
} from './friendsModel.js';

/**
 * @typedef {import('./friendsModel.js').FriendSummary} FriendSummary
 * @typedef {import('./friendsModel.js').FriendInvite} FriendInvite
 */

/**
 * @param {{
 *   getClient?: () => unknown,
 *   requireSession?: boolean,
 * }} [options]
 * @returns {Promise<{ ok: true, client: object } | { ok: false, reason: string, client?: null }>}
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
 * @returns {Promise<{ data: unknown, error: unknown }>}
 */
async function callRpc(client, name, args) {
  if (typeof client.rpc !== 'function') {
    return { data: null, error: { message: 'rpc_failed' } };
  }
  return args ? client.rpc(name, args) : client.rpc(name);
}

/**
 * @param {unknown} data
 * @param {unknown} error
 * @returns {{ ok: false, reason: string } | null}
 */
function failureFromRpc(data, error) {
  if (error) {
    return { ok: false, reason: normalizeFriendRpcFailure(error, data) };
  }
  if (data && typeof data === 'object' && /** @type {{ ok?: unknown }} */ (data).ok === false) {
    return {
      ok: false,
      reason: normalizeFriendRpcFailure(null, data),
    };
  }
  return null;
}

/**
 * @param {{ getClient?: () => unknown }} [options]
 * @returns {Promise<
 *   | { ok: true, invite: FriendInvite, inviteUrl: string | null }
 *   | { ok: false, reason: string }
 * >}
 */
export async function createFriendInvite(options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(resolved.client, FRIEND_RPC.create);
  const fail = failureFromRpc(data, error);
  if (fail) return fail;
  const invite = normalizeFriendInvite(omitPrivateAccountFields(data));
  if (!invite) return { ok: false, reason: 'rpc_failed' };
  return {
    ok: true,
    invite,
    inviteUrl: buildFriendInviteUrl(invite.token),
  };
}

/**
 * Anonymous lookup is allowed: the unguessable token is the credential.
 *
 * @param {string} tokenOrCode
 * @param {{ getClient?: () => unknown }} [options]
 * @returns {Promise<
 *   | { ok: true, invite: FriendInvite }
 *   | { ok: false, reason: string, status?: string }
 * >}
 */
export async function lookupFriendInvite(tokenOrCode, options = {}) {
  const trimmed =
    typeof tokenOrCode === 'string' ? tokenOrCode.trim() : '';
  const looksLikeShortCode = trimmed.length > 0 && trimmed.length <= 8;
  const resolved = await resolveClient({
    ...options,
    requireSession: looksLikeShortCode,
  });
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(resolved.client, FRIEND_RPC.lookup, {
    token_or_code: tokenOrCode,
  });
  const fail = failureFromRpc(data, error);
  if (fail) {
    const status =
      data && typeof data === 'object'
        ? /** @type {{ status?: string }} */ (data).status
        : undefined;
    return status ? { ...fail, status } : fail;
  }
  const invite = normalizeFriendInvite(omitPrivateAccountFields(data));
  if (!invite) return { ok: false, reason: 'rpc_failed' };
  return { ok: true, invite };
}

/**
 * @param {string} tokenOrCode
 * @param {{ getClient?: () => unknown }} [options]
 * @returns {Promise<
 *   | { ok: true, friendshipId: string | null, friendUserId: string | null, alreadyFriends: boolean }
 *   | { ok: false, reason: string }
 * >}
 */
export async function acceptFriendInvite(tokenOrCode, options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(resolved.client, FRIEND_RPC.accept, {
    token_or_code: tokenOrCode,
  });
  const fail = failureFromRpc(data, error);
  if (fail) return fail;
  const row = data && typeof data === 'object' ? data : {};
  return {
    ok: true,
    friendshipId:
      typeof row.friendship_id === 'string' ? row.friendship_id : null,
    friendUserId:
      typeof row.friend_user_id === 'string' ? row.friend_user_id : null,
    alreadyFriends: Boolean(row.already_friends),
  };
}

/**
 * @param {string} inviteId
 * @param {{ getClient?: () => unknown }} [options]
 * @returns {Promise<{ ok: true, inviteId: string } | { ok: false, reason: string }>}
 */
export async function revokeFriendInvite(inviteId, options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(resolved.client, FRIEND_RPC.revoke, {
    invite_id: inviteId,
  });
  const fail = failureFromRpc(data, error);
  if (fail) return fail;
  return { ok: true, inviteId };
}

/**
 * @param {{ getClient?: () => unknown }} [options]
 * @returns {Promise<
 *   | { ok: true, friends: FriendSummary[] }
 *   | { ok: false, reason: string }
 * >}
 */
export async function listFriends(options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(resolved.client, FRIEND_RPC.list);
  const fail = failureFromRpc(data, error);
  if (fail) return fail;
  const rows =
    data && typeof data === 'object' && Array.isArray(data.friends)
      ? data.friends
      : Array.isArray(data)
        ? data
        : [];
  const friends = rows
    .map((row) => normalizeFriendSummary(omitPrivateAccountFields(row)))
    .filter(Boolean)
    .sort(compareFriendSummaries);
  return { ok: true, friends };
}

/**
 * @param {string} friendUserId
 * @param {{ getClient?: () => unknown }} [options]
 * @returns {Promise<
 *   | { ok: true, removed: boolean }
 *   | { ok: false, reason: string }
 * >}
 */
export async function removeFriend(friendUserId, options = {}) {
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(resolved.client, FRIEND_RPC.remove, {
    friend_user_id: friendUserId,
  });
  const fail = failureFromRpc(data, error);
  if (fail) return fail;
  return {
    ok: true,
    removed: Boolean(data && data.removed),
  };
}
