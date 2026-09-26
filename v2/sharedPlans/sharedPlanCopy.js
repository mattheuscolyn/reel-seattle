/**
 * Shared-plan copy helpers — user-facing vocabulary + companion line.
 */

export const SHARED_PLAN_DETAIL_SURFACE_TYPE = 'shared-plan-detail';

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
 * - include interested / maybe / going
 * - first remaining display name + optional +N
 *
 * @param {{
 *   ownerId: string | null | undefined,
 *   viewerId?: string | null,
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
      if (!row || !isPositiveSharedPlanResponse(row.response)) continue;
      push(row.userId, row.displayName);
    }
  } else if (Array.isArray(input?.members)) {
    for (const row of input.members) {
      if (!row || !isPositiveSharedPlanResponse(row.response)) continue;
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
 * Format a plan date for the detail header.
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
