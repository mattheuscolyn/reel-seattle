/**
 * Compose Planner landing presentation from accepted plans (honest production).
 * Mockup fixtures are never injected here.
 */

import { getAcceptedPlans } from '../stores/acceptedPlansStore.js';

/**
 * @param {string} isoDate
 * @param {string} localTime
 */
function formatWhenLabel(isoDate, localTime) {
  if (!isoDate) return localTime || null;
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    const datePart = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date);
    return localTime ? `${datePart} · ${localTime}` : datePart;
  } catch {
    return localTime || isoDate;
  }
}

/**
 * @param {string} localTime HH:MM or display
 */
function formatClockLabel(localTime) {
  if (!localTime || typeof localTime !== 'string') return null;
  const trimmed = localTime.trim();
  if (/[ap]m/i.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return trimmed;
  let hour = Number(match[1]);
  const min = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${min} ${suffix}`;
}

/**
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanItem} plan
 */
function toUpcomingRow(plan) {
  const perfs = Array.isArray(plan.performances) ? plan.performances : [];
  const first = perfs[0] ?? null;
  const titles = perfs.map((p) => p.title).filter(Boolean);
  const title =
    plan.label?.trim() ||
    (titles.length > 1 ? titles.join(' + ') : titles[0]) ||
    'Scheduled plan';
  const venueLabel = first?.theaterName ?? null;
  const whenLabel = formatWhenLabel(
    plan.date || first?.localDate,
    formatClockLabel(first?.localTime) ?? first?.localTime,
  );
  const badges = [];
  if (perfs.length >= 2) {
    badges.push({
      id: `${plan.planId}-multi`,
      label: `${perfs.length}-film plan`,
      tone: 'teal',
    });
  } else if (perfs.length === 1) {
    badges.push({
      id: `${plan.planId}-single`,
      label: 'Single film',
      tone: 'purple',
    });
  }
  return {
    id: plan.planId,
    title,
    venueLabel,
    whenLabel,
    imageUrl: first?.posterUrl ?? null,
    badges,
  };
}

/**
 * @param {string} isoDate YYYY-MM-DD
 * @param {Date} now
 */
function nextPlanSummary(isoDate, localTime, now) {
  if (!isoDate) {
    return { nextPlanValue: '—', nextPlanLabel: 'No next plan' };
  }
  const today = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  });
  const clock = formatClockLabel(localTime);
  if (isoDate === today) {
    return {
      nextPlanValue: 'Tonight',
      nextPlanLabel: clock ? `Next plan ${clock}` : 'Next plan today',
    };
  }
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    const short = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date);
    return {
      nextPlanValue: short,
      nextPlanLabel: clock ? `Next plan ${clock}` : 'Next plan',
    };
  } catch {
    return {
      nextPlanValue: isoDate,
      nextPlanLabel: clock ? `Next plan ${clock}` : 'Next plan',
    };
  }
}

/**
 * @param {{
 *   storage?: Storage | null,
 *   now?: Date,
 * }} [options]
 */
export function composePlannerLandingFromAcceptedPlans(options = {}) {
  const storage =
    options.storage ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  const now = options.now ?? new Date();
  const plans = getAcceptedPlans(storage)
    .slice()
    .sort((a, b) => {
      const aKey = `${a.date}|${a.performances?.[0]?.localTime ?? ''}`;
      const bKey = `${b.date}|${b.performances?.[0]?.localTime ?? ''}`;
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    });

  const upcomingRows = plans.map(toUpcomingRow);
  const next = plans[0] ?? null;
  const nextSummary = nextPlanSummary(
    next?.date ?? next?.performances?.[0]?.localDate,
    next?.performances?.[0]?.localTime,
    now,
  );

  return {
    source: 'accepted-plans',
    pageTitle: 'Planner',
    pageTagline: 'See what’s ahead or plan your next movie day.',
    summary: {
      upcomingCount: plans.length,
      draftCount: 0,
      nextPlanValue: plans.length ? nextSummary.nextPlanValue : '—',
      nextPlanLabel: plans.length ? nextSummary.nextPlanLabel : 'No next plan',
    },
    entries: [
      {
        id: 'my-schedule',
        title: 'My Schedule',
        description: 'See your week, month, and all scheduled movie plans.',
        accent: 'purple',
        icon: 'schedule',
      },
      {
        id: 'build-a-plan',
        title: 'Build a Plan',
        description:
          'Choose films, tune preferences, and generate great itineraries.',
        accent: 'teal',
        icon: 'build',
      },
    ],
    upcoming: {
      sectionTitle: 'Upcoming Plans',
      viewAllLabel: 'View all',
      emptyTitle: plans.length === 0 ? 'No upcoming plans yet' : null,
      emptyBody:
        plans.length === 0
          ? 'Accepted plans will appear here. Build a Plan to get started.'
          : null,
      plans: upcomingRows.slice(0, 5),
    },
    // No draft persistence in this shell — omit the card on the normal route.
    draft: {
      visible: false,
      eyebrow: null,
      title: null,
      metaLabel: null,
    },
  };
}
