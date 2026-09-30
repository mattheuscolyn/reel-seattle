/**
 * Shared-plan copy helpers — user-facing vocabulary + companion line.
 */

/**
 * Canonical Plan Detail destination.
 * Accepted plans (`accepted:`) and shared plans (`shared:`) use this same surface.
 */
export const PLAN_DETAIL_SURFACE_TYPE = 'shared-plan-detail';
export const SHARED_PLAN_DETAIL_SURFACE_TYPE = PLAN_DETAIL_SURFACE_TYPE;

/**
 * Owner-facing / member-facing RSVP label (base vocabulary).
 * @param {string | null | undefined} response
 */
export function formatMemberResponseLabel(response) {
  switch (response) {
    case 'pending':
      return 'Pending';
    case 'interested':
      return 'Interested';
    case 'maybe':
      return 'Maybe';
    case 'going':
      return 'Going';
    case 'declined':
      return 'Can’t go';
    default:
      return response || '—';
  }
}

/**
 * Plan-state badge for header.
 * @param {'proposal' | 'decided' | string | null | undefined} planType
 */
export function sharedPlanStateBadge(planType) {
  if (planType === 'decided') return 'Going';
  if (planType === 'proposal') return 'Proposal';
  return 'Shared plan';
}

/**
 * User-facing RSVP label. Historical interested/maybe on a decided plan
 * become "Needs response" (never silently remapped to Going).
 * @param {string | null | undefined} response
 * @param {'proposal' | 'decided' | null | undefined} [planType]
 */
export function formatSharedPlanResponseLabel(response, planType) {
  if (planType === 'decided' && (response === 'interested' || response === 'maybe')) {
    return 'Needs response';
  }
  return formatMemberResponseLabel(response);
}

/**
 * RSVP controls for the current viewer by plan type.
 * @param {'proposal' | 'decided'} planType
 */
export function sharedPlanRsvpOptions(planType) {
  if (planType === 'decided') {
    return [
      { id: 'going', label: 'Going' },
      { id: 'declined', label: 'Can’t go' },
    ];
  }
  return [
    { id: 'interested', label: 'Interested' },
    { id: 'maybe', label: 'Maybe' },
    { id: 'declined', label: 'Can’t go' },
  ];
}

/**
 * Positive RSVP for companion counting (excludes pending/declined).
 * @param {string | null | undefined} response
 */
export function isPositiveSharedPlanResponse(response) {
  return (
    response === 'interested' ||
    response === 'maybe' ||
    response === 'going'
  );
}

/**
 * Build "With Jamie" / "With Jamie +2" for Planner cards and detail chrome.
 *
 * Rules:
 * - exclude owner
 * - exclude viewer (self)
 * - exclude pending and declined
 * - proposal (default): interested, maybe, and going
 * - decided: going only (historical interested/maybe are not Going)
 * - first remaining display name + optional +N
 *
 * @param {{
 *   ownerId: string | null | undefined,
 *   viewerId?: string | null,
 *   planType?: 'proposal' | 'decided' | string | null,
 *   members?: Array<{
 *     userId: string,
 *     response?: string | null,
 *     role?: string | null,
 *     displayName?: string | null,
 *   }>,
 *   companions?: Array<{
 *     userId: string,
 *     displayName?: string | null,
 *     response?: string | null,
 *   }>,
 * }} input
 * @returns {string | null}
 */
