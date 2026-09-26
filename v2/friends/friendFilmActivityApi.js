/**
 * Friend film-activity RPC wrappers + own share-preference sync.
 *
 * Privacy mutations for signed-in users require a successful cloud write.
 * Local storage is a cache — failed cloud updates roll back the cache.
 */

import { getSupabaseClient } from '../auth/supabaseClient.js';
import {
  FRIEND_FILM_ACTIVITY_RPC,
  normalizeFriendActivityFilmRow,
  normalizeFriendSharedActivityPayload,
} from './friendFilmActivityModel.js';
import { normalizeFriendFilmUserState } from '../filmState/filmUserStateModel.js';
import {
  applyAuthoritativeFriendActivityPrivacy,
  getFriendActivityPrivacy,
  updateFriendActivityPrivacy,
} from './friendActivityPrivacyStore.js';

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
  return 'rpc_failed';
}

/**
 * Friend activity for one film (Film Detail).
 *
 * @param {string} filmKey
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function listFriendActivityForFilm(filmKey, options = {}) {
  const key = typeof filmKey === 'string' ? filmKey.trim() : '';
  if (!key) return { ok: true, states: [] };
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(
    resolved.client,
    FRIEND_FILM_ACTIVITY_RPC.listForFilm,
    { p_film_key: key },
  );
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    states: rows.map(normalizeFriendFilmUserState).filter(Boolean),
  };
}

/**
 * All shared films for one friend (Friend Detail).
 *
 * @param {string} friendUserId
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function listSharedFilmActivityForFriend(
  friendUserId,
  options = {},
) {
  const id = typeof friendUserId === 'string' ? friendUserId.trim() : '';
  if (!id) {
    return {
      ok: true,
      isFriend: false,
      sharesActivity: false,
      films: [],
    };
  }
  const resolved = await resolveClient(options);
  if (!resolved.ok) return resolved;
  const { data, error } = await callRpc(
    resolved.client,
    FRIEND_FILM_ACTIVITY_RPC.listForFriend,
    { p_friend_user_id: id },
  );
  if (error) return { ok: false, reason: rpcFailureReason(error) };
  const payload = normalizeFriendSharedActivityPayload(data);
  return {
    ok: true,
    isFriend: payload.isFriend,
    sharesActivity: payload.sharesActivity,
    films: payload.films,
  };
}

/**
 * Persist own share preference.
 *
 * Signed-in + cloud available: server is authoritative. Optimistic local
 * update rolls back if the RPC fails — never leave UI/cache claiming OFF
 * (or ON) when friends can still (or cannot) see activity.
 *
 * Signed-out / unconfigured: local cache only (no peer visibility path).
 *
 * @param {boolean} enabled
 * @param {{
 *   storage?: Storage | null,
 *   getClient?: () => unknown,
 * }} [options]
 */
export async function setShareFilmActivityWithFriends(enabled, options = {}) {
  const share = enabled === true;
  const storage = options.storage ?? null;
  const previous = getFriendActivityPrivacy(storage);

  const resolved = await resolveClient({
    getClient: options.getClient,
    requireSession: true,
  });

  // No authenticated cloud session → local-only cache (offline / signed-out).
  if (
    !resolved.ok &&
    (resolved.reason === 'not_authenticated' ||
      resolved.reason === 'supabase_unconfigured')
  ) {
    const local = updateFriendActivityPrivacy(storage, {
      shareFilmActivityWithFriends: share,
    });
    if (!local.ok) {
      return {
        ok: false,
        reason: local.error ?? 'storage_unavailable',
        settings: previous,
        synced: false,
        source: 'local',
      };
    }
    return {
      ok: true,
      settings: local.settings,
      synced: false,
      reason: resolved.reason,
      source: 'local',
    };
  }

  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason,
      settings: previous,
      synced: false,
      source: 'cloud',
    };
  }

  // Optimistic UI/cache update; roll back on RPC failure.
  updateFriendActivityPrivacy(storage, {
    shareFilmActivityWithFriends: share,
  });

  const { data, error } = await callRpc(
    resolved.client,
    FRIEND_FILM_ACTIVITY_RPC.setShare,
    { p_enabled: share },
  );
  if (error) {
    applyAuthoritativeFriendActivityPrivacy(
      storage,
      previous.shareFilmActivityWithFriends,
    );
    return {
      ok: false,
      reason: rpcFailureReason(error),
      settings: getFriendActivityPrivacy(storage),
      synced: false,
      source: 'cloud',
      rolledBack: true,
    };
  }

  const payload =
    data && typeof data === 'object'
      ? /** @type {Record<string, unknown>} */ (data)
      : {};
  if (payload.ok === false) {
    applyAuthoritativeFriendActivityPrivacy(
      storage,
      previous.shareFilmActivityWithFriends,
    );
    return {
      ok: false,
      reason: 'rpc_failed',
      settings: getFriendActivityPrivacy(storage),
      synced: false,
      source: 'cloud',
      rolledBack: true,
    };
  }

  const cloudEnabled =
    payload.share_film_activity_with_friends === true ||
    payload.share_film_activity_with_friends === false
      ? payload.share_film_activity_with_friends === true
      : share;

  applyAuthoritativeFriendActivityPrivacy(storage, cloudEnabled);
  return {
    ok: true,
    settings: getFriendActivityPrivacy(storage),
    synced: true,
    source: 'cloud',
  };
}

/**
 * Pull cloud preference into local cache when signed in.
 * Server value always overwrites local on success.
 *
 * @param {{
 *   storage?: Storage | null,
 *   getClient?: () => unknown,
 * }} [options]
 */
export async function pullShareFilmActivityPreference(options = {}) {
  const storage = options.storage ?? null;
  const resolved = await resolveClient({
    getClient: options.getClient,
    requireSession: true,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason,
      settings: getFriendActivityPrivacy(storage),
      source: 'local',
    };
  }
  const client = /** @type {{ from?: Function }} */ (resolved.client);
  if (typeof client.from !== 'function') {
    return {
      ok: false,
      reason: 'rpc_failed',
      settings: getFriendActivityPrivacy(storage),
      source: 'local',
    };
  }
  const { data, error } = await client
    .from('profiles')
    .select('share_film_activity_with_friends')
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      reason: 'rpc_failed',
      settings: getFriendActivityPrivacy(storage),
      source: 'local',
    };
  }
  // Missing row / null column → opt-in default OFF (authoritative).
  const cloudEnabled =
    data &&
    typeof data === 'object' &&
    data.share_film_activity_with_friends === true;
  applyAuthoritativeFriendActivityPrivacy(storage, cloudEnabled);
  return {
    ok: true,
    settings: getFriendActivityPrivacy(storage),
    source: 'cloud',
  };
}

export { FRIEND_FILM_ACTIVITY_RPC };
