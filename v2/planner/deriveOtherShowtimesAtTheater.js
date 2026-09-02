/**
 * Other showtimes for the same film at the same theater (Planner screening sheet).
 * Uses live HomeData opportunities — no second showtime model.
 */

import { listFilmOpportunities } from '../filmDetail/filmDetailModel.js';
import { pacificDateString } from '../explore/exploreCatalog.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';
import { normalizeExternalTicketUrl } from '../ticket/externalTicketUrl.js';
import { pacificSortableDateTime } from '../showtimes/showtimeEligibility.js';
import { buildPerformanceKey } from '../../src/utils/performanceIdentity.js';

export const PLANNED_SCREENING_OTHER_SHOWTIMES_VISIBLE = 3;

/**
 * @param {object} opp
 * @param {{
 *   performanceKey?: string | null,
 *   localDate?: string | null,
 *   localTime?: string | null,
 *   source?: string | null,
 *   sourceShowtimeId?: string | null,
 * }} exclude
 */
function isSameShowtime(opp, exclude) {
  if (!opp) return false;
  const excludeKey = exclude.performanceKey?.trim();
  if (excludeKey) {
    const oppKey = buildPerformanceKey({
      source: opp.source,
      sourceShowtimeId: opp.sourceShowtimeId ?? opp.source_showtime_id,
      filmKey: opp.filmKey,
      theaterId: opp.theaterId,
      localDate: opp.localDate,
      localTime: opp.localTime,
    });
    if (oppKey && oppKey === excludeKey) return true;
  }
  if (
    exclude.localDate &&
    exclude.localTime &&
    opp.localDate === exclude.localDate &&
    opp.localTime === exclude.localTime
  ) {
    return true;
  }
  if (
    exclude.source &&
    exclude.sourceShowtimeId &&
    opp.source === exclude.source &&
    (opp.sourceShowtimeId ?? opp.source_showtime_id) === exclude.sourceShowtimeId
  ) {
    return true;
  }
  return false;
}

/**
 * @param {object | null | undefined} homeData
 * @param {{
 *   filmKey?: string | null,
 *   theaterId?: string | null,
 *   performanceKey?: string | null,
 *   localDate?: string | null,
 *   localTime?: string | null,
 *   source?: string | null,
 *   sourceShowtimeId?: string | null,
 *   now?: Date,
 *   timeFormatId?: string,
 *   visibleLimit?: number,
 * }} options
 */
export function deriveOtherShowtimesAtTheater(homeData, options = {}) {
  const filmKey =
    typeof options.filmKey === 'string' && options.filmKey.trim()
      ? options.filmKey.trim()
      : null;
  const theaterId =
    typeof options.theaterId === 'string' && options.theaterId.trim()
      ? options.theaterId.trim()
      : null;
  const now = options.now ?? new Date();
  const today = pacificDateString(now);
  const nowKey = pacificSortableDateTime(now);
  const timeFormatId =
    typeof options.timeFormatId === 'string' && options.timeFormatId
      ? options.timeFormatId
      : '12h';
  const visibleLimit =
    typeof options.visibleLimit === 'number' && options.visibleLimit > 0
      ? options.visibleLimit
      : PLANNED_SCREENING_OTHER_SHOWTIMES_VISIBLE;

  if (!homeData || !filmKey || !theaterId) {
    return {
      theaterName: null,
      items: [],
      visibleItems: [],
      moreCount: 0,
    };
  }

  const exclude = {
    performanceKey: options.performanceKey ?? null,
    localDate: options.localDate ?? null,
    localTime: options.localTime ?? null,
    source: options.source ?? null,
    sourceShowtimeId: options.sourceShowtimeId ?? null,
  };

  const candidates = listFilmOpportunities(homeData, filmKey).filter((opp) => {
    if (!theaterId || opp.theaterId !== theaterId) return false;
    if (isSameShowtime(opp, exclude)) return false;
    const localDate = opp.localDate;
    if (typeof localDate !== 'string' || localDate < today) return false;
    const sortable = opp.sortableLocalDateTime;
    if (localDate === today && sortable && sortable < nowKey) return false;
    return true;
  });

  const items = candidates.map((opp) => {
    const formatLabel = formatUserFacingFormatLabel(
      opp.formatLabel ?? opp.format ?? opp.presentationLabel,
    );
    return {
      opportunityKey: opp.opportunityKey ?? null,
      filmKey: opp.filmKey ?? filmKey,
      theaterId: opp.theaterId ?? theaterId,
      theaterName: opp.theaterName ?? opp.theater ?? theaterId,
      localDate: opp.localDate,
      localTime: opp.localTime,
      timeLabel:
        formatDisplayClock(opp.localTime, timeFormatId) ?? opp.localTime ?? null,
      formatLabel: formatLabel || null,
      ticketUrl: normalizeExternalTicketUrl(opp.ticketUrl),
      sortable: opp.sortableLocalDateTime ?? `${opp.localDate}T${opp.localTime}`,
    };
  });

  const visibleItems = items.slice(0, visibleLimit);
  return {
    theaterName: visibleItems[0]?.theaterName ?? theaterId,
    items,
    visibleItems,
    moreCount: Math.max(0, items.length - visibleItems.length),
  };
}
