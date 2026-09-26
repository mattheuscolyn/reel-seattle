/**
 * Cache pending invitations + active shared plans for Planner projection.
 */

import {
  listMySharedPlansRemote,
  listPendingSharedPlanInvitationsRemote,
} from './sharedPlansApi.js';

/**
 * @typedef {{
 *   status: 'idle' | 'loading' | 'ready' | 'error',
 *   pendingInvitations: import('./sharedPlansRpcModel.js').normalizeSharedPlanInvitationRow extends Function
 *     ? NonNullable<ReturnType<typeof import('./sharedPlansRpcModel.js').normalizeSharedPlanInvitationRow>>[]
 *     : object[],
 *   activeSharedPlans: object[],
 *   errorReason: string | null,
 *   userId: string | null,
 *   revision: number,
 * }} SharedPlansPlannerSnapshot
 */

/** @type {SharedPlansPlannerSnapshot} */
let snapshot = {
  status: 'idle',
  pendingInvitations: [],
  activeSharedPlans: [],
  errorReason: null,
  userId: null,
  revision: 0,
};

let generation = 0;
/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

/**
 * @param {Partial<SharedPlansPlannerSnapshot>} patch
 */
function setSnapshot(patch) {
  snapshot = { ...snapshot, ...patch, revision: snapshot.revision + 1 };
  notify();
}

export function getSharedPlansPlannerSnapshot() {
  return snapshot;
}

export function subscribeSharedPlansPlanner(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetSharedPlansPlannerStore() {
  generation += 1;
  snapshot = {
    status: 'idle',
    pendingInvitations: [],
    activeSharedPlans: [],
    errorReason: null,
    userId: null,
    revision: snapshot.revision + 1,
  };
  notify();
}

/**
 * @param {string | null | undefined} userId
 * @param {{ getClient?: () => unknown }} [options]
 */
export async function refreshSharedPlansForPlanner(userId, options = {}) {
  const uid = typeof userId === 'string' && userId ? userId : null;
  if (!uid) {
    generation += 1;
    setSnapshot({
      status: 'idle',
      pendingInvitations: [],
      activeSharedPlans: [],
      errorReason: null,
      userId: null,
    });
    return getSharedPlansPlannerSnapshot();
  }

  const gen = ++generation;
  setSnapshot({ status: 'loading', userId: uid, errorReason: null });

  const [pendingResult, activeResult] = await Promise.all([
    listPendingSharedPlanInvitationsRemote(options),
    listMySharedPlansRemote(options),
  ]);

  if (gen !== generation) return getSharedPlansPlannerSnapshot();

  if (!pendingResult.ok || !activeResult.ok) {
    setSnapshot({
      status: 'error',
      errorReason:
        (!pendingResult.ok && pendingResult.reason) ||
        (!activeResult.ok && activeResult.reason) ||
        'rpc_failed',
      pendingInvitations: pendingResult.ok
        ? pendingResult.invitations
        : snapshot.pendingInvitations,
      activeSharedPlans: activeResult.ok
        ? activeResult.items
        : snapshot.activeSharedPlans,
    });
    return getSharedPlansPlannerSnapshot();
  }

  setSnapshot({
    status: 'ready',
    userId: uid,
    errorReason: null,
    pendingInvitations: pendingResult.invitations,
    activeSharedPlans: activeResult.items,
  });
  return getSharedPlansPlannerSnapshot();
}
