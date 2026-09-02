/**
 * Viable alternate showtimes for Planner conflict review.
 * Uses live HomeData opportunities; filters against other planned screenings.
 */

import {
  extendedMinutesToUtcDate,
  parseCalendarDateParts,
  parseCalendarShowtimeMinutes,
} from '../../src/utils/calendarExport.js';
import {
  calculateExpectedEndTime,
  PLANNER_BUFFER_POLICY_V1,
} from '../../src/utils/plannerBufferPolicy.js';
import { buildPerformanceKey } from '../../src/utils/performanceIdentity.js';
import { parseRuntimeMinutes } from '../../src/utils/timeUtils.js';
import { listFilmOpportunities } from '../filmDetail/filmDetailModel.js';
import { pacificDateString } from '../explore/exploreCatalog.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';
import { normalizeExternalTicketUrl } from '../ticket/externalTicketUrl.js';
import { pacificSortableDateTime } from '../showtimes/showtimeEligibility.js';
import { screeningsOverlap } from './plannerScreeningOverlap.js';

export const CONFLICT_REVIEW_ALTERNATES_VISIBLE = 2;

/**
 * @param {string} isoDate
 */
function weekdayShort(isoDate) {
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
    }).format(date);
  } catch {
    return '';
  }
}

/**
 * @param {string} isoDate
 */
function monthDayShort(isoDate) {
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return isoDate;
  }
}

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
  return false;
}

/**
 * @param {object} opp
 * @param {number} runtimeMin
 */
function opportunityWindow(opp, runtimeMin) {
  const localDate = opp.localDate;
  const localTime = opp.localTime;
  const dateParts = parseCalendarDateParts(localDate);
  const startMin = parseCalendarShowtimeMinutes(localTime);
  if (!dateParts || startMin == null) return null;
  const expected = calculateExpectedEndTime(
    { startMin, runtime: runtimeMin },
    runtimeMin,
    { policy: PLANNER_BUFFER_POLICY_V1, planner: false },
  );
  if (!expected.ok || expected.endMin == null) return null;
  const start = extendedMinutesToUtcDate(dateParts, startMin);
  const end = extendedMinutesToUtcDate(dateParts, expected.endMin);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    localDate,
    localTime,
  };
}

/**
 * @param {{ startMs: number, endMs: number }} candidate
 * @param {Array<{ startMs?: number | null, endMs?: number | null }>} plannedWindows
 */
function isConflictFree(candidate, plannedWindows) {
  for (const planned of plannedWindows) {
    if (screeningsOverlap(candidate, planned)) return false;
  }
  return true;
}

/**
 * @param {object} a
 * @param {object} b
 * @param {string} referenceDate
 * @param {string | null} referenceTheaterId
 */
function compareAlternateCandidates(a, b, referenceDate, referenceTheaterId) {
  const aSameDay = a.localDate === referenceDate ? 0 : 1;
  const bSameDay = b.localDate === referenceDate ? 0 : 1;
  if (aSameDay !== bSameDay) return aSameDay - bSameDay;

  const aSameTheater =
    referenceTheaterId && a.theaterId === referenceTheaterId ? 0 : 1;
  const bSameTheater =
    referenceTheaterId && b.theaterId === referenceTheaterId ? 0 : 1;
  if (aSameTheater !== bSameTheater) return aSameTheater - bSameTheater;

  if (a.sortable !== b.sortable) {
    return a.sortable < b.sortable ? -1 : 1;
  }
  return 0;
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
 *   runtimeMin?: number | null,
 *   referenceDate?: string | null,
 *   plannedWindows?: Array<{ startMs?: number | null, endMs?: number | null }>,
 *   now?: Date,
 *   timeFormatId?: string,
 *   visibleLimit?: number,
 * }} options
 */
export function deriveConflictReviewAlternates(homeData, options = {}) {
  const filmKey =
    typeof options.filmKey === 'string' && options.filmKey.trim()
      ? options.filmKey.trim()
      : null;
  const theaterId =
    typeof options.theaterId === 'string' && options.theaterId.trim()
      ? options.theaterId.trim()
      : null;
  const referenceDate =
    typeof options.referenceDate === 'string' && options.referenceDate.trim()
      ? options.referenceDate.trim()
      : options.localDate ?? null;
  const runtimeMin =
    typeof options.runtimeMin === 'number' && Number.isFinite(options.runtimeMin)
      ? options.runtimeMin
      : 120;
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
      : CONFLICT_REVIEW_ALTERNATES_VISIBLE;
  const plannedWindows = Array.isArray(options.plannedWindows)
    ? options.plannedWindows
    : [];

  if (!homeData || !filmKey) {
    return { items: [], visibleItems: [], moreCount: 0 };
  }

  const exclude = {
    performanceKey: options.performanceKey ?? null,
    localDate: options.localDate ?? null,
    localTime: options.localTime ?? null,
    source: options.source ?? null,
    sourceShowtimeId: options.sourceShowtimeId ?? null,
  };

  const candidates = listFilmOpportunities(homeData, filmKey).filter((opp) => {
    if (isSameShowtime(opp, exclude)) return false;
    const localDate = opp.localDate;
    if (typeof localDate !== 'string' || localDate < today) return false;
    const sortable = opp.sortableLocalDateTime;
    if (localDate === today && sortable && sortable < nowKey) return false;
    const oppRuntime =
      parseRuntimeMinutes(opp.runtimeMin ?? opp.runtime ?? opp.runtimeMinutes) ??
      runtimeMin;
    const window = opportunityWindow(opp, oppRuntime);
    if (!window) return false;
    return isConflictFree(window, plannedWindows);
  });

  const items = candidates
    .map((opp) => {
      const oppRuntime =
        parseRuntimeMinutes(opp.runtimeMin ?? opp.runtime ?? opp.runtimeMinutes) ??
        runtimeMin;
      const window = opportunityWindow(opp, oppRuntime);
      const formatLabel = formatUserFacingFormatLabel(
        opp.formatLabel ?? opp.format ?? opp.presentationLabel,
      );
      const timeLabel =
        formatDisplayClock(opp.localTime, timeFormatId) ??
        opp.localTime ??
        null;
      const dayShort = weekdayShort(opp.localDate);
      const dateShort = monthDayShort(opp.localDate);
      const venue = opp.theaterName ?? opp.theater ?? opp.theaterId ?? '';
      const rowLabel = [dayShort && dateShort ? `${dayShort}, ${dateShort}` : dateShort, timeLabel, venue]
        .filter(Boolean)
        .join(' • ');
      return {
        opportunityKey: opp.opportunityKey ?? null,
        filmKey: opp.filmKey ?? filmKey,
        theaterId: opp.theaterId ?? null,
        theaterName: venue,
        localDate: opp.localDate,
        localTime: opp.localTime,
        timeLabel,
        dayShort,
        dateShort,
        rowLabel,
        formatLabel: formatLabel || null,
        ticketUrl: normalizeExternalTicketUrl(opp.ticketUrl),
        source: opp.source ?? null,
        sourceShowtimeId: opp.sourceShowtimeId ?? opp.source_showtime_id ?? null,
        runtimeMin: oppRuntime,
        sortable: opp.sortableLocalDateTime ?? `${opp.localDate}T${opp.localTime}`,
        startMs: window?.startMs ?? null,
        endMs: window?.endMs ?? null,
      };
    })
    .sort((a, b) =>
      compareAlternateCandidates(a, b, referenceDate, theaterId),
    );

  const visibleItems = items.slice(0, visibleLimit);
  return {
    items,
    visibleItems,
    moreCount: Math.max(0, items.length - visibleItems.length),
  };
}
