/**
 * Upcoming card status + Plan invites summary.
 * Presentation only: ticket marks and invite rows stay on the existing models.
 */

import { formatRuntimeLabel } from '../home/shelfData.js';
import { isPositiveSharedPlanResponse } from '../sharedPlans/sharedPlanCopy.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';

const VISIBLE_ATTENDEE_AVATARS = 2;

/**
 * @param {string | null | undefined} value
 */
function cleanName(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * @param {number | null} ms
 * @param {string} timeFormatId
 */
function formatInstantClock(ms, timeFormatId) {
  if (ms == null || !Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit',
      hour12: timeFormatId !== '24h',
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

/**
 * Start–end and runtime for an upcoming card. Missing end or runtime is omitted.
 * Does not invent a default runtime.
 *
 * @param {{
 *   timeLabel?: string | null,
 *   localTime?: string | null,
 *   startsAt?: string | null,
 *   expectedEndsAt?: string | null,
 *   runtimeMin?: number | null,
 *   timeFormatId?: string,
 * }} input
 * @returns {string | null}
 */
export function formatUpcomingScheduleLine(input) {
  const timeFormatId = input?.timeFormatId || '12h';
  const start =
    cleanName(input?.timeLabel) ||
    (input?.localTime
      ? formatDisplayClock(input.localTime, timeFormatId) || null
      : null);
  if (!start) return null;

  const runtime = Number(input?.runtimeMin);
  const hasRuntime = Number.isFinite(runtime) && runtime > 0;
  const startMs = input?.startsAt ? Date.parse(input.startsAt) : NaN;
  const endMsRaw = input?.expectedEndsAt ? Date.parse(input.expectedEndsAt) : NaN;
  let endMs = null;
  if (
    Number.isFinite(startMs) &&
    Number.isFinite(endMsRaw) &&
    endMsRaw > startMs + 60_000
  ) {
    endMs = endMsRaw;
  } else if (hasRuntime && Number.isFinite(startMs)) {
    endMs = startMs + runtime * 60_000;
  }

  const endLabel = formatInstantClock(endMs, timeFormatId);
  const runtimeLabel = hasRuntime ? formatRuntimeLabel(runtime) : null;
  let line = endLabel ? `${start} \u2013 ${endLabel}` : start;
  if (runtimeLabel) line = `${line} (${runtimeLabel})`;
  return line;
}

/**
 * People shown in the attendance column.
 * Includes the organizer when the viewer is not the owner, plus companions
 * with a positive response. Excludes the viewer, pending, and declined.
 *
 * @param {{
 *   owner?: { userId?: string | null, displayName?: string | null, avatarUrl?: string | null } | null,
 *   viewerId?: string | null,
 *   planType?: string | null,
 *   companions?: Array<{
 *     userId?: string | null,
 *     displayName?: string | null,
 *     avatarUrl?: string | null,
 *     response?: string | null,
 *   }>,
 * }} input
 */
export function listUpcomingAttendees(input) {
  const viewerId = cleanName(input?.viewerId);
  const decided = input?.planType === 'decided';
  const counts = (response) =>
    decided ? response === 'going' : isPositiveSharedPlanResponse(response);
  /** @type {Array<{ userId: string, displayName: string, avatarUrl: string | null }>} */
  const people = [];
  const seen = new Set();

  const push = (userId, displayName, avatarUrl) => {
    const id = cleanName(userId);
    const name = cleanName(displayName);
    if (!id || !name || seen.has(id)) return;
    if (viewerId && id === viewerId) return;
    seen.add(id);
    people.push({
      userId: id,
      displayName: name,
      avatarUrl: cleanName(avatarUrl),
    });
  };

  const owner = input?.owner;
  if (owner) push(owner.userId, owner.displayName, owner.avatarUrl);

  for (const row of input?.companions ?? []) {
    if (!row || !counts(row.response)) continue;
    push(row.userId, row.displayName, row.avatarUrl);
  }
  return people;
}

/**
 * @param {Array<{ userId?: string, displayName?: string, avatarUrl?: string | null }> | null | undefined} people
 */
export function upcomingAttendance(people) {
  const list = Array.isArray(people) ? people.filter((person) => cleanName(person?.displayName)) : [];
  if (list.length === 0) {
    return { mode: 'solo', people: [], overflow: 0 };
  }
  const visible = list.slice(0, VISIBLE_ATTENDEE_AVATARS);
  return {
    mode: 'friends',
    people: visible,
    overflow: Math.max(0, list.length - visible.length),
  };
}

/**
 * @param {boolean | null | undefined} ticketsPurchased
 */
export function upcomingTicketLabel(ticketsPurchased) {
  return ticketsPurchased === true ? 'Tickets purchased' : 'Tickets needed';
}

/**
 * Outstanding invitations are pending invites, not maybe/going responses.
 *
 * @param {Array<{
 *   plan?: { planId?: string | null } | null,
 *   owner?: { userId?: string | null, displayName?: string | null } | null,
 * }> | null | undefined} pendingInvitations
 */
export function formatPlanInvitesSummary(pendingInvitations) {
  const rows = Array.isArray(pendingInvitations) ? pendingInvitations : [];
  const planIds = rows
    .map((row) => cleanName(row?.plan?.planId))
    .filter(Boolean);
  if (planIds.length === 0) return null;

  /** @type {string[]} */
  const names = [];
  const seen = new Set();
  for (const row of rows) {
    const name = cleanName(row?.owner?.displayName);
    const key = cleanName(row?.owner?.userId) || name;
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  const count = planIds.length;
  const planWord = count === 1 ? 'a plan' : 'plans';
  let who;
  if (names.length === 0) {
    who = count === 1 ? 'A friend' : `${count} friends`;
  } else if (names.length === 1) {
    who = names[0];
  } else if (names.length === 2) {
    who = `${names[0]} and ${names[1]}`;
  } else {
    who = `${names[0]}, ${names[1]}, and ${names.length - 2} more`;
  }

  return {
    count,
    title: 'Plan invites',
    subtitle: `${who} invited you to ${planWord}.`,
    planIds,
  };
}

/**
 * One pending invite opens that plan. Several open the existing invite list.
 *
 * @param {ReturnType<typeof formatPlanInvitesSummary>} summary
 */
export function planInvitesNavigation(summary) {
  if (!summary || summary.count < 1 || !summary.planIds?.length) return null;
  if (summary.planIds.length === 1) {
    return { kind: 'plan', planId: summary.planIds[0] };
  }
  return { kind: 'list', planIds: [...summary.planIds] };
}
