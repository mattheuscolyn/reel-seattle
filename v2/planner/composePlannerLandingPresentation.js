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
 * @param {{ startMs: number | null, endMs: number | null }} a
 * @param {{ startMs: number | null, endMs: number | null }} b
 */
function overlaps(a, b) {
  if (a.startMs == null || a.endMs == null || b.startMs == null || b.endMs == null) {
    return false;
  }
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * Greedy pairwise conflicts among screenings (sorted by start).
 * @param {ReturnType<typeof toScreening>[]} screenings
 */
function findConflictPairs(screenings) {
  const sorted = [...screenings].sort((a, b) => {
    const as = a.startMs ?? 0;
    const bs = b.startMs ?? 0;
    if (as !== bs) return as - bs;
    return String(a.id).localeCompare(String(b.id));
  });
  /** @type {{ id: string, left: object, right: object }[]} */
  const pairs = [];
  const used = new Set();
  for (let i = 0; i < sorted.length; i += 1) {
    const left = sorted[i];
    if (used.has(left.id)) continue;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const right = sorted[j];
      if (used.has(right.id)) continue;
      if (right.startMs != null && left.endMs != null && right.startMs >= left.endMs) {
        break;
      }
      if (!overlaps(left, right)) continue;
      pairs.push({
        id: `conflict-${left.id}__${right.id}`,
        left,
        right,
      });
      used.add(left.id);
      used.add(right.id);
      break;
    }
  }
  return { pairs, used };
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

  const { upcoming: upcomingPlans, past: pastPlans } = partitionAcceptedPlans(
    getAcceptedPlans(storage),
    now,
  );

  const screenings = [];
  for (const plan of upcomingPlans) {
    const perfs = Array.isArray(plan.performances) ? plan.performances : [];
    for (const perf of perfs) {
      screenings.push(toScreening(plan, perf, timeFormatId));
    }
  }

  const { pairs, used } = findConflictPairs(screenings);
  const conflictByDate = new Map();
  for (const pair of pairs) {
    const dateKey = pair.left.dateKey || pair.right.dateKey || 'unknown';
    if (!conflictByDate.has(dateKey)) conflictByDate.set(dateKey, []);
    conflictByDate.get(dateKey).push(pair);
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

  for (const pair of pairs) {
    const dateKey = pair.left.dateKey || pair.right.dateKey || 'unknown';
    ensureDate(dateKey).push({
      kind: 'conflict-group',
      id: pair.id,
      bannerLabel: 'CONFLICT • You can’t see both',
      left: publicScreening(pair.left),
      right: publicScreening(pair.right),
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

  const needsAttentionItems = pairs.map((pair) => {
    const dateKey = pair.left.dateKey || pair.right.dateKey || '';
    const dayName = weekdayLong(dateKey);
    return {
      id: `attention-${pair.id}`,
      kind: 'conflict',
      headline: `${dayName} has a conflict`,
      body: `${pair.left.title} and ${pair.right.title} overlap.`,
      ctaLabel: 'Review options',
      weekdayLabel: dayName,
      dateKey,
      posterUrls: [pair.left.posterUrl, pair.right.posterUrl].filter(Boolean),
      screeningIds: [pair.left.id, pair.right.id],
      planIds: [pair.left.planId, pair.right.planId],
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
      conflictCount: pairs.length,
      draftCount: 0,
    },
  };
}
