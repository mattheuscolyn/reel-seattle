/**
 * Small Friends list cache shared by Profile preview and the Friends screen.
 * No public search. shareInteractionCount is never rendered here.
 */

import { listFriends, removeFriend } from './friendsApi.js';

/** @typedef {import('./friendsModel.js').FriendSummary} FriendSummary */

/**
 * @typedef {{
 *   status: 'idle' | 'loading' | 'ready' | 'error',
 *   friends: FriendSummary[],
 *   errorReason: string | null,
 *   userId: string | null,
 * }} FriendsSnapshot
 */

/** @type {FriendsSnapshot} */
let snapshot = {
  status: 'idle',
  friends: [],
  errorReason: null,
  userId: null,
};

let generation = 0;

/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

/**
 * @param {Partial<FriendsSnapshot>} patch
 */
function setSnapshot(patch) {
  snapshot = { ...snapshot, ...patch };
  notify();
}

/**
 * @returns {FriendsSnapshot}
 */
export function getFriendsSnapshot() {
  return snapshot;
}

/**
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeFriends(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetFriendsStore() {
  generation += 1;
  snapshot = {
    status: 'idle',
    friends: [],
    errorReason: null,
    userId: null,
  };
  notify();
}

/**
 * @param {string | null | undefined} userId
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function refreshFriends(userId, options = {}) {
  const uid = typeof userId === 'string' && userId ? userId : null;
  if (!uid) {
    generation += 1;
    setSnapshot({
      status: 'idle',
      friends: [],
      errorReason: null,
      userId: null,
    });
    return { ok: true, friends: [] };
  }

  const gen = (generation += 1);
  setSnapshot({
    status: snapshot.userId === uid && snapshot.status === 'ready' ? 'ready' : 'loading',
    userId: uid,
    errorReason: null,
  });

  const result = await listFriends(options);
  if (gen !== generation) return result;

  if (!result.ok) {
    setSnapshot({
      status: 'error',
      errorReason: result.reason,
      userId: uid,
    });
    return result;
  }

  setSnapshot({
    status: 'ready',
    friends: result.friends,
    errorReason: null,
    userId: uid,
  });
  return result;
}

/**
 * @param {string} friendUserId
 * @param {string | null | undefined} userId
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function removeFriendAndRefresh(friendUserId, userId, options = {}) {
  const result = await removeFriend(friendUserId, options);
  if (result.ok) {
    await refreshFriends(userId, options);
  }
  return result;
}