export function formatSharedPlanWithLine(input) {
  const ownerId =
    typeof input?.ownerId === 'string' && input.ownerId.trim()
      ? input.ownerId.trim()
      : null;
  const viewerId =
    typeof input?.viewerId === 'string' && input.viewerId.trim()
      ? input.viewerId.trim()
      : null;
  const decided = input?.planType === 'decided';

  const counts = (response) => {
    if (decided) return response === 'going';
    return isPositiveSharedPlanResponse(response);
  };

  /** @type {Array<{ userId: string, displayName: string }>} */
  const people = [];
  const seen = new Set();

  const push = (userId, displayName) => {
    if (!userId || seen.has(userId)) return;
    if (ownerId && userId === ownerId) return;
    if (viewerId && userId === viewerId) return;
    const name =
      typeof displayName === 'string' && displayName.trim()
        ? displayName.trim()
        : null;
    if (!name) return;
    seen.add(userId);
    people.push({ userId, displayName: name });
  };

  if (Array.isArray(input?.companions)) {
    for (const row of input.companions) {
      if (!row || !counts(row.response)) continue;
      push(row.userId, row.displayName);
    }
  } else if (Array.isArray(input?.members)) {
    for (const row of input.members) {
      if (!row || !counts(row.response)) continue;
      if (row.role === 'owner') continue;
      push(row.userId, row.displayName);
    }
  }

  if (people.length === 0) return null;
  if (people.length === 1) return `With ${people[0].displayName}`;
  return `With ${people[0].displayName} +${people.length - 1}`;
}

/**
 * Title for shared plan chrome / cards.
 * @param {import('./sharedPlanModel.js').SharedPlan | null | undefined} plan
 */
export function sharedPlanDisplayTitle(plan) {
  if (!plan) return 'Shared plan';
  if (plan.label) return plan.label;
  const titles = (plan.screenings ?? []).map((s) => s.title).filter(Boolean);
  if (titles.length === 0) return 'Shared plan';
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} + ${titles[1]}`;
  return `${titles[0]} + ${titles.length - 1} more`;
}

/**
 * Owner-facing sharing line.
 * @param {'private' | 'invited' | 'friends' | string | null | undefined} visibility
 */
export function sharedPlanSharingLabel(visibility) {
  if (visibility === 'friends') return 'All friends can join';
  if (visibility === 'invited') return 'Specific friends';
  return 'Just you';
}

/**
 * Upcoming in America/Los_Angeles. Missing date stays visible.
 * @param {{ date?: string | null }} plan
 * @param {Date} [now]
 */
export function isSharedPlanUpcoming(plan, now = new Date()) {
  if (!plan?.date || typeof plan.date !== 'string') return true;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return plan.date >= today;
}

/**
 * Open Invites card summary. Multi-film plans are not flattened to one title.
 * @param {import('./sharedPlanModel.js').SharedPlan | null | undefined} plan
 */
export function formatOpenInviteCardSummary(plan) {
  const screenings = plan?.screenings ?? [];
  const count = screenings.length;
  const first = screenings[0] ?? null;
  const last = screenings[count - 1] ?? null;
  const title =
    count > 1
      ? `${count}-film plan`
      : plan?.label || first?.title || 'Shared plan';
  const start = first?.localTime || null;
  const end = last?.localTime || null;
  const timeLabel =
    count > 1 && start && end && start !== end ? `${start}–${end}` : start;
  const theaters = [
    ...new Set(screenings.map((row) => row.theaterName).filter(Boolean)),
  ];
  return {
    title,
    dateLabel: formatSharedPlanDateLabel(plan?.date),
    timeLabel,
    venue: theaters.length === 1 ? theaters[0] : null,
    filmCount: count,
  };
}

/**
 * "Jamie +2 are going" — owner plus positive companions. Pending/declined excluded.
 * @param {{
 *   ownerName: string,
 *   companionCount: number,
 *   planType?: string | null,
 * }} input
 */
export function formatOpenInviteSocialLine(input) {
  const name = typeof input?.ownerName === 'string' ? input.ownerName.trim() : '';
  const count = Number(input?.companionCount) || 0;
  if (!name || count < 1) return null;
  if (input?.planType === 'decided') {
    return count === 1 ? `${name} +1 are going` : `${name} +${count} are going`;
  }
  return count === 1 ? `${name} +1 interested` : `${name} +${count} interested`;
}

/**
 * @param {string | null | undefined} isoDate
 */
export function formatSharedPlanDateLabel(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return null;
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    if (!y || !m || !d) return isoDate;
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return isoDate;
  }
}
