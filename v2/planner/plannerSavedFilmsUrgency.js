/**
 * Urgency + availability copy for Planner Saved Films.
 * Reuses qualifying-showtime counts (same definition as personal collections).
 */

import { LIMITED_SHOWTIME_MAX } from '../adapters/selectTopOpportunities.js';
import { pacificDateString } from '../explore/exploreCatalog.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';
import { opportunitySortableKey } from '../showtimes/showtimeEligibility.js';

export const PLANNER_SAVED_URGENCY = Object.freeze({
  lastChance: 'last_chance',
  leavingSoon: 'leaving_soon',
  none: 'none',
});

/**
 * @param {number} count
 */
export function deriveSavedFilmUrgency(count) {
  if (count <= 0) {
    return { id: PLANNER_SAVED_URGENCY.none, badge: null, rank: 50 };
  }
  if (count === 1) {
    return {
      id: PLANNER_SAVED_URGENCY.lastChance,
      badge: 'Last chance',
      rank: 0,
    };
  }
  if (count <= LIMITED_SHOWTIME_MAX) {
    return {
      id: PLANNER_SAVED_URGENCY.leavingSoon,
      badge: 'Leaving soon',
      rank: 1,
    };
  }
  return { id: PLANNER_SAVED_URGENCY.none, badge: null, rank: 10 };
}

/**
 * Pacific week start (Sunday) as YYYY-MM-DD.
 * @param {Date} date
 */
export function pacificWeekStartIso(date = new Date()) {
  const today = pacificDateString(date);
  const [y, m, d] = today.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  const day = utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() - day);
  return utc.toISOString().slice(0, 10);
}

/**
 * @param {string} isoDate YYYY-MM-DD
 * @param {Date} [now]
 */
function weekBucket(isoDate, now = new Date()) {
  const thisWeek = pacificWeekStartIso(now);
  const nextWeekDate = new Date(`${thisWeek}T12:00:00Z`);
  nextWeekDate.setUTCDate(nextWeekDate.getUTCDate() + 7);
  const nextWeek = nextWeekDate.toISOString().slice(0, 10);
  if (isoDate >= thisWeek && isoDate < nextWeek) return 'this_week';
  if (isoDate >= nextWeek) {
    const afterNext = new Date(nextWeekDate);
    afterNext.setUTCDate(afterNext.getUTCDate() + 7);
    if (isoDate < afterNext.toISOString().slice(0, 10)) return 'next_week';
  }
  return 'later';
}

/**
 * @param {number} count
 * @param {object[]} opportunities qualifying opportunities
 * @param {Date} [now]
 */
export function formatSavedFilmShowtimeSummary(count, opportunities, now = new Date()) {
  if (count <= 0) return 'No showtimes currently scheduled';
  if (count === 1) return '1 showtime left';
  if (count === 2) return '2 showtimes left';

  const buckets = new Set(
    (opportunities ?? []).map((opp) => {
      const sortable = opportunitySortableKey(opp);
      const localDate =
        typeof opp.localDate === 'string'
          ? opp.localDate
          : sortable?.slice(0, 10) ?? '';
      return weekBucket(localDate, now);
    }),
  );
  if (buckets.size === 1 && buckets.has('this_week')) {
    return `${count} showtimes this week`;
  }
  if (buckets.size === 1 && buckets.has('next_week')) {
    return `${count} showtimes next week`;
  }
  return `${count} showtimes remaining`;
}

/**
 * @param {object | null | undefined} opportunity
 * @param {string} [timeFormatId]
 */
export function formatSavedFilmNextShowtimeLine(opportunity, timeFormatId = '12h') {
  if (!opportunity) return null;
  const sortable = opportunitySortableKey(opportunity);
  const localDate =
    typeof opportunity.localDate === 'string'
      ? opportunity.localDate
      : sortable?.slice(0, 10) ?? null;
  let dayLabel = null;
  if (localDate) {
    try {
      const [y, m, d] = localDate.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d, 12));
      const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        weekday: 'short',
      }).format(date);
      const rest = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
      }).format(date);
      dayLabel = `${weekday}, ${rest}`;
    } catch {
      dayLabel = localDate;
    }
  }
  const timeLabel =
    formatDisplayClock(opportunity.localTime, timeFormatId) ??
    opportunity.timeDisplay?.replace(/^.*at\s+/i, '') ??
    opportunity.localTime ??
    null;
  const venue =
    opportunity.theaterName ??
    opportunity.theater ??
    opportunity.theaterId ??
    null;
  const parts = [dayLabel, timeLabel, venue].filter(Boolean);
  if (!parts.length) return null;
  return parts.join(' • ');
}

/**
 * @param {string | null | undefined} savedAt
 */
export function formatPlannerSavedDateLabel(savedAt) {
  if (!savedAt || typeof savedAt !== 'string') return null;
  const d = new Date(savedAt);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const label = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    }).format(d);
    return `Saved ${label}`;
  } catch {
    return 'Saved';
  }
}

/**
 * @param {object} opportunity
 * @param {string} [timeFormatId]
 */
export function formatChooseShowtimeRowLabel(opportunity, timeFormatId = '12h') {
  return formatSavedFilmNextShowtimeLine(opportunity, timeFormatId);
}

/**
 * @param {object} opportunity
 * @param {string} [timeFormatId]
 */
export function formatChooseShowtimeFormatLabel(opportunity) {
  const raw = Array.isArray(opportunity?.formatLabels)
    ? opportunity.formatLabels[0]
    : opportunity?.format ?? opportunity?.formatLabel;
  return formatUserFacingFormatLabel(raw) || null;
}
