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
 * @param {{
 *   openingDate: string,
 *   engagementDays?: number | null,
 *   categoryId?: string | null,
 *   timezone?: string | null,
 *   todayIso?: string | null,
 *   hasUpcomingShowtimes?: boolean,
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
}) {
  const today = todayIso ?? pacificTodayIso(timezone);
  const shortDate = formatLocalDateLabel(openingDate);

  let dateLabel;
  if (openingDate === today) {
    dateLabel = 'Opens today';
  } else if (openingDate > today) {
    dateLabel = shortDate ? `Opens ${shortDate}` : 'Opens this week';
  } else {
    dateLabel = shortDate ? `Opened ${shortDate}` : 'Opened earlier this week';
  }

  if (
    categoryId === 'event' &&
    engagementDays === 1 &&
    shortDate
  ) {
    dateLabel = `One night · ${shortDate}`;
  }

  const availabilityLabel = hasUpcomingShowtimes
    ? null
    : 'No upcoming showtimes';

  return { dateLabel, availabilityLabel };
}
