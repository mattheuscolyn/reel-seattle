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
