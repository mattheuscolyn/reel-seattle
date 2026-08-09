/**
 * Compose Planner landing presentation from accepted plans (honest production).
 * Mockup fixtures are never injected here.
 */

import { getAcceptedPlans } from '../stores/acceptedPlansStore.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import {
  formatLongPlanDateLabel,
  partitionAcceptedPlans,
} from './planLifecycle.js';

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
 * @param {string} [timeFormatId]
 */
function formatClockLabel(localTime, timeFormatId = '12h') {
  if (!localTime || typeof localTime !== 'string') return null;
  const formatted = formatDisplayClock(localTime, timeFormatId);
  return formatted || null;
}

/**
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanItem} plan
 * @param {string} [timeFormatId]
 */
function toPlanRow(plan, timeFormatId = '12h') {
  const perfs = Array.isArray(plan.performances) ? plan.performances : [];
  const first = perfs[0] ?? null;
  const titles = perfs.map((p) => p.title).filter(Boolean);
  const title =
    plan.label?.trim() ||
    (titles.length > 1 ? titles.join(' + ') : titles[0]) ||
    'Your Movie Day Plan';
  const theaters = [
    ...new Set(perfs.map((p) => p.theaterName).filter(Boolean)),
  ];
  let venueLabel = null;
  if (theaters.length === 1) venueLabel = theaters[0];
  else if (theaters.length > 1) {
    venueLabel = `${theaters[0]} · ${theaters.length} theaters`;
  }
  const whenLabel = formatWhenLabel(
    plan.date || first?.localDate,
    formatClockLabel(first?.localTime, timeFormatId) ?? first?.localTime,
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
    planId: plan.planId,
    title,
    venueLabel,
    whenLabel,
    dateLabel: formatLongPlanDateLabel(plan.date) || plan.date || null,
    imageUrl: first?.posterUrl ?? null,
    filmCount: perfs.length,
    badges,
  };
}

/**
 * @param {string} isoDate YYYY-MM-DD
 * @param {string | null | undefined} localTime
 * @param {Date} now
 * @param {string} [timeFormatId]
 */
function nextPlanSummary(isoDate, localTime, now, timeFormatId = '12h') {
  if (!isoDate) {
    return { nextPlanValue: '—', nextPlanLabel: 'No next plan' };
  }
  const today = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  });
  const clock = formatClockLabel(localTime, timeFormatId);
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
 *   timeFormatId?: string,
 * }} [options]
 */
export function composePlannerLandingFromAcceptedPlans(options = {}) {
  const storage =
    options.storage ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  const now = options.now ?? new Date();
  const timeFormatId =
    typeof options.timeFormatId === 'string' && options.timeFormatId
      ? options.timeFormatId
      : '12h';
  const { upcoming, past } = partitionAcceptedPlans(
    getAcceptedPlans(storage),
    now,
  );

  const upcomingRows = upcoming.map((plan) => toPlanRow(plan, timeFormatId));
  const pastRows = past.map((plan) => toPlanRow(plan, timeFormatId));
  const next = upcoming[0] ?? null;
  const nextSummary = nextPlanSummary(
    next?.date ?? next?.performances?.[0]?.localDate,
    next?.performances?.[0]?.localTime,
    now,
    timeFormatId,
  );

  return {
    source: 'accepted-plans',
    pageTitle: 'Planner',
    pageTagline: 'See what’s ahead or plan your next movie day.',
    summary: {
      upcomingCount: upcoming.length,
      draftCount: 0,
      nextPlanValue: upcoming.length ? nextSummary.nextPlanValue : '—',
      nextPlanLabel: upcoming.length
        ? nextSummary.nextPlanLabel
        : 'No next plan',
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
      emptyTitle: upcoming.length === 0 ? 'No upcoming plans yet' : null,
      emptyBody:
        upcoming.length === 0
          ? 'Accepted plans will appear here. Build a Plan to get started.'
          : null,
      plans: upcomingRows.slice(0, 5),
    },
    past: {
      sectionTitle: 'Past Plans',
      viewAllLabel: past.length > 3 ? 'Show all' : null,
      emptyTitle: null,
      emptyBody: null,
      plans: pastRows,
      previewCount: 3,
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
