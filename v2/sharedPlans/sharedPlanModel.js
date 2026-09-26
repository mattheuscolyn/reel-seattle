/**
 * Shared social-planning domain model (foundation).
 *
 * One SharedPlan type supports solo private plans, proposals, decided outings,
 * direct invites, and friend-visible open invites. Membership is separate from
 * visibility. Exact screening identity reuses AcceptedPlanPerformance keys.
 *
 * Friends graph and personal AcceptedPlanItem stores remain unchanged.
 */

import { buildPerformanceKey } from '../../src/utils/performanceIdentity.js';

export const SHARED_PLAN_SCHEMA_VERSION = 1;

/** @type {readonly ['proposal', 'decided']} */
export const SHARED_PLAN_TYPES = Object.freeze(['proposal', 'decided']);

/** @type {readonly ['private', 'invited', 'friends']} */
export const SHARED_PLAN_VISIBILITIES = Object.freeze([
  'private',
  'invited',
  'friends',
]);

/**
 * Owner is authoritative editor. Invitee was directly invited.
 * Participant joined (typically via friends-visible open invite) or remains
 * after invitation semantics are no longer the primary label.
 * @type {readonly ['owner', 'invitee', 'participant']}
 */
export const PLAN_MEMBER_ROLES = Object.freeze([
  'owner',
  'invitee',
  'participant',
]);

/**
 * Proposal-oriented: pending / interested / maybe / declined.
 * Decided-oriented: pending / going / declined (interested/maybe still valid
 * historically after proposal→decided until the member updates).
 * @type {readonly ['pending', 'interested', 'maybe', 'going', 'declined']}
 */
export const PLAN_MEMBER_RESPONSES = Object.freeze([
  'pending',
  'interested',
  'maybe',
  'going',
  'declined',
]);

export const SHARED_PLAN_ERROR_REASONS = Object.freeze([
  'not_authenticated',
  'invalid_plan',
  'invalid_screening',
  'invalid_transition',
  'not_owner',
  'not_member',
  'not_friend',
  'plan_not_found',
  'member_not_found',
  'already_member',
  'cannot_invite_self',
  'visibility_forbidden',
  'empty_screenings',
]);

/**
 * @typedef {import('../stores/acceptedPlansStore.js').AcceptedPlanPerformance} SharedPlanScreening
 */

/**
 * @typedef {{
 *   planId: string,
 *   ownerId: string,
 *   type: 'proposal' | 'decided',
 *   visibility: 'private' | 'invited' | 'friends',
 *   label: string | null,
 *   date: string | null,
 *   timezone: string,
 *   screenings: SharedPlanScreening[],
 *   sourceAcceptedPlanId: string | null,
 *   schemaVersion: number,
 *   createdAt: string,
 *   updatedAt: string,
 * }} SharedPlan
 */

/**
 * @typedef {{
 *   planId: string,
 *   userId: string,
 *   role: 'owner' | 'invitee' | 'participant',
 *   response: 'pending' | 'interested' | 'maybe' | 'going' | 'declined',
 *   invitedBy: string | null,
 *   inviteMessage: string | null,
 *   joinedAt: string | null,
 *   updatedAt: string,
 * }} PlanMember
 */

/** Max plain-text invitation message length (matches DB constraint). */
export const SHARED_PLAN_INVITE_MESSAGE_MAX = 280;

/**
 * RSVP responses allowed for a plan type (excludes initial `pending`).
 * @param {'proposal' | 'decided' | null | undefined} planType
 * @param {string | null | undefined} response
 */
