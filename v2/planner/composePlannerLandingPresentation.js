/**
 * Compose Planner landing presentation from accepted plans (honest production).
 * Mockup fixtures are never injected here.
 *
 * Presentation model matches Canonical Mockup Images/Planner Main Page Upcoming.png:
 * Needs Attention conflicts + chronologically grouped upcoming screenings.
 */

import { getAcceptedPlans } from '../stores/acceptedPlansStore.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import { partitionAcceptedPlans } from './planLifecycle.js';
import {
  findConflictClusters,
  formatConflictBody,
} from './plannerScreeningOverlap.js';

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
 * @param {string | null | undefined} iso
 * @returns {number | null}
 */
function parseMs(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {string | null | undefined} isoInstant
 * @param {Date} [fallback]
 */
function formatAddedLabel(isoInstant, fallback = new Date()) {
  const ms = parseMs(isoInstant);
  const date = ms != null ? new Date(ms) : fallback;
  try {
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
    }).format(date);
    return `Added ${label}`;
  } catch {
    return 'Added';
  }
}

/**
 * @param {string} isoDate YYYY-MM-DD
 * @param {string} todayIso
 */
function formatDateGroupLabel(isoDate, todayIso) {
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
    })
      .format(date)
      .toUpperCase();
    const rest = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    })
      .format(date)
      .toUpperCase();
    if (isoDate === todayIso) {
      return `TODAY • ${weekday}, ${rest}`;
    }
    return `${weekday}, ${rest}`;
  } catch {
    return isoDate;
  }
}

/**
 * @param {string} isoDate
 */
function weekdayLong(isoDate) {
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
    }).format(date);
  } catch {
    return 'This day';
  }
}

/**
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanItem} plan
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanPerformance} perf
 * @param {string} timeFormatId
 */
function toScreening(plan, perf, timeFormatId) {
  const startMs = parseMs(perf.startsAt);
  let endMs = parseMs(perf.expectedEndsAt);
  if (endMs == null && startMs != null) {
    const runtime = Number(perf.runtimeMin);
    endMs = startMs + (Number.isFinite(runtime) ? runtime : 120) * 60_000;
  }
  const timeLabel =
    formatClockLabel(perf.localTime, timeFormatId) ?? perf.localTime ?? null;
  const formatRaw =
    typeof perf.format === 'string' && perf.format.trim()
      ? perf.format.trim()
      : null;
  return {
    kind: 'screening',
    id: `${plan.planId}::${perf.performanceKey || `${perf.localDate}-${perf.localTime}`}`,
    planId: plan.planId,
    performanceKey: perf.performanceKey ?? null,
    title: perf.title || 'Untitled',
    timeLabel,
    venueLabel: perf.theaterName || null,
    formatLabel: formatRaw,
    posterUrl: perf.posterUrl ?? null,
    inPlanner: true,
    addedLabel: formatAddedLabel(plan.acceptedAt),
    dateKey: plan.date || perf.localDate || '',
    startsAt: perf.startsAt ?? null,
    startMs,
    endMs,
  };
}


/**
 * @param {ReturnType<typeof toScreening>} screening
 */
function publicScreening(screening) {
  return {
    kind: 'screening',
    id: screening.id,
    planId: screening.planId,
    performanceKey: screening.performanceKey,
    title: screening.title,
    timeLabel: screening.timeLabel,
    venueLabel: screening.venueLabel,
    formatLabel: screening.formatLabel,
    posterUrl: screening.posterUrl,
    inPlanner: true,
    addedLabel: screening.addedLabel,
    startsAt: screening.startsAt,
  };
}

/**
 * Flatten upcoming accepted-plan screenings for conflict resolution.
 * @param {{
 *   storage?: Storage | null,
 *   now?: Date,
 *   timeFormatId?: string,
 * }} [options]
 */
export function listUpcomingPlannerScreenings(options = {}) {
  const storage =
    options.storage ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  const now = options.now ?? new Date();
  const timeFormatId =
    typeof options.timeFormatId === 'string' && options.timeFormatId
      ? options.timeFormatId
      : '12h';
  const { upcoming: upcomingPlans } = partitionAcceptedPlans(
    getAcceptedPlans(storage),
    now,
  );
  /** @type {ReturnType<typeof toScreening>[]} */
  const screenings = [];
  for (const plan of upcomingPlans) {
    const perfs = Array.isArray(plan.performances) ? plan.performances : [];
    for (const perf of perfs) {
      const row = toScreening(plan, perf, timeFormatId);
      screenings.push({
        ...row,
        filmKey: perf.filmKey ?? null,
        filmId: perf.filmId ?? null,
        theaterId: perf.theaterId,
        localDate: perf.localDate,
        localTime: perf.localTime,
        source: perf.source ?? null,
        sourceShowtimeId: perf.sourceShowtimeId ?? null,
        ticketUrl: perf.ticketUrl ?? null,
        expectedEndsAt: perf.expectedEndsAt ?? null,
        runtimeMin: perf.runtimeMin,
        format: perf.format ?? null,
      });
    }
  }
  return screenings;
}

