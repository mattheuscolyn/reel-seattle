/**
 * In-memory shared-plan repository for domain foundation + tests.
 * Production multi-user persistence is Supabase (see migration + sharedPlansApi).
 *
 * Guarantees:
 * - One canonical planId shared by all members
 * - Visibility ≠ membership
 * - Owner-only itinerary edits
 * - Joining an open plan attaches to the same plan identity
 */

import {
  buildDirectInviteMember,
  buildOpenJoinMember,
  canViewerSeeSharedPlan,
  createSharedPlan,
  isFriendVisibleOpenPlan,
  normalizePlanMember,
  normalizeSharedPlan,
  transitionPlanMemberResponse,
  transitionSharedPlanType,
  transitionSharedPlanVisibility,
} from './sharedPlanModel.js';
import { projectSharedPlanMembersForViewer } from './sharedPlansRpcModel.js';

/**
 * @typedef {{
 *   plans: Map<string, import('./sharedPlanModel.js').SharedPlan>,
 *   membersByPlan: Map<string, import('./sharedPlanModel.js').PlanMember[]>,
 *   friendships: Set<string>,
 * }} SharedPlanRepositoryState
 */

/**
 * Canonical unordered friendship key.
 * @param {string} a
 * @param {string} b
 */
export function friendshipPairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * @returns {SharedPlanRepositoryState}
 */
export function createSharedPlanRepository() {
  return {
    plans: new Map(),
    membersByPlan: new Map(),
    friendships: new Set(),
  };
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} userA
 * @param {string} userB
 */
export function markFriends(repo, userA, userB) {
  if (!userA || !userB || userA === userB) return;
  repo.friendships.add(friendshipPairKey(userA, userB));
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} userA
 * @param {string} userB
 */
export function areFriends(repo, userA, userB) {
  if (!userA || !userB || userA === userB) return false;
  return repo.friendships.has(friendshipPairKey(userA, userB));
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} planId
 */
export function getSharedPlan(repo, planId) {
  return repo.plans.get(planId) ?? null;
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} planId
 */
