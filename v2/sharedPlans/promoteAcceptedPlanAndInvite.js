/**
 * Promote a solo AcceptedPlan into a canonical SharedPlan and invite friends.
 * Never clones itineraries for recipients — one planId for all members.
 */

import { sharedPlanFromAcceptedPlan } from './acceptedPlanAdapter.js';
import {
  createSharedPlanRemote,
  getSharedPlanBySourceAcceptedRemote,
  getSharedPlanRemote,
  inviteFriendsToSharedPlanRemote,
  setSharedPlanVisibilityRemote,
} from './sharedPlansApi.js';
import { createSharedPlanId } from './sharedPlanModel.js';

/**
 * @param {{
 *   acceptedPlan: import('../stores/acceptedPlansStore.js').AcceptedPlanItem,
 *   ownerId: string,
 *   type: 'proposal' | 'decided',
 *   inviteeIds: string[],
 *   message?: string | null,
 *   getClient?: () => unknown,
 * }} input
 */
export async function promoteAcceptedPlanAndInvite(input) {
  const {
    acceptedPlan,
    ownerId,
    type,
    inviteeIds,
    message = null,
    getClient,
  } = input;
  if (!acceptedPlan?.planId || !ownerId) {
    return { ok: false, reason: 'invalid_plan' };
  }
  const ids = Array.isArray(inviteeIds)
    ? [...new Set(inviteeIds.filter((id) => typeof id === 'string' && id))]
    : [];
  if (ids.length === 0) {
    return { ok: false, reason: 'invalid_invitees' };
  }

  // Reuse existing canonical shared plan when this AcceptedPlan was already shared.
  const existing = await getSharedPlanBySourceAcceptedRemote(acceptedPlan.planId, {
    getClient,
  });
  if (!existing.ok) return existing;

  /** @type {import('./sharedPlanModel.js').SharedPlan | null} */
  let plan = existing.plan;
  let created = false;

  if (!plan) {
    const adapted = sharedPlanFromAcceptedPlan(acceptedPlan, {
      ownerId,
      type,
      // Direct invites → invited visibility (not open-to-all-friends).
      visibility: 'invited',
    });
    if (!adapted.ok || !adapted.plan) {
      return { ok: false, reason: adapted.reason || 'invalid_plan' };
    }
    const toCreate = {
      ...adapted.plan,
      planId: createSharedPlanId(),
    };
    const createdRemote = await createSharedPlanRemote(toCreate, { getClient });
    if (!createdRemote.ok || !createdRemote.plan) return createdRemote;
    plan = createdRemote.plan;
    created = true;
  }

  const inviteResult = await inviteFriendsToSharedPlanRemote(
    plan.planId,
    ids,
    { message, getClient },
  );
  if (!inviteResult.ok) return inviteResult;

  // Refresh members for owner status UI.
  const refreshed = await getSharedPlanRemote(plan.planId, {
    getClient,
    viewerId: ownerId,
  });

  return {
    ok: true,
    created,
    plan: refreshed.ok ? refreshed.plan : inviteResult.plan,
    members: refreshed.ok ? refreshed.members : [],
    invited: inviteResult.invited,
    skipped: inviteResult.skipped,
  };
}

/**
 * Set who can join an existing or newly promoted SharedPlan.
 * Visibility changes never remove members. "All friends" does not insert memberships.
 *
 * @param {{
 *   acceptedPlan?: import('../stores/acceptedPlansStore.js').AcceptedPlanItem | null,
 *   sharedPlanId?: string | null,
 *   ownerId: string,
 *   mode: 'private' | 'invited' | 'friends',
 *   type?: 'proposal' | 'decided',
 *   getClient?: () => unknown,
 * }} input
 */
export async function applySharedPlanAudience(input) {
  const {
    acceptedPlan = null,
    sharedPlanId = null,
    ownerId,
    mode,
    type = 'proposal',
    getClient,
  } = input;
  if (!ownerId || !['private', 'invited', 'friends'].includes(mode)) {
    return { ok: false, reason: 'invalid_plan' };
  }

  let plan = null;
  if (sharedPlanId) {
    const loaded = await getSharedPlanRemote(sharedPlanId, {
      getClient,
      viewerId: ownerId,
    });
    if (!loaded.ok) return loaded;
    plan = loaded.plan;
  } else if (acceptedPlan?.planId) {
    const existing = await getSharedPlanBySourceAcceptedRemote(acceptedPlan.planId, {
      getClient,
    });
    if (!existing.ok) return existing;
    plan = existing.plan;
  }

  if (!plan && mode === 'private') {
    return { ok: true, plan: null, created: false };
  }

  if (!plan) {
    if (!acceptedPlan) return { ok: false, reason: 'invalid_plan' };
    if (mode === 'invited') {
      return { ok: false, reason: 'invalid_invitees' };
    }
    const adapted = sharedPlanFromAcceptedPlan(acceptedPlan, {
      ownerId,
      type,
      visibility: 'friends',
    });
    if (!adapted.ok || !adapted.plan) {
      return { ok: false, reason: adapted.reason || 'invalid_plan' };
    }
    const createdRemote = await createSharedPlanRemote(
      { ...adapted.plan, planId: createSharedPlanId() },
      { getClient },
    );
    if (!createdRemote.ok) return createdRemote;
    return { ok: true, plan: createdRemote.plan, created: true };
  }

  if (plan.ownerId && plan.ownerId !== ownerId) {
    return { ok: false, reason: 'not_owner' };
  }
  if (plan.visibility === mode) {
    return { ok: true, plan, created: false };
  }
  return setSharedPlanVisibilityRemote(plan.planId, mode, { getClient });
}