export function composePlannerLandingFromAcceptedPlans(options = {}) {
  const storage =
    options.storage ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  const now = options.now ?? new Date();
  const timeFormatId =
    typeof options.timeFormatId === 'string' && options.timeFormatId
      ? options.timeFormatId
      : '12h';

  const { upcoming: upcomingPlans, past: pastPlans } = partitionAcceptedPlans(
    getAcceptedPlans(storage),
    now,
  );

  const screenings = listUpcomingPlannerScreenings({ storage, now, timeFormatId });
  const clusters = findConflictClusters(screenings);
  const used = new Set();
  for (const cluster of clusters) {
    for (const member of cluster.members) {
      used.add(member.id);
    }
  }

  const todayIso = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  });

  /** @type {Map<string, object[]>} */
  const itemsByDate = new Map();
  const ensureDate = (dateKey) => {
    if (!itemsByDate.has(dateKey)) itemsByDate.set(dateKey, []);
    return itemsByDate.get(dateKey);
  };

  for (const cluster of clusters) {
    const dateKey = cluster.dateKey || 'unknown';
    const members = cluster.members.map(publicScreening);
    ensureDate(dateKey).push({
      kind: 'conflict-group',
      id: cluster.id,
      conflictId: cluster.id,
      bannerLabel: 'CONFLICT • You can’t see both',
      members,
      left: members[0] ?? null,
      right: members[1] ?? members[0] ?? null,
    });
  }

  for (const screening of screenings) {
    if (used.has(screening.id)) continue;
    const dateKey = screening.dateKey || 'unknown';
    ensureDate(dateKey).push(publicScreening(screening));
  }

  // Sort items within each date by earliest start.
  for (const [dateKey, items] of itemsByDate) {
    items.sort((a, b) => {
      const aStart =
        a.kind === 'conflict-group'
          ? Math.min(
              parseMs(a.left?.startsAt) ?? Number.POSITIVE_INFINITY,
              parseMs(a.right?.startsAt) ?? Number.POSITIVE_INFINITY,
            )
          : parseMs(a.startsAt) ?? Number.POSITIVE_INFINITY;
      const bStart =
        b.kind === 'conflict-group'
          ? Math.min(
              parseMs(b.left?.startsAt) ?? Number.POSITIVE_INFINITY,
              parseMs(b.right?.startsAt) ?? Number.POSITIVE_INFINITY,
            )
          : parseMs(b.startsAt) ?? Number.POSITIVE_INFINITY;
      return aStart - bStart;
    });
    itemsByDate.set(dateKey, items);
  }

  const dateKeys = [...itemsByDate.keys()].sort();
  const dateGroups = dateKeys.map((dateKey) => ({
    id: `day-${dateKey}`,
    dateKey,
    label: formatDateGroupLabel(dateKey, todayIso),
    items: itemsByDate.get(dateKey) ?? [],
  }));

  const needsAttentionItems = clusters.map((cluster) => {
    const dateKey = cluster.dateKey || '';
    const dayName = weekdayLong(dateKey);
    const members = cluster.members;
    return {
      id: `attention-${cluster.id}`,
      conflictId: cluster.id,
      kind: 'conflict',
      headline: `${dayName} has a conflict`,
      body: formatConflictBody(members),
      ctaLabel: 'Review options',
      weekdayLabel: dayName,
      dateKey,
      posterUrls: members.map((m) => m.posterUrl).filter(Boolean).slice(0, 3),
      screeningIds: members.map((m) => m.id),
      planIds: members.map((m) => m.planId),
      performanceKeys: members.map((m) => m.performanceKey).filter(Boolean),
    };
  });

  return {
    source: 'accepted-plans',
    pageTitle: 'Planner',
    pageTagline:
      'Plan your moviegoing. We’ll help you make the most of your options.',
    tabs: [
      { id: 'upcoming', label: 'Upcoming' },
      { id: 'saved-films', label: 'Saved films' },
    ],
    needsAttention: {
      sectionTitle: 'NEEDS ATTENTION',
      count: needsAttentionItems.length,
      items: needsAttentionItems,
    },
    upcoming: {
      sectionTitle: 'UPCOMING',
      viewTimelineLabel: 'View full timeline',
      emptyTitle:
        dateGroups.length === 0 ? 'No upcoming screenings yet' : null,
      emptyBody:
        dateGroups.length === 0
          ? 'Accepted plans will appear here. Build a Plan to get started.'
          : null,
      dateGroups,
    },
    savedFilms: {
      implemented: false,
      emptyTitle: 'Saved films',
      emptyBody:
        'Saved films with showtimes will appear here. Switch back to Upcoming for your planned screenings.',
    },
    // Retained for callers that still inspect plan-level upcoming/past counts.
    past: {
      sectionTitle: 'Past Plans',
      plans: pastPlans.map((plan) => ({
        id: plan.planId,
        planId: plan.planId,
        title: plan.label || plan.performances?.[0]?.title || 'Past plan',
      })),
      previewCount: 3,
      viewAllLabel: pastPlans.length > 3 ? 'Show all' : null,
    },
    summary: {
      upcomingCount: upcomingPlans.length,
      screeningCount: screenings.length,
      conflictCount: clusters.length,
      draftCount: 0,
    },
  };
}
