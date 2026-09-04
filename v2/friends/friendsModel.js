/**
 * Canonical friends + invite shapes for Reel Seattle (T-FRIENDS-INVITES-01).
 *
 * Invite-only. No public people directory. UI lives in a later slice;
 * this module only normalizes RPC payloads and invite URLs.
 */

export const FRIEND_INVITE_PUBLIC_ORIGIN = 'https://www.reelseattle.com';
export const FRIEND_INVITE_PATH_PREFIX = '/invite/';
export const FRIEND_INVITE_TTL_DAYS = 14;

export const FRIEND_RPC = Object.freeze({
  create: 'create_friend_invite',
  lookup: 'lookup_friend_invite',
  accept: 'accept_friend_invite',
  revoke: 'revoke_friend_invite',
  list: 'list_friends',
  remove: 'remove_friend',
});

export const FRIEND_ERROR_REASONS = Object.freeze([
  'not_authenticated',
  'supabase_unconfigured',
  'invite_not_found',
  'invite_revoked',
  'invite_expired',
  'invite_accepted',
  'invite_not_pending',
  'invite_create_failed',
  'cannot_friend_self',
  'rate_limited',
  'rpc_failed',
]);

/**
 * @typedef {object} FriendSummary
 * @property {string} friendshipId
 * @property {string} userId
 * @property {string | null} displayName
 * @property {string | null} avatarUrl
 * @property {string} createdAt
 * @property {number} shareInteractionCount
 */

/**
 * @typedef {object} FriendInviter
 * @property {string} userId
 * @property {string | null} displayName
 * @property {string | null} avatarUrl
 */

/**
 * @typedef {object} FriendInvite
 * @property {string} inviteId
 * @property {string} [token]
 * @property {string | null} [shortCode]
 * @property {FriendInviter} [inviter]
 * @property {string | null} expiresAt
 * @property {string} status
 * @property {boolean} [alreadyFriends]
 */

/**
 * @param {string | null | undefined} token
 * @param {string} [origin]
 * @returns {string | null}
 */
export function buildFriendInviteUrl(
  token,
  origin = FRIEND_INVITE_PUBLIC_ORIGIN,
) {
  if (typeof token !== 'string' || !token.trim()) return null;
  const base = String(origin || FRIEND_INVITE_PUBLIC_ORIGIN).replace(/\/$/, '');
  return `${base}${FRIEND_INVITE_PATH_PREFIX}${encodeURIComponent(token.trim())}`;
}

/**
 * @param {string | null | undefined} pathname
 * @returns {string | null}
 */