export function isValidResponseForPlanType(planType, response) {
  if (typeof response !== 'string' || !response) return false;
  if (planType === 'proposal') {
    return response === 'interested' || response === 'maybe' || response === 'declined';
  }
  if (planType === 'decided') {
    return response === 'going' || response === 'declined';
  }
  return false;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeInviteMessage(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > SHARED_PLAN_INVITE_MESSAGE_MAX) {
    return trimmed.slice(0, SHARED_PLAN_INVITE_MESSAGE_MAX);
  }
  return trimmed;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asOptionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asIso(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * @param {string | number | Date} [now]
 */
export function sharedPlanNowIso(now = Date.now()) {
  const ms =
    now instanceof Date
      ? now.getTime()
      : typeof now === 'number'
        ? now
        : Date.parse(String(now));
  return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();
}

/**
 * Stable shared-plan id. Prefer UUID when creating network plans.
 * Local/test helpers may pass an explicit id.
 *
 * @param {{ randomUUID?: () => string }} [options]
 */
export function createSharedPlanId(options = {}) {
  if (typeof options.randomUUID === 'function') {
    return `shared:${options.randomUUID()}`;
  }
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `shared:${crypto.randomUUID()}`;
  }
  return `shared:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {unknown} raw
 * @returns {SharedPlanScreening | null}
 */
export function normalizeSharedPlanScreening(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const performanceKey =
    asOptionalString(row.performanceKey) ??
    buildPerformanceKey({
      source: row.source,
      sourceShowtimeId: row.sourceShowtimeId ?? row.source_showtime_id,
      theaterId: row.theaterId ?? row.theater_id,
      opportunityKey: row.opportunityKey,
      filmKey: row.filmKey ?? row.showtimeFilmKey,
      localDate: row.localDate ?? row.date,
      localTime: row.localTime ?? row.time,
    });
  if (!performanceKey) return null;

  const localDate = asOptionalString(row.localDate) ?? asOptionalString(row.date);
  const localTime = asOptionalString(row.localTime) ?? asOptionalString(row.time);
  const theaterId = asOptionalString(row.theaterId) ?? asOptionalString(row.theater_id);
  const title = asOptionalString(row.title);
  if (!localDate || !localTime || !theaterId || !title) return null;

  const startsAt = asIso(row.startsAt) ?? `${localDate}T${localTime}:00`;
  const expectedEndsAt = asIso(row.expectedEndsAt) ?? startsAt;
  const runtimeMin =
    typeof row.runtimeMin === 'number' && Number.isFinite(row.runtimeMin)
      ? Math.max(0, Math.round(row.runtimeMin))
      : 0;

  return {
    performanceKey,
    filmId: asOptionalString(row.filmId),
    filmKey: asOptionalString(row.filmKey),
    parentFilmKey: asOptionalString(row.parentFilmKey) ?? undefined,
    title,
    theaterId,
    theaterName: asOptionalString(row.theaterName) ?? theaterId,
    source: asOptionalString(row.source),
    sourceShowtimeId: asOptionalString(row.sourceShowtimeId),
    opportunityKey: asOptionalString(row.opportunityKey),
    localDate,
    localTime,
    startsAt,
    expectedEndsAt,
    runtimeMin,
    format: asOptionalString(row.format),
    ticketUrl: asOptionalString(row.ticketUrl),
    addressLabel: asOptionalString(row.addressLabel),
    posterUrl: asOptionalString(row.posterUrl),
    ticketsPurchased: row.ticketsPurchased === true ? true : undefined,
  };
}

/**
 * @param {unknown} raw
 * @returns {SharedPlanScreening[]}
 */
export function normalizeSharedPlanScreenings(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {SharedPlanScreening[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const item of raw) {
    const screening = normalizeSharedPlanScreening(item);
    if (!screening || seen.has(screening.performanceKey)) continue;
    seen.add(screening.performanceKey);
    out.push(screening);
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {SharedPlan | null}
 */
export function normalizeSharedPlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const planId = asOptionalString(row.planId) ?? asOptionalString(row.plan_id);
  const ownerId = asOptionalString(row.ownerId) ?? asOptionalString(row.owner_id);
  const type = asOptionalString(row.type);
  const visibility = asOptionalString(row.visibility);
  if (!planId || !ownerId) return null;
  if (!SHARED_PLAN_TYPES.includes(/** @type {'proposal'|'decided'} */ (type))) {
    return null;
  }
  if (
    !SHARED_PLAN_VISIBILITIES.includes(
      /** @type {'private'|'invited'|'friends'} */ (visibility),
    )
  ) {
    return null;
  }
  const screenings = normalizeSharedPlanScreenings(
    row.screenings ?? row.performances,
  );
  if (screenings.length === 0) return null;

  const createdAt =
    asIso(row.createdAt) ?? asIso(row.created_at) ?? sharedPlanNowIso();
  const updatedAt =
    asIso(row.updatedAt) ?? asIso(row.updated_at) ?? createdAt;

  return {
    planId,
    ownerId,
    type: /** @type {'proposal'|'decided'} */ (type),
    visibility: /** @type {'private'|'invited'|'friends'} */ (visibility),
    label: asOptionalString(row.label),
    date: asOptionalString(row.date) ?? screenings[0]?.localDate ?? null,
    timezone:
      asOptionalString(row.timezone) ?? 'America/Los_Angeles',
    screenings,
    sourceAcceptedPlanId:
      asOptionalString(row.sourceAcceptedPlanId) ??
      asOptionalString(row.source_accepted_plan_id),
    schemaVersion:
      Number.isInteger(row.schemaVersion)
        ? Number(row.schemaVersion)
        : Number.isInteger(row.schema_version)
          ? Number(row.schema_version)
          : SHARED_PLAN_SCHEMA_VERSION,
    createdAt,
    updatedAt,
  };
}

/**
 * @param {unknown} raw
 * @returns {PlanMember | null}
 */
export function normalizePlanMember(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const planId = asOptionalString(row.planId) ?? asOptionalString(row.plan_id);
  const userId = asOptionalString(row.userId) ?? asOptionalString(row.user_id);
  const role = asOptionalString(row.role);
  const response = asOptionalString(row.response);
  if (!planId || !userId) return null;
  if (!PLAN_MEMBER_ROLES.includes(/** @type {*} */ (role))) return null;
  if (!PLAN_MEMBER_RESPONSES.includes(/** @type {*} */ (response))) return null;
  const updatedAt =
    asIso(row.updatedAt) ?? asIso(row.updated_at) ?? sharedPlanNowIso();
  return {
    planId,
    userId,
    role: /** @type {PlanMember['role']} */ (role),
    response: /** @type {PlanMember['response']} */ (response),
    invitedBy:
      asOptionalString(row.invitedBy) ?? asOptionalString(row.invited_by),
    inviteMessage:
      normalizeInviteMessage(row.inviteMessage) ??
      normalizeInviteMessage(row.invite_message),
    joinedAt: asIso(row.joinedAt) ?? asIso(row.joined_at),
    updatedAt,
  };
}

/**
 * @param {{
 *   ownerId: string,
 *   type?: 'proposal' | 'decided',
 *   visibility?: 'private' | 'invited' | 'friends',
 *   screenings: unknown[],
 *   label?: string | null,
 *   date?: string | null,
 *   timezone?: string | null,
 *   sourceAcceptedPlanId?: string | null,
 *   planId?: string | null,
 *   now?: string | number | Date,
 * }} input
 * @returns {{ ok: true, plan: SharedPlan, ownerMember: PlanMember } | { ok: false, reason: string }}
 */
export function createSharedPlan(input) {
  const ownerId = asOptionalString(input?.ownerId);
  if (!ownerId) return { ok: false, reason: 'not_authenticated' };
  const type = input?.type ?? 'proposal';
  const visibility = input?.visibility ?? 'private';
  if (!SHARED_PLAN_TYPES.includes(type)) {
    return { ok: false, reason: 'invalid_plan' };
  }
  if (!SHARED_PLAN_VISIBILITIES.includes(visibility)) {
    return { ok: false, reason: 'invalid_plan' };
  }
  const screenings = normalizeSharedPlanScreenings(input?.screenings);
  if (screenings.length === 0) {
    return { ok: false, reason: 'empty_screenings' };
  }
  const nowIso = sharedPlanNowIso(input?.now);
  const planId = asOptionalString(input?.planId) ?? createSharedPlanId();
  const plan = normalizeSharedPlan({
    planId,
    ownerId,
    type,
    visibility,
    label: input?.label ?? null,
    date: input?.date ?? screenings[0].localDate,
    timezone: input?.timezone ?? 'America/Los_Angeles',
    screenings,
    sourceAcceptedPlanId: input?.sourceAcceptedPlanId ?? null,
    schemaVersion: SHARED_PLAN_SCHEMA_VERSION,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  if (!plan) return { ok: false, reason: 'invalid_plan' };

  const ownerMember = /** @type {PlanMember} */ ({
    planId: plan.planId,
    userId: ownerId,
    role: 'owner',
    response: type === 'decided' ? 'going' : 'interested',
    invitedBy: null,
    inviteMessage: null,
    joinedAt: nowIso,
    updatedAt: nowIso,
  });

  return { ok: true, plan, ownerMember };
}

/**
 * @param {SharedPlan} plan
 * @param {'proposal' | 'decided'} nextType
 * @param {{ now?: string | number | Date }} [options]
 */
export function transitionSharedPlanType(plan, nextType, options = {}) {
  const normalized = normalizeSharedPlan(plan);
  if (!normalized) return { ok: false, reason: 'plan_not_found' };
  if (!SHARED_PLAN_TYPES.includes(nextType)) {
    return { ok: false, reason: 'invalid_transition' };
  }
  if (normalized.type === nextType) {
    return { ok: true, plan: normalized, changed: false };
  }
  // Only proposal → decided is a defined forward transition for v1.
  if (!(normalized.type === 'proposal' && nextType === 'decided')) {
    return { ok: false, reason: 'invalid_transition' };
  }
  const nowIso = sharedPlanNowIso(options.now);
  return {
    ok: true,
    changed: true,
    plan: {
      ...normalized,
      type: 'decided',
      updatedAt: nowIso,
    },
  };
}

/**
 * Visibility changes do not remove existing members.
 *
 * @param {SharedPlan} plan
 * @param {'private' | 'invited' | 'friends'} nextVisibility
 * @param {{ actorId: string, now?: string | number | Date }} options
 */
export function transitionSharedPlanVisibility(plan, nextVisibility, options) {
  const normalized = normalizeSharedPlan(plan);
  if (!normalized) return { ok: false, reason: 'plan_not_found' };
  const actorId = asOptionalString(options?.actorId);
  if (!actorId || actorId !== normalized.ownerId) {
    return { ok: false, reason: 'not_owner' };
  }
  if (!SHARED_PLAN_VISIBILITIES.includes(nextVisibility)) {
    return { ok: false, reason: 'invalid_transition' };
  }
  if (normalized.visibility === nextVisibility) {
    return { ok: true, plan: normalized, changed: false };
  }
  return {
    ok: true,
    changed: true,
    plan: {
      ...normalized,
      visibility: nextVisibility,
      updatedAt: sharedPlanNowIso(options.now),
    },
  };
}

/**
 * @param {SharedPlan} plan
 * @param {PlanMember[]} members
 * @param {string} viewerId
 * @param {{ isFriendOfOwner?: boolean }} [context]
 */
export function canViewerSeeSharedPlan(plan, members, viewerId, context = {}) {
  const normalized = normalizeSharedPlan(plan);
  const viewer = asOptionalString(viewerId);
  if (!normalized || !viewer) return false;
  if (normalized.ownerId === viewer) return true;
  const member = (Array.isArray(members) ? members : [])
    .map(normalizePlanMember)
    .filter(Boolean)
    .find((row) => row && row.userId === viewer);
  if (member) return true;
  if (normalized.visibility === 'friends' && context.isFriendOfOwner === true) {
    return true;
  }
  return false;
}

/**
 * Friend-visible open plans: discoverable by friends of the owner without
 * auto-membership.
 *
 * @param {SharedPlan} plan
 * @param {string} viewerId
 * @param {{ isFriendOfOwner: boolean, isMember?: boolean }} context
 */
export function isFriendVisibleOpenPlan(plan, viewerId, context) {
  const normalized = normalizeSharedPlan(plan);
  const viewer = asOptionalString(viewerId);
  if (!normalized || !viewer) return false;
  if (normalized.visibility !== 'friends') return false;
  if (normalized.ownerId === viewer) return false;
  if (context.isMember === true) return false;
  return context.isFriendOfOwner === true;
}

/**
 * @param {SharedPlan} plan
 * @param {string} ownerId
 * @param {string} inviteeId
 * @param {{ now?: string | number | Date, inviteMessage?: string | null }} [options]
 */
export function buildDirectInviteMember(plan, ownerId, inviteeId, options = {}) {
  const normalized = normalizeSharedPlan(plan);
  const owner = asOptionalString(ownerId);
  const invitee = asOptionalString(inviteeId);
  if (!normalized) return { ok: false, reason: 'plan_not_found' };
  if (!owner || owner !== normalized.ownerId) {
    return { ok: false, reason: 'not_owner' };
  }
  if (!invitee) return { ok: false, reason: 'not_authenticated' };
  if (invitee === owner) return { ok: false, reason: 'cannot_invite_self' };
  const nowIso = sharedPlanNowIso(options.now);
  const inviteMessage = normalizeInviteMessage(options.inviteMessage);
  return {
    ok: true,
    member: /** @type {PlanMember} */ ({
      planId: normalized.planId,
      userId: invitee,
      role: 'invitee',
      response: 'pending',
      invitedBy: owner,
      inviteMessage,
      joinedAt: null,
      updatedAt: nowIso,
    }),
  };
}

/**
 * Join a friends-visible plan as a participant (open invite).
 *
 * @param {SharedPlan} plan
 * @param {string} userId
 * @param {{ isFriendOfOwner: boolean, now?: string | number | Date }} context
 */
export function buildOpenJoinMember(plan, userId, context) {
  const normalized = normalizeSharedPlan(plan);
  const user = asOptionalString(userId);
  if (!normalized) return { ok: false, reason: 'plan_not_found' };
  if (!user) return { ok: false, reason: 'not_authenticated' };
  if (normalized.ownerId === user) return { ok: false, reason: 'already_member' };
  if (normalized.visibility !== 'friends') {
    return { ok: false, reason: 'visibility_forbidden' };
  }
  if (context.isFriendOfOwner !== true) {
    return { ok: false, reason: 'not_friend' };
  }
  const nowIso = sharedPlanNowIso(context.now);
  return {
    ok: true,
    member: /** @type {PlanMember} */ ({
      planId: normalized.planId,
      userId: user,
      role: 'participant',
      response: normalized.type === 'decided' ? 'going' : 'interested',
      invitedBy: null,
      inviteMessage: null,
      joinedAt: nowIso,
      updatedAt: nowIso,
    }),
  };
}

/**
 * @param {PlanMember} member
 * @param {'pending' | 'interested' | 'maybe' | 'going' | 'declined'} nextResponse
 * @param {{ planType?: 'proposal' | 'decided', now?: string | number | Date }} [options]
 */
export function transitionPlanMemberResponse(member, nextResponse, options = {}) {
  const normalized = normalizePlanMember(member);
  if (!normalized) return { ok: false, reason: 'member_not_found' };
  if (!PLAN_MEMBER_RESPONSES.includes(nextResponse)) {
    return { ok: false, reason: 'invalid_transition' };
  }
  if (normalized.role === 'owner' && nextResponse === 'declined') {
    // Owner leaving is a different operation (leave/delete), not RSVP decline.
    return { ok: false, reason: 'invalid_transition' };
  }
  if (
    options.planType &&
    nextResponse !== 'pending' &&
    !isValidResponseForPlanType(options.planType, nextResponse)
  ) {
    return { ok: false, reason: 'invalid_transition' };
  }
  const nowIso = sharedPlanNowIso(options.now);
  const joinedAt =
    normalized.joinedAt ??
    (nextResponse === 'pending' || nextResponse === 'declined'
      ? normalized.joinedAt
      : nowIso);
  return {
    ok: true,
    member: {
      ...normalized,
      response: nextResponse,
      joinedAt,
      updatedAt: nowIso,
    },
  };
}
