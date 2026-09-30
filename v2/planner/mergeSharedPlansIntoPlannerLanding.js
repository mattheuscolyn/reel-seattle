/**
 * Merge shared-plan invitations / participations into Planner landing IA.
 *
 * Pending + maybe → Needs Attention
 * interested / going (non-owner recipient) → Upcoming projection of same planId
 * declined → excluded
 * Owner solo AcceptedPlans remain the owner's upcoming source (unchanged).
 */

import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import { formatSharedPlanWithLine } from '../sharedPlans/sharedPlanCopy.js';
import {
  formatPlanInvitesSummary,
  formatUpcomingScheduleLine,
  listUpcomingAttendees,
} from './plannerUpcomingStatus.js';

/**
 * @param {string | null | undefined} localTime
 * @param {string} timeFormatId
 */
function formatTimeLabel(localTime, timeFormatId) {
  if (!localTime || typeof localTime !== 'string') return '';
  return formatDisplayClock(localTime, timeFormatId) || localTime;
}

/**
 * @param {import('../sharedPlans/sharedPlanModel.js').SharedPlan} plan
 */
function planTitle(plan) {
  if (plan.label) return plan.label;
  const titles = (plan.screenings ?? []).map((s) => s.title).filter(Boolean);
  if (titles.length === 0) return 'Shared plan';
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} + ${titles[1]}`;
  return `${titles[0]} + ${titles.length - 1} more`;
}

/**
 * @param {import('../sharedPlans/sharedPlanModel.js').SharedPlan} plan
 * @param {string} timeFormatId
 */
function planBodyLine(plan, timeFormatId) {
  const first = plan.screenings?.[0];
  if (!first) return '';
  const time = formatTimeLabel(first.localTime, timeFormatId);
  const theater = first.theaterName || first.theaterId || '';
  const multi =
    (plan.screenings?.length ?? 0) > 1
      ? ` · ${plan.screenings.length}-film plan`
      : '';
  return [time, theater].filter(Boolean).join(' · ') + multi;
}

/**
 * @param {import('../sharedPlans/sharedPlanModel.js').SharedPlan} plan
 * @param {string} timeFormatId
 * @param {{
 *   viewerId?: string | null,
 *   companions?: Array<{ userId: string, displayName?: string | null, response?: string | null }>,
 * }} [context]
 */
function attendeesForPlan(plan, context = {}) {
  return listUpcomingAttendees({
    owner: context.owner ?? null,
    viewerId: context.viewerId ?? null,
    planType: plan?.type,
    companions: context.companions,
  });
}

function toSharedPlanGroup(plan, timeFormatId, context = {}) {
  const attendees = attendeesForPlan(plan, context);
  const screenings = (plan.screenings ?? []).map((perf, index) => {
    const timeLabel = formatTimeLabel(perf.localTime, timeFormatId);
    return {
      kind: 'screening',
      id: `${plan.planId}::${perf.performanceKey}`,
      planId: plan.planId,
      sharedPlanId: plan.planId,
      origin: 'shared-plan',
      performanceKey: perf.performanceKey,
      title: perf.title,
      theaterName: perf.theaterName,
      theaterId: perf.theaterId,
      venueLabel: perf.theaterName || perf.theaterId || null,
      localDate: perf.localDate,
      localTime: perf.localTime,
      timeLabel,
      scheduleLabel: formatUpcomingScheduleLine({
        timeLabel,
        localTime: perf.localTime,
        startsAt: perf.startsAt,
        expectedEndsAt: perf.expectedEndsAt,
        runtimeMin: perf.runtimeMin,
        timeFormatId,
      }),
      startsAt: perf.startsAt,
      posterUrl: perf.posterUrl,
      format: perf.format,
      formatLabel: perf.format || null,
      ticketsPurchased: perf.ticketsPurchased === true,
      attendees,
      index,
    };
  });
  const withLine = formatSharedPlanWithLine({
    ownerId: plan.ownerId,
    viewerId: context.viewerId ?? null,
    planType: plan.type,
    companions: context.companions,
  });
  return {
    kind: 'shared-plan-group',
    id: `shared-${plan.planId}`,
    planId: plan.planId,
    sharedPlanId: plan.planId,
    origin: 'shared-plan',
    title: planTitle(plan),
    date: plan.date,
    metaLine: withLine,
    movieCountLabel:
      screenings.length === 1
        ? '1-film plan'
        : `${screenings.length}-film plan`,
    members: screenings,
    startsAt: screenings[0]?.startsAt ?? null,
  };
}

/**
 * @param {{
 *   landing: object,
 *   pendingInvitations?: Array<{
 *     plan: import('../sharedPlans/sharedPlanModel.js').SharedPlan,
 *     member: import('../sharedPlans/sharedPlanModel.js').PlanMember,
 *     owner?: { userId: string, displayName?: string | null, avatarUrl?: string | null } | null,
 *   }>,
 *   activeSharedPlans?: Array<{
 *     plan: import('../sharedPlans/sharedPlanModel.js').SharedPlan,
 *     member: import('../sharedPlans/sharedPlanModel.js').PlanMember,
 *     owner?: { userId: string, displayName?: string | null, avatarUrl?: string | null } | null,
 *   }>,
 *   viewerId?: string | null,
 *   timeFormatId?: string,
 * }} options
 */
export function mergeSharedPlansIntoPlannerLanding(options) {
  const landing = options.landing;
  if (!landing || typeof landing !== 'object') return landing;
  const timeFormatId = options.timeFormatId || '12h';
  const viewerId = options.viewerId ?? null;
  const pending = Array.isArray(options.pendingInvitations)
    ? options.pendingInvitations
    : [];
  const active = Array.isArray(options.activeSharedPlans)
    ? options.activeSharedPlans
    : [];

  const attentionItems = [...(landing.needsAttention?.items ?? [])];

  for (const row of pending) {
    const plan = row.plan;
    const ownerName = row.owner?.displayName?.trim() || 'A friend';
    const message = row.member?.inviteMessage;
    attentionItems.unshift({
      id: `invite-${plan.planId}`,
      kind: 'plan-invite',
      sharedPlanId: plan.planId,
      planId: plan.planId,
      headline: `${ownerName} invited you`,
      body: planBodyLine(plan, timeFormatId),
      inviteMessage: message || null,
      ctaLabel: 'View plan',
      planType: plan.type,
      posterUrls: (plan.screenings ?? [])
        .map((s) => s.posterUrl)
        .filter(Boolean)
        .slice(0, 3),
      dateKey: plan.date,
    });
  }

  // maybe stays in Needs Attention (still deciding).
  for (const row of active) {
    if (row.member?.response !== 'maybe') continue;
    if (viewerId && row.plan.ownerId === viewerId) continue;
    const plan = row.plan;
    const ownerName = row.owner?.displayName?.trim() || 'A friend';
    attentionItems.push({
      id: `maybe-${plan.planId}`,
      kind: 'plan-invite-maybe',
      sharedPlanId: plan.planId,
      planId: plan.planId,
      headline: `Maybe · ${planTitle(plan)}`,
      body: `${ownerName}'s plan · ${planBodyLine(plan, timeFormatId)}`,
      inviteMessage: row.member?.inviteMessage || null,
      ctaLabel: 'Update response',
      planType: plan.type,
      posterUrls: (plan.screenings ?? [])
        .map((s) => s.posterUrl)
        .filter(Boolean)
        .slice(0, 3),
      dateKey: plan.date,
    });
  }

  const dateGroups = (landing.upcoming?.dateGroups ?? []).map((group) => ({
    ...group,
    items: [...(group.items ?? [])],
  }));
  const groupByDate = new Map(dateGroups.map((g) => [g.dateKey, g]));

  for (const row of active) {
    const response = row.member?.response;
    if (response !== 'interested' && response !== 'going') continue;
    // Owner already sees the solo AcceptedPlan; skip duplicate upcoming card.
    if (viewerId && row.plan.ownerId === viewerId) continue;
    const plan = row.plan;
    const dateKey = plan.date || plan.screenings?.[0]?.localDate || 'unknown';
    let group = groupByDate.get(dateKey);
    if (!group) {
      group = {
        id: `day-${dateKey}`,
        dateKey,
        label: dateKey,
        items: [],
      };
      groupByDate.set(dateKey, group);
      dateGroups.push(group);
    }
    // Avoid duplicating if already present.
    if (group.items.some((item) => item.sharedPlanId === plan.planId)) {
      continue;
    }
    group.items.push(
      toSharedPlanGroup(plan, timeFormatId, {
        viewerId,
        companions: row.companions,
        owner: row.owner ?? null,
      }),
    );
  }

  // Owner solo plan-groups: attach "With …" when this AcceptedPlan was shared.
  if (viewerId) {
    for (const row of active) {
      if (row.plan?.ownerId !== viewerId) continue;
      const sourceId = row.plan.sourceAcceptedPlanId;
      if (!sourceId) continue;
      const withLine = formatSharedPlanWithLine({
        ownerId: row.plan.ownerId,
        viewerId,
        planType: row.plan.type,
        companions: row.companions,
      });
      const attendees = attendeesForPlan(row.plan, {
        viewerId,
        companions: row.companions,
        owner: row.owner ?? { userId: row.plan.ownerId },
      });
      for (const group of dateGroups) {
        for (const item of group.items) {
          if (
            (item.kind !== 'plan-group' && item.kind !== 'screening') ||
            item.planId !== sourceId
          ) {
            continue;
          }
          item.sharedPlanId = row.plan.planId;
          if (withLine && !item.metaLine) item.metaLine = withLine;
          if (attendees.length > 0) {
            item.attendees = attendees;
            if (Array.isArray(item.members)) {
              for (const member of item.members) member.attendees = attendees;
            }
          }
        }
      }
    }
  }

  dateGroups.sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));

  return {
    ...landing,
    source: landing.source || 'accepted-plans',
    needsAttention: {
      ...landing.needsAttention,
      sectionTitle: landing.needsAttention?.sectionTitle || 'NEEDS ATTENTION',
      items: attentionItems,
      count: attentionItems.length,
    },
    upcoming: {
      ...landing.upcoming,
      dateGroups,
      totalDateGroupCount: dateGroups.length,
      emptyTitle:
        dateGroups.length === 0
          ? landing.upcoming?.emptyTitle ?? 'No upcoming screenings yet'
          : null,
      emptyBody:
        dateGroups.length === 0 ? landing.upcoming?.emptyBody ?? null : null,
    },
    planInvites: formatPlanInvitesSummary(pending),
    summary: {
      ...landing.summary,
      sharedInviteCount: pending.length,
      sharedActiveCount: active.filter(
        (row) =>
          row.member?.response === 'interested' ||
          row.member?.response === 'going' ||
          row.member?.response === 'maybe',
      ).length,
    },
  };
}

/**
 * Response chips for a plan type.
 * @param {'proposal' | 'decided'} planType
 */
export { sharedPlanRsvpOptions, formatMemberResponseLabel } from '../sharedPlans/sharedPlanCopy.js';