export function parseInviteTokenFromPath(pathname) {
  const raw = String(pathname || '').split('?')[0];
  const match = raw.match(/^\/invite\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Put `/invite/<token>` back in the address bar after OAuth returns to `/`.
 * @param {string} token
 * @param {{
 *   replaceState?: (data: unknown, unused: string, url: string) => void,
 *   pathname?: string,
 *   state?: unknown,
 * }} [location]
 * @returns {string | null}
 */
export function restoreInvitePath(token, location = {}) {
  if (!isLikelyFriendInviteToken(token)) return null;
  const path = `${FRIEND_INVITE_PATH_PREFIX}${encodeURIComponent(token.trim())}`;
  const currentPath =
    typeof location.pathname === 'string'
      ? location.pathname
      : typeof window !== 'undefined'
        ? window.location.pathname
        : '';
  if (parseInviteTokenFromPath(currentPath) === token.trim()) return path;
  const replace =
    location.replaceState ??
    (typeof window !== 'undefined'
      ? window.history.replaceState.bind(window.history)
      : null);
  try {
    replace?.(location.state ?? null, '', path);
  } catch {
    // History may be unavailable in tests.
  }
  return path;
}

/**
 * Strong invite URL tokens are 64 hex chars (32 bytes). Require ≥32 hex so
 * short codes and junk paths never hit lookup as tokens.
 * @param {string | null | undefined} token
 * @returns {boolean}
 */
export function isLikelyFriendInviteToken(token) {
  return typeof token === 'string' && /^[0-9a-f]{32,}$/i.test(token.trim());
}

/**
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function normalizeFriendInviteCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 8);
}

/**
 * Compact Profile preview label: first token of display name.
 * @param {string | null | undefined} displayName
 * @returns {string}
 */
export function friendGivenName(displayName) {
  const trimmed = String(displayName || '').trim();
  if (!trimmed) return 'Friend';
  return trimmed.split(/\s+/)[0];
}

/**
 * @param {number} widthPx
 * @returns {number}
 */
export function previewSlotCount(widthPx) {
  const width = Number(widthPx);
  if (!Number.isFinite(width) || width < 1) return 4;
  const slot = 88;
  return Math.max(3, Math.min(6, Math.floor(width / slot)));
}

/**
 * @param {FriendSummary[]} friends
 * @param {number} slotCount
 * @returns {{ visible: FriendSummary[], overflow: number }}
 */
export function splitFriendsForPreview(friends, slotCount) {
  const list = Array.isArray(friends) ? friends : [];
  const slots = Math.max(1, Number(slotCount) || 1);
  if (list.length <= slots) return { visible: list, overflow: 0 };
  const visibleCount = Math.max(1, slots - 1);
  return {
    visible: list.slice(0, visibleCount),
    overflow: list.length - visibleCount,
  };
}

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
function nullableString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {unknown} row
 * @returns {FriendSummary | null}
 */
export function normalizeFriendSummary(row) {
  if (!row || typeof row !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (row);
  const friendshipId = nullableString(
    /** @type {string | null} */ (r.friendshipId ?? r.friendship_id),
  );
  const userId = nullableString(
    /** @type {string | null} */ (r.userId ?? r.friend_user_id ?? r.user_id),
  );
  if (!friendshipId || !userId) return null;
  const createdAt = nullableString(
    /** @type {string | null} */ (r.createdAt ?? r.created_at),
  );
  const shareRaw = r.shareInteractionCount ?? r.share_interaction_count ?? 0;
  const shareInteractionCount =
    typeof shareRaw === 'number' && Number.isFinite(shareRaw)
      ? shareRaw
      : Number(shareRaw) || 0;
  return {
    friendshipId,
    userId,
    displayName: nullableString(
      /** @type {string | null} */ (r.displayName ?? r.display_name),
    ),
    avatarUrl: nullableString(
      /** @type {string | null} */ (r.avatarUrl ?? r.avatar_url),
    ),
    createdAt: createdAt || '',
    shareInteractionCount,
  };
}

/**
 * @param {unknown} row
 * @returns {FriendInviter | null}
 */
export function normalizeFriendInviter(row) {
  if (!row || typeof row !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (row);
  const userId = nullableString(
    /** @type {string | null} */ (r.userId ?? r.user_id),
  );
  if (!userId) return null;
  return {
    userId,
    displayName: nullableString(
      /** @type {string | null} */ (r.displayName ?? r.display_name),
    ),
    avatarUrl: nullableString(
      /** @type {string | null} */ (r.avatarUrl ?? r.avatar_url),
    ),
  };
}

/**
 * @param {unknown} row
 * @returns {FriendInvite | null}
 */
export function normalizeFriendInvite(row) {
  if (!row || typeof row !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (row);
  const inviteId = nullableString(
    /** @type {string | null} */ (r.inviteId ?? r.invite_id),
  );
  if (!inviteId) return null;
  const token = nullableString(/** @type {string | null} */ (r.token));
  const shortCode = nullableString(
    /** @type {string | null} */ (r.shortCode ?? r.short_code),
  );
  const expiresAt = nullableString(
    /** @type {string | null} */ (r.expiresAt ?? r.expires_at),
  );
  const status =
    nullableString(/** @type {string | null} */ (r.status)) || 'pending';
  const inviter = normalizeFriendInviter(r.inviter);
  /** @type {FriendInvite} */
  const invite = {
    inviteId,
    expiresAt,
    status,
  };
  if (token) invite.token = token;
  if (shortCode) invite.shortCode = shortCode;
  if (inviter) invite.inviter = inviter;
  if (typeof r.alreadyFriends === 'boolean') {
    invite.alreadyFriends = r.alreadyFriends;
  } else if (typeof r.already_friends === 'boolean') {
    invite.alreadyFriends = r.already_friends;
  }
  return invite;
}

/**
 * Profile Friends preview / list ordering.
 * 1. shareInteractionCount DESC
 * 2. createdAt DESC
 * 3. userId ASC (stable)
 *
 * @param {FriendSummary} a
 * @param {FriendSummary} b
 * @returns {number}
 */
export function compareFriendSummaries(a, b) {
  const shareDiff =
    (b?.shareInteractionCount ?? 0) - (a?.shareInteractionCount ?? 0);
  if (shareDiff !== 0) return shareDiff;
  const aCreated = Date.parse(a?.createdAt || '') || 0;
  const bCreated = Date.parse(b?.createdAt || '') || 0;
  if (bCreated !== aCreated) return bCreated - aCreated;
  return String(a?.userId || '').localeCompare(String(b?.userId || ''));
}

/**
 * @param {unknown} error
 * @param {unknown} [data]
 * @returns {string}
 */
export function normalizeFriendRpcFailure(error, data) {
  if (data && typeof data === 'object') {
    const reason = /** @type {{ ok?: unknown, reason?: unknown }} */ (data)
      .reason;
    if (
      /** @type {{ ok?: unknown }} */ (data).ok === false &&
      typeof reason === 'string' &&
      reason
    ) {
      return reason;
    }
  }
  const message = String(
    (error && typeof error === 'object' && 'message' in error
      ? /** @type {{ message?: unknown }} */ (error).message
      : '') || '',
  );
  for (const code of FRIEND_ERROR_REASONS) {
    if (message.includes(code)) return code;
  }
  if (error) return 'rpc_failed';
  return 'rpc_failed';
}

/**
 * Strip keys that must never reach UI from a friend/invite projection.
 * @param {unknown} value
 * @returns {unknown}
 */
export function omitPrivateAccountFields(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(omitPrivateAccountFields);
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (
      /email|is_admin|username|sync|raw_user|phone|identit/i.test(key)
    ) {
      continue;
    }
    out[key] = omitPrivateAccountFields(nested);
  }
  return out;
}
