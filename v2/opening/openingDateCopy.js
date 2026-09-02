/**
 * Opening This Week date copy — Pacific local dates from artifact opening_date.
 * Never derives copy from next showtime or first-announced dates.
 */

import { formatLocalDateLabel } from '../topOpportunities/topOpportunityFormat.js';

/**
 * @param {string} [timezone]
 * @returns {string} YYYY-MM-DD in the given IANA timezone
 */
export function pacificTodayIso(timezone = 'America/Los_Angeles') {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}

/**
 * @param {string | null | undefined} isoDate
 * @returns {string | null}
 */
function formatCompactWeekday(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null;
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * @param {{
 *   openingDate: string,
 *   engagementDays?: number | null,
 *   categoryId?: string | null,
 *   timezone?: string | null,
 *   todayIso?: string | null,
 *   hasUpcomingShowtimes?: boolean,
 *   compact?: boolean,
 * }} args
 * @returns {{ dateLabel: string, availabilityLabel: string | null }}
 */
export function buildOpeningDateCopy({
  openingDate,
  engagementDays = null,
  categoryId = null,
  timezone = 'America/Los_Angeles',
  todayIso = null,
  hasUpcomingShowtimes = true,
  compact = false,
}) {
  const today = todayIso ?? pacificTodayIso(timezone);
  const shortDate = formatLocalDateLabel(openingDate);
  const compactDay = formatCompactWeekday(openingDate);

  let dateLabel;
  if (openingDate === today) {
    dateLabel = 'Opens today';
  } else if (openingDate > today) {
    if (compact && compactDay) {
      dateLabel = `Opens ${compactDay}`;
    } else {
      dateLabel = shortDate ? `Opens ${shortDate}` : 'Opens this week';
    }
  } else if (compact && compactDay) {
    dateLabel = `Opened ${compactDay}`;
  } else {
    dateLabel = shortDate ? `Opened ${shortDate}` : 'Opened earlier this week';
  }

  if (categoryId === 'event' && engagementDays === 1) {
    const eventDay = compact ? compactDay : shortDate;
    if (eventDay) {
      dateLabel = `One night · ${eventDay}`;
    }
  }

  const availabilityLabel = hasUpcomingShowtimes
    ? null
    : 'No upcoming showtimes';

  return { dateLabel, availabilityLabel };
}