export function listPlanMembers(repo, planId) {
  return [...(repo.membersByPlan.get(planId) ?? [])];
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {Parameters<typeof createSharedPlan>[0]} input
 */
export function repoCreateSharedPlan(repo, input) {
  const created = createSharedPlan(input);
  if (!created.ok) return created;
  repo.plans.set(created.plan.planId, created.plan);
  repo.membersByPlan.set(created.plan.planId, [created.ownerMember]);
  return created;
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} planId
 * @param {string} actorId
 * @param {'proposal' | 'decided'} nextType
 * @param {{ now?: string | number | Date }} [options]
 */
export function repoMarkPlanDecided(repo, planId, actorId, nextType = 'decided', options = {}) {
  const plan = getSharedPlan(repo, planId);
  if (!plan) return { ok: false, reason: 'plan_not_found' };
  if (plan.ownerId !== actorId) return { ok: false, reason: 'not_owner' };
  const result = transitionSharedPlanType(plan, nextType, options);
  if (!result.ok || !result.plan) return result;
  repo.plans.set(planId, result.plan);
  return result;
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} planId
 * @param {string} actorId
 * @param {'private' | 'invited' | 'friends'} nextVisibility
 * @param {{ now?: string | number | Date }} [options]
 */
export function repoSetPlanVisibility(repo, planId, actorId, nextVisibility, options = {}) {
  const plan = getSharedPlan(repo, planId);
  if (!plan) return { ok: false, reason: 'plan_not_found' };
  const result = transitionSharedPlanVisibility(plan, nextVisibility, {
    actorId,
    now: options.now,
  });
  if (!result.ok || !result.plan) return result;
  // Existing members are preserved (visibility ≠ membership).
  repo.plans.set(planId, result.plan);
  return {
    ...result,
    members: listPlanMembers(repo, planId),
  };
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} planId
 * @param {string} ownerId
 * @param {string} inviteeId
 * @param {{ now?: string | number | Date, requireFriendship?: boolean, inviteMessage?: string | null }} [options]
 */
export function repoInviteFriend(repo, planId, ownerId, inviteeId, options = {}) {
  const plan = getSharedPlan(repo, planId);
  if (!plan) return { ok: false, reason: 'plan_not_found' };
  if (plan.ownerId !== ownerId) return { ok: false, reason: 'not_owner' };
  if (options.requireFriendship !== false && !areFriends(repo, ownerId, inviteeId)) {
    return { ok: false, reason: 'not_friend' };
  }
  const existing = listPlanMembers(repo, planId).find((m) => m.userId === inviteeId);
  if (existing) return { ok: false, reason: 'already_member' };
  const built = buildDirectInviteMember(plan, ownerId, inviteeId, options);
  if (!built.ok || !built.member) return built;
  const members = listPlanMembers(repo, planId);
  members.push(built.member);
  repo.membersByPlan.set(planId, members);
  // Direct invite promotes private → invited (visibility ≠ open-to-all-friends).
  if (plan.visibility === 'private') {
    const next = {
      ...plan,
      visibility: /** @type {'invited'} */ ('invited'),
      updatedAt: built.member.updatedAt,
    };
    repo.plans.set(planId, next);
    return { ok: true, member: built.member, plan: next };
  }
  return { ok: true, member: built.member, plan };
}

/**
 * Invite multiple friends in one pass (mirrors invite_friends_to_shared_plan RPC).
 *
 * @param {SharedPlanRepositoryState} repo
 * @param {string} planId
 * @param {string} ownerId
 * @param {string[]} inviteeIds
 * @param {{ now?: string | number | Date, inviteMessage?: string | null }} [options]
 */
export function repoInviteFriends(repo, planId, ownerId, inviteeIds, options = {}) {
  /** @type {import('./sharedPlanModel.js').PlanMember[]} */
  const invited = [];
  /** @type {Array<{ userId: string | null, reason: string }>} */
  const skipped = [];
  const ids = Array.isArray(inviteeIds) ? inviteeIds : [];
  for (const inviteeId of ids) {
    const result = repoInviteFriend(repo, planId, ownerId, inviteeId, options);
    if (result.ok && result.member) {
      invited.push(result.member);
    } else {
      skipped.push({
        userId: typeof inviteeId === 'string' ? inviteeId : null,
        reason: result.reason || 'invalid_invitees',
      });
    }
  }
  return {
    ok: true,
    plan: getSharedPlan(repo, planId),
    invited,
    skipped,
  };
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} planId
 * @param {string} userId
 * @param {{ now?: string | number | Date }} [options]
 */
export function repoJoinOpenPlan(repo, planId, userId, options = {}) {
  const plan = getSharedPlan(repo, planId);
  if (!plan) return { ok: false, reason: 'plan_not_found' };
  if (listPlanMembers(repo, planId).some((m) => m.userId === userId)) {
    return { ok: false, reason: 'already_member', plan };
  }
  const built = buildOpenJoinMember(plan, userId, {
    isFriendOfOwner: areFriends(repo, plan.ownerId, userId),
    now: options.now,
  });
  if (!built.ok || !built.member) return built;
  const members = listPlanMembers(repo, planId);
  members.push(built.member);
  repo.membersByPlan.set(planId, members);
  // Same canonical plan identity — never clone.
  return { ok: true, member: built.member, plan };
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} planId
 * @param {string} userId
 * @param {import('./sharedPlanModel.js').PlanMember['response']} response
 * @param {{ now?: string | number | Date }} [options]
 */
export function repoRespondToPlan(repo, planId, userId, response, options = {}) {
  const plan = getSharedPlan(repo, planId);
  if (!plan) return { ok: false, reason: 'plan_not_found' };
  const members = listPlanMembers(repo, planId);
  const index = members.findIndex((m) => m.userId === userId);
  if (index < 0) return { ok: false, reason: 'not_member' };
  const next = transitionPlanMemberResponse(members[index], response, {
    planType: plan.type,
    now: options.now,
  });
  if (!next.ok || !next.member) return next;
  members[index] = next.member;
  repo.membersByPlan.set(planId, members);
  return { ok: true, member: next.member, plan };
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} planId
 * @param {string} userId
 */
export function repoLeavePlan(repo, planId, userId) {
  const plan = getSharedPlan(repo, planId);
  if (!plan) return { ok: false, reason: 'plan_not_found' };
  if (plan.ownerId === userId) {
    // Owner leave/delete is a separate product action; not implemented as RSVP leave.
    return { ok: false, reason: 'invalid_transition' };
  }
  const members = listPlanMembers(repo, planId);
  const next = members.filter((m) => m.userId !== userId);
  if (next.length === members.length) return { ok: false, reason: 'not_member' };
  repo.membersByPlan.set(planId, next);
  return { ok: true, plan, members: next };
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} viewerId
 * @param {{ includeMaybe?: boolean }} [options]
 */
export function repoListPendingInvitationsForUser(repo, viewerId) {
  /** @type {Array<{ plan: import('./sharedPlanModel.js').SharedPlan, member: import('./sharedPlanModel.js').PlanMember }>} */
  const out = [];
  for (const [planId, members] of repo.membersByPlan.entries()) {
    const member = members.find(
      (m) =>
        m.userId === viewerId &&
        m.role === 'invitee' &&
        m.response === 'pending',
    );
    if (!member) continue;
    const plan = getSharedPlan(repo, planId);
    if (!plan) continue;
    out.push({ plan, member });
  }
  return out;
}

/**
 * Active shared plans for Planner projection (owner + positive/maybe).
 * Declined excluded. Never clones into AcceptedPlanItem.
 *
 * @param {SharedPlanRepositoryState} repo
 * @param {string} viewerId
 */
export function repoListActiveSharedPlansForUser(repo, viewerId) {
  /** @type {Array<{ plan: import('./sharedPlanModel.js').SharedPlan, member: import('./sharedPlanModel.js').PlanMember }>} */
  const out = [];
  for (const [planId, members] of repo.membersByPlan.entries()) {
    const member = members.find((m) => m.userId === viewerId);
    if (!member) continue;
    if (
      member.role !== 'owner' &&
      member.response !== 'interested' &&
      member.response !== 'maybe' &&
      member.response !== 'going'
    ) {
      continue;
    }
    const plan = getSharedPlan(repo, planId);
    if (!plan) continue;
    out.push({ plan, member });
  }
  return out;
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} viewerId
 */
export function repoListInvitationsForUser(repo, viewerId) {
  /** @type {Array<{ plan: import('./sharedPlanModel.js').SharedPlan, member: import('./sharedPlanModel.js').PlanMember }>} */
  const out = [];
  for (const [planId, members] of repo.membersByPlan.entries()) {
    const member = members.find(
      (m) => m.userId === viewerId && m.role === 'invitee',
    );
    if (!member) continue;
    const plan = getSharedPlan(repo, planId);
    if (!plan) continue;
    out.push({ plan, member });
  }
  return out;
}

/**
 * Open friend-visible plans the viewer may discover (not already a member).
 *
 * @param {SharedPlanRepositoryState} repo
 * @param {string} viewerId
 */
export function repoListOpenFriendVisiblePlans(repo, viewerId) {
  /** @type {import('./sharedPlanModel.js').SharedPlan[]} */
  const out = [];
  for (const plan of repo.plans.values()) {
    const members = listPlanMembers(repo, plan.planId);
    const isMember = members.some((m) => m.userId === viewerId);
    if (
      isFriendVisibleOpenPlan(plan, viewerId, {
        isFriendOfOwner: areFriends(repo, plan.ownerId, viewerId),
        isMember,
      })
    ) {
      out.push(plan);
    }
  }
  return out;
}

/**
 * @param {SharedPlanRepositoryState} repo
 * @param {string} planId
 * @param {string} viewerId
 */
export function repoCanViewerSeePlan(repo, planId, viewerId) {
  const plan = getSharedPlan(repo, planId);
  if (!plan) return false;
  const members = listPlanMembers(repo, planId);
  return canViewerSeeSharedPlan(plan, members, viewerId, {
    isFriendOfOwner: areFriends(repo, plan.ownerId, viewerId),
  });
}

/**
 * Viewer-scoped get: plan body when discoverable, membership only when
 * the viewer is owner or an actual member (not a non-member friend discoverer).
 *
 * @param {SharedPlanRepositoryState} repo
 * @param {string} planId
 * @param {string} viewerId
 * @returns {{
 *   ok: true,
 *   plan: import('./sharedPlanModel.js').SharedPlan,
 *   members: import('./sharedPlanModel.js').PlanMember[],
 * } | { ok: false, reason: string }}
 */
export function repoGetSharedPlanForViewer(repo, planId, viewerId) {
  if (!repoCanViewerSeePlan(repo, planId, viewerId)) {
    return { ok: false, reason: 'plan_not_found' };
  }
  const plan = getSharedPlan(repo, planId);
  if (!plan) return { ok: false, reason: 'plan_not_found' };
  const members = listPlanMembers(repo, planId);
  return {
    ok: true,
    plan,
    members: projectSharedPlanMembersForViewer(plan, members, viewerId),
  };
}

/**
 * Private plans must never appear in friend-visible listings.
 *
 * @param {SharedPlanRepositoryState} repo
 * @param {string} viewerId
 */
export function repoAssertPrivatePlansHiddenFromOpenFeed(repo, viewerId) {
  return repoListOpenFriendVisiblePlans(repo, viewerId).every(
    (plan) => plan.visibility === 'friends',
  );
}

export {
  normalizeSharedPlan,
  normalizePlanMember,
};
